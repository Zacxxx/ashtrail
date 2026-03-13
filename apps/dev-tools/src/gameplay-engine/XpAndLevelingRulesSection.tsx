import React, { useEffect, useMemo, useRef, useState } from "react";
import type { GameRulesConfig } from "./rules/useGameRules";

interface Props {
    rules: GameRulesConfig;
    onChange: (nextRules: GameRulesConfig) => void;
    previewRules: (draftRules: GameRulesConfig) => Promise<GameRulesConfig | null>;
}

function NumberField({
    label,
    value,
    step = 1,
    min,
    onChange,
}: {
    label: string;
    value: number;
    step?: number;
    min?: number;
    onChange: (value: number) => void;
}) {
    return (
        <label className="flex flex-col gap-2 rounded-lg border border-white/5 bg-black/20 p-3">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">{label}</span>
            <input
                type="number"
                value={value}
                min={min}
                step={step}
                onChange={(event) => onChange(Number(event.target.value) || 0)}
                className="rounded border border-white/10 bg-black/40 px-2 py-1 text-sm font-mono text-white focus:border-orange-500/40 focus:outline-none"
            />
        </label>
    );
}

function SimpleBarChart({
    values,
    color,
    valueSuffix = "",
}: {
    values: Array<{ label: string; value: number }>;
    color: string;
    valueSuffix?: string;
}) {
    const max = Math.max(...values.map((entry) => entry.value), 1);
    return (
        <div className="grid grid-cols-5 gap-2">
            {values.map((entry) => (
                <div key={entry.label} className="flex flex-col gap-2">
                    <div className="flex h-28 items-end rounded border border-white/5 bg-black/20 p-1">
                        <div
                            className={`w-full rounded-sm ${color}`}
                            style={{ height: `${Math.max((entry.value / max) * 100, 4)}%` }}
                            title={`${entry.label}: ${entry.value.toLocaleString()}${valueSuffix}`}
                        />
                    </div>
                    <div className="text-center text-[9px] font-mono text-gray-500">{entry.label}</div>
                </div>
            ))}
        </div>
    );
}

