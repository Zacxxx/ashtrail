import { useState, useEffect } from "react";

export interface GameRulesConfig {
    core: {
        hpBase: number;
        hpPerEndurance: number;
        apBase: number;
        apAgilityDivisor: number;
    };
    combat: {
        damageVarianceMin: number;
        damageVarianceMax: number;
        strengthToPowerRatio: number;
    };
    grid: {
        baseDisengageCost: number;
        threatScaling: number;
        agilityMitigationDivisor: number;
    };
}

const DEFAULT_RULES: GameRulesConfig = {
    core: {
        hpBase: 10,
        hpPerEndurance: 5,
        apBase: 5,
        apAgilityDivisor: 2,
    },
    combat: {
        damageVarianceMin: 0.85,
        damageVarianceMax: 1.15,
        strengthToPowerRatio: 0.3,
    },
    grid: {
        baseDisengageCost: 2,
        threatScaling: 1,
        agilityMitigationDivisor: 10,
    }
};

let globalRules = { ...DEFAULT_RULES };
const listeners = new Set<() => void>();

export const GameRulesManager = {
    get: () => globalRules,
    update: (newRules: GameRulesConfig) => {
        globalRules = { ...newRules };
        listeners.forEach(l => l());
    },
    subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }
};

export function useGameRules() {
    const [rules, setRules] = useState(GameRulesManager.get());

    useEffect(() => {
        return GameRulesManager.subscribe(() => {
            setRules(GameRulesManager.get());
        });
    }, []);

    return {
        rules,
        updateRules: GameRulesManager.update
    };
}
