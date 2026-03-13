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
        armorAgiScale: number;
        armorEnduScale: number;
    };
    combat: {
        damageVarianceMin: number;
        damageVarianceMax: number;
        strengthToPowerRatio: number;
        strengthScalingMin: number;
        strengthScalingMax: number;
        agilityScalingMin: number;
        agilityScalingMax: number;
        meleeScalingStat: string;
        rangedScalingStat: string;
        shovePushDamageRatio: number;
        shoveShockDamageRatio: number;
        defendPartialThreshold: number;
        defendSuccessThreshold: number;
        defendFailReduction: number;
        defendPartialReduction: number;
        defendSuccessReduction: number;
        stealthBaseDuration: number;
        stealthScaleFactor: number;
        distractCharismaScale: number;
        analyzeBaseCrit: number;
        analyzeIntelScale: number;
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
    xpAndLeveling: {
        maxCharacterLevel: number;
        maxCharacterCumulativeXp: number;
        targetXpPerMinute: number;
        targetXpPerHour: number;
        targetHoursToMaxLevel: number;
        referenceFormula: {
            base: number;
            exponent: number;
            levelOffset: number;
        };
        generatedLevelTable: Array<{
            level: number;
            cumulativeXp: number;
            nextLevelXp: number | null;
        }>;
        rewards: {
            occupationPointsPerLevel: number;
            levelOneOccupationPoints: number;
            statPointEveryLevels: number;
            maxStatPointsAtMaxLevel: number;
        };
        pioneer: {
            startsAfterLevel: number;
            maxLevel: number;
            pointPerLevel: number;
            tiers: Array<{
                startLevel: number;
                endLevel: number;
                xpPerLevel: number;
            }>;
            milestones: Array<{
                level: number;
                cumulativeXp: number;
            }>;
        };
    };
}