export function XpAndLevelingRulesSection({ rules, onChange, previewRules }: Props) {
    const { xpAndLeveling } = rules;
    const [isPreviewing, setIsPreviewing] = useState(false);
    const previewSignatureRef = useRef("");

    const previewSignature = useMemo(
        () =>
            JSON.stringify({
                maxCharacterLevel: xpAndLeveling.maxCharacterLevel,
                maxCharacterCumulativeXp: xpAndLeveling.maxCharacterCumulativeXp,
                targetXpPerMinute: xpAndLeveling.targetXpPerMinute,
                targetXpPerHour: xpAndLeveling.targetXpPerHour,
                targetHoursToMaxLevel: xpAndLeveling.targetHoursToMaxLevel,
                referenceFormula: xpAndLeveling.referenceFormula,
                rewards: xpAndLeveling.rewards,
                pioneer: xpAndLeveling.pioneer,
            }),
        [xpAndLeveling],
    );

    useEffect(() => {
        if (previewSignatureRef.current === previewSignature) {
            return;
        }

        const timer = window.setTimeout(async () => {
            previewSignatureRef.current = previewSignature;
            setIsPreviewing(true);
            try {
                await previewRules(rules);
            } finally {
                setIsPreviewing(false);
            }
        }, 250);

        return () => window.clearTimeout(timer);
    }, [previewRules, previewSignature, rules]);

    const setXpRules = (nextXpRules: GameRulesConfig["xpAndLeveling"]) => {
        onChange({
            ...rules,
            xpAndLeveling: nextXpRules,
        });
    };

    const setFormula = (field: keyof GameRulesConfig["xpAndLeveling"]["referenceFormula"], value: number) => {
        setXpRules({
            ...xpAndLeveling,
            referenceFormula: {
                ...xpAndLeveling.referenceFormula,
                [field]: value,
            },
        });
    };

    const setReward = (field: keyof GameRulesConfig["xpAndLeveling"]["rewards"], value: number) => {
        setXpRules({
            ...xpAndLeveling,
            rewards: {
                ...xpAndLeveling.rewards,
                [field]: value,
            },
        });
    };

    const setPioneerField = (field: keyof Omit<GameRulesConfig["xpAndLeveling"]["pioneer"], "tiers" | "milestones">, value: number) => {
        setXpRules({
            ...xpAndLeveling,
            pioneer: {
                ...xpAndLeveling.pioneer,
                [field]: value,
            },
        });
    };

    const updateTier = (index: number, field: keyof GameRulesConfig["xpAndLeveling"]["pioneer"]["tiers"][number], value: number) => {
        const tiers = xpAndLeveling.pioneer.tiers.map((tier, tierIndex) =>
            tierIndex === index ? { ...tier, [field]: value } : tier,
        );
        setXpRules({
            ...xpAndLeveling,
            pioneer: {
                ...xpAndLeveling.pioneer,
                tiers,
            },
        });
    };

    const updateMilestone = (
        index: number,
        field: keyof GameRulesConfig["xpAndLeveling"]["pioneer"]["milestones"][number],
        value: number,
    ) => {
        const milestones = xpAndLeveling.pioneer.milestones.map((milestone, milestoneIndex) =>
            milestoneIndex === index ? { ...milestone, [field]: value } : milestone,
        );
        setXpRules({
            ...xpAndLeveling,
            pioneer: {
                ...xpAndLeveling.pioneer,
                milestones,
            },
        });
    };

    const milestonePreview = xpAndLeveling.generatedLevelTable
        .filter((entry) => [1, 5, 10, 15, 20, 25, 30].includes(entry.level))
        .map((entry) => ({ label: `L${entry.level}`, value: entry.cumulativeXp }));
    const nextLevelPreview = xpAndLeveling.generatedLevelTable
        .filter((entry) => [1, 5, 10, 15, 20, 25, 29].includes(entry.level))
        .map((entry) => ({ label: `L${entry.level}`, value: entry.nextLevelXp ?? 0 }));

    return (
        <section className="space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-3">
                    <span className="text-xl">XP</span>
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-emerald-300">XP & Leveling</h3>
                </div>
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-gray-500">
                    {isPreviewing ? "Preview syncing..." : "Formula authoritative"}
                </span>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="space-y-4 rounded-xl border border-white/5 bg-black/30 p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">Global Targets</p>
                    <div className="grid grid-cols-2 gap-3">
                        <NumberField label="Max Level" value={xpAndLeveling.maxCharacterLevel} min={1} onChange={(value) => setXpRules({ ...xpAndLeveling, maxCharacterLevel: value })} />
                        <NumberField label="Max Cumulative XP" value={xpAndLeveling.maxCharacterCumulativeXp} min={0} onChange={(value) => setXpRules({ ...xpAndLeveling, maxCharacterCumulativeXp: value })} />
                        <NumberField label="Target XP / Min" value={xpAndLeveling.targetXpPerMinute} min={0} onChange={(value) => setXpRules({ ...xpAndLeveling, targetXpPerMinute: value })} />
                        <NumberField label="Target XP / Hour" value={xpAndLeveling.targetXpPerHour} min={0} onChange={(value) => setXpRules({ ...xpAndLeveling, targetXpPerHour: value })} />
                        <NumberField label="Target Hours To Max" value={xpAndLeveling.targetHoursToMaxLevel} min={0} onChange={(value) => setXpRules({ ...xpAndLeveling, targetHoursToMaxLevel: value })} />
                    </div>
                </div>

                <div className="space-y-4 rounded-xl border border-white/5 bg-black/30 p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">Reference Formula</p>
                    <div className="grid grid-cols-3 gap-3">
                        <NumberField label="Base" value={xpAndLeveling.referenceFormula.base} step={0.001} min={0} onChange={(value) => setFormula("base", value)} />
                        <NumberField label="Exponent" value={xpAndLeveling.referenceFormula.exponent} step={0.001} min={0} onChange={(value) => setFormula("exponent", value)} />
                        <NumberField label="Level Offset" value={xpAndLeveling.referenceFormula.levelOffset} step={0.001} min={0} onChange={(value) => setFormula("levelOffset", value)} />
                    </div>
                    <div className="rounded-lg border border-emerald-500/10 bg-black/40 p-3 font-mono text-xs text-emerald-200">
                        XP cumulative(N) = {xpAndLeveling.referenceFormula.base} x (N - {xpAndLeveling.referenceFormula.levelOffset})^{xpAndLeveling.referenceFormula.exponent}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="space-y-4 rounded-xl border border-white/5 bg-black/30 p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-300">Level Rewards</p>
                    <div className="grid grid-cols-2 gap-3">
                        <NumberField label="Occupation / Level" value={xpAndLeveling.rewards.occupationPointsPerLevel} min={0} onChange={(value) => setReward("occupationPointsPerLevel", value)} />
                        <NumberField label="Level 1 Occupation" value={xpAndLeveling.rewards.levelOneOccupationPoints} min={0} onChange={(value) => setReward("levelOneOccupationPoints", value)} />
                        <NumberField label="Stat Every N Levels" value={xpAndLeveling.rewards.statPointEveryLevels} min={1} onChange={(value) => setReward("statPointEveryLevels", value)} />
                        <NumberField label="Max Stat Points" value={xpAndLeveling.rewards.maxStatPointsAtMaxLevel} min={0} onChange={(value) => setReward("maxStatPointsAtMaxLevel", value)} />
                    </div>
                </div>

                <div className="space-y-4 rounded-xl border border-white/5 bg-black/30 p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">Pioneer Core</p>
                    <div className="grid grid-cols-3 gap-3">
                        <NumberField label="Starts After Level" value={xpAndLeveling.pioneer.startsAfterLevel} min={1} onChange={(value) => setPioneerField("startsAfterLevel", value)} />
                        <NumberField label="Pioneer Cap" value={xpAndLeveling.pioneer.maxLevel} min={1} onChange={(value) => setPioneerField("maxLevel", value)} />
                        <NumberField label="Points / Level" value={xpAndLeveling.pioneer.pointPerLevel} min={0} onChange={(value) => setPioneerField("pointPerLevel", value)} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="space-y-4 rounded-xl border border-white/5 bg-black/30 p-5">
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">Pioneer Tiers</p>
                        <span className="text-[9px] font-mono text-gray-500">Editable by hand</span>
                    </div>
                    <div className="space-y-3">
                        {xpAndLeveling.pioneer.tiers.map((tier, index) => (
                            <div key={`${tier.startLevel}-${tier.endLevel}-${index}`} className="grid grid-cols-3 gap-3 rounded-lg border border-white/5 bg-black/20 p-3">
                                <NumberField label="Start" value={tier.startLevel} min={1} onChange={(value) => updateTier(index, "startLevel", value)} />
                                <NumberField label="End" value={tier.endLevel} min={1} onChange={(value) => updateTier(index, "endLevel", value)} />
                                <NumberField label="XP / Level" value={tier.xpPerLevel} min={0} onChange={(value) => updateTier(index, "xpPerLevel", value)} />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="space-y-4 rounded-xl border border-white/5 bg-black/30 p-5">
                    <div className="flex items-center justify-between">
                        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">Pioneer Milestones</p>
                        <span className="text-[9px] font-mono text-gray-500">Editable by hand</span>
                    </div>
                    <div className="max-h-[320px] space-y-2 overflow-y-auto pr-2">
                        {xpAndLeveling.pioneer.milestones.map((milestone, index) => (
                            <div key={`${milestone.level}-${index}`} className="grid grid-cols-2 gap-3 rounded-lg border border-white/5 bg-black/20 p-3">
                                <NumberField label="Level" value={milestone.level} min={1} onChange={(value) => updateMilestone(index, "level", value)} />
                                <NumberField label="Cumulative XP" value={milestone.cumulativeXp} min={0} onChange={(value) => updateMilestone(index, "cumulativeXp", value)} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="space-y-4 rounded-xl border border-white/5 bg-black/30 p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">Cumulative XP Curve</p>
                    <SimpleBarChart values={milestonePreview} color="bg-emerald-500/80" valueSuffix=" XP" />
                </div>

                <div className="space-y-4 rounded-xl border border-white/5 bg-black/30 p-5">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-300">XP To Next Level</p>
                    <SimpleBarChart values={nextLevelPreview} color="bg-orange-500/80" valueSuffix=" XP" />
                </div>
            </div>

            <div className="rounded-xl border border-white/5 bg-black/30 p-5">
                <div className="mb-4 flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">Generated Level Table</p>
                    <span className="text-[9px] font-mono text-gray-500">
                        Level 30 XP: {xpAndLeveling.generatedLevelTable.at(-1)?.cumulativeXp?.toLocaleString() ?? "0"}
                    </span>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-left text-[10px] font-mono">
                        <thead>
                            <tr className="border-b border-white/10 text-gray-500">
                                <th className="px-2 py-2">Level</th>
                                <th className="px-2 py-2">Cumulative XP</th>
                                <th className="px-2 py-2">XP To Next</th>
                                <th className="px-2 py-2">Occupation Total</th>
                                <th className="px-2 py-2">Stat Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {xpAndLeveling.generatedLevelTable.map((entry) => {
                                const occupationPoints = entry.level === 1
                                    ? Math.max(
                                        xpAndLeveling.rewards.levelOneOccupationPoints,
                                        xpAndLeveling.rewards.occupationPointsPerLevel,
                                    )
                                    : entry.level * xpAndLeveling.rewards.occupationPointsPerLevel;
                                const statPoints = Math.min(
                                    Math.floor(entry.level / Math.max(xpAndLeveling.rewards.statPointEveryLevels, 1)),
                                    xpAndLeveling.rewards.maxStatPointsAtMaxLevel,
                                );
                                return (
                                    <tr key={entry.level} className="border-b border-white/5 text-gray-300 last:border-0">
                                        <td className="px-2 py-2">Lv. {entry.level}</td>
                                        <td className="px-2 py-2">{entry.cumulativeXp.toLocaleString()}</td>
                                        <td className="px-2 py-2">{entry.nextLevelXp?.toLocaleString() ?? "MAX"}</td>
                                        <td className="px-2 py-2">{occupationPoints}</td>
                                        <td className="px-2 py-2">{statPoints}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
}
