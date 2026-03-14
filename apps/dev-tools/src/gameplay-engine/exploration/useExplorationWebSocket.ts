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

const EXPLORATION_WS_LOG_PREFIX = "[exploration-ws]";

function visibilityEquals(
    left: ExplorationVisibilityState,
    right: ExplorationVisibilityState,
) {
    if (left.revealedInteriorId !== right.revealedInteriorId) {
        return false;
    }
    if (left.revealedRoofGroupIds.length !== right.revealedRoofGroupIds.length) {
        return false;
    }
    if (left.openedDoorIds.length !== right.openedDoorIds.length) {
        return false;
    }
    for (let index = 0; index < left.revealedRoofGroupIds.length; index += 1) {
        if (left.revealedRoofGroupIds[index] !== right.revealedRoofGroupIds[index]) {
            return false;
        }
    }
    for (let index = 0; index < left.openedDoorIds.length; index += 1) {
        if (left.openedDoorIds[index] !== right.openedDoorIds[index]) {
            return false;
        }
    }
    return true;
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
    const selectedCharacterIdsKey = useMemo(
        () => JSON.stringify(session.selectedCharIds),
        [session.selectedCharIds],
    );
    const [descriptor, setDescriptor] = useState<ExplorationManifestDescriptor | null>(null);
    const [chunks, setChunks] = useState<Map<string, ExplorationChunk>>(new Map());
    const [pawnStore, setPawnStore] = useState<Map<string, ExplorationPawn>>(new Map());
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
        console.info(EXPLORATION_WS_LOG_PREFIX, "reset session state", {
            worldId: session.worldId,
            locationId: session.locationId,
            selectedCharacterIds: session.selectedCharIds,
        });
        setDescriptor(null);
        descriptorRef.current = null;
        setChunks(new Map());
        setPawnStore(new Map());
        setSelectedPawnIdState(null);
        setVisibility({
            revealedInteriorId: null,
            revealedRoofGroupIds: [],
            openedDoorIds: [],
        });
        setTick(0);
        setLastInteraction(null);
        latestSubscriptionRef.current = null;
    }, [selectedCharacterIdsKey, session.locationId, session.worldId]);

    const applySnapshot = useCallback((snapshot: ExplorationSessionSnapshot) => {
        setDescriptor(snapshot.descriptor);
        descriptorRef.current = snapshot.descriptor;
        setChunks(new Map(snapshot.chunks.map((chunk) => [chunk.id, chunk])));
        setPawnStore(new Map(snapshot.pawns.map((pawn) => [pawn.id, pawn])));
        setSelectedPawnIdState(snapshot.selectedPawnId);
        setVisibility((previous) => visibilityEquals(previous, snapshot.visibility) ? previous : snapshot.visibility);
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
            type: "subscribe_view",
            centerRow,
            centerCol,
            radius,
        });
    }, [sendAction]);

    const pawns = useMemo(() => [...pawnStore.values()], [pawnStore]);

    useEffect(() => {
        intentionallyClosedRef.current = false;

        const connect = () => {
            const url = getWebSocketUrl();
            if (!url) {
                console.warn(EXPLORATION_WS_LOG_PREFIX, "window unavailable, skipping websocket init");
                return;
            }
            console.info(EXPLORATION_WS_LOG_PREFIX, "connecting", { url });
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                reconnectAttemptRef.current = 0;
                setIsConnected(true);
                setConnectionState("active");
                setError(null);
                console.info(EXPLORATION_WS_LOG_PREFIX, "connected, sending start_session", {
                    worldId: latestSessionRef.current.worldId,
                    locationId: latestSessionRef.current.locationId,
                    selectedCharacterIds: latestSessionRef.current.selectedCharIds,
                });
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
                        type: "subscribe_view",
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
                            console.info(EXPLORATION_WS_LOG_PREFIX, "session_ready", {
                                descriptorId: message.state.descriptor.id,
                                chunkCount: message.state.chunks.length,
                                pawnCount: message.state.pawns.length,
                            });
                            applySnapshot(message.state);
                            break;
                        case "chunk_delta":
                            setChunks((previous) => {
                                const next = new Map(previous);
                                for (const chunkId of message.removedChunkIds) {
                                    next.delete(chunkId);
                                }
                                for (const chunk of message.chunks) {
                                    next.set(chunk.id, chunk);
                                }
                                const subscription = latestSubscriptionRef.current;
                                if (!subscription) return next;
                                return pruneChunks(next, subscription.centerRow, subscription.centerCol, descriptorRef.current?.chunkSize || 16);
                            });
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
                        case "pawn_delta":
                            setPawnStore((previous) => {
                                const next = new Map(previous);
                                for (const pawnId of message.removedPawnIds) {
                                    next.delete(pawnId);
                                }
                                for (const pawn of message.pawns) {
                                    next.set(pawn.id, pawn);
                                }
                                return next;
                            });
                            setSelectedPawnIdState(message.selectedPawnId);
                            setVisibility((previous) => visibilityEquals(previous, message.visibility) ? previous : message.visibility);
                            setTick(message.tick);
                            setConnectionState(message.connectionState);
                            break;
                        case "pawn_sync":
                            setPawnStore(new Map(message.pawns.map((pawn) => [pawn.id, pawn])));
                            setSelectedPawnIdState(message.selectedPawnId);
                            setVisibility((previous) => visibilityEquals(previous, message.visibility) ? previous : message.visibility);
                            setTick(message.tick);
                            setConnectionState(message.connectionState);
                            break;
                        case "interaction":
                            setLastInteraction(message.label);
                            break;
                        case "error":
                            console.error(EXPLORATION_WS_LOG_PREFIX, "server error", message.message);
                            setError(message.message);
                            break;
                        case "pong":
                            break;
                    }
                } catch (parseError) {
                    console.error(EXPLORATION_WS_LOG_PREFIX, "failed to parse exploration event", parseError);
                }
            };

            ws.onerror = () => {
                console.error(EXPLORATION_WS_LOG_PREFIX, "socket error");
                setError("Exploration connection error");
            };

            ws.onclose = () => {
                setIsConnected(false);
                if (intentionallyClosedRef.current) {
                    console.info(EXPLORATION_WS_LOG_PREFIX, "socket closed intentionally");
                    return;
                }
                setConnectionState("reconnecting");
                reconnectAttemptRef.current += 1;
                const delay = Math.min(4000, 400 * (2 ** (reconnectAttemptRef.current - 1)));
                console.warn(EXPLORATION_WS_LOG_PREFIX, "socket closed, scheduling reconnect", { delay });
                reconnectTimerRef.current = window.setTimeout(connect, delay);
            };
        };

        connect();
        return () => {
            intentionallyClosedRef.current = true;
            if (reconnectTimerRef.current !== null) {
                window.clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            const socket = wsRef.current;
            if (socket) {
                socket.onopen = null;
                socket.onmessage = null;
                socket.onerror = null;
                socket.onclose = null;
                if (socket.readyState === WebSocket.OPEN) {
                    socket.close();
                }
            }
            wsRef.current = null;
        };
    }, [applySnapshot, selectedCharacterIdsKey, sendAction, session.locationId, session.worldId]);

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
