import { useState, useCallback, useEffect } from 'react';
import { Trait } from '@ashtrail/core';
import { GameRulesManager } from "../rules/useGameRules";

export interface BaseStats {
    strength: number;
    agility: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
    endurance: number;
    evasion: number;
    defense: number;
}

export interface CombatEntity extends BaseStats {
    id: string;
    isPlayer: boolean;
    name: string;
    hp: number;
    maxHp: number;
    ap: number;
    maxAp: number;
    mp: number;
    maxMp: number;
    critChance: number;
    resistance: number;
    socialBonus: number;
    equipped?: Record<string, any>;
    traits: Trait[];
    activeEffects?: any[]; // GameplayEffect[] but avoid circular/type issues if any
    baseStats: BaseStats; // Immortal source of truth
}

export interface CombatLogMessage {
    id: string;
    message: string;
    type: 'system' | 'damage' | 'heal' | 'info';
}

export function calculateEffectiveStats(baseEntity: CombatEntity, traits: Trait[] = []): CombatEntity {
    const rules = GameRulesManager.get();
    const source = baseEntity.baseStats || baseEntity;

    // Project everything from baseStats to avoid feedback loops
    const stats = {
        strength: source.strength || 10,
        agility: source.agility || 10,
        endurance: source.endurance || 10,
        intelligence: source.intelligence || 10,
        wisdom: source.wisdom || 10,
        charisma: source.charisma || 10,
        defense: source.defense || 0,
        evasion: source.evasion || 5,
    };

    let maxHpBonus = 0;
    let maxApBonus = 0;
    let maxMpBonus = 0;

    // Apply trait effects (Passive)
    traits.forEach(trait => {
        if (!trait.effects) return;
        trait.effects.forEach(effect => {
            if (effect.trigger !== 'passive') return;

            if (effect.type === 'STAT_MODIFIER' || effect.type === 'COMBAT_BONUS') {
                const target = effect.target as string;
                if (target === 'maxHp' || target === 'hp') {
                    maxHpBonus += effect.value;
                } else if (target === 'maxAp' || target === 'ap') {
                    maxApBonus += effect.value;
                } else if (target === 'maxMp' || target === 'mp') {
                    maxMpBonus += effect.value;
                } else if (target && (target in stats || target === 'armor')) {
                    const finalTarget = target === 'armor' ? 'defense' : target;
                    (stats as any)[finalTarget] += effect.value;
                }
            }
        });
    });

    // Apply Equipment effects
    if (baseEntity.equipped) {
        Object.values(baseEntity.equipped).forEach(item => {
            if (!item || !item.effects) return;
            item.effects.forEach((effect: any) => {
                const target = effect.target as string;
                if (effect.type === 'STAT_MODIFIER' || effect.type === 'COMBAT_BONUS') {
                    if (target === 'maxHp' || target === 'hp') {
                        maxHpBonus += effect.value;
                    } else if (target === 'maxAp' || target === 'ap') {
                        maxApBonus += effect.value;
                    } else if (target === 'maxMp' || target === 'mp') {
                        maxMpBonus += effect.value;
                    } else if (target && (target in stats || target === 'armor')) {
                        const finalTarget = target === 'armor' ? 'defense' : target;
                        (stats as any)[finalTarget] += effect.value;
                    }
                }
            });
        });
    }

    // Apply Active Effects (Buffs/Debuffs)
    if (baseEntity.activeEffects) {
        baseEntity.activeEffects.forEach(effect => {
            if (effect.type === 'STAT_MODIFIER' || effect.type === 'COMBAT_BONUS') {
                if (effect.target === 'maxHp') {
                    maxHpBonus += effect.value;
                } else if (effect.target === 'maxAp') {
                    maxApBonus += effect.value;
                } else if (effect.target === 'maxMp') {
                    maxMpBonus += effect.value;
                } else if (effect.target && (effect.target in stats || effect.target === 'armor')) {
                    const finalTarget = effect.target === 'armor' ? 'defense' : effect.target;
                    (stats as any)[finalTarget] += effect.value;
                }
            }
        });
    }

    // Derived from rules
    let maxHp = ((rules.core.hpBase || 10) + (stats.endurance * (rules.core.hpPerEndurance || 5))) + maxHpBonus;
    const maxAp = ((rules.core.apBase || 5) + Math.floor(stats.agility / (rules.core.apAgilityDivisor || 2))) + maxApBonus;
    const maxMp = (rules.core.mpBase || 3) + maxMpBonus;

    // --- NEW ARMOR CALCULATION ---
    // Logarithmic Base Armor = (agiScale * ln(agi + 1)) + (enduScale * ln(endu + 1))
    // Diminishing returns ensures high stat investment is rewarded but not broken.
    const agiScale = rules.core.armorAgiScale || 2.5;
    const enduScale = rules.core.armorEnduScale || 3.5;
    const baseArmor = Math.floor(
        agiScale * Math.log(stats.agility + 1) +
        enduScale * Math.log(stats.endurance + 1)
    );
    // stats.defense already contains equipment bonuses
    const finalDefense = baseArmor + (stats.defense || 0);

    const critChance = stats.intelligence * (rules.core.critPerIntelligence || 0.02);
    const resistance = stats.wisdom * (rules.core.resistPerWisdom || 0.05);
    const socialBonus = stats.charisma * (rules.core.charismaBonusPerCharisma || 0.03);

    const effective: CombatEntity = {
        id: baseEntity.id || Math.random().toString(36).substring(7),
        isPlayer: baseEntity.isPlayer || false,
        name: baseEntity.name || 'Unknown Entity',
        hp: baseEntity.maxHp > 0 ? (baseEntity.hp ?? maxHp) : maxHp,
        maxHp: maxHp,
        ap: baseEntity.maxAp > 0 ? (baseEntity.ap ?? maxAp) : maxAp,
        maxAp: maxAp,
        mp: baseEntity.maxMp > 0 ? (baseEntity.mp ?? maxMp) : maxMp,
        maxMp: maxMp,
        strength: stats.strength,
        agility: stats.agility,
        intelligence: stats.intelligence,
        wisdom: stats.wisdom,
        charisma: stats.charisma,
        endurance: stats.endurance,
        critChance,
        resistance,
        socialBonus,
        defense: finalDefense,
        evasion: stats.evasion,
        equipped: baseEntity.equipped,
        traits,
        activeEffects: baseEntity.activeEffects,
        baseStats: source // Keep the unmutated base
    };

    // Clamp HP if MaxHP was modified
    if (effective.hp > effective.maxHp) {
        effective.hp = effective.maxHp;
    }

    return effective;
}

