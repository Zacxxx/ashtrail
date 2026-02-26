import { useState, useCallback, useEffect } from 'react';
import { Trait } from '@ashtrail/core';

export interface CombatEntity {
    id: string;
    isPlayer: boolean;
    name: string;
    hp: number;
    maxHp: number;
    strength: number;
    agility: number;
    evasion: number;
    defense: number;
    traits: Trait[];
}

export interface CombatLogMessage {
    id: string;
    message: string;
    type: 'system' | 'damage' | 'heal' | 'info';
}

export function calculateEffectiveStats(baseEntity: Partial<CombatEntity>, traits: Trait[] = []): CombatEntity {
    // Start with base stats
    const effective: CombatEntity = {
        id: baseEntity.id || Math.random().toString(36).substring(7),
        isPlayer: baseEntity.isPlayer || false,
        name: baseEntity.name || 'Unknown Entity',
        hp: baseEntity.hp || 100,
        maxHp: baseEntity.maxHp || 100,
        strength: baseEntity.strength || 10,
        agility: baseEntity.agility || 10,
        evasion: baseEntity.evasion || 5,
        defense: baseEntity.defense || 0,
        traits: traits
    };

    // Apply trait effects
    traits.forEach(trait => {
        if (!trait.effects) return;
        trait.effects.forEach(effect => {
            // Right now we only parse passive stat blocks at Init
            if (effect.trigger !== 'passive') return;

            if (effect.type === 'STAT_MODIFIER' || effect.type === 'COMBAT_BONUS') {
                if (effect.target && effect.target in effective) {
                    (effective as any)[effect.target] += effect.value;
                }
            }
        });
    });

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

        // Damage Calculation
        // Base damage = strength with +/- 20% variance. Minus flat defense.
        const variance = 0.8 + (Math.random() * 0.4);
        const rawDamage = Math.floor(attacker.strength * variance);
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
