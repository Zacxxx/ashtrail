// ═══════════════════════════════════════════════════════════
// useTacticalCombat.ts — React hook for Dofus-style tactical combat
// ═══════════════════════════════════════════════════════════

import { useState, useCallback, useEffect, useRef } from 'react';
import { Trait, Skill } from '@ashtrail/core';
import { GameRulesManager } from '../rules/useGameRules';
import {
    Grid, GridCell,
    generateGrid, getReachableCells, getAttackableCells, getNeighbors, getAoECells,
    findPath, moveEntityOnGrid, placeEntity, removeEntity,
    clearHighlights, highlightCells,
} from './tacticalGrid';
import { CombatLogMessage, calculateEffectiveStats } from './useCombatEngine';

// ── Types ──

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
    charisma: number;
    critChance: number;
    resistance: number;
    socialBonus: number;
    evasion: number;
    defense: number;
    traits: Trait[];
    skills: Skill[];
    skillCooldowns: Record<string, number>; // skillId -> turns remaining
    // Tactical additions
    ap: number;
    maxAp: number;
    mp: number;
    maxMp: number;
    gridPos: { row: number; col: number };
}

export type CombatPhase = 'placement' | 'combat' | 'victory' | 'defeat';
export type PlayerAction = 'idle' | 'moving' | 'attacking' | 'targeting_skill';

export interface TacticalCombatState {
    grid: Grid;
    entities: Map<string, TacticalEntity>;
    turnOrder: string[];
    activeEntityIndex: number;
    phase: CombatPhase;
    playerAction: PlayerAction;
    logs: CombatLogMessage[];
    turnNumber: number;
    selectedCell: GridCell | null;
}

// ── Config ──

const MELEE_ATTACK_COST = 3;
const MELEE_RANGE = 1;

export interface CombatConfig {
    gridRows: number;
    gridCols: number;
}

const DEFAULT_CONFIG: CombatConfig = { gridRows: 12, gridCols: 12 };

// ── Helper: Create TacticalEntity from combat entity params ──

export function createTacticalEntity(
    id: string,
    isPlayer: boolean,
    name: string,
    strength: number,
    agility: number,
    endurance: number,
    intelligence: number,
    wisdom: number,
    charisma: number,
    evasion: number,
    defense: number,
    hp: number,
    maxHp: number,
    traits: Trait[],
    skills: Skill[],
    gridPos: { row: number; col: number }
): TacticalEntity {
    const base = calculateEffectiveStats(
        { id, isPlayer, name, hp, maxHp, strength, agility, endurance, intelligence, wisdom, charisma, evasion, defense, traits } as any,
        traits
    );
    return {
        ...base,
        skills,
        skillCooldowns: {},
        gridPos,
    };
}

// ── The Hook ──

function calculateTackleCost(grid: Grid, entities: Map<string, TacticalEntity>, entityId: string): number {
    const entity = entities.get(entityId);
    if (!entity) return 0;

    const neighbors = getNeighbors(grid, entity.gridPos.row, entity.gridPos.col);
    let enemyAgilitySum = 0;
    let adjacentEnemies = 0;

    for (const cell of neighbors) {
        if (cell.occupantId) {
            const occupant = entities.get(cell.occupantId);
            if (occupant && occupant.hp > 0 && occupant.isPlayer !== entity.isPlayer) {
                enemyAgilitySum += occupant.agility;
                adjacentEnemies++;
            }
        }
    }

    if (adjacentEnemies === 0) return 0;

    // If our agility is 1.5x or more than the sum of enemy agility, we escape freely
    if (entity.agility * 1.5 >= enemyAgilitySum) return 0;

    // Otherwise it costs AP to break away
    return Math.max(1, Math.floor(enemyAgilitySum / Math.max(1, entity.agility)));
}