export function useCombatEngine(initialPlayer: CombatEntity, initialEnemy: CombatEntity) {
    const [player, setPlayer] = useState<CombatEntity>(() => calculateEffectiveStats(initialPlayer, initialPlayer.traits));
    const [enemy, setEnemy] = useState<CombatEntity>(() => calculateEffectiveStats(initialEnemy, initialEnemy.traits));

    // Engine State
    const [logs, setLogs] = useState<CombatLogMessage[]>([]);
    const [turn, setTurn] = useState<number>(1);
    const [activeEntityId, setActiveEntityId] = useState<string>('');
    const [combatEnded, setCombatEnded] = useState<boolean>(false);

    const addLog = useCallback((msg: string, type: CombatLogMessage['type'] = 'info') => {
        setLogs(prev => [...prev, { id: Math.random().toString(), message: msg, type }]);
    }, []);

    // Initiative / Turn setup
    useEffect(() => {
        if (turn === 1 && !activeEntityId && !combatEnded) {
            addLog('Combat Started! Calculating Initiative...', 'system');

            // Check traits that might modify initiative later, for now we just use effective agility
            if (player.agility >= enemy.agility) {
                setActiveEntityId(player.id);
                addLog(`${player.name} is faster and attacks first.`, 'info');
            } else {
                setActiveEntityId(enemy.id);
                addLog(`${enemy.name} is faster and attacks first.`, 'info');
            }
        }
    }, [turn, activeEntityId, player, enemy, addLog, combatEnded]);

    const performAttack = useCallback((attacker: CombatEntity, defender: CombatEntity) => {
        // Evasion check
        const hitChance = 100 - defender.evasion;
        const roll = Math.random() * 100;

        if (roll > hitChance) {
            addLog(`${attacker.name} missed! ${defender.name} dodged the attack.`, 'info');
            return 0; // Miss
        }

        // Critical Hit check
        const critRoll = Math.random();
        const isCrit = critRoll < attacker.critChance;

        // Damage Calculation
        // Base damage = strength with +/- 20% variance. Minus flat defense.
        const rules = GameRulesManager.get();
        const vMin = rules.combat.damageVarianceMin || 0.85;
        const vMax = rules.combat.damageVarianceMax || 1.15;
        const variance = vMin + (Math.random() * (vMax - vMin));
        let rawDamage = Math.floor(attacker.strength * variance);

        if (isCrit) {
            rawDamage = Math.floor(rawDamage * 1.5); // 50% bonus for crit
            addLog(`CRITICAL HIT!`, 'info');
        }

        const actualDamage = Math.max(1, rawDamage - defender.defense); // Always deal at least 1 dmg on a hit

        addLog(`${attacker.name} strikes for ${actualDamage} damage!`, 'damage');
        return actualDamage;
    }, [addLog]);

    const nextTurn = useCallback(() => {
        if (combatEnded) return;
        setTurn(t => t + 1);
        setActiveEntityId(prev => prev === player.id ? enemy.id : player.id);
    }, [player.id, enemy.id, combatEnded]);

    const handlePlayerAttack = useCallback(() => {
        if (activeEntityId !== player.id || combatEnded) return;

        const damage = performAttack(player, enemy);
        const newHp = Math.max(0, enemy.hp - damage);

        setEnemy(prev => ({ ...prev, hp: newHp }));

        if (newHp <= 0) {
            addLog(`${enemy.name} has been defeated! You win!`, 'system');
            setCombatEnded(true);
            setActiveEntityId('');
            return;
        }

        // Pass turn
        setActiveEntityId(''); // Clear temporarily to prevent double clicks
        setTimeout(() => nextTurn(), 500); // Small UI delay
    }, [activeEntityId, player, enemy, performAttack, nextTurn, addLog, combatEnded]);

    // AI Turn Hook
    useEffect(() => {
        if (activeEntityId === enemy.id && !combatEnded) {
            const timer = setTimeout(() => {
                const damage = performAttack(enemy, player);
                const newHp = Math.max(0, player.hp - damage);

                setPlayer(prev => ({ ...prev, hp: newHp }));

                if (newHp <= 0) {
                    addLog(`${player.name} has died... Game Over.`, 'system');
                    setCombatEnded(true);
                    setActiveEntityId('');
                    return;
                }

                nextTurn();
            }, 1000); // 1 second AI artificial delay

            return () => clearTimeout(timer);
        }
    }, [activeEntityId, enemy, player, performAttack, nextTurn, addLog, combatEnded]);

    return {
        player,
        enemy,
        turn,
        logs,
        activeEntityId,
        combatEnded,
        handlePlayerAttack
    };
}
