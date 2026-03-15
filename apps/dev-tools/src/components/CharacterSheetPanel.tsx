import { type ReactNode } from "react";
import { type Character, type Stats } from "@ashtrail/core";
import {
    Activity,
    Brain,
    Footprints,
    Handshake,
    HeartPulse,
    Mountain,
    ShieldPlus,
    Sparkles,
    Star,
    Swords,
} from "lucide-react";

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
    className?: string;
    generatedWeapon?: GeneratedWeaponView | null;
    footerOverlay?: ReactNode;
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

function iconForStat(stat: keyof Stats) {
    switch (stat) {
        case "strength":
            return Swords;
        case "agility":
            return Footprints;
        case "intelligence":
            return Brain;
        case "wisdom":
            return Sparkles;
        case "endurance":
            return Mountain;
        case "charisma":
            return Handshake;
        default:
            return Activity;
    }
}

export function CharacterSheetPanel({
    character,
    className = "",
    generatedWeapon = null,
    footerOverlay,
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
                <div className="relative flex h-full flex-col overflow-hidden border border-white/5 bg-black/30 p-2 shadow-2xl backdrop-blur-md">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2">
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-1.5 bg-[#c2410c]" />
                            <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-white">Character Sheet</span>
                        </div>
                    </div>

                    <div className={`flex min-h-0 flex-1 flex-col space-y-2 ${footerOverlay ? "pb-24" : ""}`}>
                        <section className="border border-white/5 bg-black/40 p-4 shadow-2xl">
                            <div className="space-y-2.5 font-mono">
                                <div className="grid items-start gap-4 md:grid-cols-[minmax(220px,0.92fr)_minmax(0,1.08fr)]">
                                    <div className="mx-auto w-full max-w-[308px] md:max-w-none">
                                        <div className="relative overflow-hidden border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0.2))] shadow-[0_24px_48px_rgba(0,0,0,0.32)]">
                                            <div className="aspect-[1.13/1] w-full" />
                                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(194,65,12,0.12),transparent_48%)]" />
                                            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:18px_18px] opacity-30" />
                                            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                                            {character.portraitUrl ? (
                                                <img
                                                    src={character.portraitUrl}
                                                    alt={character.name}
                                                    className="absolute inset-0 h-full w-full object-cover object-center"
                                                />
                                            ) : (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <svg
                                                        viewBox="0 0 64 64"
                                                        className="h-24 w-24 animate-pulse text-[#1f1f1f] opacity-80"
                                                        fill="currentColor"
                                                        aria-hidden="true"
                                                    >
                                                        <circle cx="32" cy="21" r="11" />
                                                        <path d="M14 56c1-11 8-19 18-19s17 8 18 19H14z" />
                                                    </svg>
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-black/18" />
                                        </div>
                                    </div>

                                    <div className="space-y-3 self-stretch">
                                        <div className="flex items-center gap-2 md:justify-start">
                                            <div className="h-1.5 w-1.5 bg-[#c2410c] shadow-[0_0_8px_rgba(194,65,12,0.45)]" />
                                            <span className="text-[8px] font-bold uppercase tracking-[0.24em] text-gray-500">Identification</span>
                                        </div>

                                        <div className="space-y-1.5 border-b border-white/5 pb-3 text-center md:text-left">
                                            <h3 className="text-[17px] font-bold leading-none tracking-[0.06em] text-white sm:text-[19px]">
                                                {character.badge && <span className="mr-2 text-orange-500/80 drop-shadow-[0_0_8px_rgba(194,65,12,0.4)]">{character.badge}</span>}
                                                {character.name || "Unnamed Unit"}
                                            </h3>
                                            <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-gray-400">
                                                {character.occupation?.name || "No Occupation"}
                                            </p>
                                            <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-gray-600">
                                                {characterTitle}
                                            </p>
                                        </div>

                                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                            <div className="border border-white/5 bg-black/30 px-3 py-2.5 text-center md:text-left">
                                                <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-gray-600">Age / Gender</div>
                                                <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
                                                    {character.age} / {character.gender}
                                                </div>
                                            </div>

                                            <div className="border border-[#c2410c]/25 bg-[#c2410c]/[0.07] px-3 py-2.5 text-center md:text-left">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#f1c765]/15 bg-black/25 text-[#f6d37a]">
                                                        <Star className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                                                    </div>
                                                    <div>
                                                        <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-[#c2410c]/70">Level</div>
                                                        <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
                                                            LVL {character.level}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2.5 text-center md:text-left">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-400/15 bg-black/25 text-emerald-200">
                                                        <HeartPulse className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                                                    </div>
                                                    <div>
                                                        <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-gray-600">Health Status</div>
                                                        <div className={`mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${healthStatus.className}`}>
                                                            {healthStatus.label}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="border border-[#c2410c]/25 bg-[#c2410c]/[0.07] px-3 py-2.5 sm:col-span-2 lg:col-span-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    {[
                                                        {
                                                            label: "HP",
                                                            value: `${tacticalStats.hp}/${tacticalStats.maxHp}`,
                                                            icon: Activity,
                                                        },
                                                        {
                                                            label: "AP",
                                                            value: String(tacticalStats.ap),
                                                            icon: ShieldPlus,
                                                        },
                                                        {
                                                            label: "MP",
                                                            value: String(tacticalStats.mp),
                                                            icon: Footprints,
                                                        },
                                                    ].map((entry) => {
                                                        const Icon = entry.icon;
                                                        return (
                                                            <div key={entry.label} className="flex min-w-0 items-center gap-2">
                                                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#f1c765]/15 bg-black/25 text-[#f6d37a]">
                                                                    <Icon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="text-[7px] font-bold uppercase tracking-[0.2em] text-[#c2410c]/70">{entry.label}</div>
                                                                    <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-white">
                                                                        {entry.value}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 border-t border-white/5 pt-2">
                                            <div className="h-1.5 w-1.5 bg-[#c2410c] shadow-[0_0_8px_rgba(194,65,12,0.55)]" />
                                            <span className="text-[8px] font-bold uppercase tracking-[0.24em] text-[#c2410c]">Attributes</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-1.5">
                                            {(Object.entries(effectiveStats) as [keyof Stats, number][]).map(([stat, value]) => (
                                                <div key={stat} className="border border-white/5 bg-black/30 px-2.5 py-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/8 bg-black/25 text-[#f6d37a]">
                                                            {(() => {
                                                                const Icon = iconForStat(stat);
                                                                return <Icon className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden="true" />;
                                                            })()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="text-[6px] font-bold uppercase tracking-[0.16em] text-gray-500">{stat}</div>
                                                            <div className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-white">
                                                                {value}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="border border-white/5 bg-black/40 p-3 shadow-2xl">
                            <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
                                <div className="border border-white/5 bg-black/30 p-3">
                                    <div className="text-[8px] font-black uppercase tracking-[0.24em] text-gray-500">Equipped</div>
                                    <div className="mt-3 grid gap-2">
                                        {equipmentEntries.length > 0 ? equipmentEntries.map(([slot, item]) => {
                                            const imageUrl = slot === "mainHand" && generatedWeapon?.image?.url
                                                ? generatedWeapon.image.url
                                                : (typeof item?.icon === "string" && item.icon.startsWith("/")) ? item.icon : null;
                                            const weaponStats = slot === "mainHand" && generatedWeapon?.weapon
                                                ? [
                                                    `${generatedWeapon.weapon.weaponType}`,
                                                    `Range ${generatedWeapon.weapon.weaponRange}`,
                                                    `Damage ${generatedWeapon.weapon.baseDamage}`,
                                                ]
                                                : [];
                                            return (
                                                <div key={slot} className="border border-white/5 bg-black/40 px-3 py-2">
                                                    <div className="flex gap-3">
                                                        {imageUrl && (
                                                            <div className="h-16 w-16 shrink-0 overflow-hidden border border-white/8 bg-black/40">
                                                                <img src={imageUrl} alt={item?.name || slot} className="h-full w-full object-cover" />
                                                            </div>
                                                        )}
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-[7px] font-black uppercase tracking-[0.22em] text-cyan-200">{slot}</div>
                                                            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                                                                {item?.name || "Empty"}
                                                            </div>
                                                            {weaponStats.length > 0 && (
                                                                <div className="mt-1 flex flex-wrap gap-2 text-[7px] font-black uppercase tracking-[0.2em] text-[#f6d37a]">
                                                                    {weaponStats.map((entry) => (
                                                                        <span key={entry}>{entry}</span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {"description" in (item || {}) && item?.description && (
                                                                <p className="mt-1 text-[10px] leading-relaxed text-gray-400">{item.description}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }) : (
                                            <div className="text-[10px] italic leading-relaxed text-gray-600">No equipment slotted.</div>
                                        )}
                                    </div>
                                </div>

                                <div className="border border-white/5 bg-black/30 p-3">
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
                            </div>
                        </section>
                    </div>

                    {footerOverlay && (
                        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20">
                            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#02060b] via-[#02060b]/92 to-transparent" />
                            <div className="pointer-events-auto relative flex items-end justify-center px-4 pb-2 pt-10">
                                {footerOverlay}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
