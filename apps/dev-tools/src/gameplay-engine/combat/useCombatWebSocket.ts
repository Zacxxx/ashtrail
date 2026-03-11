// ═══════════════════════════════════════════════════════════
// useCombatWebSocket.ts — Replaces useTacticalCombat with server-driven state
// Connects to the Rust backend via WebSocket, sends actions, receives state.
// ═══════════════════════════════════════════════════════════

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
    GridPos,
} from '@ashtrail/core';
import { Grid } from './tacticalGrid';

// ── Types ──

export type PlayerAction = 'idle' | 'moving' | 'attacking' | 'targeting_skill';

export interface CombatSetup {
    players: TacticalEntity[];
    enemies: TacticalEntity[];
    grid?: Grid;
    config: CombatConfig;
}

const WS_URL = `ws://${window.location.hostname}:8787/api/combat/ws`;

const MELEE_ATTACK_COST = 3;

// ── Hook ──

export function useCombatWebSocket(setup: CombatSetup) {
    // State from server
    const [serverState, setServerState] = useState<CombatStateSnapshot | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Local UI state (not server-driven)
    const [playerAction, setPlayerAction] = useState<PlayerAction>('idle');
    const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const setupRef = useRef(setup);
    setupRef.current = setup;

    // Connect and start combat
    useEffect(() => {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            setError(null);
            // Send start combat action immediately
            const action: CombatAction = {
                type: 'start_combat',
                players: setupRef.current.players,
                enemies: setupRef.current.enemies,
                grid: setupRef.current.grid,
                config: setupRef.current.config,
            };
            ws.send(JSON.stringify(action));
        };

        ws.onmessage = (event) => {
            try {
                const combatEvent: CombatEvent = JSON.parse(event.data);
                handleEvent(combatEvent);
            } catch (e) {
                console.error('Failed to parse combat event:', e);
            }
        };

        ws.onerror = (e) => {
            console.error('Combat WebSocket error:', e);
            setError('WebSocket connection error');
        };

        ws.onclose = () => {
            setIsConnected(false);
        };

        return () => {
            ws.close();
            wsRef.current = null;
        };
    }, []); // Connect once on mount

    const handleEvent = useCallback((event: CombatEvent) => {
        switch (event.type) {
            case 'state_sync':
                setServerState(event.state);
                break;
            case 'error':
                setError(event.message);
                console.warn('[Combat WS] Error:', event.message);
                break;
            // Other events are informational — the state_sync after them updates everything
            // But we could add animations/effects based on these events in the future
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
    }, []);

    // ── Actions (send to server) ──

    const sendAction = useCallback((action: CombatAction) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(action));
        }
    }, []);

    const handleCellClick = useCallback((row: number, col: number) => {
        if (!serverState || serverState.phase !== 'combat') return;

        const activeId = serverState.activeEntityId;
        const activeEntity = serverState.entities[activeId];
        if (!activeEntity || !activeEntity.isPlayer) return;

        // ── Skill targeting mode ──
        if (selectedSkill) {
            sendAction({
                type: 'use_skill',
                casterId: activeId,
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

        // ── Click on enemy: basic attack ──
        if (cell.occupantId && cell.occupantId !== activeId) {
            const target = serverState.entities[cell.occupantId];
            if (target && !target.isPlayer) {
                const dist = Math.abs(row - activeEntity.gridPos.row) + Math.abs(col - activeEntity.gridPos.col);
                const weaponRange = (activeEntity as any).equipped?.mainHand?.weaponRange || 1;
                if (dist <= weaponRange && activeEntity.ap >= MELEE_ATTACK_COST) {
                    sendAction({
                        type: 'attack',
                        attackerId: activeId,
                        defenderId: cell.occupantId,
                    });
                    return;
                }
            }
        }

        // ── Click on empty walkable cell: move ──
        if (cell.walkable && !cell.occupantId && activeEntity.mp > 0) {
            sendAction({
                type: 'move',
                entityId: activeId,
                targetRow: row,
                targetCol: col,
            });
        }
    }, [serverState, selectedSkill, sendAction]);

    const endTurn = useCallback(() => {
        sendAction({ type: 'end_turn' });
        setSelectedSkill(null);
        setPlayerAction('idle');
    }, [sendAction]);

    const selectSkill = useCallback((skill: Skill | null) => {
        setSelectedSkill(skill);
        setPlayerAction(skill ? 'targeting_skill' : 'idle');
    }, []);

    // ── Derived values (matching useTacticalCombat interface) ──

    const grid = serverState?.grid ?? [];
    const entities: Map<string, TacticalEntity> = new Map(
        serverState ? Object.entries(serverState.entities) : []
    );
    const turnOrder = serverState?.turnOrder ?? [];
    const activeEntityId = serverState?.activeEntityId ?? '';
    const activeEntity = serverState?.entities[activeEntityId];
    const isPlayerTurn = activeEntity?.isPlayer ?? false;
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
        MELEE_ATTACK_COST,
        isConnected,
        error,
    };
}