export function useTacticalCombat(
    playerEntities: TacticalEntity[],
    enemyEntities: TacticalEntity[],
    initialGrid?: Grid,
    config: CombatConfig = DEFAULT_CONFIG,
) {
    const { gridRows, gridCols } = config;

    // Initialize both grid and entities safely without mutating props
    const [{ initialGridState, initialEntitiesState }] = useState(() => {
        let g = initialGrid
            ? initialGrid.map(row => row.map(cell => ({ ...cell })))
            : generateGrid(gridRows, gridCols, 0.12);

        const m = new Map<string, TacticalEntity>();

        const playerSpawns = g.flatMap(row => row.filter(c => c.isSpawnZone === 'player' && c.walkable && !c.occupantId))
            .sort(() => Math.random() - 0.5);
        playerEntities.forEach((baseEntity, i) => {
            const e = { ...baseEntity };
            if (i < playerSpawns.length) {
                g[playerSpawns[i].row][playerSpawns[i].col].occupantId = e.id;
                e.gridPos = { row: playerSpawns[i].row, col: playerSpawns[i].col };
            }
            m.set(e.id, e);
        });

        const enemySpawns = g.flatMap(row => row.filter(c => c.isSpawnZone === 'enemy' && c.walkable && !c.occupantId))
            .sort(() => Math.random() - 0.5);
        enemyEntities.forEach((baseEntity, i) => {
            const e = { ...baseEntity };
            if (i < enemySpawns.length) {
                g[enemySpawns[i].row][enemySpawns[i].col].occupantId = e.id;
                e.gridPos = { row: enemySpawns[i].row, col: enemySpawns[i].col };
            }
            m.set(e.id, e);
        });

        return { initialGridState: g, initialEntitiesState: m };
    });

    const [grid, setGrid] = useState<Grid>(initialGridState);
    const [entities, setEntities] = useState<Map<string, TacticalEntity>>(initialEntitiesState);

    // Turn order: sorted by agility descending
    const [turnOrder] = useState<string[]>(() => {
        const all = [...playerEntities, ...enemyEntities];
        all.sort((a, b) => b.agility - a.agility);
        return all.map(e => e.id);
    });

    const [activeEntityIndex, setActiveEntityIndex] = useState(0);
    const [phase, setPhase] = useState<CombatPhase>('combat');
    const [playerAction, setPlayerAction] = useState<PlayerAction>('idle');
    const [logs, setLogs] = useState<CombatLogMessage[]>([]);
    const [turnNumber, setTurnNumber] = useState(1);
    const [selectedCell, setSelectedCell] = useState<GridCell | null>(null);
    const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);

    // Prevent stale closure issues with AI timer
    const entitiesRef = useRef(entities);
    const gridRef = useRef(grid);
    useEffect(() => { entitiesRef.current = entities; }, [entities]);
    useEffect(() => { gridRef.current = grid; }, [grid]);

    const addLog = useCallback((msg: string, type: CombatLogMessage['type'] = 'info') => {
        setLogs(prev => [...prev, { id: `${Date.now()}-${Math.random()}`, message: msg, type }]);
    }, []);

    // ── Derived ──
    const activeEntityId = turnOrder[activeEntityIndex] || '';
    const activeEntity = entities.get(activeEntityId);
    const isPlayerTurn = activeEntity?.isPlayer ?? false;

    // ── Init log ──
    const initRef = useRef(false);
    useEffect(() => {
        if (!initRef.current) {
            initRef.current = true;
            addLog('⚔️ Tactical combat initiated!', 'system');
            if (activeEntity) {
                addLog(`${activeEntity.name}'s turn. AP: ${activeEntity.ap} | MP: ${activeEntity.mp}`, 'system');
            }
        }
    }, []);

    // ── Show reachable cells when player turn and idle ──
    useEffect(() => {
        if (phase !== 'combat' || !activeEntity || !isPlayerTurn) return;
        if (playerAction === 'idle') {
            const reachable = getReachableCells(grid, activeEntity.gridPos.row, activeEntity.gridPos.col, activeEntity.mp);
            setGrid(prev => highlightCells(prev, reachable, 'move'));
        }
    }, [activeEntityId, playerAction, phase]);

    // ── Show attackable cells when skill is selected ──
    useEffect(() => {
        if (phase !== 'combat' || !activeEntity || !isPlayerTurn || !selectedSkill) return;
        if (playerAction === 'targeting_skill') {
            const attackable = getAttackableCells(grid, activeEntity.gridPos.row, activeEntity.gridPos.col, selectedSkill.minRange, selectedSkill.maxRange);
            setGrid(prev => highlightCells(prev, attackable, 'attack'));
        }
    }, [selectedSkill, playerAction]);

    // ── Select Skill ──
    const selectSkill = useCallback((skill: Skill | null) => {
        if (!skill) {
            setSelectedSkill(null);
            setPlayerAction('idle');
            return;
        }
        if (!activeEntity) return;

        // Check AP
        if (activeEntity.ap < skill.apCost) {
            addLog(`Not enough AP for ${skill.name} (need ${skill.apCost}, have ${activeEntity.ap})`, 'info');
            return;
        }
        // Check cooldown
        const cd = activeEntity.skillCooldowns[skill.id] || 0;
        if (cd > 0) {
            addLog(`${skill.name} is on cooldown (${cd} turns remaining)`, 'info');
            return;
        }

        // Self-targeting skills execute immediately
        if (skill.targetType === 'self') {
            executeSkill(activeEntity.id, activeEntity.gridPos.row, activeEntity.gridPos.col, skill);
            return;
        }

        setSelectedSkill(skill);
        setPlayerAction('targeting_skill');
    }, [activeEntity]);

    // ── Execute Skill ──
    const executeSkill = useCallback((casterId: string, targetRow: number, targetCol: number, skill: Skill) => {
        const caster = entities.get(casterId);
        if (!caster) return;
        if (caster.ap < skill.apCost) return;

        const dr = targetRow - caster.gridPos.row;
        const dc = targetCol - caster.gridPos.col;
        let dirR = 0; let dirC = 0;
        if (skill.areaType === 'line') {
            if (Math.abs(dr) > Math.abs(dc)) dirR = dr > 0 ? 1 : -1;
            else if (Math.abs(dc) > Math.abs(dr)) dirC = dc > 0 ? 1 : -1;
            else { dirR = dr > 0 ? 1 : -1; dirC = 0; }
        }

        const affectedCells = getAoECells(grid, targetRow, targetCol, skill.areaType, skill.areaSize || 0, dirR, dirC);

        setEntities(prev => {
            const next = new Map(prev);

            // Deduct AP caster
            const c = { ...next.get(casterId)! };
            c.ap -= skill.apCost;
            if (skill.cooldown > 0) {
                c.skillCooldowns = { ...c.skillCooldowns, [skill.id]: skill.cooldown + 1 };
            }
            next.set(casterId, c);

            for (const cell of affectedCells) {
                if (!cell.occupantId) continue;
                const targetId = cell.occupantId;
                const t = next.get(targetId);
                if (!t || t.hp <= 0) continue;

                // For AoE, we generally apply to all. We could filter by targetType if we wanted strict friend/foe AoE.
                if (skill.healing) {
                    const rules = GameRulesManager.get();
                    const variance = rules.combat.damageVarianceMin + (Math.random() * (rules.combat.damageVarianceMax - rules.combat.damageVarianceMin));
                    const charismaBonus = 1 + c.socialBonus;
                    const healAmount = Math.floor(skill.healing * charismaBonus * variance);
                    const actualHeal = Math.min(healAmount, t.maxHp - t.hp);
                    t.hp = Math.min(t.maxHp, t.hp + healAmount);
                    addLog(`${skill.icon || '✨'} ${c.name} uses ${skill.name} on ${t.name} → heals ${actualHeal} HP!`, 'heal');
                }

                if (skill.damage) {
                    const isPhysical = skill.effectType === 'physical';
                    const isMagical = skill.effectType === 'magical';

                    if (isPhysical) {
                        const hitChance = 100 - t.evasion;
                        if (Math.random() * 100 > hitChance) {
                            addLog(`${skill.icon || '✨'} ${skill.name} missed ${t.name}!`, 'info');
                            continue;
                        }
                    }

                    // Critical Hit check
                    const isCrit = Math.random() < c.critChance;

                    const rules = GameRulesManager.get();
                    const variance = rules.combat.damageVarianceMin + (Math.random() * (rules.combat.damageVarianceMax - rules.combat.damageVarianceMin));

                    // Base scaled damage
                    let scaledDamage = Math.floor((skill.damage + c.strength * rules.combat.strengthToPowerRatio) * variance);

                    if (isCrit) {
                        scaledDamage = Math.floor(scaledDamage * 1.5);
                    }

                    // Resistance/Defense check
                    let actualDamage = scaledDamage;
                    if (isMagical) {
                        // Magical damage is resisted by Wisdom
                        const resistAmount = Math.floor(actualDamage * t.resistance);
                        actualDamage = Math.max(1, actualDamage - resistAmount);
                    } else {
                        // Physical damage is reduced by flat defense
                        actualDamage = Math.max(1, actualDamage - t.defense);
                    }

                    const newHp = Math.max(0, t.hp - actualDamage);
                    t.hp = newHp;

                    addLog(`${skill.icon || '✨'} ${c.name} uses ${skill.name} on ${t.name} → ${isCrit ? 'CRITICAL ' : ''}${actualDamage} damage!`, 'damage');

                    if (skill.pushDistance && skill.pushDistance > 0 && newHp > 0) {
                        // Push effect simplified for AoE (push away from center)
                        const pdr = t.gridPos.row - targetRow;
                        const pdc = t.gridPos.col - targetCol;
                        const pDirR = pdr === 0 ? 0 : (pdr > 0 ? 1 : -1);
                        const pDirC = pdc === 0 ? 0 : (pdc > 0 ? 1 : -1);

                        let newRow = t.gridPos.row;
                        let newCol = t.gridPos.col;
                        for (let i = 0; i < skill.pushDistance; i++) {
                            const nextR = newRow + pDirR;
                            const nextC = newCol + pDirC;
                            if (nextR < 0 || nextR >= grid.length || nextC < 0 || nextC >= grid[0].length) break;
                            if (!grid[nextR][nextC].walkable || grid[nextR][nextC].occupantId) break;
                            newRow = nextR;
                            newCol = nextC;
                        }
                        if (newRow !== t.gridPos.row || newCol !== t.gridPos.col) {
                            // Because we update grid later, we must be careful. 
                            // It's safer to just log the push but not execute it in AoE loop without a complex queue. 
                            // We will skip push for now in AoE to avoid grid desync, or we can just apply t.gridPos and let grid refresh.
                            // To keep it simple, we just don't push if it's an AoE effect unless we rewrite the grid resolver.
                        }
                    }
                }
                next.set(targetId, { ...t });
            }
            return next;
        });

        setTimeout(() => {
            setEntities(currEntities => {
                const dead = [...currEntities.values()].filter(e => e.hp <= 0);
                if (dead.length > 0) {
                    setGrid(currGrid => {
                        let ng = currGrid;
                        for (const d of dead) ng = removeEntity(ng, d.gridPos.row, d.gridPos.col);
                        return ng;
                    });
                    dead.forEach(d => {
                        addLog(`💀 ${d.name} has been defeated!`, 'system');
                        checkWinLoss(d.id);
                    });
                }
                return currEntities;
            });
        }, 50);

        setSelectedSkill(null);
        setPlayerAction('idle');
    }, [entities, grid, addLog]);

    // ── Win/Loss check ──
    const checkWinLoss = useCallback((defeatedId: string) => {
        const currentEntities = entitiesRef.current;
        const allAlive = [...currentEntities.values()].filter(e => e.hp > 0 && e.id !== defeatedId);
        const playersAlive = allAlive.filter(e => e.isPlayer);
        const enemiesAlive = allAlive.filter(e => !e.isPlayer);

        if (enemiesAlive.length === 0) {
            addLog('🏆 VICTORY! All enemies defeated!', 'system');
            setPhase('victory');
        } else if (playersAlive.length === 0) {
            addLog('💀 DEFEAT... All allies have fallen.', 'system');
            setPhase('defeat');
        }
    }, [addLog]);

    // ── Cell Click Handler ──
    const handleCellClick = useCallback((row: number, col: number) => {
        if (phase !== 'combat' || !activeEntity || !isPlayerTurn) return;

        const cell = grid[row][col];
        setSelectedCell(cell);

        // Skill targeting mode
        if (playerAction === 'targeting_skill' && selectedSkill) {
            if (!cell.walkable) {
                addLog('Cannot target obstacles.', 'info');
                setSelectedSkill(null);
                setPlayerAction('idle');
                return;
            }

            const dist = Math.abs(row - activeEntity.gridPos.row) + Math.abs(col - activeEntity.gridPos.col);
            if (dist < selectedSkill.minRange || dist > selectedSkill.maxRange) {
                // Clicking outside valid range cancels targeting
                setSelectedSkill(null);
                setPlayerAction('idle');
                return;
            }

            if (selectedSkill.targetType === 'cell' || cell.occupantId) {
                const target = cell.occupantId ? entities.get(cell.occupantId) : null;
                if (selectedSkill.targetType === 'cell' || (target && target.hp > 0)) {
                    if (
                        selectedSkill.targetType === 'cell' ||
                        (selectedSkill.targetType === 'enemy' && target && !target.isPlayer) ||
                        (selectedSkill.targetType === 'ally' && target && target.isPlayer)
                    ) {
                        executeSkill(activeEntity.id, row, col, selectedSkill);
                        return; // execution finished, handlers reset state inside executeSkill
                    } else {
                        addLog(`Invalid target for ${selectedSkill.name}.`, 'info');
                    }
                }
            } else {
                addLog(`${selectedSkill.name} requires an occupant as a target.`, 'info');
            }

            // Clicked in range but invalid target: cancel targeting
            setSelectedSkill(null);
            setPlayerAction('idle');
            return;
        }

        if (playerAction === 'idle' || playerAction === 'moving') {
            // Check if clicking on an enemy to basic attack
            if (cell.occupantId && cell.occupantId !== activeEntity.id) {
                const target = entities.get(cell.occupantId);
                if (target && !target.isPlayer) {
                    const dist = Math.abs(row - activeEntity.gridPos.row) + Math.abs(col - activeEntity.gridPos.col);
                    if (dist <= MELEE_RANGE && activeEntity.ap >= MELEE_ATTACK_COST) {
                        performAttack(activeEntity.id, cell.occupantId);
                        return;
                    }
                }
            }

            // Check if clicking a walkable cell to move
            if (cell.walkable && !cell.occupantId && activeEntity.mp > 0) {
                const path = findPath(grid, activeEntity.gridPos.row, activeEntity.gridPos.col, row, col);
                if (path && path.length <= activeEntity.mp) {
                    const tackleCost = calculateTackleCost(grid, entities, activeEntity.id);
                    if (activeEntity.ap < tackleCost) {
                        addLog(`💢 ${activeEntity.name} is tackled and needs ${tackleCost} AP to escape!`, 'info');
                        return;
                    }
                    performMove(activeEntity.id, row, col, path.length, tackleCost);
                    return;
                }
            }
        }
    }, [grid, entities, activeEntity, isPlayerTurn, playerAction, phase, selectedSkill, executeSkill]);

    // ── Move ──
    const performMove = useCallback((entityId: string, toRow: number, toCol: number, mapCost: number, tackleCost: number = 0) => {
        const entity = entities.get(entityId);
        if (!entity || entity.mp < mapCost || entity.ap < tackleCost) return;

        setGrid(prev => {
            const newGrid = moveEntityOnGrid(prev, entityId, entity.gridPos.row, entity.gridPos.col, toRow, toCol);
            return clearHighlights(newGrid);
        });

        setEntities(prev => {
            const next = new Map(prev);
            const e = { ...next.get(entityId)! };
            e.gridPos = { row: toRow, col: toCol };
            e.mp -= mapCost;
            e.ap -= tackleCost;
            next.set(entityId, e);
            return next;
        });

        if (tackleCost > 0) {
            addLog(`💢 ${entity.name} breaks tackle (-${tackleCost} AP) and moves (-${mapCost} MP)`, 'info');
        } else {
            addLog(`${entity.name} moves to [${toRow}, ${toCol}] (-${mapCost} MP)`, 'info');
        }

        // Re-highlight after move
        setTimeout(() => {
            setGrid(prev => {
                const updatedEntity = entitiesRef.current.get(entityId);
                if (!updatedEntity) return prev;
                const reachable = getReachableCells(prev, toRow, toCol, updatedEntity.mp);
                return highlightCells(prev, reachable, 'move');
            });
        }, 50);
    }, [entities, addLog]);

    // ── Basic Attack (kept as a default action) ──
    const performAttack = useCallback((attackerId: string, defenderId: string) => {
        const attacker = entities.get(attackerId);
        const defender = entities.get(defenderId);
        if (!attacker || !defender) return;
        if (attacker.ap < MELEE_ATTACK_COST) {
            addLog(`${attacker.name} doesn't have enough AP to attack!`, 'info');
            return;
        }

        const hitChance = 100 - defender.evasion;
        const roll = Math.random() * 100;

        const isCrit = Math.random() < attacker.critChance;

        setEntities(prev => {
            const next = new Map(prev);
            const a = { ...next.get(attackerId)! };
            a.ap -= MELEE_ATTACK_COST;
            next.set(attackerId, a);
            return next;
        });

        if (roll > hitChance) {
            addLog(`${attacker.name} missed ${defender.name}! (-${MELEE_ATTACK_COST} AP)`, 'info');
            return;
        }

        const rules = GameRulesManager.get();
        const variance = rules.combat.damageVarianceMin + (Math.random() * (rules.combat.damageVarianceMax - rules.combat.damageVarianceMin));
        let rawDamage = Math.floor(attacker.strength * variance);

        if (isCrit) {
            rawDamage = Math.floor(rawDamage * 1.5);
        }

        const actualDamage = Math.max(1, rawDamage - defender.defense);

        addLog(`🗡️ ${attacker.name} strikes ${defender.name} for ${isCrit ? 'CRITICAL ' : ''}${actualDamage} damage! (-${MELEE_ATTACK_COST} AP)`, 'damage');

        const newHp = Math.max(0, defender.hp - actualDamage);
        setEntities(prev => {
            const next = new Map(prev);
            const d = { ...next.get(defenderId)! };
            d.hp = newHp;
            next.set(defenderId, d);
            return next;
        });

        if (newHp <= 0) {
            addLog(`💀 ${defender.name} has been defeated!`, 'system');
            setGrid(prev => removeEntity(prev, defender.gridPos.row, defender.gridPos.col));
            setTimeout(() => checkWinLoss(defenderId), 100);
        }
    }, [entities, addLog, checkWinLoss]);

    // ── End Turn ──
    const endTurn = useCallback(() => {
        if (phase !== 'combat') return;

        setGrid(prev => clearHighlights(prev));
        setPlayerAction('idle');
        setSelectedSkill(null);

        // Find next alive entity
        let nextIndex = activeEntityIndex;
        const aliveEntities = [...entities.values()].filter(e => e.hp > 0);
        if (aliveEntities.length <= 1) return;

        let attempts = 0;
        do {
            nextIndex = (nextIndex + 1) % turnOrder.length;
            attempts++;
        } while ((!entities.get(turnOrder[nextIndex]) || entities.get(turnOrder[nextIndex])!.hp <= 0) && attempts < turnOrder.length);

        // Check if we wrapped around = new round
        if (nextIndex <= activeEntityIndex) {
            setTurnNumber(t => t + 1);
        }

        // Reset AP/MP and tick cooldowns for the next entity
        const nextEntityId = turnOrder[nextIndex];
        setEntities(prev => {
            const next = new Map(prev);
            const e = next.get(nextEntityId);
            if (e) {
                const newCooldowns: Record<string, number> = {};
                for (const [skillId, cd] of Object.entries(e.skillCooldowns)) {
                    if (cd > 1) newCooldowns[skillId] = cd - 1;
                }
                next.set(nextEntityId, { ...e, ap: e.maxAp, mp: e.maxMp, skillCooldowns: newCooldowns });
            }
            return next;
        });

        setActiveEntityIndex(nextIndex);
        const nextEntity = entities.get(nextEntityId);
        if (nextEntity) {
            addLog(`── ${nextEntity.name}'s turn ──`, 'system');
        }
    }, [activeEntityIndex, entities, turnOrder, phase, addLog]);

    // ── AI Turn (Enhanced: uses skills) ──
    useEffect(() => {
        if (phase !== 'combat') return;
        if (!activeEntity || activeEntity.isPlayer || activeEntity.hp <= 0) return;

        const timer = setTimeout(() => {
            const currentGrid = gridRef.current;
            const currentEntities = entitiesRef.current;
            const ai = currentEntities.get(activeEntityId);
            if (!ai || ai.hp <= 0) { endTurn(); return; }

            const playerTargets = [...currentEntities.values()].filter(e => e.isPlayer && e.hp > 0);
            if (playerTargets.length === 0) { endTurn(); return; }

            // Pick closest target
            let closestTarget = playerTargets[0];
            let closestDist = Infinity;
            for (const target of playerTargets) {
                const d = Math.abs(target.gridPos.row - ai.gridPos.row) + Math.abs(target.gridPos.col - ai.gridPos.col);
                if (d < closestDist) { closestDist = d; closestTarget = target; }
            }

            // === AI Skill-based decision ===

            // 1. If low HP and has a self-heal, use it
            if (ai.hp < ai.maxHp * 0.4) {
                const healSkill = ai.skills.find(s =>
                    (s.targetType === 'self') && s.healing && s.apCost <= ai.ap && !(ai.skillCooldowns[s.id] > 0)
                );
                if (healSkill) {
                    executeSkill(ai.id, ai.gridPos.row, ai.gridPos.col, healSkill);
                    setTimeout(() => endTurn(), 800);
                    return;
                }
            }

            // 2. Try a ranged skill if target is far
            if (closestDist > MELEE_RANGE) {
                const rangedSkill = ai.skills.find(s =>
                    s.targetType === 'enemy' && s.damage && s.maxRange >= closestDist && s.minRange <= closestDist &&
                    s.apCost <= ai.ap && !(ai.skillCooldowns[s.id] > 0)
                );
                if (rangedSkill) {
                    executeSkill(ai.id, closestTarget.gridPos.row, closestTarget.gridPos.col, rangedSkill);
                    // After using ranged skill, maybe still move or end turn
                    setTimeout(() => endTurn(), 800);
                    return;
                }
            }

            // 3. Move closer if needed
            if (ai.mp > 0 && closestDist > MELEE_RANGE) {
                const tackleCost = calculateTackleCost(currentGrid, currentEntities, ai.id);
                if (ai.ap >= tackleCost) {
                    const reachable = getReachableCells(currentGrid, ai.gridPos.row, ai.gridPos.col, ai.mp);
                    let bestCell = null as GridCell | null;
                    let bestDist = closestDist;
                    for (const cell of reachable) {
                        const d = Math.abs(cell.row - closestTarget.gridPos.row) + Math.abs(cell.col - closestTarget.gridPos.col);
                        if (d < bestDist) { bestDist = d; bestCell = cell; }
                    }
                    if (bestCell) {
                        const path = findPath(currentGrid, ai.gridPos.row, ai.gridPos.col, bestCell.row, bestCell.col);
                        if (path) performMove(ai.id, bestCell.row, bestCell.col, path.length, tackleCost);
                    }
                }
            }

            // 4. Use melee skill or basic attack after moving
            setTimeout(() => {
                const updatedAi = entitiesRef.current.get(activeEntityId);
                if (!updatedAi || updatedAi.hp <= 0) { endTurn(); return; }

                const updatedTarget = entitiesRef.current.get(closestTarget.id);
                if (!updatedTarget || updatedTarget.hp <= 0) { endTurn(); return; }

                const newDist = Math.abs(updatedAi.gridPos.row - updatedTarget.gridPos.row) + Math.abs(updatedAi.gridPos.col - updatedTarget.gridPos.col);

                if (newDist <= MELEE_RANGE) {
                    // Try a melee skill first (pick highest damage that we can afford)
                    const meleeSkill = updatedAi.skills
                        .filter(s => s.targetType === 'enemy' && s.damage && s.maxRange >= newDist && s.minRange <= newDist &&
                            s.apCost <= updatedAi.ap && !(updatedAi.skillCooldowns[s.id] > 0))
                        .sort((a, b) => (b.damage || 0) - (a.damage || 0))[0];

                    if (meleeSkill) {
                        executeSkill(updatedAi.id, updatedTarget.gridPos.row, updatedTarget.gridPos.col, meleeSkill);
                    } else if (updatedAi.ap >= MELEE_ATTACK_COST) {
                        // Fallback to basic attack
                        performAttack(updatedAi.id, updatedTarget.id);
                    }
                }

                setTimeout(() => endTurn(), 600);
            }, 600);
        }, 800);

        return () => clearTimeout(timer);
    }, [activeEntityId, phase]);

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
        selectedCell,
        selectedSkill,
        handleCellClick,
        endTurn,
        selectSkill,
        setPlayerAction,
        MELEE_ATTACK_COST,
    };
}
