import { Button } from "@ashtrail/ui";
import { type Character, type Stats } from "@ashtrail/core";

interface GeneratedWeaponView {
    weapon: {
        id: string;
        name: string;
        description: string;
        rarity: string;
        weaponType: string;
        weaponRange: number;
        baseDamage: number;
    };
    loreText: string;
    image: {
        url: string;
    };
}

interface CharacterSheetPanelProps {
    character: Character;
    currentLocationLabel?: string;
    className?: string;
    generatedWeapon?: GeneratedWeaponView | null;
    onGenerateWeapon?: () => void;
    isGeneratingWeapon?: boolean;
    weaponError?: string | null;
}

function healthStatusFor(character: Character) {
    const ratio = character.maxHp > 0 ? character.hp / character.maxHp : 0;
    if (ratio > 0.66) return { label: "Stable", className: "text-emerald-300" };
    if (ratio > 0.33) return { label: "Wounded", className: "text-amber-300" };
    return { label: "Critical", className: "text-red-300" };
}

function deriveTacticalStats(character: Character) {
    return {
        hp: character.hp,
        maxHp: character.maxHp,
        ap: 5 + Math.floor((character.stats.agility || 0) / 2),
        mp: 3,
    };
}

export function CharacterSheetPanel({
    character,
    currentLocationLabel = "No Current Location",
    className = "",
    generatedWeapon = null,
    onGenerateWeapon,
    isGeneratingWeapon = false,
    weaponError = null,
}: CharacterSheetPanelProps) {
    const healthStatus = healthStatusFor(character);
    const characterTitle = character.title || character.faction || "No Title";
    const effectiveStats = character.stats;
    const equipmentEntries = Object.entries(character.equipped || {}).filter(([, item]) => item);
    const inventoryItems = character.inventory || [];
    const traitEntries = character.traits || [];
    const tacticalStats = deriveTacticalStats(character);

    return (
        <>
            <style>{`
                @keyframes character-sheet-settle {
                    0% {
                        opacity: 0;
                        transform: translateY(18px) scale(0.985);
                        filter: brightness(0.28) contrast(1.2);
                    }
                    100% {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                        filter: brightness(1) contrast(1);
                    }
                }
                .animate-character-sheet-settle {
                    animation: character-sheet-settle 0.82s cubic-bezier(0.22, 1, 0.36, 1) both;
                }
            `}</style>
            <div className={`animate-character-sheet-settle h-full px-0 py-1 ${className}`}>
                <div className="flex h-full flex-col border border-white/5 bg-black/30 p-2 shadow-2xl backdrop-blur-md">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-1.5 bg-[#c2410c]" />
                            <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white">Character Sheet</span>
                        </div>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col space-y-2">
                        <section className="border border-white/5 bg-black/40 p-3 shadow-2xl">
                            <div className="space-y-2.5 font-mono">
                                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-[132px_minmax(0,1fr)] md:items-start">
                                    <div className="relative h-[132px] w-full overflow-hidden border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0.2))] shadow-lg md:w-[132px]">
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

                                    <div className="min-w-0 space-y-1.5">
                                        <div className="flex items-center gap-2">
                                            <div className="h-1.5 w-1.5 bg-[#c2410c] shadow-[0_0_8px_rgba(194,65,12,0.45)]" />
                                            <span className="text-[8px] font-bold uppercase tracking-[0.24em] text-gray-500">Identification</span>
                                        </div>
                                        <div className="space-y-1 border-b border-white/5 pb-1.5">
                                            <h3 className="text-[15px] font-bold uppercase leading-none tracking-[0.07em] text-white">
                                                {character.badge && <span className="mr-2 text-orange-500/80 drop-shadow-[0_0_8px_rgba(194,65,12,0.4)]">{character.badge}</span>}
                                                {character.name || "Unnamed Unit"}
                                            </h3>
                                            <p className="pt-0.5 text-[9px] font-medium uppercase leading-none tracking-[0.18em] text-gray-400">
                                                {character.occupation?.name || "No Occupation"}
                                            </p>
                                            <p className="pt-0.5 text-[9px] font-medium uppercase leading-none tracking-[0.16em] text-gray-600">
                                                {characterTitle}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2 pt-1">
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

                                <div className="grid gap-2 md:grid-cols-[1.15fr_0.9fr_1.1fr]">
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

                                    <div className="grid grid-cols-3 gap-2">
                                        {[
                                            { label: "HP", value: `${tacticalStats.hp}/${tacticalStats.maxHp}` },
                                            { label: "AP", value: String(tacticalStats.ap) },
                                            { label: "MP", value: String(tacticalStats.mp) },
                                        ].map((entry) => (
                                            <div key={entry.label} className="border border-[#c2410c]/25 bg-[#c2410c]/[0.07] px-3 py-2 text-center">
                                                <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-[#c2410c]/70">{entry.label}</div>
                                                <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
                                                    {entry.value}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="border border-white/5 bg-black/40 p-3 shadow-2xl">
                            <div className="mb-3 flex items-center gap-2">
                                <div className="h-1.5 w-1.5 bg-[#c2410c] shadow-[0_0_8px_rgba(194,65,12,0.55)]" />
                                <h4 className="text-[9px] font-bold uppercase tracking-[0.28em] text-[#c2410c]">Operational Profile</h4>
                            </div>

                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {(Object.entries(effectiveStats) as [keyof Stats, number][]).map(([stat, value]) => (
                                    <div key={stat} className="border border-white/5 bg-black/30 p-2.5">
                                        <div className="mb-2 flex items-start justify-between gap-2">
                                            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400">{stat}</span>
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

                            <div className="mt-3 grid gap-2 md:grid-cols-[0.92fr_1.08fr]">
                                <div className="border border-white/5 bg-black/30 p-3">
                                    <div className="text-[8px] font-black uppercase tracking-[0.24em] text-gray-500">Equipped</div>
                                    <div className="mt-3 space-y-2">
                                        {equipmentEntries.length > 0 ? equipmentEntries.map(([slot, item]) => (
                                            <div key={slot} className="border border-white/5 bg-black/40 px-3 py-2">
                                                <div className="text-[7px] font-black uppercase tracking-[0.22em] text-cyan-200">{slot}</div>
                                                <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                                                    {item?.name || "Empty"}
                                                </div>
                                                {"description" in (item || {}) && item?.description && (
                                                    <p className="mt-1 text-[10px] leading-relaxed text-gray-400">{item.description}</p>
                                                )}
                                            </div>
                                        )) : (
                                            <div className="text-[10px] italic leading-relaxed text-gray-600">No equipment slotted.</div>
                                        )}
                                    </div>
                                </div>

                                <div className="border border-white/5 bg-black/30 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-[8px] font-black uppercase tracking-[0.24em] text-gray-500">Weapon Forge</div>
                                        {onGenerateWeapon && (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="glass"
                                                onClick={onGenerateWeapon}
                                                disabled={isGeneratingWeapon}
                                                className="min-w-[150px] rounded px-4 py-2 text-[9px] font-black uppercase tracking-[0.3em] disabled:opacity-60"
                                            >
                                                {isGeneratingWeapon ? "Forging..." : generatedWeapon ? "Reforge Weapon" : "Forge Weapon"}
                                            </Button>
                                        )}
                                    </div>

                                    {weaponError && (
                                        <div className="mt-3 rounded border border-red-500/25 bg-red-500/10 px-3 py-2 text-[10px] leading-relaxed text-red-100">
                                            {weaponError}
                                        </div>
                                    )}

                                    {generatedWeapon ? (
                                        <div className="mt-3 space-y-3">
                                            <div className="overflow-hidden border border-white/8 bg-black/40">
                                                <div className="aspect-[1/1] w-full overflow-hidden bg-black/40">
                                                    <img
                                                        src={generatedWeapon.image.url}
                                                        alt={generatedWeapon.weapon.name}
                                                        className="h-full w-full object-cover"
                                                    />
                                                </div>
                                                <div className="space-y-2 px-3 py-3">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                                                            {generatedWeapon.weapon.name}
                                                        </div>
                                                        <span className="border border-[#c2410c]/20 bg-[#c2410c]/10 px-2 py-1 text-[7px] font-black uppercase tracking-[0.22em] text-[#f6d37a]">
                                                            {generatedWeapon.weapon.rarity}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2 text-[7px] font-black uppercase tracking-[0.22em] text-gray-400">
                                                        <span>{generatedWeapon.weapon.weaponType}</span>
                                                        <span>Range {generatedWeapon.weapon.weaponRange}</span>
                                                        <span>Damage {generatedWeapon.weapon.baseDamage}</span>
                                                    </div>
                                                    <p className="text-[10px] leading-relaxed text-gray-300">
                                                        {generatedWeapon.weapon.description}
                                                    </p>
                                                    <p className="text-[10px] italic leading-relaxed text-[#f6d37a]/90">
                                                        {generatedWeapon.loreText}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-3 space-y-2">
                                            {inventoryItems.length > 0 ? inventoryItems.map((item) => (
                                                <div key={item.id} className="border border-white/5 bg-black/40 px-3 py-2">
                                                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-white">{item.name}</div>
                                                    <div className="mt-1 text-[7px] font-black uppercase tracking-[0.22em] text-[#c2410c]">
                                                        {item.category}
                                                    </div>
                                                </div>
                                            )) : (
                                                <div className="text-[10px] italic leading-relaxed text-gray-600">No inventory recorded.</div>
                                            )}
                                        </div>
                                    )}

                                    {isGeneratingWeapon && (
                                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                                            <div className="relative h-full w-full">
                                                <div className="absolute inset-0 rounded-full bg-cyan-200/10" />
                                                <div
                                                    className="absolute left-0 top-0 h-full w-14 rounded-full bg-gradient-to-r from-transparent via-white to-cyan-200 shadow-[0_0_18px_rgba(165,243,252,0.55)]"
                                                    style={{ animation: "demo-step-ping-bar 1.15s ease-in-out infinite alternate" }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-3 border border-white/5 bg-black/30 p-3">
                                <div className="text-[8px] font-black uppercase tracking-[0.24em] text-gray-500">Traits</div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {traitEntries.length > 0 ? traitEntries.map((trait) => (
                                        <span
                                            key={trait.id}
                                            className="border border-[#c2410c]/20 bg-[#c2410c]/10 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-[0.18em] text-[#f6d37a]"
                                        >
                                            {trait.name}
                                        </span>
                                    )) : (
                                        <div className="text-[10px] italic leading-relaxed text-gray-600">No traits assigned.</div>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        </>
    );
}
