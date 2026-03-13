import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
    ExplorationChunk,
    ExplorationClientAction,
    ExplorationManifestDescriptor,
    ExplorationSessionEvent,
    ExplorationSessionSnapshot,
    ExplorationVisibilityState,
    ExplorationPawn,
} from "@ashtrail/core";
import type { ExplorationLaunchConfig } from "../explorationSupport";

const MAX_CHUNK_CACHE = 25;

interface UseExplorationWebSocketOptions {
    session: ExplorationLaunchConfig;
}

function getWebSocketUrl() {
    if (typeof window === "undefined") {
        return null;
    }
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.host}/api/exploration/ws`;
}

function chunkDistance(chunk: ExplorationChunk, centerRow: number, centerCol: number, chunkSize: number) {
    const row = Math.abs(chunk.chunkRow - Math.floor(centerRow / Math.max(1, chunkSize)));
    const col = Math.abs(chunk.chunkCol - Math.floor(centerCol / Math.max(1, chunkSize)));
    return row + col;
}

function pruneChunks(
    chunks: Map<string, ExplorationChunk>,
    centerRow: number,
    centerCol: number,
    chunkSize: number,
) {
    if (chunks.size <= MAX_CHUNK_CACHE) {
        return chunks;
    }
    const sorted = [...chunks.values()].sort(
        (left, right) => chunkDistance(left, centerRow, centerCol, chunkSize) - chunkDistance(right, centerRow, centerCol, chunkSize),
    );
    return new Map(sorted.slice(0, MAX_CHUNK_CACHE).map((chunk) => [chunk.id, chunk]));
}

export function useExplorationWebSocket({ session }: UseExplorationWebSocketOptions) {
    const [descriptor, setDescriptor] = useState<ExplorationManifestDescriptor | null>(null);
    const [chunks, setChunks] = useState<Map<string, ExplorationChunk>>(new Map());
    const [pawns, setPawns] = useState<ExplorationPawn[]>([]);
    const [selectedPawnId, setSelectedPawnIdState] = useState<string | null>(null);
    const [visibility, setVisibility] = useState<ExplorationVisibilityState>({
        revealedInteriorId: null,
        revealedRoofGroupIds: [],
        openedDoorIds: [],
    });
    const [tick, setTick] = useState(0);
    const [connectionState, setConnectionState] = useState<"active" | "reconnecting">("reconnecting");
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastInteraction, setLastInteraction] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<number | null>(null);
    const reconnectAttemptRef = useRef(0);
    const intentionallyClosedRef = useRef(false);
    const latestSessionRef = useRef(session);
    const descriptorRef = useRef<ExplorationManifestDescriptor | null>(null);
    const latestSubscriptionRef = useRef<{ centerRow: number; centerCol: number; radius: number } | null>(null);
    latestSessionRef.current = session;

    useEffect(() => {
        setDescriptor(null);
        descriptorRef.current = null;
        setChunks(new Map());
        setPawns([]);
        setSelectedPawnIdState(null);
        setVisibility({
            revealedInteriorId: null,
            revealedRoofGroupIds: [],
            openedDoorIds: [],
        });
        setTick(0);
        setLastInteraction(null);
        latestSubscriptionRef.current = null;
    }, [session.locationId, session.worldId, session.selectedCharIds]);

    const applySnapshot = useCallback((snapshot: ExplorationSessionSnapshot) => {
        setDescriptor(snapshot.descriptor);
        descriptorRef.current = snapshot.descriptor;
        setChunks(new Map(snapshot.chunks.map((chunk) => [chunk.id, chunk])));
        setPawns(snapshot.pawns);
        setSelectedPawnIdState(snapshot.selectedPawnId);
        setVisibility(snapshot.visibility);
        setTick(snapshot.tick);
        setConnectionState(snapshot.connectionState);
    }, []);

    const sendAction = useCallback((action: ExplorationClientAction) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            return;
        }
        wsRef.current.send(JSON.stringify(action));
    }, []);

    const subscribeChunks = useCallback((centerRow: number, centerCol: number, radius: number) => {
        const next = { centerRow, centerCol, radius };
        latestSubscriptionRef.current = next;
        sendAction({
            type: "subscribe_chunks",
            centerRow,
            centerCol,
            radius,
        });
    }, [sendAction]);

    useEffect(() => {
        intentionallyClosedRef.current = false;

        const connect = () => {
            const url = getWebSocketUrl();
            if (!url) {
                return;
            }
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                reconnectAttemptRef.current = 0;
                setIsConnected(true);
                setConnectionState("active");
                setError(null);
                sendAction({
                    type: "start_session",
                    worldId: latestSessionRef.current.worldId,
                    locationId: latestSessionRef.current.locationId,
                    selectedCharacterIds: latestSessionRef.current.selectedCharIds,
                    config: {
                        tickRateHz: 10,
                        sessionName: latestSessionRef.current.locationId,
                    },
                });
                if (latestSubscriptionRef.current) {
                    sendAction({
                        type: "subscribe_chunks",
                        centerRow: latestSubscriptionRef.current.centerRow,
                        centerCol: latestSubscriptionRef.current.centerCol,
                        radius: latestSubscriptionRef.current.radius,
                    });
                }
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data) as ExplorationSessionEvent;
                    switch (message.type) {
                        case "session_ready":
                            applySnapshot(message.state);
                            break;
                        case "chunk_sync":
                            setChunks((previous) => {
                                const next = new Map(previous);
                                for (const chunk of message.sync.chunks) {
                                    next.set(chunk.id, chunk);
                                }
                                const subscription = latestSubscriptionRef.current;
                                if (!subscription) return next;
                                return pruneChunks(next, subscription.centerRow, subscription.centerCol, descriptorRef.current?.chunkSize || 16);
                            });
                            break;
                        case "pawn_sync":
                            setPawns(message.pawns);
                            setSelectedPawnIdState(message.selectedPawnId);
                            setVisibility(message.visibility);
                            setTick(message.tick);
                            setConnectionState(message.connectionState);
                            break;
                        case "interaction":
                            setLastInteraction(message.label);
                            break;
                        case "error":
                            setError(message.message);
                            break;
                        case "pong":
                            break;
                    }
                } catch (parseError) {
                    console.error("Failed to parse exploration event", parseError);
                }
            };

            ws.onerror = () => {
                setError("Exploration connection error");
            };

            ws.onclose = () => {
                setIsConnected(false);
                if (intentionallyClosedRef.current) {
                    return;
                }
                setConnectionState("reconnecting");
                reconnectAttemptRef.current += 1;
                const delay = Math.min(4000, 400 * (2 ** (reconnectAttemptRef.current - 1)));
                reconnectTimerRef.current = window.setTimeout(connect, delay);
            };
        };

        connect();
        return () => {
            intentionallyClosedRef.current = true;
            if (reconnectTimerRef.current !== null) {
                window.clearTimeout(reconnectTimerRef.current);
            }
            wsRef.current?.close();
            wsRef.current = null;
        };
    }, [applySnapshot, sendAction, session.locationId, session.selectedCharIds, session.worldId]);

    const moveTo = useCallback((pawnId: string, targetRow: number, targetCol: number) => {
        sendAction({
            type: "move_to",
            pawnId,
            targetRow,
            targetCol,
        });
    }, [sendAction]);

    const setSelectedPawnId = useCallback((pawnId: string | null) => {
        setSelectedPawnIdState(pawnId);
        sendAction({
            type: "set_selected_pawn",
            pawnId,
        });
    }, [sendAction]);

    const interact = useCallback((row?: number, col?: number, objectId?: string, actorId?: string) => {
        sendAction({
            type: "interact",
            row,
            col,
            objectId,
            actorId,
        });
    }, [sendAction]);

    return {
        descriptor,
        chunks: useMemo(() => [...chunks.values()], [chunks]),
        pawns,
        selectedPawnId,
        visibility,
        tick,
        connectionState,
        isConnected,
        error,
        lastInteraction,
        moveTo,
        setSelectedPawnId,
        interact,
        subscribeChunks,
    };
}
