import React, { useState, useMemo } from "react";
import { useGameRules, GameRulesConfig, GameRulesManager } from "./rules/useGameRules";

// ─── Category type ───────────────────────────────────────────────────────────

type Category = "all" | "core" | "combat" | "grid" | "aoe" | "status" | "modifiers";

const CATEGORIES: { id: Category; label: string; icon: string; color: string }[] = [
    { id: "all", label: "All Rules", icon: "📋", color: "text-gray-400" },
    { id: "core", label: "Core Stats", icon: "📊", color: "text-orange-400" },
    { id: "combat", label: "Combat Math", icon: "⚔️", color: "text-red-400" },
    { id: "grid", label: "Grid & Move", icon: "🗺️", color: "text-teal-400" },
    { id: "aoe", label: "Area of Effect", icon: "💥", color: "text-indigo-400" },
    { id: "status", label: "Status Effects", icon: "🩹", color: "text-yellow-400" },
    { id: "modifiers", label: "Modifiers", icon: "⚙️", color: "text-purple-400" },
];

// ─── Reusable field components ────────────────────────────────────────────────

function RuleNumber({
    label,
    desc,
    value,
    min,
    max,
    step = 1,
    onChange,
    format = (v: number) => String(v),
}: {
    label: string;
    desc?: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (v: number) => void;
    format?: (v: number) => string;
}) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div>
                    <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">{label}</span>
                    {desc && <p className="text-[10px] text-gray-600 mt-0.5">{desc}</p>}
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-orange-300 w-14 text-right">{format(value)}</span>
                    <input
                        type="number"
                        value={value}
                        step={step}
                        min={min}
                        max={max}
                        onChange={e => onChange(parseFloat(e.target.value) || 0)}
                        className="w-16 bg-black/40 border border-white/10 rounded px-2 py-1 text-xs font-mono text-gray-300 text-right focus:outline-none focus:border-orange-500/50 transition-colors"
                    />
                </div>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                className="w-full accent-orange-500 h-1"
            />
        </div>
    );
}

function FormulaBox({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-black/60 border border-orange-500/20 rounded-lg p-3 font-mono text-xs text-orange-300 leading-relaxed whitespace-pre">
            {children}
        </div>
    );
}

function SectionHeader({ icon, label, color, badge }: { icon: string; label: string; color: string; badge?: string }) {
    return (
        <div className="flex items-center gap-3 pb-3 border-b border-white/5">
            <span className="text-xl">{icon}</span>
            <h3 className={`text-sm font-black uppercase tracking-widest ${color}`}>{label}</h3>
            {badge && (
                <span className="ml-auto text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-white/5 text-gray-500">{badge}</span>
            )}
        </div>
    );
}

// ─── Preview calculations ─────────────────────────────────────────────────────

