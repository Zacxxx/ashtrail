import { useState, useEffect } from "react";

export interface GameRulesConfig {
    core: {
        hpBase: number;
        hpPerEndurance: number;
        apBase: number;
        apAgilityDivisor: number;
        mpBase: number;
        critPerIntelligence: number;
        resistPerWisdom: number;
        charismaBonusPerCharisma: number;
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
    regions: {
        /** Population multiplier per region type: Continent, Kingdom, Duchy, Province */
        popMultiplierContinent: number;
        popMultiplierKingdom: number;
        popMultiplierDuchy: number;
        popMultiplierProvince: number;
        /** Base population range */
        popBaseMin: number;
        popBaseMax: number;
        /** Wealth range (-100 to 100). Affects trade, resource availability. */
        wealthMin: number;
        wealthMax: number;
        /** Development range (-100 to 100). Affects infrastructure, tech level. */
        devMin: number;
        devMax: number;
    };
}

const DEFAULT_RULES: GameRulesConfig = {
    core: {
        hpBase: 10,
        hpPerEndurance: 5,
        apBase: 5,
        apAgilityDivisor: 2,
        mpBase: 3,
        critPerIntelligence: 0.02, // 2% crit per INT
        resistPerWisdom: 0.05,     // 5% resist per WIS
        charismaBonusPerCharisma: 0.03, // 3% bonus per CHA
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
    },
    regions: {
        popMultiplierContinent: 50,
        popMultiplierKingdom: 10,
        popMultiplierDuchy: 3,
        popMultiplierProvince: 1,
        popBaseMin: 500,
        popBaseMax: 5000,
        wealthMin: -100,
        wealthMax: 100,
        devMin: -100,
        devMax: 100,
    },
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
        return () => { listeners.delete(listener); };
    }
};

export function useGameRules() {
    const [rules, setRules] = useState<GameRulesConfig>(GameRulesManager.get());
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadRules = async () => {
            try {
                const res = await fetch("http://127.0.0.1:8787/api/data/game-rules");
                if (res.ok) {
                    const data = await res.json();
                    if (data && Object.keys(data).length > 0) {
                        GameRulesManager.update(data);
                    }
                }
            } catch (e) {
                console.error("Failed to fetch game rules:", e);
            } finally {
                setIsLoading(false);
            }
        };
        loadRules();

        return GameRulesManager.subscribe(() => {
            setRules(GameRulesManager.get());
        });
    }, []);

    const saveRules = async (newRules: GameRulesConfig) => {
        try {
            const res = await fetch("http://127.0.0.1:8787/api/data/game-rules", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newRules),
            });
            if (res.ok) {
                GameRulesManager.update(newRules);
                return true;
            }
        } catch (e) {
            console.error("Failed to save game rules:", e);
        }
        return false;
    };

    return {
        rules,
        isLoading,
        updateRules: GameRulesManager.update,
        saveRules
    };
}
