import { useState, useRef, useCallback, useEffect } from 'react';
import { Skill } from '@ashtrail/core';
import type {
    CombatAction,
    CombatEvent,
    CombatStateSnapshot,
    TacticalEntity,
    CombatPhase,
    CombatLogMessage,
    CombatConfig,
    Grid,
    CombatRosterEntry,
    CombatPreviewState,
} from '@ashtrail/core';

export type PlayerAction = 'idle' | 'moving' | 'attacking' | 'targeting_skill';

export interface CombatSetup {
    roster: CombatRosterEntry[];
    grid?: Grid;
    config: CombatConfig;
}

const WS_URL = `ws://${window.location.hostname}:8787/api/combat/ws`;
const MELEE_ATTACK_COST = 3;
const EMPTY_PREVIEW: CombatPreviewState = {
    mode: 'none',
    reachableCells: [],
    pathCells: [],
    attackableCells: [],
    blockedCells: [],
    aoeCells: [],
    targetPreviews: [],
};

export function useCombatWebSocket(setup: CombatSetup) {
    const [serverState, setServerState] = useState<CombatStateSnapshot | null>(null);
    const [previewState, setPreviewState] = useState<CombatPreviewState>(EMPTY_PREVIEW);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [playerAction, setPlayerAction] = useState<PlayerAction>('idle');
    const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const setupRef = useRef(setup);
    setupRef.current = setup;

    const sendAction = useCallback((action: CombatAction) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(action));
        }
    }, []);

    useEffect(() => {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            setError(null);
            sendAction({
                type: 'start_combat',
                roster: setupRef.current.roster,
                grid: setupRef.current.grid,
                config: setupRef.current.config,
            });
        };

        ws.onmessage = (event) => {
            try {
                const combatEvent: CombatEvent = JSON.parse(event.data);
                switch (combatEvent.type) {
                    case 'state_sync':
                        setServerState(combatEvent.state);
                        break;
                    case 'preview_state':
                        setPreviewState(combatEvent.preview);
                        break;
                    case 'error':
                        setError(combatEvent.message);
                        break;
                    case 'entity_moved':
                    case 'attack_result':
                    case 'skill_used':
                    case 'entity_defeated':
                    case 'turn_changed':
                    case 'combat_ended':
                    case 'log':
                    case 'highlight_cells':
                        break;
                }
            } catch (parseError) {
                console.error('Failed to parse combat event:', parseError);
            }
        };

        ws.onerror = () => {
            setError('WebSocket connection error');
        };

        ws.onclose = () => {
            setIsConnected(false);
        };

        return () => {
            ws.close();
            wsRef.current = null;
        };
    }, [sendAction]);

    const previewMove = useCallback((entityId: string, hoverRow?: number, hoverCol?: number) => {
        sendAction({ type: 'preview_move', entityId, hoverRow, hoverCol });
    }, [sendAction]);

    const previewBasicAttack = useCallback((attackerId: string, hoverRow?: number, hoverCol?: number) => {
        sendAction({ type: 'preview_basic_attack', attackerId, hoverRow, hoverCol });
    }, [sendAction]);

    const previewSkill = useCallback((casterId: string, skillId: string, hoverRow?: number, hoverCol?: number) => {
        sendAction({ type: 'preview_skill', casterId, skillId, hoverRow, hoverCol });
    }, [sendAction]);

    const clearPreview = useCallback(() => {
        sendAction({ type: 'clear_preview' });
    }, [sendAction]);

    const activeEntityId = serverState?.activeEntityId ?? '';
    const activeEntity = serverState?.entities[activeEntityId];
    const isPlayerTurn = activeEntity?.isPlayer ?? false;

    useEffect(() => {
        if (!serverState || serverState.phase !== 'combat' || !activeEntity || !activeEntity.isPlayer) {
            setPreviewState(EMPTY_PREVIEW);
            setSelectedSkill(null);
            setPlayerAction('idle');
            return;
        }

        if (selectedSkill) {
            previewSkill(activeEntity.id, selectedSkill.id);
            setPlayerAction('targeting_skill');
        } else {
            previewMove(activeEntity.id);
            setPlayerAction('idle');
        }
    }, [activeEntity?.id, activeEntity?.isPlayer, previewMove, previewSkill, selectedSkill, serverState]);

    const handleCellClick = useCallback((row: number, col: number) => {
        if (!serverState || serverState.phase !== 'combat' || !activeEntity || !activeEntity.isPlayer) {
            return;
        }

        if (selectedSkill) {
            sendAction({
                type: 'use_skill',
                casterId: activeEntity.id,
                skillId: selectedSkill.id,
                targetRow: row,
                targetCol: col,
            });
            setSelectedSkill(null);
            setPlayerAction('idle');
            return;
        }

        const cell = serverState.grid[row]?.[col];
        if (!cell) return;

        if (cell.occupantId && cell.occupantId !== activeEntity.id) {
            sendAction({
                type: 'attack',
                attackerId: activeEntity.id,
                defenderId: cell.occupantId,
            });
            return;
        }

        if (cell.walkable && !cell.occupantId) {
            sendAction({
                type: 'move',
                entityId: activeEntity.id,
                targetRow: row,
                targetCol: col,
            });
        }
    }, [activeEntity, selectedSkill, sendAction, serverState]);

    const endTurn = useCallback(() => {
        sendAction({ type: 'end_turn' });
        setSelectedSkill(null);
        setPlayerAction('idle');
    }, [sendAction]);

    const selectSkill = useCallback((skill: Skill | null) => {
        setSelectedSkill(skill);
        if (!activeEntity || !activeEntity.isPlayer || !serverState || serverState.phase !== 'combat') {
            setPlayerAction('idle');
            return;
        }

        if (skill) {
            setPlayerAction('targeting_skill');
            previewSkill(activeEntity.id, skill.id);
        } else {
            setPlayerAction('idle');
            previewMove(activeEntity.id);
        }
    }, [activeEntity, previewMove, previewSkill, serverState]);

    const grid = serverState?.grid ?? [];
    const entities: Map<string, TacticalEntity> = new Map(
        serverState ? Object.entries(serverState.entities) : []
    );
    const turnOrder = serverState?.turnOrder ?? [];
    const phase: CombatPhase = serverState?.phase ?? 'placement';
    const logs: CombatLogMessage[] = serverState?.logs ?? [];
    const turnNumber = serverState?.turnNumber ?? 1;

    return {
        grid,
        entities,
        turnOrder,
        activeEntityId,
        activeEntity,
        isPlayerTurn,
        phase,
        playerAction,
        logs,
        turnNumber,
        handleCellClick,
        endTurn,
        selectSkill,
        selectedSkill,
        previewState,
        previewMove,
        previewBasicAttack,
        previewSkill,
        clearPreview,
        MELEE_ATTACK_COST,
        isConnected,
        error,
    };
}
