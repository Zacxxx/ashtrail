// ═══════════════════════════════════════════════════════════
// combat-protocol.ts — Shared types for the WebSocket combat protocol
// Mirrors Rust backend combat_engine/types.rs exactly.
// ═══════════════════════════════════════════════════════════

import type { CharacterProgression, Skill, Trait, Item, GameplayEffect, Occupation } from './types';

// ── Grid Types (mirrored from tacticalGrid.ts) ─────────────
// Defined here so packages/core is self-contained.

export interface GridCell {
    row: number;
    col: number;
    walkable: boolean;
    occupantId: string | null;
    isSpawnZone?: 'player' | 'enemy';
    highlight?: 'move' | 'attack' | 'attack-blocked' | 'path' | null;
    textureUrl?: string;
}

export type Grid = GridCell[][];

// ── Entities ────────────────────────────────────────────────

export interface BaseStats {
    strength: number;
    agility: number;
    intelligence: number;
    wisdom: number;
    endurance: number;
    charisma: number;
    evasion: number;
    defense: number;
}

export interface TacticalEntity {
    id: string;
    isPlayer: boolean;
    name: string;
    hp: number;
    maxHp: number;
    strength: number;
    agility: number;
    intelligence: number;
    wisdom: number;
    endurance: number;
    charisma: number;
    critChance: number;
    resistance: number;
    socialBonus: number;
    evasion: number;
    defense: number;
    traits: Trait[];
    skills: Skill[];
    occupation?: Occupation;
    progression?: CharacterProgression;
    skillCooldowns: Record<string, number>;
    ap: number;
    maxAp: number;
    mp: number;
    maxMp: number;
    level: number;
    gridPos: GridPos;
    equipped?: Record<string, Item | null>;
    activeEffects?: (GameplayEffect & { justApplied?: boolean; protectorId?: string; lastKnownPosition?: GridPos })[];
    baseStats: BaseStats;
}

export interface DamagePreview {
    min: number;
    max: number;
    critMin: number;
    critMax: number;
    isMagical: boolean;
    critChance: number;
}

export interface CombatRosterEntry {
    rosterId: string;
    characterId: string;
    team: 'player' | 'enemy';
}

export interface CombatTargetPreview {
    entityId: string;
    preview: DamagePreview;
}

export interface CombatPreviewState {
    mode: 'none' | 'move' | 'attack' | 'skill';
    reachableCells: GridPos[];
    pathCells: GridPos[];
    attackableCells: GridPos[];
    blockedCells: GridPos[];
    aoeCells: GridPos[];
    hoveredCell?: GridPos;
    hoveredError?: string;
    targetPreviews: CombatTargetPreview[];
}

export interface GridPos {
    row: number;
    col: number;
}

// ── Combat State ────────────────────────────────────────────

export type CombatPhase = 'placement' | 'combat' | 'victory' | 'defeat';
export type PlayerAction = 'idle' | 'moving' | 'attacking' | 'targeting_skill';

export interface CombatLogMessage {
    id: string;
    message: string;
    type: 'system' | 'damage' | 'heal' | 'info';
}

export interface CombatConfig {
    gridRows: number;
    gridCols: number;
}

export interface CombatStateSnapshot {
    grid: Grid;
    entities: Record<string, TacticalEntity>;
    turnOrder: string[];
    activeEntityId: string;
    phase: CombatPhase;
    logs: CombatLogMessage[];
    turnNumber: number;
}

// ── WebSocket Protocol ──────────────────────────────────────

export interface SkillTarget {
    entityId: string;
    damage: number | null;
    healing: number | null;
    isCrit: boolean;
    isMiss: boolean;
    newHp: number;
}

/** Client → Server messages */
export type CombatAction =
    | { type: 'start_combat'; roster?: CombatRosterEntry[]; players?: TacticalEntity[]; enemies?: TacticalEntity[]; grid?: Grid; config: CombatConfig }
    | { type: 'move'; entityId: string; targetRow: number; targetCol: number }
    | { type: 'attack'; attackerId: string; defenderId: string }
    | { type: 'use_skill'; casterId: string; skillId: string; targetRow: number; targetCol: number }
    | { type: 'preview_move'; entityId: string; hoverRow?: number; hoverCol?: number }
    | { type: 'preview_basic_attack'; attackerId: string; hoverRow?: number; hoverCol?: number }
    | { type: 'preview_skill'; casterId: string; skillId: string; hoverRow?: number; hoverCol?: number }
    | { type: 'clear_preview' }
    | { type: 'end_turn' };

/** Server → Client messages */
export type CombatEvent =
    | { type: 'state_sync'; state: CombatStateSnapshot }
    | { type: 'preview_state'; preview: CombatPreviewState }
    | { type: 'entity_moved'; entityId: string; from: GridPos; to: GridPos; mpCost: number; tackleCost: number }
    | { type: 'attack_result'; attackerId: string; defenderId: string; damage: number; isCrit: boolean; isMiss: boolean }
    | { type: 'skill_used'; casterId: string; skillId: string; targets: SkillTarget[] }
    | { type: 'entity_defeated'; entityId: string }
    | { type: 'turn_changed'; activeEntityId: string; turnNumber: number }
    | { type: 'combat_ended'; result: 'victory' | 'defeat' }
    | { type: 'log'; message: CombatLogMessage }
    | { type: 'error'; message: string }
    | { type: 'highlight_cells'; cells: GridPos[]; highlightType: 'move' | 'attack' | 'path' };
