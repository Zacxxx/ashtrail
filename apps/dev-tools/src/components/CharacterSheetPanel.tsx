import { type Character, type Stats } from "@ashtrail/core";

interface CharacterSheetPanelProps {
    character: Character;
    currentLocationLabel?: string;
    className?: string;
}

function healthStatusFor(character: Character) {
    const ratio = character.maxHp > 0 ? character.hp / character.maxHp : 0;
    if (ratio > 0.66) return { label: "Stable", className: "text-emerald-300" };
    if (ratio > 0.33) return { label: "Wounded", className: "text-amber-300" };
    return { label: "Critical", className: "text-red-300" };
}

export function CharacterSheetPanel({
    character,
    currentLocationLabel = "No Current Location",
    className = "",
}: CharacterSheetPanelProps) {
    const healthStatus = healthStatusFor(character);
    const characterTitle = character.title || character.faction || "No Title";
    const history = character.history || character.backstory || "";
    const effectiveStats = character.stats;

    return (
        <div className={`animate-ash-settling px-0 py-1 ${className}`}>
            <div className="mx-auto max-w-[860px] border border-white/5 bg-black/30 p-2.5 shadow-2xl backdrop-blur-md">
                <div className="mb-2 flex items-center gap-2 border-b border-white/5 pb-2">
                    <div className="h-3 w-1.5 bg-[#c2410c]" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white">Character Sheet</span>
                </div>

                <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.05fr_0.95fr]">
                        <section className="border border-white/5 bg-black/40 p-3 shadow-2xl">
                            <div className="space-y-3 font-mono">
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-[112px_minmax(0,1fr)] md:items-start">
                                    <div className="relative h-28 w-full overflow-hidden border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0.2))] shadow-lg md:w-28">
                                        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:18px_18px] opacity-30" />
                                        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/30 to-transparent" />
                                        {character.portraitUrl ? (
                                            <img src={character.portraitUrl} alt={character.name} className="absolute inset-0 h-full w-full object-cover" />
                                        ) : (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <svg
                                                    viewBox="0 0 64 64"
                                                    className="h-16 w-16 animate-pulse text-[#1f1f1f] opacity-80"
                                                    fill="currentColor"
                                                    aria-hidden="true"
                                                >
                                                    <circle cx="32" cy="21" r="11" />
                                                    <path d="M14 56c1-11 8-19 18-19s17 8 18 19H14z" />
                                                </svg>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-black/35" />
                                    </div>

                                    <div className="min-w-0 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <div className="h-1.5 w-1.5 bg-[#c2410c] shadow-[0_0_8px_rgba(194,65,12,0.45)]" />
                                            <span className="text-[8px] font-bold uppercase tracking-[0.24em] text-gray-500">Identification</span>
                                        </div>
                                        <div className="space-y-1 border-b border-white/5 pb-2">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-[18px] font-bold uppercase leading-none tracking-[0.08em] text-white">
                                                    {character.badge && <span className="mr-2 text-orange-500/80 drop-shadow-[0_0_8px_rgba(194,65,12,0.4)]">{character.badge}</span>}
                                                    {character.name || "Unnamed Unit"}
                                                </h3>
                                            </div>
                                            <p className="pt-0.5 text-[9px] font-medium uppercase leading-none tracking-[0.18em] text-gray-400">
                                                {character.occupation?.name || "No Occupation"}
                                            </p>
                                            <p className="pt-0.5 text-[9px] font-medium uppercase leading-none tracking-[0.16em] text-gray-600">
                                                {characterTitle}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-[minmax(0,1fr)_108px] gap-2 pt-1">
                                            <div className="border border-white/5 bg-black/30 px-2.5 py-2">
                                                <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-gray-600">Age / Gender</div>
                                                <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
                                                    {character.age} / {character.gender}
                                                </div>
                                            </div>
                                            <div className="border border-[#c2410c]/25 bg-[#c2410c]/[0.07] px-2.5 py-2">
                                                <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-[#c2410c]/70">Level</div>
                                                <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
                                                    LVL {character.level}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="border border-white/5 bg-black/30 px-3 py-2">
                                    <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-gray-600">Current Location</div>
                                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">{currentLocationLabel}</div>
                                </div>

                                <div className="border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2">
                                    <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-gray-600">Health Status</div>
                                    <div className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${healthStatus.className}`}>
                                        {healthStatus.label}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="border border-white/5 bg-black/40 p-3 shadow-2xl">
                            <div className="mb-3 flex items-center gap-2">
                                <div className="h-1.5 w-1.5 bg-[#c2410c] shadow-[0_0_8px_rgba(194,65,12,0.55)]" />
                                <h4 className="text-[9px] font-bold uppercase tracking-[0.28em] text-[#c2410c]">Story & Reputation</h4>
                            </div>

                            <div className="space-y-2.5">
                                {character.alignment && (
                                    <div className="border border-white/5 bg-black/30 p-2">
                                        <div className="text-[6px] font-black uppercase tracking-[0.22em] text-gray-600">Soul Alignment</div>
                                        <div className="mt-1 truncate text-[9px] font-bold uppercase text-[#c2410c]">{character.alignment}</div>
                                    </div>
                                )}
                                <div className="max-h-[168px] overflow-y-auto custom-scrollbar border border-white/5 bg-black/30 p-2.5">
                                    <div className="mb-2 flex items-center justify-between">
                                        <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-gray-500">Abridged Dossier</div>
                                        {history.length > 165 && <div className="text-[6px] font-black uppercase text-[#c2410c]/60">Condensed</div>}
                                    </div>
                                    {history ? (
                                        <p className="text-[10px] italic leading-relaxed text-gray-400">
                                            {history.length > 165 ? `${history.substring(0, 165)}...` : history}
                                        </p>
                                    ) : (
                                        <p className="text-[10px] italic leading-relaxed text-gray-600">No historical records available for this unit.</p>
                                    )}
                                </div>

                                {character.currentStory && (
                                    <div className="border border-teal-500/10 bg-teal-500/[0.03] p-2.5">
                                        <div className="mb-2 flex items-center justify-between">
                                            <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-teal-400/70">Active Chronicle</div>
                                            <div className="flex gap-1">
                                                <div className="h-1 w-1 rounded-full bg-teal-500/30" />
                                                <div className="h-1 w-1 rounded-full bg-teal-500/30" />
                                            </div>
                                        </div>
                                        <p className="line-clamp-2 text-[9px] italic leading-relaxed text-teal-100/30">
                                            {character.currentStory}
                                        </p>
                                    </div>
                                )}

                                <div className="border border-dashed border-white/10 bg-black/20 p-2.5">
                                    <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-[#c2410c]">Reputation</div>
                                    <div className="mt-2 grid grid-cols-2 gap-2">
                                        {[
                                            { label: "Titles", value: characterTitle },
                                            { label: "Badges", value: character.badge || "NONE" },
                                        ].map((entry) => (
                                            <div key={entry.label} className="flex h-14 flex-col items-center justify-center gap-1.5 border border-white/5 bg-black/40 p-2 text-center">
                                                <span className="text-[7px] font-black uppercase tracking-[0.2em] text-gray-600">{entry.label}</span>
                                                <span className="line-clamp-1 text-[10px] font-bold uppercase tracking-widest text-white">{entry.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    <section className="border border-white/5 bg-black/40 p-3 shadow-2xl">
                        <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <div className="h-1.5 w-1.5 bg-[#c2410c] shadow-[0_0_8px_rgba(194,65,12,0.55)]" />
                                <h4 className="text-[9px] font-bold uppercase tracking-[0.28em] text-[#c2410c]">Core Attributes</h4>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                            {(Object.entries(effectiveStats) as [keyof Stats, number][]).map(([stat, value]) => (
                                <div key={stat} className="border border-white/5 bg-black/30 p-2.5">
                                    <div className="mb-2 flex items-start justify-between gap-2">
                                        <div className="min-w-0 text-left">
                                            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400">{stat}</span>
                                        </div>
                                        <span className="shrink-0 text-[12px] font-bold uppercase tracking-[0.08em] text-white">{value}</span>
                                    </div>
                                    <div className="relative h-2 overflow-hidden border border-white/8 bg-black/50">
                                        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:12px_100%] opacity-40" />
                                        <div
                                            className="relative h-full bg-[#c2410c] shadow-[0_0_12px_rgba(194,65,12,0.28)]"
                                            style={{ width: `${Math.min((value / 10) * 100, 100)}%` }}
                                        />
                                    </div>
                                    <div className="mt-1.5 flex items-center justify-between text-[7px] font-medium uppercase tracking-[0.18em] text-gray-600">
                                        <span className="font-bold text-gray-500">Base {value}</span>
                                        <span>{Math.min(value, 10)}/10</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