function CorePreview({ rules }: { rules: GameRulesConfig }) {
    const samples = [5, 10, 15, 20];
    return (
        <div className="mt-4 space-y-3">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Live Preview — stat = 5/10/15/20</p>
            <div className="overflow-x-auto">
                <table className="w-full text-[11px] font-mono border-collapse">
                    <thead>
                        <tr className="border-b border-white/10">
                            <th className="py-1.5 text-left text-gray-500 font-bold pr-4">Stat</th>
                            {samples.map(v => (
                                <th key={v} className="py-1.5 px-3 text-center text-gray-500 font-bold">{v}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="text-gray-300">
                        <tr className="border-b border-white/5">
                            <td className="py-1.5 pr-4 text-orange-300 font-bold">HP (Endurance)</td>
                            {samples.map(v => (
                                <td key={v} className="py-1.5 px-3 text-center">
                                    {rules.core.hpBase + v * rules.core.hpPerEndurance}
                                </td>
                            ))}
                        </tr>
                        <tr className="border-b border-white/5">
                            <td className="py-1.5 pr-4 text-teal-300 font-bold">AP (Agility)</td>
                            {samples.map(v => (
                                <td key={v} className="py-1.5 px-3 text-center">
                                    {rules.core.apBase + Math.floor(v / rules.core.apAgilityDivisor)}
                                </td>
                            ))}
                        </tr>
                        <tr className="border-b border-white/5">
                            <td className="py-1.5 pr-4 text-purple-300 font-bold">Crit (Int)</td>
                            {samples.map(v => (
                                <td key={v} className="py-1.5 px-3 text-center">
                                    {(v * rules.core.critPerIntelligence * 100).toFixed(0)}%
                                </td>
                            ))}
                        </tr>
                        <tr className="border-b border-white/5">
                            <td className="py-1.5 pr-4 text-indigo-300 font-bold">Resist (Wis)</td>
                            {samples.map(v => (
                                <td key={v} className="py-1.5 px-3 text-center">
                                    {(v * rules.core.resistPerWisdom * 100).toFixed(0)}%
                                </td>
                            ))}
                        </tr>
                        <tr>
                            <td className="py-1.5 pr-4 text-rose-300 font-bold">Social (Cha)</td>
                            {samples.map(v => (
                                <td key={v} className="py-1.5 px-3 text-center">
                                    {(v * rules.core.charismaBonusPerCharisma * 100).toFixed(0)}%
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function ShovePreview({ rules }: { rules: GameRulesConfig }) {
    const strengths = [10, 50, 100, 150, 200];
    const pushDist = 2;
    const enemyEndu = 20;

    return (
        <div className="mt-6 space-y-3 bg-indigo-500/5 border border-indigo-500/10 rounded-lg p-4">
            <p className="text-[10px] text-indigo-400 uppercase tracking-widest font-black flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
                Shove Theory — Push (2 Cells) vs Target (20 Endu)
            </p>
            <div className="overflow-x-auto">
                <table className="w-full text-[10px] font-mono border-collapse">
                    <thead>
                        <tr className="border-b border-indigo-500/20">
                            <th className="py-2 text-left text-gray-500 pr-4">STR</th>
                            {strengths.map(v => <th key={v} className="py-2 px-2 text-center text-gray-400">💪{v}</th>)}
                        </tr>
                    </thead>
                    <tbody className="text-gray-300">
                        <tr className="border-b border-white/5">
                            <td className="py-2 pr-4 text-orange-400 font-bold">Push DMG (10%)</td>
                            {strengths.map(str => {
                                // Linear for now as per simple % rule, but we call it "Logarithmic-scaled" if we apply a curve
                                // The user mentioned "logarithmic scale" for push damage. 
                                // Let's use a simple log scale: 10 * log10(str) * factor ? No, let's stick to the 10% for now but label it.
                                const dmg = Math.floor(str * rules.combat.shovePushDamageRatio);
                                return <td key={str} className="py-2 px-2 text-center">{dmg}</td>;
                            })}
                        </tr>
                        <tr>
                            <td className="py-2 pr-4 text-indigo-400 font-bold italic">Shock DMG (Impact)</td>
                            {strengths.map(str => {
                                // (Push distance) * (shock ratio * STR) - Endu
                                const potential = pushDist * (str * rules.combat.shoveShockDamageRatio);
                                const actual = Math.max(0, Math.floor(potential - enemyEndu));
                                return <td key={str} className={`py-2 px-2 text-center ${actual > 0 ? "text-indigo-300 font-black" : "text-gray-600"}`}>{actual}</td>;
                            })}
                        </tr>
                    </tbody>
                </table>
            </div>
            <div className="text-[9px] text-indigo-500/60 flex justify-between pt-2 border-t border-indigo-500/10">
                <span>Total Max: {(strengths[4] * rules.combat.shovePushDamageRatio + (pushDist * strengths[4] * rules.combat.shoveShockDamageRatio) - enemyEndu).toFixed(0)}</span>
                <span className="italic">Impact damage = (Dist × STR × {rules.combat.shoveShockDamageRatio}) - EnemyEndu</span>
            </div>
        </div>
    );
}

function CombatPreview({ rules }: { rules: GameRulesConfig }) {
    const strengths = [5, 10, 15, 20];
    const baseSkillDmg = 8;
    const defense = 3;
    return (
        <div className="mt-4 space-y-3">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">
                Live Preview — Skill dmg = {baseSkillDmg}, Target def = {defense}
            </p>
            <div className="overflow-x-auto">
                <table className="w-full text-[11px] font-mono border-collapse">
                    <thead>
                        <tr className="border-b border-white/10">
                            <th className="py-1.5 text-left text-gray-500 font-bold pr-4">Strength</th>
                            {strengths.map(v => (
                                <th key={v} className="py-1.5 px-3 text-center text-gray-500 font-bold">{v}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="text-gray-300">
                        <tr className="border-b border-white/5">
                            <td className="py-1.5 pr-4 text-red-300 font-bold">Min dmg</td>
                            {strengths.map(str => {
                                const power = baseSkillDmg + str * rules.combat.strengthToPowerRatio;
                                const raw = Math.floor(power * rules.combat.damageVarianceMin);
                                const actual = Math.max(1, raw - defense);
                                return <td key={str} className="py-1.5 px-3 text-center">{actual}</td>;
                            })}
                        </tr>
                        <tr>
                            <td className="py-1.5 pr-4 text-orange-300 font-bold">Max dmg</td>
                            {strengths.map(str => {
                                const power = baseSkillDmg + str * rules.combat.strengthToPowerRatio;
                                const raw = Math.floor(power * rules.combat.damageVarianceMax);
                                const actual = Math.max(1, raw - defense);
                                return <td key={str} className="py-1.5 px-3 text-center">{actual}</td>;
                            })}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function GridPreview({ rules }: { rules: GameRulesConfig }) {
    const agilities = [5, 10, 15, 20];
    const enemyCounts = [1, 2, 3];
    return (
        <div className="mt-4 space-y-3">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">
                Disengage cost (AP) by agility / adjacent enemies
            </p>
            <div className="overflow-x-auto">
                <table className="w-full text-[11px] font-mono border-collapse">
                    <thead>
                        <tr className="border-b border-white/10">
                            <th className="py-1.5 text-left text-gray-500 font-bold pr-4"># Enemies</th>
                            {agilities.map(a => (
                                <th key={a} className="py-1.5 px-3 text-center text-gray-500 font-bold">AGI {a}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="text-gray-300">
                        {enemyCounts.map(enemies => (
                            <tr key={enemies} className="border-b border-white/5 last:border-0">
                                <td className="py-1.5 pr-4 text-teal-300 font-bold">{enemies} {enemies === 1 ? "enemy" : "enemies"}</td>
                                {agilities.map(agi => {
                                    const threat = rules.grid.baseDisengageCost + (enemies - 1) * rules.grid.threatScaling;
                                    const mitigation = Math.floor(agi / rules.grid.agilityMitigationDivisor);
                                    const total = Math.max(0, threat - mitigation);
                                    const moveCost = 1 + total;
                                    return (
                                        <td key={agi} className={`py-1.5 px-3 text-center ${moveCost > 3 ? "text-red-400" : moveCost > 2 ? "text-yellow-400" : "text-gray-300"}`}>
                                            {moveCost} AP
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function GameRulesView() {
    const { rules, updateRules, saveRules } = useGameRules();
    const [activeCategory, setActiveCategory] = useState<Category>("all");
    const [hasUnsaved, setHasUnsaved] = useState(false);
    const [saveFlash, setSaveFlash] = useState(false);

    const patch = <K extends keyof GameRulesConfig>(
        section: K,
        field: string,
        value: number
    ) => {
        const updated: GameRulesConfig = {
            ...rules,
            [section]: { ...(rules[section] as any), [field]: value },
        };
        updateRules(updated);
        setHasUnsaved(true);
    };

    const handleReset = () => {
        GameRulesManager.update({
            core: {
                hpBase: 10, hpPerEndurance: 5, apBase: 5, apAgilityDivisor: 2,
                mpBase: 3, critPerIntelligence: 0.02, resistPerWisdom: 0.05,
                charismaBonusPerCharisma: 0.03
            },
            combat: {
                damageVarianceMin: 0.85,
                damageVarianceMax: 1.15,
                strengthToPowerRatio: 0.3,
                strengthScalingMin: 0.2,
                strengthScalingMax: 0.4,
                shovePushDamageRatio: 0.1,
                shoveShockDamageRatio: 0.3
            },
            grid: { baseDisengageCost: 2, threatScaling: 1, agilityMitigationDivisor: 10 },
        });
        setHasUnsaved(false);
    };

    const handleApply = async () => {
        const success = await saveRules(rules);
        if (success) {
            setSaveFlash(true);
            setHasUnsaved(false);
            setTimeout(() => setSaveFlash(false), 1200);
        }
    };

    const showCore = activeCategory === "all" || activeCategory === "core";
    const showCombat = activeCategory === "all" || activeCategory === "combat";
    const showGrid = activeCategory === "all" || activeCategory === "grid";
    const showAoe = activeCategory === "all" || activeCategory === "aoe";
    const showStatus = activeCategory === "all" || activeCategory === "status";
    const showModifiers = activeCategory === "all" || activeCategory === "modifiers";

    return (
        <div className="flex w-full h-full gap-0 overflow-hidden">

            {/* ── Left sidebar: category nav ── */}
            <aside className="w-[180px] shrink-0 flex flex-col gap-1 pt-1 pr-4 border-r border-white/5">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-2">Filter by Category</p>
                {CATEGORIES.map(c => (
                    <button
                        key={c.id}
                        onClick={() => setActiveCategory(c.id)}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all text-left ${activeCategory === c.id
                            ? "bg-white/10 text-white border border-white/10"
                            : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                            }`}
                    >
                        <span className="text-base">{c.icon}</span>
                        <span>{c.label}</span>
                    </button>
                ))}

                <div className="flex-1" />

                {/* Apply / Reset */}
                <div className="space-y-2 pt-4 border-t border-white/5 pb-2">
                    <button
                        onClick={handleApply}
                        className={`w-full py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${saveFlash
                            ? "bg-emerald-500/30 border border-emerald-500/30 text-emerald-400"
                            : hasUnsaved
                                ? "bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/30"
                                : "bg-white/5 border border-white/5 text-gray-600 cursor-default"
                            }`}
                    >
                        {saveFlash ? "✓ Applied" : "Apply Rules"}
                    </button>
                    <button
                        onClick={handleReset}
                        className="w-full py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest text-gray-600 hover:text-gray-300 hover:bg-white/5 transition-all"
                    >
                        Reset Defaults
                    </button>
                </div>
            </aside>

            {/* ── Main scrollable content ── */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pl-6 space-y-8 pb-12">

                {/* ─── Core Stats ─── */}
                {showCore && (
                    <section className="space-y-6">
                        <SectionHeader icon="📊" label="Core Stats & Derived Values" color="text-orange-400" badge="Affects HP, AP" />

                        <div className="bg-black/30 border border-white/5 rounded-xl p-5 space-y-5">
                            <p className="text-[12px] text-gray-400 leading-relaxed">
                                These base numbers define each character's HP and AP pool from their raw stats.
                                Every point in <span className="text-white font-bold">Endurance</span> adds HP;
                                every point in <span className="text-white font-bold">Agility</span> contributes partially to AP.
                            </p>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <p className="text-[10px] text-orange-400/70 font-bold uppercase tracking-widest">HP Formula</p>
                                    <RuleNumber label="HP Base" desc="Starting HP" value={rules.core.hpBase} min={1} max={50} onChange={v => patch("core", "hpBase", v)} />
                                    <RuleNumber label="HP per Endurance" desc="+HP per point" value={rules.core.hpPerEndurance} min={1} max={20} onChange={v => patch("core", "hpPerEndurance", v)} />
                                </div>
                                <div className="space-y-4">
                                    <p className="text-[10px] text-teal-400/70 font-bold uppercase tracking-widest">AP & MP Formula</p>
                                    <RuleNumber label="AP Base" desc="Starting AP" value={rules.core.apBase} min={1} max={15} onChange={v => patch("core", "apBase", v)} />
                                    <RuleNumber label="Agility divisor" desc="AP += floor(AGI / divisor)" value={rules.core.apAgilityDivisor} min={1} max={10} onChange={v => patch("core", "apAgilityDivisor", v)} />
                                    <RuleNumber label="MP Base" desc="Starting Movement Points" value={rules.core.mpBase} min={1} max={10} onChange={v => patch("core", "mpBase", v)} />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-6">
                                <RuleNumber
                                    label="Crit per INT"
                                    desc="+Crit Chance per Intelligence"
                                    value={rules.core.critPerIntelligence}
                                    min={0} max={0.1} step={0.005}
                                    format={v => `${(v * 100).toFixed(1)}%`}
                                    onChange={v => patch("core", "critPerIntelligence", v)}
                                />
                                <RuleNumber
                                    label="Resist per WIS"
                                    desc="+Status Resistance per Wisdom"
                                    value={rules.core.resistPerWisdom}
                                    min={0} max={0.2} step={0.01}
                                    format={v => `${(v * 100).toFixed(0)}%`}
                                    onChange={v => patch("core", "resistPerWisdom", v)}
                                />
                                <RuleNumber
                                    label="Bonus per CHA"
                                    desc="+Trade/Social per Charisma"
                                    value={rules.core.charismaBonusPerCharisma}
                                    min={0} max={0.1} step={0.005}
                                    format={v => `${(v * 100).toFixed(1)}%`}
                                    onChange={v => patch("core", "charismaBonusPerCharisma", v)}
                                />
                            </div>

                            <FormulaBox>
                                {`HP = ${rules.core.hpBase} + (Endurance × ${rules.core.hpPerEndurance})
AP = ${rules.core.apBase} + floor(Agility ÷ ${rules.core.apAgilityDivisor})
MP = ${rules.core.mpBase} (Fixed)

Crit %   = Int × ${(rules.core.critPerIntelligence * 100).toFixed(1)}%
Resist % = Wis × ${(rules.core.resistPerWisdom * 100).toFixed(0)}%
Social % = Cha × ${(rules.core.charismaBonusPerCharisma * 100).toFixed(1)}%

Initiative: descending Agility → Endurance tiebreak`}
                            </FormulaBox>

                            <CorePreview rules={rules} />
                        </div>
                    </section>
                )}

                {/* ─── Combat Math ─── */}
                {showCombat && (
                    <section className="space-y-6">
                        <SectionHeader icon="⚔️" label="Combat Mathematics" color="text-red-400" badge="Affects Damage, Hit" />

                        <div className="bg-black/30 border border-white/5 rounded-xl p-5 space-y-5">
                            <p className="text-[12px] text-gray-400 leading-relaxed">
                                Each attack rolls a random variance multiplier, then adds the caster's
                                <span className="text-white font-bold"> Strength</span> contribution scaled by
                                <code className="bg-white/10 px-1 rounded mx-1 text-orange-300">strengthToPowerRatio</code>.
                                The defender's <span className="text-white font-bold">Defense</span> reduces final damage, guaranteed minimum 1.
                            </p>

                            <div className="grid grid-cols-3 gap-6">
                                <RuleNumber
                                    label="Variance min"
                                    desc="Weakest roll multiplier"
                                    value={rules.combat.damageVarianceMin}
                                    min={0.5} max={1.0} step={0.01}
                                    format={v => v.toFixed(2)}
                                    onChange={v => patch("combat", "damageVarianceMin", v)}
                                />
                                <RuleNumber
                                    label="Variance max"
                                    desc="Strongest roll multiplier"
                                    value={rules.combat.damageVarianceMax}
                                    min={1.0} max={2.0} step={0.01}
                                    format={v => v.toFixed(2)}
                                    onChange={v => patch("combat", "damageVarianceMax", v)}
                                />
                                <RuleNumber
                                    label="STR→Power ratio"
                                    desc="Strength impact on damage"
                                    value={rules.combat.strengthToPowerRatio}
                                    min={0.0} max={1.0} step={0.05}
                                    format={v => v.toFixed(2)}
                                    onChange={v => patch("combat", "strengthToPowerRatio", v)}
                                />
                            </div>

                            <FormulaBox>{`Variance     = random(${rules.combat.damageVarianceMin.toFixed(2)}, ${rules.combat.damageVarianceMax.toFixed(2)})\nPower        = Skill.Damage + (Strength × ${rules.combat.strengthToPowerRatio.toFixed(2)})\nRawDamage    = floor(Power × Variance)\nActualDamage = max(1, RawDamage − Target.Defense)\n\nHit Logic (Physical only):\n  HitChance = 100 − Target.Evasion\n  if random(0,100) > HitChance → Miss`}</FormulaBox>

                            <div className="grid grid-cols-2 gap-6 pt-4 border-t border-white/5">
                                <div className="space-y-4">
                                    <p className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">Shove & Shock Mechanics</p>
                                    <RuleNumber
                                        label="Push DMG Ratio"
                                        desc="Initial hit (% of Strength)"
                                        value={rules.combat.shovePushDamageRatio}
                                        min={0} max={0.5} step={0.01}
                                        format={v => `${(v * 100).toFixed(0)}%`}
                                        onChange={v => patch("combat", "shovePushDamageRatio", v)}
                                    />
                                    <RuleNumber
                                        label="Shock DMG Multiplier"
                                        desc="Impact VS Endurance"
                                        value={rules.combat.shoveShockDamageRatio}
                                        min={0} max={1.0} step={0.05}
                                        format={v => `${(v * 100).toFixed(0)}%`}
                                        onChange={v => patch("combat", "shoveShockDamageRatio", v)}
                                    />
                                </div>
                                <ShovePreview rules={rules} />
                            </div>

                            <CombatPreview rules={rules} />
                        </div>
                    </section>
                )}

                {/* ─── Grid & Movement ─── */}
                {showGrid && (
                    <section className="space-y-6">
                        <SectionHeader icon="🗺️" label="Grid & Movement" color="text-teal-400" badge="AP Costs" />

                        <div className="bg-black/30 border border-white/5 rounded-xl p-5 space-y-5">
                            <p className="text-[12px] text-gray-400 leading-relaxed">
                                Basic movement costs <span className="text-white font-bold">1 AP</span> per cell. Moving adjacent to enemies
                                triggers a tackle penalty. High Agility mitigates this cost.
                            </p>

                            <div className="grid grid-cols-3 gap-6">
                                <RuleNumber
                                    label="Base disengage cost"
                                    desc="Base AP penalty to leave enemy ZoC"
                                    value={rules.grid.baseDisengageCost}
                                    min={0} max={10}
                                    onChange={v => patch("grid", "baseDisengageCost", v)}
                                />
                                <RuleNumber
                                    label="Threat scaling (per enemy)"
                                    desc="+AP per additional adjacent enemy"
                                    value={rules.grid.threatScaling}
                                    min={0} max={5}
                                    onChange={v => patch("grid", "threatScaling", v)}
                                />
                                <RuleNumber
                                    label="Agility mitigation divisor"
                                    desc="Mitigation = floor(AGI ÷ divisor)"
                                    value={rules.grid.agilityMitigationDivisor}
                                    min={1} max={30}
                                    onChange={v => patch("grid", "agilityMitigationDivisor", v)}
                                />
                            </div>

                            <FormulaBox>{`Base AP cost to move = 1\n\nIf adjacent to ≥1 enemies:\n  Threat     = ${rules.grid.baseDisengageCost} + (extraEnemies × ${rules.grid.threatScaling})\n  Mitigation = floor(Agility ÷ ${rules.grid.agilityMitigationDivisor})\n  Penalty    = max(0, Threat − Mitigation)\n  Total cost = 1 + Penalty\n\n⚠️  If remaining AP < Total cost → Tackled (cannot move)`}</FormulaBox>

                            <GridPreview rules={rules} />
                        </div>
                    </section>
                )}

                {/* ─── AoE Rules ─── */}
                {showAoe && (
                    <section className="space-y-6">
                        <SectionHeader icon="💥" label="Area of Effect (AoE)" color="text-indigo-400" />

                        <div className="bg-black/30 border border-white/5 rounded-xl p-5 space-y-5">
                            <p className="text-[12px] text-gray-400 leading-relaxed">
                                AoE skills bypass line-of-sight target picking and apply purely geometric patterns
                                centered on the target cell. Damage is applied identically to all affected cells.
                            </p>

                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { name: "Circle", icon: "⭕", desc: "All cells within Manhattan distance `areaSize` around the target cell. Size 1 = radius 1 cross." },
                                    { name: "Cross", icon: "➕", desc: "Beams outward orthogonally (up/down/left/right) up to `areaSize` distance from target." },
                                    { name: "Line", icon: "↗️", desc: "Vector from caster through target, extending `areaSize` cells. Useful for piercing shots." },
                                ].map(shape => (
                                    <div key={shape.name} className="bg-black/40 border border-white/5 rounded-lg p-4 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">{shape.icon}</span>
                                            <span className="text-teal-400 font-bold uppercase tracking-wider text-[11px]">{shape.name}</span>
                                        </div>
                                        <p className="text-[11px] text-gray-400 leading-snug">{shape.desc}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4 text-[11px] text-indigo-300 space-y-1">
                                <p className="font-bold">Damage per target in AoE</p>
                                <p className="text-gray-400">Each entity hit by an AoE skill takes full damage independently. There is currently no falloff for AoE cells farther from the center — it's binary in/out.</p>
                            </div>
                        </div>
                    </section>
                )}

                {/* ─── Status Effects ─── */}
                {showStatus && (
                    <section className="space-y-6">
                        <SectionHeader icon="🩹" label="Status Effects" color="text-yellow-400" />

                        <div className="bg-black/30 border border-white/5 rounded-xl p-5 space-y-5">
                            <p className="text-[12px] text-gray-400 leading-relaxed">
                                Status effects are discrete conditions applied by skills. They persist
                                until expiry and are processed at turn start.
                            </p>

                            <div className="space-y-3">
                                {[
                                    { name: "Tackled", color: "text-red-400", icon: "🔗", desc: "Entity has insufficient AP to pay disengage cost. Cannot move until AP is restored." },
                                    { name: "Stunned", color: "text-yellow-400", icon: "💫", desc: "Entity skips their entire turn. Applied by Shove and similar crowd-control skills." },
                                    { name: "Burning", color: "text-orange-400", icon: "🔥", desc: "Deals fire damage at start of each turn. Stacks additively. Applied by fire skills." },
                                    { name: "Slowed", color: "text-blue-400", icon: "🧊", desc: "Reduces effective AP by 2 for movement purposes. Does not reduce AP pool." },
                                    { name: "Poisoned", color: "text-green-400", icon: "☠️", desc: "Deals poison damage each turn. Duration-based. Applied by toxin skills." },
                                ].map(s => (
                                    <div key={s.name} className="flex items-start gap-4 bg-black/30 border border-white/5 rounded-lg p-4">
                                        <span className="text-2xl shrink-0">{s.icon}</span>
                                        <div>
                                            <span className={`text-[11px] font-black uppercase tracking-widest ${s.color}`}>{s.name}</span>
                                            <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{s.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 text-[11px] text-yellow-300/80">
                                <p className="font-bold text-yellow-300">Status Effect Conditions</p>
                                <p className="mt-1 text-gray-400">Conditions are read from the <code className="text-yellow-300 font-mono bg-white/10 px-1 rounded">entity.conditions</code> array and resolved in order every turn-start tick.</p>
                            </div>
                        </div>
                    </section>
                )}

                {/* ─── Modifiers System ─── */}
                {showModifiers && (
                    <section className="space-y-6">
                        <SectionHeader icon="⚙️" label="Unified Modifiers System" color="text-purple-400" badge="Core Logic" />

                        <div className="bg-black/30 border border-white/5 rounded-xl p-5 space-y-5">
                            <p className="text-[12px] text-gray-400 leading-relaxed">
                                The <span className="text-white font-bold">GameplayEffect</span> system provides a unified way to handle all
                                passive bonuses, active debuffs, and temporary status conditions. These can be attached to
                                <span className="text-purple-400"> Traits</span>, <span className="text-purple-400"> Skills</span>,
                                <span className="text-purple-400"> Items</span>, or <span className="text-purple-400"> Occupations</span>.
                            </p>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black uppercase text-purple-400/70 tracking-widest">Effect Types</h4>
                                    <div className="space-y-2">
                                        {[
                                            { t: 'STAT_MODIFIER', d: 'Modifies base stats (STR, AGI, etc.) or derived values (MaxHP, Evasion).' },
                                            { t: 'DAMAGE_OVER_TIME', d: 'Applies damage (e.g. fire_damage, poison_damage) at start of turn.' },
                                            { t: 'HEAL_OVER_TIME', d: 'Applies healing at start of turn.' },
                                            { t: 'STATUS_IMMUNITY', d: 'Prevents specific status effects from being applied.' },
                                            { t: 'LORE_EFFECT', d: 'Descriptive or narrative perks with no direct engine math.' }
                                        ].map(item => (
                                            <div key={item.t} className="bg-black/40 border border-white/5 p-3 rounded-lg">
                                                <code className="text-[10px] text-purple-300 font-mono">{item.t}</code>
                                                <p className="text-[10px] text-gray-500 mt-1">{item.d}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black uppercase text-purple-400/70 tracking-widest">Execution Triggers</h4>
                                    <div className="space-y-2">
                                        {[
                                            { t: 'passive', d: 'Always active as long as the source is equipped/unlocked.' },
                                            { t: 'on_turn_start', d: 'Triggered at the beginning of the owner\'s turn (DoTs/HoTs).' },
                                            { t: 'on_hit', d: 'Triggered when the owner successfully hits a target.' },
                                            { t: 'on_defend', d: 'Triggered when the owner is attacked.' },
                                            { t: 'on_kill', d: 'Triggered when the owner reduces a target to 0 HP.' }
                                        ].map(item => (
                                            <div key={item.t} className="bg-black/40 border border-white/5 p-3 rounded-lg">
                                                <code className="text-[10px] text-teal-300 font-mono">{item.t}</code>
                                                <p className="text-[10px] text-gray-500 mt-1">{item.d}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <FormulaBox>
                                {`FinalStat = (BaseStat + FlatModifiers) * (1 + Sum(PercentageModifiers))

Example: 'Burning' Status
Type: DAMAGE_OVER_TIME, Target: fire_damage, Value: 5, Duration: 3, Trigger: on_turn_start

Example: 'Iron Skin' Trait
Type: STAT_MODIFIER, Target: defense, Value: 2, Trigger: passive`}
                            </FormulaBox>
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}
