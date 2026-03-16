import { type ReactNode } from "react";
import { type Character, type Stats } from "@ashtrail/core";
import {
    Activity,
    Brain,
    Footprints,
    Gauge,
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
                <div className="relative flex h-full flex-col overflow-hidden rounded-[28px] border border-[#f1c765]/12 bg-[linear-gradient(180deg,rgba(8,11,16,0.88),rgba(4,6,10,0.94))] p-2 shadow-[0_28px_80px_rgba(0,0,0,0.42)] backdrop-blur-md">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-[#f1c765]/10 pb-2">
                        <div className="flex items-center gap-2">
                            <div className="h-3 w-1.5 bg-[#f1c765] shadow-[0_0_10px_rgba(241,199,101,0.45)]" />
                            <span className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#f4e3b2]">Character Sheet</span>
                        </div>
                    </div>

                    <div className={`flex min-h-0 flex-1 flex-col space-y-2 ${footerOverlay ? "pb-24" : ""}`}>
                        <section className="rounded-[24px] border border-[#f1c765]/10 bg-[linear-gradient(180deg,rgba(15,19,27,0.84),rgba(7,10,15,0.94))] p-4 shadow-[0_18px_48px_rgba(0,0,0,0.34)]">
                            <div className="space-y-2.5 font-mono">
                                <div className="grid items-start gap-4 md:grid-cols-[minmax(220px,0.92fr)_minmax(0,1.08fr)]">
                                    <div className="mx-auto w-full max-w-[308px] md:max-w-none">
                                        <div className="relative overflow-hidden rounded-[22px] border border-[#f1c765]/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0.2))] shadow-[0_24px_48px_rgba(0,0,0,0.32)]">
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
                                            <div className="h-1.5 w-1.5 bg-[#f1c765] shadow-[0_0_8px_rgba(241,199,101,0.48)]" />
                                            <span className="text-[8px] font-bold uppercase tracking-[0.24em] text-[#f1c765]/72">Identification</span>
                                        </div>

                                        <div className="space-y-1.5 border-b border-[#f1c765]/10 pb-3 text-center md:text-left">
                                            <h3 className="text-[17px] font-bold leading-none tracking-[0.06em] text-[#f8e6b5] sm:text-[19px]">
                                                {character.badge && <span className="mr-2 text-[#f1c765]/85 drop-shadow-[0_0_8px_rgba(241,199,101,0.35)]">{character.badge}</span>}
                                                {character.name || "Unnamed Unit"}
                                            </h3>
                                            <p className="text-[9px] font-medium uppercase tracking-[0.2em] text-[#f1c765]/80">
                                                {character.occupation?.name || "No Occupation"}
                                            </p>
                                            <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-[#c9b27d]/54">
                                                {characterTitle}
                                            </p>
                                        </div>

                                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                            <div className="rounded-[18px] border border-[#f1c765]/10 bg-[#f1c765]/[0.035] px-3 py-2.5 text-center md:text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
                                                <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-[#c9b27d]/56">Age / Gender</div>
                                                <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#f7ead0]">
                                                    {character.age} / {character.gender}
                                                </div>
                                            </div>

                                            <div className="rounded-[18px] border border-[#f1c765]/16 bg-[#f1c765]/[0.06] px-3 py-2.5 text-center md:text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#f1c765]/18 bg-black/30 text-[#f6d37a]">
                                                        <Star className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                                                    </div>
                                                    <div>
                                                        <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-[#c9b27d]/68">Level</div>
                                                        <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#f7ead0]">
                                                            LVL {character.level}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="rounded-[18px] border border-[#f1c765]/10 bg-[#f1c765]/[0.035] px-3 py-2.5 text-center md:text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#f1c765]/14 bg-black/30 text-[#f6d37a]">
                                                        <HeartPulse className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                                                    </div>
                                                    <div>
                                                        <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-[#c9b27d]/56">Health Status</div>
                                                        <div className={`mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${healthStatus.className}`}>
                                                            {healthStatus.label}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="rounded-[18px] border border-[#f1c765]/16 bg-[#f1c765]/[0.055] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:col-span-2 lg:col-span-3">
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
                                                            icon: Gauge,
                                                        },
                                                    ].map((entry) => {
                                                        const Icon = entry.icon;
                                                        return (
                                                            <div key={entry.label} className="flex min-w-0 items-center gap-2">
                                                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#f1c765]/15 bg-black/30 text-[#f6d37a]">
                                                                    <Icon className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="text-[7px] font-bold uppercase tracking-[0.2em] text-[#c9b27d]/68">{entry.label}</div>
                                                                    <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#f7ead0]">
                                                                        {entry.value}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 border-t border-[#f1c765]/10 pt-2">
                                            <div className="h-1.5 w-1.5 bg-[#f1c765] shadow-[0_0_8px_rgba(241,199,101,0.55)]" />
                                            <span className="text-[8px] font-bold uppercase tracking-[0.24em] text-[#f1c765]">Attributes</span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-1.5">
                                            {(Object.entries(effectiveStats) as [keyof Stats, number][]).map(([stat, value]) => (
                                                <div key={stat} className="rounded-[16px] border border-[#f1c765]/10 bg-[#f1c765]/[0.035] px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#f1c765]/12 bg-black/30 text-[#f6d37a]">
                                                            {(() => {
                                                                const Icon = iconForStat(stat);
                                                                return <Icon className="h-3.5 w-3.5" strokeWidth={2.1} aria-hidden="true" />;
                                                            })()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="text-[6px] font-bold uppercase tracking-[0.16em] text-[#c9b27d]/58">{stat}</div>
                                                            <div className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[#f7ead0]">
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

                        <section className="rounded-[24px] border border-[#f1c765]/10 bg-[linear-gradient(180deg,rgba(15,19,27,0.82),rgba(7,10,15,0.92))] p-3 shadow-[0_18px_48px_rgba(0,0,0,0.32)]">
                            <div className="grid gap-3 md:grid-cols-[1.2fr_0.8fr]">
                                <div className="rounded-[20px] border border-[#f1c765]/10 bg-[#f1c765]/[0.035] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                                    <div className="text-[8px] font-black uppercase tracking-[0.24em] text-[#f1c765]/72">Equipped</div>
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
                                                <div key={slot} className="rounded-[18px] border border-[#f1c765]/10 bg-black/28 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.015)]">
                                                    <div className="flex gap-3">
                                                        {imageUrl && (
                                                            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[14px] border border-[#f1c765]/10 bg-black/35">
                                                                <img src={imageUrl} alt={item?.name || slot} className="h-full w-full object-cover" />
                                                            </div>
                                                        )}
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-[7px] font-black uppercase tracking-[0.22em] text-[#c9b27d]/68">{slot}</div>
                                                            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#f7ead0]">
                                                                {item?.name || "Empty"}
                                                            </div>
                                                            {weaponStats.length > 0 && (
                                                                <div className="mt-1 flex flex-wrap gap-2 text-[7px] font-black uppercase tracking-[0.2em] text-[#f1c765]">
                                                                    {weaponStats.map((entry) => (
                                                                        <span key={entry}>{entry}</span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            {"description" in (item || {}) && item?.description && (
                                                                <p className="mt-1 text-[10px] leading-relaxed text-[#dbc89a]/72">{item.description}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }) : (
                                            <div className="text-[10px] italic leading-relaxed text-[#c9b27d]/50">No equipment slotted.</div>
                                        )}
                                    </div>
                                </div>

                                <div className="rounded-[20px] border border-[#f1c765]/10 bg-[#f1c765]/[0.035] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                                    <div className="text-[8px] font-black uppercase tracking-[0.24em] text-[#f1c765]/72">Traits</div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {traitEntries.length > 0 ? traitEntries.map((trait) => (
                                            <span
                                                key={trait.id}
                                                className="rounded-full border border-[#f1c765]/14 bg-[#f1c765]/[0.08] px-2.5 py-1.5 text-[8px] font-black uppercase tracking-[0.18em] text-[#f6d37a] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                                            >
                                                {trait.name}
                                            </span>
                                        )) : (
                                            <div className="text-[10px] italic leading-relaxed text-[#c9b27d]/50">No traits assigned.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    {footerOverlay && (
                        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20">
                            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#04070b] via-[#04070b]/94 to-transparent" />
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