export const DEFAULT_RULES: GameRulesConfig = {
    core: {
        hpBase: 10,
        hpPerEndurance: 5,
        apBase: 5,
        apAgilityDivisor: 2,
        mpBase: 3,
        critPerIntelligence: 0.02, // 2% crit per INT
        resistPerWisdom: 0.05,     // 5% resist per WIS
        charismaBonusPerCharisma: 0.03, // 3% bonus per CHA
        armorAgiScale: 2.5,            // Scaling factor for Agility
        armorEnduScale: 3.5,           // Scaling factor for Endurance
    },
    combat: {
        damageVarianceMin: 0.85,
        damageVarianceMax: 1.15,
        strengthToPowerRatio: 0.3,
        strengthScalingMin: 0.2,
        strengthScalingMax: 0.4,
        agilityScalingMin: 0.2,
        agilityScalingMax: 0.4,
        meleeScalingStat: 'strength',
        rangedScalingStat: 'agility',
        shovePushDamageRatio: 0.1,
        shoveShockDamageRatio: 0.3,
        defendPartialThreshold: 5,
        defendSuccessThreshold: 10,
        defendFailReduction: 0.1,
        defendPartialReduction: 0.2,
        defendSuccessReduction: 0.6,
        stealthBaseDuration: 1,
        stealthScaleFactor: 1.4,
        distractCharismaScale: 0.42,
        analyzeBaseCrit: 30,
        analyzeIntelScale: 0.6,
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
    xpAndLeveling: {
        maxCharacterLevel: 30,
        maxCharacterCumulativeXp: 414000,
        targetXpPerMinute: 300,
        targetXpPerHour: 18000,
        targetHoursToMaxLevel: 23,
        referenceFormula: {
            base: 120,
            exponent: 2.419,
            levelOffset: 1,
        },
        generatedLevelTable: [
            { level: 1, cumulativeXp: 0, nextLevelXp: 120 },
            { level: 2, cumulativeXp: 120, nextLevelXp: 522 },
            { level: 3, cumulativeXp: 642, nextLevelXp: 1070 },
            { level: 4, cumulativeXp: 1712, nextLevelXp: 1721 },
            { level: 5, cumulativeXp: 3433, nextLevelXp: 2457 },
            { level: 6, cumulativeXp: 5890, nextLevelXp: 3265 },
            { level: 7, cumulativeXp: 9155, nextLevelXp: 4138 },
            { level: 8, cumulativeXp: 13293, nextLevelXp: 5069 },
            { level: 9, cumulativeXp: 18362, nextLevelXp: 6054 },
            { level: 10, cumulativeXp: 24416, nextLevelXp: 7088 },
            { level: 11, cumulativeXp: 31504, nextLevelXp: 8167 },
            { level: 12, cumulativeXp: 39671, nextLevelXp: 9288 },
            { level: 13, cumulativeXp: 48959, nextLevelXp: 10447 },
            { level: 14, cumulativeXp: 59406, nextLevelXp: 11642 },
            { level: 15, cumulativeXp: 71048, nextLevelXp: 12870 },
            { level: 16, cumulativeXp: 83918, nextLevelXp: 14129 },
            { level: 17, cumulativeXp: 98047, nextLevelXp: 15417 },
            { level: 18, cumulativeXp: 113464, nextLevelXp: 16731 },
            { level: 19, cumulativeXp: 130195, nextLevelXp: 18071 },
            { level: 20, cumulativeXp: 148266, nextLevelXp: 19435 },
            { level: 21, cumulativeXp: 167701, nextLevelXp: 20821 },
            { level: 22, cumulativeXp: 188522, nextLevelXp: 22229 },
            { level: 23, cumulativeXp: 210751, nextLevelXp: 23657 },
            { level: 24, cumulativeXp: 234408, nextLevelXp: 25105 },
            { level: 25, cumulativeXp: 259513, nextLevelXp: 26573 },
            { level: 26, cumulativeXp: 286086, nextLevelXp: 28373 },
            { level: 27, cumulativeXp: 317886, nextLevelXp: 30389 },
            { level: 28, cumulativeXp: 348275, nextLevelXp: 32030 },
            { level: 29, cumulativeXp: 380305, nextLevelXp: 33695 },
            { level: 30, cumulativeXp: 414000, nextLevelXp: null },
        ],
        rewards: {
            occupationPointsPerLevel: 1,
            levelOneOccupationPoints: 1,
            statPointEveryLevels: 3,
            maxStatPointsAtMaxLevel: 10,
        },
        pioneer: {
            startsAfterLevel: 30,
            maxLevel: 200,
            pointPerLevel: 1,
            tiers: [
                { startLevel: 1, endLevel: 20, xpPerLevel: 35000 },
                { startLevel: 21, endLevel: 50, xpPerLevel: 45000 },
                { startLevel: 51, endLevel: 100, xpPerLevel: 60000 },
                { startLevel: 101, endLevel: 150, xpPerLevel: 80000 },
                { startLevel: 151, endLevel: 200, xpPerLevel: 100000 },
            ],
            milestones: [
                { level: 1, cumulativeXp: 35000 },
                { level: 2, cumulativeXp: 70000 },
                { level: 3, cumulativeXp: 105000 },
                { level: 4, cumulativeXp: 140000 },
                { level: 5, cumulativeXp: 175000 },
                { level: 10, cumulativeXp: 350000 },
                { level: 15, cumulativeXp: 525000 },
                { level: 20, cumulativeXp: 700000 },
                { level: 21, cumulativeXp: 745000 },
                { level: 25, cumulativeXp: 925000 },
                { level: 30, cumulativeXp: 1150000 },
                { level: 40, cumulativeXp: 1600000 },
                { level: 50, cumulativeXp: 2050000 },
                { level: 51, cumulativeXp: 2110000 },
                { level: 60, cumulativeXp: 2650000 },
                { level: 75, cumulativeXp: 3550000 },
                { level: 100, cumulativeXp: 5050000 },
                { level: 101, cumulativeXp: 5130000 },
                { level: 125, cumulativeXp: 7050000 },
                { level: 150, cumulativeXp: 9050000 },
                { level: 151, cumulativeXp: 9150000 },
                { level: 175, cumulativeXp: 11550000 },
                { level: 200, cumulativeXp: 14050000 },
            ],
        },
    },
};

let globalRules = { ...DEFAULT_RULES };
const listeners = new Set<() => void>();

function mergeRules(base: any, incoming: any): any {
    if (Array.isArray(base)) {
        return Array.isArray(incoming) ? incoming : base;
    }
    if (base && typeof base === "object") {
        const result: Record<string, unknown> = { ...base };
        const source = incoming && typeof incoming === "object" ? incoming : {};
        Object.keys(base).forEach((key) => {
            const nextValue = (source as Record<string, unknown>)[key];
            if (nextValue === undefined || nextValue === null) {
                return;
            }
            result[key] = mergeRules((base as Record<string, unknown>)[key], nextValue);
        });
        Object.keys(source).forEach((key) => {
            if (!(key in result)) {
                result[key] = (source as Record<string, unknown>)[key];
            }
        });
        return result;
    }
    return incoming ?? base;
}

export const GameRulesManager = {
    get: () => globalRules,
    update: (newRules: Partial<GameRulesConfig>) => {
        globalRules = mergeRules(DEFAULT_RULES, newRules) as GameRulesConfig;
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

    const previewRules = async (draftRules: GameRulesConfig) => {
        try {
            const res = await fetch("http://127.0.0.1:8787/api/progression/preview-rules", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(draftRules),
            });
            if (res.ok) {
                const normalized = await res.json();
                GameRulesManager.update(normalized);
                return normalized as GameRulesConfig;
            }
        } catch (e) {
            console.error("Failed to preview game rules:", e);
        }
        return null;
    };

    const saveRules = async (newRules: GameRulesConfig) => {
        try {
            const res = await fetch("http://127.0.0.1:8787/api/data/game-rules", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newRules),
            });
            if (res.ok) {
                const normalized = await res.json();
                GameRulesManager.update(normalized);
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
        saveRules,
        previewRules,
    };
}
