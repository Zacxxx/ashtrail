import { useState, useCallback, useEffect } from 'react';
import { CharacterProgression, Occupation, Trait, applyResolvedModifier, resolveCharacterEffects } from '@ashtrail/core';
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
    occupation?: Occupation;
    progression?: CharacterProgression;
    activeEffects?: any[]; // GameplayEffect[] but avoid circular/type issues if any
    baseStats: BaseStats; // Immortal source of truth
}

export interface CombatLogMessage {
    id: string;
    message: string;
    type: 'system' | 'damage' | 'heal' | 'info';
}

const toNum = (val: any, fallback: number) => {
    const n = parseFloat(val);
    return isNaN(n) ? fallback : n;
};

export function calculateEffectiveStats(baseEntity: CombatEntity, traits: Trait[] = []): CombatEntity {
    const rules = GameRulesManager.get();
    const source = baseEntity.baseStats || baseEntity;
    const resolved = resolveCharacterEffects({
        traits: traits.length > 0 ? traits : baseEntity.traits,
        occupation: baseEntity.occupation,
        progression: baseEntity.progression,
        equipped: baseEntity.equipped,
        activeEffects: baseEntity.activeEffects,
    }, {
        scope: 'combat',
        locationKind: 'combat',
        currentHpPct: baseEntity.maxHp > 0 ? ((baseEntity.hp ?? baseEntity.maxHp) / baseEntity.maxHp) * 100 : 100,
        isAlone: false,
    });

    // Project everything from baseStats to avoid feedback loops
    const stats = {
        strength: toNum(source.strength, 10),
        agility: toNum(source.agility, 10),
        endurance: toNum(source.endurance, 10),
        intelligence: toNum(source.intelligence, 10),
        wisdom: toNum(source.wisdom, 10),
        charisma: toNum(source.charisma, 10),
        defense: toNum(source.defense, 0),
        evasion: toNum(source.evasion, 5),
    };

    let maxHpBonus = 0;
    let maxApBonus = 0;
    let maxMpBonus = 0;
    stats.strength = applyResolvedModifier(stats.strength, resolved.modifiers.strength);
    stats.agility = applyResolvedModifier(stats.agility, resolved.modifiers.agility);
    stats.endurance = applyResolvedModifier(stats.endurance, resolved.modifiers.endurance);
    stats.intelligence = applyResolvedModifier(stats.intelligence, resolved.modifiers.intelligence);
    stats.wisdom = applyResolvedModifier(stats.wisdom, resolved.modifiers.wisdom);
    stats.charisma = applyResolvedModifier(stats.charisma, resolved.modifiers.charisma);
    stats.defense = applyResolvedModifier(stats.defense, resolved.modifiers.defense || resolved.modifiers.armor);
    stats.evasion = applyResolvedModifier(stats.evasion, resolved.modifiers.evasion);
    maxHpBonus = applyResolvedModifier(maxHpBonus, resolved.modifiers.maxHp || resolved.modifiers.hp);
    maxApBonus = applyResolvedModifier(maxApBonus, resolved.modifiers.maxAp || resolved.modifiers.ap);
    maxMpBonus = applyResolvedModifier(maxMpBonus, resolved.modifiers.maxMp || resolved.modifiers.mp);

    // Derived from rules
    const maxHp = Math.max(1, (stats.endurance * (toNum(rules.core.hpPerEndurance, 5))) + (toNum(rules.core.hpBase, 10)) + maxHpBonus);
    const maxAp = Math.max(1, (toNum(rules.core.apBase, 5)) + Math.floor(stats.agility / (toNum(rules.core.apAgilityDivisor, 2))) + maxApBonus);
    const maxMp = Math.max(1, (toNum(rules.core.mpBase, 3)) + maxMpBonus);

    // --- NEW ARMOR CALCULATION ---
    const agiScale = toNum(rules.core.armorAgiScale, 2.5);
    const enduScale = toNum(rules.core.armorEnduScale, 3.5);
    const baseArmorLog = Math.floor(
        agiScale * Math.log(Math.max(0, stats.agility) + 1) +
        enduScale * Math.log(Math.max(0, stats.endurance) + 1)
    );
    const finalDefense = baseArmorLog + stats.defense;

    const critChance = applyResolvedModifier(
        stats.intelligence * (toNum(rules.core.critPerIntelligence, 0.02)),
        resolved.modifiers.critChance,
    );
    const resistance = applyResolvedModifier(
        stats.wisdom * (toNum(rules.core.resistPerWisdom, 0.05)),
        resolved.modifiers.resistance,
    );
    const socialBonus = applyResolvedModifier(
        stats.charisma * (toNum(rules.core.charismaBonusPerCharisma, 0.03)),
        resolved.modifiers.socialBonus,
    );

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
        traits: resolved.traits,
        occupation: baseEntity.occupation,
        progression: baseEntity.progression,
        activeEffects: baseEntity.activeEffects,
        baseStats: source // Keep the unmutated base
    };

    // Clamp HP/AP/MP if Max values were modified
    if (effective.hp > effective.maxHp) effective.hp = effective.maxHp;
    if (effective.ap > effective.maxAp) effective.ap = effective.maxAp;
    if (effective.mp > effective.maxMp) effective.mp = effective.maxMp;

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
