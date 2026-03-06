// ═══════════════════════════════════════════════════════════
// useTacticalCombat.ts — React hook for Dofus-style tactical combat
// ═══════════════════════════════════════════════════════════

import { useState, useCallback, useEffect, useRef } from 'react';
import { Trait, Skill } from '@ashtrail/core';
import { GameRulesManager } from '../rules/useGameRules';
import {
    Grid, GridCell,
    moveEntityOnGrid, getReachableCells, getAttackableCells,
    clearHighlights, highlightCells, getNeighbors, findPath,
    generateGrid, getAoECells, placeEntity, removeEntity
} from './tacticalGrid';
import { CombatLogMessage, CombatEntity, calculateEffectiveStats, BaseStats } from './useCombatEngine';

// ── Types ──

export interface DamagePreview {
    min: number;
    max: number;
    critMin: number;
    critMax: number;
    isMagical: boolean;
    critChance: number;
}

export interface TacticalEntity extends CombatEntity {
    skills: Skill[];
    skillCooldowns: Record<string, number>; // skillId -> turns remaining
    gridPos: { row: number; col: number };
    level: number;
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
    gridPos: { row: number; col: number },
    equipped?: Record<string, any>,
    activeEffects: any[] = [],
    level: number = 10
): TacticalEntity {
    const baseStats: BaseStats = { strength, agility, endurance, intelligence, wisdom, charisma, evasion, defense };

    // Create temp entity to calculate effective initial stats
    const tempEntity: any = {
        id, isPlayer, name, hp, maxHp, traits, equipped, activeEffects, baseStats
    };
    const effective = calculateEffectiveStats(tempEntity, traits);

    return {
        ...effective, // This now includes baseStats: baseStats
        level,
        skills,
        skillCooldowns: {},
        activeEffects: effective.activeEffects || [],
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
            setGrid(prev => {
                const cleared = clearHighlights(prev);
                return highlightCells(cleared, reachable, 'move');
            });
        }
    }, [activeEntityId, playerAction, activeEntity?.mp, activeEntity?.gridPos?.row, activeEntity?.gridPos?.col, phase, grid, entities]);

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

        const nextEntities = new Map(entities);
        const logsToAdd: { msg: string, type: CombatLogMessage['type'] }[] = [];

        // Deduct AP caster
        const rules = GameRulesManager.get();
        const c = { ...nextEntities.get(casterId)! };
        c.ap -= skill.apCost;
        if (skill.cooldown > 0) {
            c.skillCooldowns = { ...c.skillCooldowns, [skill.id]: skill.cooldown + 1 };
        }
        nextEntities.set(casterId, c);

        for (const cell of affectedCells) {
            if (!cell.occupantId) continue;
            const targetId = cell.occupantId;
            const t = nextEntities.get(targetId);
            if (!t || t.hp <= 0) continue;

            const tCopy = { ...t };

            // ── Distract (Charisma vs Wisdom) ──
            if (skill.id === 'distract') {
                const casterCha = c.charisma || 0;
                const targetWis = t.wisdom || 0;

                if (casterCha > targetWis) {
                    const scale = rules.combat.distractCharismaScale || 0.42;
                    const mpReduction = 1 + Math.floor(scale * Math.log(casterCha + 1));

                    // Apply immediate MP reduction for current turn if its target turn (optional, usually next)
                    // But user said "next turn", so we apply a 1 turn buff that reduces maxMp and thus resets to lower next turn
                    tCopy.activeEffects = [
                        ...(tCopy.activeEffects || []),
                        { type: 'STAT_MODIFIER', target: 'mp', value: -mpReduction, duration: 1, name: 'Distracted' }
                    ];

                    logsToAdd.push({
                        msg: `🎭 ${c.name} bothers ${t.name}, they lose ${mpReduction} movement points!`,
                        type: 'info'
                    });
                } else {
                    logsToAdd.push({
                        msg: `🛡️ ${t.name} is too wise to be distracted by ${c.name}.`,
                        type: 'info'
                    });
                }
                nextEntities.set(targetId, tCopy);
                continue; // Skip normal processing for this skill
            }

            // ── Analyze (Intelligence Scaling) ──
            if (skill.id === 'analyze') {
                const casterLevel = c.level || 10;
                const targetLevel = t.level || 10;

                if (targetLevel > casterLevel + 5) {
                    logsToAdd.push({
                        msg: `⚠️ ${t.name} is too powerful to be analyzed by ${c.name}!`,
                        type: 'info'
                    });
                } else {
                    const scale = (rules.combat?.analyzeIntelScale !== undefined) ? rules.combat.analyzeIntelScale : 0.6;
                    const baseBonus = (rules.combat?.analyzeBaseCrit !== undefined) ? rules.combat.analyzeBaseCrit : 30;
                    const logVal = Math.log((c.intelligence || 0) + 1);
                    const critBonus = Math.max(0, baseBonus + Math.floor(scale * logVal * 10));

                    tCopy.activeEffects = [
                        ...(tCopy.activeEffects || []),
                        { type: 'ANALYZED', value: critBonus, duration: 2, name: 'Weakness Revealed', casterId: c.id }
                    ];

                    logsToAdd.push({
                        msg: `🔍 ${c.name} identifies flaws in ${t.name}! +${critBonus}% Crit chance for everyone.`,
                        type: 'info'
                    });
                }
                nextEntities.set(targetId, tCopy);
                continue;
            }

            // For AoE, we generally apply to all. We could filter by targetType if we wanted strict friend/foe AoE.
            if (skill.healing) {
                const variance = rules.combat.damageVarianceMin + (Math.random() * (rules.combat.damageVarianceMax - rules.combat.damageVarianceMin));
                const charismaBonus = 1 + c.socialBonus;
                const healAmount = Math.floor(skill.healing * charismaBonus * variance);
                const actualHeal = Math.min(healAmount, tCopy.maxHp - tCopy.hp);
                tCopy.hp = Math.min(tCopy.maxHp, tCopy.hp + healAmount);
                logsToAdd.push({ msg: `${skill.icon || '✨'} ${c.name} uses ${skill.name} on ${tCopy.name} → heals ${actualHeal} HP!`, type: 'heal' });
            }

            if (skill.damage) {
                const isPhysical = skill.effectType === 'physical';
                const isMagical = skill.effectType === 'magical';

                if (isPhysical) {
                    const hitChance = 100 - tCopy.evasion;
                    if (Math.random() * 100 > hitChance) {
                        logsToAdd.push({ msg: `${skill.icon || '✨'} ${skill.name} missed ${tCopy.name}!`, type: 'info' });
                        continue;
                    }
                }

                // --- NEW DAMAGE CALCULATION LOGIC ---
                let baseDmg = skill.damage;
                const weaponReplacement = skill.effects?.find(e => e.type === 'WEAPON_DAMAGE_REPLACEMENT');

                if (weaponReplacement && c.equipped?.mainHand) {
                    const weapon = c.equipped.mainHand;
                    // Find a damage effect on the weapon
                    const weaponDmgEffect = weapon.effects?.find((e: any) =>
                        e.target === 'damage' || e.target === 'physical_damage' || e.type === 'COMBAT_BONUS'
                    );

                    if (weaponDmgEffect) {
                        if (weaponDmgEffect.isPercentage) {
                            baseDmg = Math.floor(baseDmg * (1 + (weaponDmgEffect.value / 100)));
                        } else {
                            // Flat replace
                            baseDmg = weaponDmgEffect.value;
                        }
                    } else if (weapon.id) {
                        // Fallback: If it's a weapon but no dmg effect found, maybe it has inherent value or we use a small bonus?
                        // For now we keep baseDmg = 10 (fists) if no damage effect is found on the item.
                    }
                }
                // ------------------------------------

                // Critical Hit check
                const analyzedBonus = tCopy.activeEffects?.filter(e => e.type === 'ANALYZED').reduce((sum, e) => sum + (e.value || 0), 0) || 0;
                const finalCritChance = c.critChance + (analyzedBonus / 100);
                const isCrit = Math.random() < finalCritChance;

                // Special handling for push damage
                let strBonus = 0;
                if (skill.pushDistance && skill.pushDistance > 0) {
                    strBonus = c.strength * (rules.combat.shovePushDamageRatio || 0.1);
                } else {
                    const minStrengthBonus = c.strength * (rules.combat.strengthScalingMin || 0.2);
                    const maxStrengthBonus = c.strength * (rules.combat.strengthScalingMax || 0.4);
                    strBonus = minStrengthBonus + (Math.random() * (maxStrengthBonus - minStrengthBonus));
                }

                // Apply variance to the whole package
                const variance = rules.combat.damageVarianceMin + (Math.random() * (rules.combat.damageVarianceMax - rules.combat.damageVarianceMin));

                let scaledDamage = Math.floor((baseDmg + strBonus) * variance);

                if (isCrit) {
                    scaledDamage = Math.floor(scaledDamage * 1.5);
                }

                // Resistance/Defense check
                let actualDamage = scaledDamage;
                if (isMagical) {
                    // Magical damage is resisted by Wisdom
                    const resistAmount = Math.floor(actualDamage * (tCopy.resistance || 0));
                    actualDamage = Math.max(1, actualDamage - resistAmount);
                } else {
                    // Physical damage is reduced by flat defense
                    actualDamage = Math.max(1, actualDamage - (tCopy.defense || 0));
                }

                let newHp = tCopy.hp;
                // --- PROTECTION CHECK (Defend Skill) ---
                const protectionEffect = tCopy.activeEffects?.find(e => e.type === 'PROTECTION_STANCE');
                let protector = protectionEffect ? nextEntities.get(protectionEffect.protectorId) : null;

                if (protector && protector.hp > 0) {
                    const dice = Math.floor(Math.random() * 3) + 1;
                    const rollValue = (protector.endurance || 0) * dice;
                    const diff = rollValue - actualDamage;

                    let redoDamageToAlly = 0;
                    let damageToProtector = 0;
                    let armorRatio = 0;
                    let outcome = "";

                    if (diff >= (rules.combat.defendSuccessThreshold || 10)) {
                        // Success: Protector takes all, high armor reduction
                        damageToProtector = actualDamage;
                        armorRatio = rules.combat.defendSuccessReduction || 0.6;
                        outcome = "TOTAL SUCCESS";
                    } else if (diff >= (rules.combat.defendPartialThreshold || 5)) {
                        // Partial: Split damage
                        redoDamageToAlly = Math.floor(actualDamage / 2);
                        damageToProtector = Math.floor(actualDamage / 2);
                        armorRatio = rules.combat.defendPartialReduction || 0.2;
                        outcome = "PARTIAL SUCCESS";
                    } else {
                        // Fail: Ally takes mostly all
                        redoDamageToAlly = actualDamage;
                        armorRatio = rules.combat.defendFailReduction || 0.1;
                        outcome = "FAILED";
                    }

                    // Apply armor reduction for protector
                    const armorBlock = Math.floor((protector.defense || 0) * armorRatio);
                    const finalProtDmg = Math.max(0, damageToProtector - armorBlock);

                    // Apply to protector
                    const pCopy = { ...protector };
                    pCopy.hp = Math.max(0, pCopy.hp - finalProtDmg);
                    nextEntities.set(pCopy.id, pCopy);

                    // Apply remaining to ally
                    const finalAllyDmg = redoDamageToAlly;
                    newHp = Math.max(0, tCopy.hp - finalAllyDmg);
                    tCopy.hp = newHp;

                    logsToAdd.push({
                        msg: `🛡️ ${pCopy.name} tanks for ${tCopy.name}! [Dice: ${dice} | Endu: ${rollValue} vs DMG ${actualDamage} | Roll: ${outcome}] → ${pCopy.name} absorbs ${finalProtDmg} (${armorBlock} armor block), ${tCopy.name} takes ${finalAllyDmg}`,
                        type: 'info'
                    });

                    // Consume protection after one hit? user didn't specify, but usually "one turn" means one hit or multiple. 
                    // Let's keep it for now as per "activeEffect" duration.
                } else {
                    newHp = Math.max(0, tCopy.hp - actualDamage);
                    tCopy.hp = newHp;
                    logsToAdd.push({ msg: `${skill.icon || '✨'} ${c.name} uses ${skill.name} on ${tCopy.name} → ${isCrit ? 'CRITICAL ' : ''}${actualDamage} damage!`, type: 'damage' });
                }

                // --- STEALTH BREAK CHECK ---
                const stealthEffect = tCopy.activeEffects?.find(e => e.type === 'STEALTH');
                if (stealthEffect && actualDamage > 0) {
                    tCopy.activeEffects = tCopy.activeEffects?.filter(e => e.type !== 'STEALTH') || [];
                    logsToAdd.push({
                        msg: `👁️ ${tCopy.name} was REVEALED at [${tCopy.gridPos.row}, ${tCopy.gridPos.col}] by taking damage!`,
                        type: 'info'
                    });
                }

                if (skill.pushDistance && skill.pushDistance > 0 && newHp > 0) {
                    const rowDiff = tCopy.gridPos.row - c.gridPos.row;
                    const colDiff = tCopy.gridPos.col - c.gridPos.col;
                    const dr = rowDiff > 0 ? 1 : rowDiff < 0 ? -1 : 0;
                    const dc = colDiff > 0 ? 1 : colDiff < 0 ? -1 : 0;

                    let distRemaining = skill.pushDistance;
                    let currentRow = tCopy.gridPos.row;
                    let currentCol = tCopy.gridPos.col;
                    let hitObstacle = false;

                    while (distRemaining > 0 && !hitObstacle) {
                        const nextRow = currentRow + dr;
                        const nextCol = currentCol + dc;
                        if (nextRow < 0 || nextRow >= grid.length || nextCol < 0 || nextCol >= grid[0].length) {
                            hitObstacle = true;
                            break;
                        }

                        const cell = grid[nextRow][nextCol];
                        const isOccupied = Array.from(nextEntities.values()).some((e: TacticalEntity) =>
                            e.id !== tCopy.id && e.gridPos.row === nextRow && e.gridPos.col === nextCol
                        );

                        if (!cell.walkable || isOccupied) {
                            hitObstacle = true;
                            break;
                        }

                        currentRow = nextRow;
                        currentCol = nextCol;
                        distRemaining--;
                    }

                    if (currentRow !== tCopy.gridPos.row || currentCol !== tCopy.gridPos.col) {
                        tCopy.gridPos = { row: currentRow, col: currentCol };
                    }

                    if (hitObstacle) {
                        const shockPot = distRemaining * (c.strength * (rules.combat.shoveShockDamageRatio || 0.3));
                        const targetEndu = tCopy.endurance || 0;
                        const shockDmg = Math.max(0, Math.floor(shockPot - targetEndu));

                        if (shockDmg > 0) {
                            tCopy.hp = Math.max(0, tCopy.hp - shockDmg);
                            logsToAdd.push({
                                msg: `💥 ${tCopy.name} hits an obstacle! ${distRemaining}m remaining → +${shockDmg} shock damage (vs ${targetEndu} endu)!`,
                                type: 'damage'
                            });
                        }
                    } else {
                        logsToAdd.push({ msg: `🌬️ ${tCopy.name} is pushed back ${skill.pushDistance} cells.`, type: 'info' });
                    }
                }
            }

            // --- APPLY ACTIVE EFFECTS (Buffs/Debuffs) ---
            if (skill.effects && skill.effects.length > 0) {
                skill.effects.forEach(eff => {
                    const newEff = { ...eff };
                    if (eff.type === 'PROTECTION_STANCE') {
                        (newEff as any).protectorId = casterId;
                    }

                    if (eff.type === 'STEALTH') {
                        const baseDur = rules.combat.stealthBaseDuration || 1;
                        const factor = rules.combat.stealthScaleFactor || 1.4;
                        const bonus = Math.floor(factor * Math.log((c.wisdom || 0) + 1));
                        newEff.duration = baseDur + bonus;
                        (newEff as any).lastKnownPosition = { ...c.gridPos };
                    }

                    // Store the effect on the target
                    tCopy.activeEffects = [...(tCopy.activeEffects || []), { ...newEff, justApplied: true }];

                    // Specific feedback for some targets
                    if (eff.type === 'STAT_MODIFIER' || eff.type === 'COMBAT_BONUS') {
                        logsToAdd.push({
                            msg: `✨ ${tCopy.name} receives ${eff.target} modifier: ${eff.value >= 0 ? '+' : ''}${eff.value} (${eff.duration || '∞'} turns)`,
                            type: 'info'
                        });
                    }
                    if (eff.type === 'PROTECTION_STANCE') {
                        logsToAdd.push({
                            msg: `🛡️ ${tCopy.name} is now protected by ${c.name} (${eff.duration || 1} turns)`,
                            type: 'info'
                        });
                    }
                    if (eff.type === 'STEALTH') {
                        logsToAdd.push({
                            msg: `👤 ${tCopy.name} hides during ${newEff.duration} turns (Wisdom bonus: +${Math.floor((newEff.duration || 1) - (rules.combat.stealthBaseDuration || 1))})`,
                            type: 'info'
                        });
                    }
                });

                // Recalculate stats immediately to apply the new effects
                const prevMaxMp = tCopy.maxMp;
                const prevMaxAp = tCopy.maxAp;

                const recalculated = calculateEffectiveStats(tCopy, tCopy.traits);
                Object.assign(tCopy, recalculated);

                // If Max stats increased, give the bonus current pool for immediate use
                const diffMp = tCopy.maxMp - prevMaxMp;
                if (diffMp > 0) tCopy.mp = Math.min(tCopy.maxMp, tCopy.mp + diffMp);
                const diffAp = tCopy.maxAp - prevMaxAp;
                if (diffAp > 0) tCopy.ap = Math.min(tCopy.maxAp, tCopy.ap + diffAp);
            }

            // Ensure the target entity (tCopy) is updated in the map
            if (targetId && tCopy) {
                nextEntities.set(targetId, tCopy);
            }
        }

        // nextEntities already contains the caster with updated AP/Cooldowns (set at line 296)
        // and any effect updates from the loop if the caster was a target.
        setEntities(new Map(nextEntities));
        logsToAdd.forEach(l => addLog(l.msg, l.type));

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
                return new Map(currEntities);
            });
        }, 50);

        setSelectedSkill(null);
        setPlayerAction('idle');
    }, [entities, grid, addLog, checkWinLoss]);

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

        // Reset AP/MP and tick cooldowns/active effects for the next entity
        const nextEntityId = turnOrder[nextIndex];
        setEntities(prev => {
            const next = new Map(prev);
            const e = next.get(nextEntityId);
            if (e) {
                const nextE = { ...e };

                // 1. Tick Cooldowns
                const newCooldowns: Record<string, number> = {};
                for (const [skillId, cd] of Object.entries(nextE.skillCooldowns)) {
                    if (cd > 1) newCooldowns[skillId] = cd - 1;
                }
                nextE.skillCooldowns = newCooldowns;

                // 2. Tick Active Effects (Buffs)
                const remainingEffects = (nextE.activeEffects || []).map(eff => {
                    if (eff.justApplied) {
                        return { ...eff, justApplied: false };
                    }
                    return {
                        ...eff,
                        duration: eff.duration !== undefined ? eff.duration - 1 : undefined
                    };
                }).filter(eff => eff.duration === undefined || eff.duration > 0);

                const effectsChanged = remainingEffects.length !== (nextE.activeEffects || []).length;
                nextE.activeEffects = remainingEffects;

                const stealthRemaining = remainingEffects.find(eff => eff.type === 'STEALTH');
                if (stealthRemaining) {
                    addLog(`👤 ${nextE.name} is still invisible (${stealthRemaining.duration} turns left)`, 'info');
                }

                // 3. Recalculate stats if effects changed
                if (effectsChanged) {
                    const recalculated = calculateEffectiveStats(nextE, nextE.traits);
                    // We preserve current HP/AP/MP but update Max values and other stats
                    Object.assign(nextE, {
                        ...recalculated,
                        hp: Math.min(nextE.hp, recalculated.maxHp),
                        ap: Math.min(nextE.ap, recalculated.maxAp),
                        mp: Math.min(nextE.mp, recalculated.maxMp)
                    });
                    addLog(`✨ Some effects on ${nextE.name} have expired.`, 'info');
                }

                // Reset per-turn resources
                nextE.ap = nextE.maxAp;
                nextE.mp = nextE.maxMp;

                next.set(nextEntityId, nextE);
            }
            return next;
        });

        setActiveEntityIndex(nextIndex);
        const nextEntity = entities.get(nextEntityId);
        if (nextEntity) {
            addLog(`── ${nextEntity.name}'s turn ──`, 'system');
        }
    }, [activeEntityIndex, entities, turnOrder, phase, addLog]);

    // ── AI Turn (Enhanced: handles Stealth Search) ──
    useEffect(() => {
        if (phase !== 'combat') return;
        if (!activeEntity || activeEntity.isPlayer || activeEntity.hp <= 0) return;

        const timer = setTimeout(() => {
            const currentGrid = gridRef.current;
            const currentEntities = entitiesRef.current;
            const ai = currentEntities.get(activeEntityId);
            if (!ai || ai.hp <= 0) { endTurn(); return; }

            const allPlayerTargets = [...currentEntities.values()].filter(e => e.isPlayer && e.hp > 0);
            if (allPlayerTargets.length === 0) { endTurn(); return; }

            const visibleTargets = allPlayerTargets.filter(e => !e.activeEffects?.some(eff => eff.type === 'STEALTH'));
            const hiddenPlayers = allPlayerTargets.filter(e => e.activeEffects?.some(eff => eff.type === 'STEALTH'));

            const isSearching = visibleTargets.length === 0 && hiddenPlayers.length > 0;

            let targetPos: { row: number, col: number } = { row: 0, col: 0 };
            let targetId: string | null = null;
            let closestDist = Infinity;

            if (!isSearching) {
                let closestTarget = visibleTargets[0];
                for (const target of visibleTargets) {
                    const d = Math.abs(target.gridPos.row - ai.gridPos.row) + Math.abs(target.gridPos.col - ai.gridPos.col);
                    if (d < closestDist) { closestDist = d; closestTarget = target; }
                }
                targetPos = { ...closestTarget.gridPos };
                targetId = closestTarget.id;
                closestDist = Math.abs(targetPos.row - ai.gridPos.row) + Math.abs(targetPos.col - ai.gridPos.col);
            } else {
                // SEARCHING: Find the closest lastKnownPosition from stealth effects
                let closestLKP = { row: 0, col: 0 };
                for (const hp of hiddenPlayers) {
                    const stealthEff = hp.activeEffects.find((eff: any) => eff.type === 'STEALTH');
                    const lkp = stealthEff?.lastKnownPosition || hp.gridPos;
                    const d = Math.abs(lkp.row - ai.gridPos.row) + Math.abs(lkp.col - ai.gridPos.col);
                    if (d < closestDist) { closestDist = d; closestLKP = lkp; }
                }
                targetPos = { ...closestLKP };
                closestDist = Math.abs(targetPos.row - ai.gridPos.row) + Math.abs(targetPos.col - ai.gridPos.col);
                addLog(`🔍 ${ai.name} is looking for someone near [${targetPos.row}, ${targetPos.col}]...`, 'info');
            }

            // === AI Decision ===

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

            // 2. Move closer if needed
            if (ai.mp > 0 && closestDist > MELEE_RANGE) {
                const tackleCost = calculateTackleCost(currentGrid, currentEntities, ai.id);
                if (ai.ap >= tackleCost) {
                    const reachable = getReachableCells(currentGrid, ai.gridPos.row, ai.gridPos.col, ai.mp);
                    let bestCell = null;
                    let bestDist = closestDist;
                    for (const cell of reachable) {
                        const d = Math.abs(cell.row - targetPos.row) + Math.abs(cell.col - targetPos.col);
                        if (d < bestDist) { bestDist = d; bestCell = cell; }
                    }
                    if (bestCell) {
                        const path = findPath(currentGrid, ai.gridPos.row, ai.gridPos.col, bestCell.row, bestCell.col);
                        if (path) {
                            performMove(ai.id, bestCell.row, bestCell.col, path.length, tackleCost);
                            closestDist = bestDist;
                        }
                    }
                }
            }

            // 3. Attack or Search
            setTimeout(() => {
                const updatedAi = entitiesRef.current.get(activeEntityId);
                if (!updatedAi || updatedAi.hp <= 0) { endTurn(); return; }

                if (isSearching) {
                    // Choose an offensive skill to "blind fire"
                    const searchSkill = updatedAi.skills.find(s => s.damage && s.apCost <= updatedAi.ap && !(updatedAi.skillCooldowns[s.id] > 0));

                    if (searchSkill) {
                        const neighbors = getNeighbors(currentGrid, targetPos.row, targetPos.col);
                        const possibleCells = [targetPos, ...neighbors].filter(n => {
                            const d = Math.abs(n.row - updatedAi.gridPos.row) + Math.abs(n.col - updatedAi.gridPos.col);
                            return d >= searchSkill.minRange && d <= searchSkill.maxRange;
                        });

                        if (possibleCells.length > 0) {
                            const luckyShot = possibleCells[Math.floor(Math.random() * possibleCells.length)];
                            addLog(`🎯 ${updatedAi.name} attacks blindly towards [${luckyShot.row}, ${luckyShot.col}] with ${searchSkill.name}!`, 'info');
                            executeSkill(updatedAi.id, luckyShot.row, luckyShot.col, searchSkill);
                        }
                    } else if (updatedAi.ap >= MELEE_ATTACK_COST && closestDist <= MELEE_RANGE) {
                        addLog(`🎯 ${updatedAi.name} swings blindly around!`, 'info');
                        executeSkill(updatedAi.id, targetPos.row, targetPos.col, { id: 'basic', name: 'Slash', apCost: 3, damage: 10, icon: '⚔️' } as Skill);
                    }
                } else if (targetId) {
                    const updatedTarget = entitiesRef.current.get(targetId);
                    if (!updatedTarget) { endTurn(); return; }

                    const distNow = Math.abs(updatedAi.gridPos.row - updatedTarget.gridPos.row) + Math.abs(updatedAi.gridPos.col - updatedTarget.gridPos.col);
                    const attackSkill = updatedAi.skills.find(s =>
                        s.damage && s.maxRange >= distNow && s.minRange <= distNow &&
                        s.apCost <= updatedAi.ap && !(updatedAi.skillCooldowns[s.id] > 0)
                    );

                    if (attackSkill) {
                        executeSkill(updatedAi.id, updatedTarget.gridPos.row, updatedTarget.gridPos.col, attackSkill);
                    } else if (distNow <= MELEE_RANGE && updatedAi.ap >= MELEE_ATTACK_COST) {
                        performAttack(updatedAi.id, updatedTarget.id);
                    }
                }

                setTimeout(() => endTurn(), 800);
            }, 600);
        }, 800);

        return () => clearTimeout(timer);
    }, [activeEntityId, phase, addLog, endTurn, executeSkill, performAttack, performMove]);

    // ── Previews ──
    const getDamagePreview = useCallback((attacker: TacticalEntity, target: TacticalEntity, skill: Skill): DamagePreview | null => {
        if (!skill.damage && !skill.pushDistance) return null;

        const rules = GameRulesManager.get();
        const isMagical = skill.effectType === 'magical';

        let baseDmg = skill.damage || 0;
        const weaponReplacement = skill.effects?.find(e => e.type === 'WEAPON_DAMAGE_REPLACEMENT');
        if (weaponReplacement && attacker.equipped?.mainHand) {
            const weapon = attacker.equipped.mainHand;
            const weaponDmgEffect = weapon.effects?.find((e: any) =>
                e.target === 'damage' || e.target === 'physical_damage' || e.type === 'COMBAT_BONUS'
            );
            if (weaponDmgEffect) {
                if (weaponDmgEffect.isPercentage) baseDmg = Math.floor(baseDmg * (1 + (weaponDmgEffect.value / 100)));
                else baseDmg = weaponDmgEffect.value;
            }
        }

        const minStrBonus = skill.pushDistance ? attacker.strength * (rules.combat.shovePushDamageRatio || 0.1) : attacker.strength * (rules.combat.strengthScalingMin || 0.2);
        const maxStrBonus = skill.pushDistance ? attacker.strength * (rules.combat.shovePushDamageRatio || 0.1) : attacker.strength * (rules.combat.strengthScalingMax || 0.4);

        const vMin = rules.combat.damageVarianceMin || 0.85;
        const vMax = rules.combat.damageVarianceMax || 1.15;

        // Critical Hit check
        const analyzedBonus = target.activeEffects?.filter((e: any) => e.type === 'ANALYZED').reduce((sum: number, e: any) => sum + (e.value || 0), 0) || 0;
        const finalCritChance = attacker.critChance + (analyzedBonus / 100);

        const calc = (str: number, v: number, crit: boolean) => {
            let d = Math.floor((baseDmg + str) * v);
            if (crit) d = Math.floor(d * 1.5);
            if (isMagical) {
                const resist = Math.floor(d * (target.resistance || 0));
                return Math.max(1, d - resist);
            } else {
                return Math.max(1, d - (target.defense || 0));
            }
        };

        return {
            min: calc(minStrBonus, vMin, false),
            max: calc(maxStrBonus, vMax, false),
            critMin: calc(minStrBonus, vMin, true),
            critMax: calc(maxStrBonus, vMax, true),
            isMagical,
            critChance: finalCritChance
        };
    }, []);

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
        getDamagePreview
    };
}
