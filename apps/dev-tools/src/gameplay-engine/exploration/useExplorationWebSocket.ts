import { useCallback, useEffect, useRef, useState } from "react";
import type {
    ExplorationClientAction,
    ExplorationMap,
    ExplorationSessionEvent,
    ExplorationSessionSnapshot,
} from "@ashtrail/core";

const WS_PROTOCOL = window.location.protocol === "https:" ? "wss" : "ws";
const WS_URL = `${WS_PROTOCOL}://${window.location.hostname}:8787/api/exploration/ws`;

interface UseExplorationWebSocketOptions {
    initialMap: ExplorationMap;
    initialSelectedPawnId: string | null;
}

export function useExplorationWebSocket({
    initialMap,
    initialSelectedPawnId,
}: UseExplorationWebSocketOptions) {
    const [snapshot, setSnapshot] = useState<ExplorationSessionSnapshot>({
        map: initialMap,
        selectedPawnId: initialSelectedPawnId,
        tick: 0,
        connectionState: "active",
    });
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastInteraction, setLastInteraction] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const setupRef = useRef({ initialMap, initialSelectedPawnId });
    setupRef.current = { initialMap, initialSelectedPawnId };

    const sendAction = useCallback((action: ExplorationClientAction) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            return;
        }
        wsRef.current.send(JSON.stringify(action));
    }, []);

    useEffect(() => {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            setError(null);
            sendAction({
                type: "start_session",
                map: setupRef.current.initialMap,
                selectedPawnId: setupRef.current.initialSelectedPawnId,
                config: {
                    tickRateHz: 5,
                    sessionName: setupRef.current.initialMap.name || "Exploration",
                },
            });
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data) as ExplorationSessionEvent;
                switch (message.type) {
                    case "state_sync":
                        setSnapshot(message.state);
                        break;
                    case "pawn_sync":
                        setSnapshot((previous) => ({
                            ...previous,
                            map: {
                                ...previous.map,
                                pawns: message.pawns,
                            },
                            selectedPawnId: message.selectedPawnId,
                            tick: message.tick,
                            connectionState: message.connectionState,
                        }));
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
        };

        return () => {
            ws.close();
            wsRef.current = null;
        };
    }, [sendAction]);

    const moveTo = useCallback((pawnId: string, targetRow: number, targetCol: number) => {
        sendAction({
            type: "move_to",
            pawnId,
            targetRow,
            targetCol,
        });
    }, [sendAction]);

    const setSelectedPawnId = useCallback((pawnId: string | null) => {
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
        map: snapshot.map,
        selectedPawnId: snapshot.selectedPawnId,
        tick: snapshot.tick,
        connectionState: snapshot.connectionState,
        isConnected,
        error,
        lastInteraction,
        moveTo,
        setSelectedPawnId,
        interact,
    };
}
