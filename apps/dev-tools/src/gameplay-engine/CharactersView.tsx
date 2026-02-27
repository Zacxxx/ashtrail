import React, { useMemo } from "react";
import { Character } from "@ashtrail/core";
import { calculateEffectiveStats } from "./combat/useCombatEngine";
import { GameRulesManager } from "./rules/useGameRules";

interface CharactersViewProps {
    character: Character | null;
}

export function CharactersView({ character }: CharactersViewProps) {
    const effective = useMemo(() => {
        if (!character) return null;
        // Map Character to Partial<CombatEntity>
        return calculateEffectiveStats({
            id: character.id,
            name: character.name,
            strength: character.stats.strength,
            agility: character.stats.agility,
            intelligence: character.stats.intelligence,
            wisdom: character.stats.wisdom,
            charisma: character.stats.charisma,
            hp: character.hp,
            maxHp: character.maxHp,
            evasion: Math.floor(character.stats.agility / 4),
            defense: Math.floor(character.stats.endurance / 2),
        } as any, character.traits);
    }, [character]);

    const rules = GameRulesManager.get();

    if (!character || !effective) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                <span className="text-4xl mb-4 opacity-20">👤</span>
                <p className="font-mono text-sm tracking-widest uppercase">Select a character to view details</p>
            </div>
        );
    }

    const statInfo = [
        { label: 'Strength', val: character.stats.strength, color: 'text-red-400', bonus: `+${character.stats.strength * rules.combat.strengthToPowerRatio} Power` },
        { label: 'Agility', val: character.stats.agility, color: 'text-blue-400', bonus: `+${Math.floor(character.stats.agility / rules.core.apAgilityDivisor)} AP` },
        { label: 'Endurance', val: character.stats.endurance, color: 'text-green-400', bonus: `+${character.stats.endurance * rules.core.hpPerEndurance} HP` },
        { label: 'Intelligence', val: character.stats.intelligence, color: 'text-purple-400', bonus: `+${(effective.critChance * 100).toFixed(0)}% Crit` },
        { label: 'Wisdom', val: character.stats.wisdom, color: 'text-yellow-400', bonus: `+${(effective.resistance * 100).toFixed(0)}% Resist` },
        { label: 'Charisma', val: character.stats.charisma, color: 'text-pink-400', bonus: `+${(effective.socialBonus * 100).toFixed(0)}% Social` },
    ];

    return (
        <div className="w-full h-full max-w-[1200px] bg-[#1e1e1e]/60 rounded-2xl border border-white/5 shadow-2xl p-8 overflow-y-auto custom-scrollbar space-y-8">
            <div className="flex justify-between items-start border-b border-white/10 pb-6 shrink-0">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-3xl overflow-hidden shadow-inner">
                            {character.portraitUrl ? (
                                <img src={character.portraitUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                                "👤"
                            )}
                        </div>
                        <div className="flex flex-col">
                            <h2 className="text-3xl font-black uppercase tracking-widest text-indigo-400">
                                {character.name}
                            </h2>
                            <div className="flex items-center gap-3 text-xs font-mono text-gray-500 uppercase tracking-widest">
                                <span>Level {character.level}</span>
                                <span className="text-indigo-500/30">/</span>
                                <span className="text-indigo-400/70">{character.occupation?.name || "Unemployed"}</span>
                                <span className="text-indigo-500/30">/</span>
                                <span>{character.age} Years</span>
                            </div>
                        </div>
                    </div>
                </div>
                {character.isNPC && (
                    <span className="px-3 py-1 bg-red-500/10 text-red-500 text-[10px] font-black tracking-widest uppercase rounded-full border border-red-500/20">
                        NPC Archetype
                    </span>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Column: Stats */}
                <div className="space-y-8">
                    {/* Core Stats */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-indigo-500/70 uppercase tracking-widest border-b border-indigo-900/30 pb-1 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            Primary Attributes
                        </h3>
                        <div className="grid grid-cols-3 gap-3">
                            {statInfo.map(s => (
                                <div key={s.label} className="bg-black/40 p-3 rounded-xl border border-white/5 flex flex-col items-center text-center gap-1 group hover:border-indigo-500/30 transition-all shadow-inner">
                                    <span className="text-[8px] uppercase text-gray-500 font-black tracking-widest">{s.label}</span>
                                    <span className={`text-xl font-black ${s.color}`}>{s.val}</span>
                                    <span className="text-[7px] text-gray-600 font-mono group-hover:text-indigo-400 transition-colors uppercase leading-none">{s.bonus}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Derived Stats */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-indigo-500/70 uppercase tracking-widest border-b border-indigo-900/30 pb-1 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                            Combat Efficiency
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <DerivedStat label="Health" value={`${effective.hp}/${effective.maxHp}`} sub="Survival Capacity" color="text-green-400" />
                            <DerivedStat label="Action Points" value={effective.maxAp} sub="Turn Economy" color="text-blue-400" />
                            <DerivedStat label="Movement" value={effective.maxMp} sub="Tactical Range" color="text-teal-400" />
                            <DerivedStat label="Crit Chance" value={`${(effective.critChance * 100).toFixed(1)}%`} sub="Lethality" color="text-purple-400" />
                        </div>
                    </div>
                </div>

                {/* Right Column: Traits & History */}
                <div className="space-y-8">
                    {/* Traits */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-orange-400/70 uppercase tracking-widest border-b border-orange-900/30 pb-1 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                            Innate Traits
                        </h3>
                        {character.traits.length > 0 ? (
                            <div className="grid grid-cols-1 gap-3">
                                {character.traits.map(t => (
                                    <div key={t.id} className="bg-black/40 p-4 rounded-xl border border-white/5 flex items-start gap-4 hover:border-orange-500/20 transition-all">
                                        <div className="text-2xl pt-1">
                                            {t.icon?.startsWith("/api/icons/") ? (
                                                <img src={t.icon} alt="" className="w-8 h-8 rounded-lg object-cover" />
                                            ) : (
                                                t.icon || "🧬"
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className={`text-xs font-bold uppercase tracking-wider ${t.type === 'positive' ? 'text-blue-400' : t.type === 'negative' ? 'text-red-400' : 'text-gray-400'}`}>{t.name}</span>
                                            <p className="text-[10px] text-gray-500 leading-relaxed">{t.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-8 bg-black/20 border border-dashed border-white/5 rounded-xl flex items-center justify-center text-xs text-gray-600 italic">
                                No active traits identified.
                            </div>
                        )}
                    </div>

                    {/* Lore Background */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest border-b border-white/10 pb-1 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                            Personnel History
                        </h3>
                        <div className="relative">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500/50 to-transparent rounded-full" />
                            <p className="text-sm text-gray-400 leading-relaxed italic pl-6 py-2">
                                {character.history || "Personnel data incomplete. No background history recorded."}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DerivedStat({ label, value, sub, color }: { label: string, value: string | number, sub: string, color: string }) {
    return (
        <div className="flex flex-col bg-black/40 p-4 border border-white/5 rounded-2xl gap-0.5 shadow-inner hover:border-white/10 transition-all">
            <span className="text-[9px] font-black uppercase text-gray-500 tracking-wider leading-none mb-1">{label}</span>
            <span className={`text-xl font-black ${color}`}>{value}</span>
            <span className="text-[8px] text-gray-600 font-mono uppercase tracking-tighter">{sub}</span>
        </div>
    );
}
