import React, { useState, useEffect } from "react";
import { Item, GameRegistry, ItemCategory, ItemRarity } from "@ashtrail/core";
import { IconGallerySelector } from "../components/IconGallerySelector";

interface ItemsViewProps {
    item: Item | null;
    onSave?: () => void;
}

const CATEGORIES: { value: ItemCategory; label: string; color: string }[] = [
    { value: "weapon", label: "WEAPON", color: "#ef4444" },
    { value: "consumable", label: "CONSUMABLE", color: "#10b981" },
    { value: "resource", label: "RESOURCE", color: "#3b82f6" },
    { value: "junk", label: "JUNK", color: "#6b7280" },
    { value: "armor", label: "ARMOR", color: "#8b5cf6" },
];

const RARITIES: { value: ItemRarity; label: string; class: string }[] = [
    { value: "salvaged", label: "SALVAGED", class: "rarity-salvaged" },
    { value: "reinforced", label: "REINFORCED", class: "rarity-reinforced" },
    { value: "pre-ash", label: "PRE-ASH", class: "rarity-pre-ash" },
    { value: "specialized", label: "SPECIALIZED", class: "rarity-specialized" },
    { value: "relic", label: "RELIC", class: "rarity-relic" },
    { value: "ashmarked", label: "ASHMARKED", class: "rarity-ashmarked" },
];

export function ItemsView({ item, onSave }: ItemsViewProps) {
    const [editingItem, setEditingItem] = useState<Item | null>(null);

    // Form State
    const [id, setId] = useState("");
    const [name, setName] = useState("");
    const [category, setCategory] = useState<ItemCategory>("weapon");
    const [rarity, setRarity] = useState<ItemRarity>("salvaged");
    const [description, setDescription] = useState("");
    const [cost, setCost] = useState(0);
    const [icon, setIcon] = useState("📦");
    const [effects, setEffects] = useState<any[]>([]);

    // Gallery State
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);

    useEffect(() => {
        if (item) {
            setEditingItem(item);
            setId(item.id);
            setName(item.name);
            setCategory(item.category);
            setRarity(item.rarity || "salvaged");
            setDescription(item.description);
            setCost(item.cost);
            setIcon(item.icon || "📦");
            setEffects(item.effects || []);
        } else {
            setEditingItem(null);
        }
    }, [item]);

    const handleSave = async () => {
        const payload: Item = {
            id,
            name,
            category,
            rarity,
            description,
            cost,
            icon,
            effects,
        };

        try {
            const res = await fetch("http://127.0.0.1:8787/api/data/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
                if (onSave) onSave();
            }
        } catch (e) {
            console.error(e);
        }
    };

    if (!item) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                <span className="text-4xl mb-4 opacity-20">📦</span>
                <p className="font-mono text-sm tracking-widest uppercase">Select an Item to edit</p>
            </div>
        );
    }

    return (
        <div className="w-full h-full max-w-[1000px] bg-[#0d0d0d]/80 rounded-2xl border border-white/5 shadow-2xll overflow-hidden flex flex-col relative z-50">
            <style>{`
                .rarity-salvaged { border-color: #d1d5db; --rarity-color: #f3f4f6; }
                .rarity-reinforced { border-color: #444444; --rarity-color: #222222; }
                .rarity-pre-ash { border-color: #2563eb; --rarity-color: #1e3a8a; }
                .rarity-specialized { border-color: #341539; --rarity-color: #4c1d95; }
                .rarity-relic { border-color: #92400e; --rarity-color: #f59e0b; }
                
                @keyframes ashRipple {
                    0% { border-color: #450a0a; box-shadow: inset 0 0 5px rgba(69,10,10,0.4); }
                    50% { border-color: #991b1b; box-shadow: inset 0 0 12px rgba(153,27,27,0.6); }
                    100% { border-color: #450a0a; box-shadow: inset 0 0 5px rgba(69,10,10,0.4); }
                }
                .rarity-ashmarked { 
                    border-color: #450a0a; 
                    animation: ashRipple 3s ease-in-out infinite;
                }
                .rarity-ashmarked-bg {
                    background: radial-gradient(circle, #450a0a 0%, transparent 70%);
                    opacity: 0.15;
                }
            `}</style>

            <IconGallerySelector
                isOpen={isGalleryOpen}
                onClose={() => setIsGalleryOpen(false)}
                onSelect={(url) => {
                    setIcon(url);
                    setIsGalleryOpen(false);
                }}
            />

            {/* Header Area */}
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/40 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 bg-black/60 border-2 rounded-xl flex items-center justify-center relative transition-all duration-500 overflow-hidden ${RARITIES.find(r => r.value === rarity)?.class}`}>
                        {icon.startsWith("/api/icons/") ? (
                            <img src={icon} alt="Icon" className="w-full h-full object-cover p-1.5" />
                        ) : (
                            <span className="text-xl rotate-[-5deg]">{icon}</span>
                        )}
                        {rarity === 'ashmarked' && <div className="absolute inset-0 rarity-ashmarked-bg" />}
                    </div>
                    <div>
                        <h2 className="text-lg font-black tracking-[0.2em] text-white uppercase italic">ITEM ARCHIVE</h2>
                        <span className="text-[10px] font-black text-gray-500 tracking-[0.3em] uppercase">{id}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={async () => {
                            if (window.confirm(`Delete ${name}? This cannot be undone.`)) {
                                try {
                                    const res = await fetch(`http://127.0.0.1:8787/api/data/items/${id}`, { method: "DELETE" });
                                    if (res.ok) {
                                        await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
                                        if (onSave) onSave();
                                    }
                                } catch (e) { console.error(e); }
                            }
                        }}
                        className="px-4 py-2 bg-red-950/40 hover:bg-red-900/60 text-red-500 border border-red-900/40 text-[10px] font-black uppercase tracking-[0.2em] rounded-lg transition-all"
                    >
                        Delete
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!name}
                        className="px-6 py-2 bg-[#c2410c] hover:bg-[#ea580c] disabled:opacity-20 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-lg transition-all shadow-[0_0_20px_rgba(194,65,12,0.2)]"
                    >
                        Save Record
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8">
                {/* Main Identity Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest pl-1 flex items-center gap-2">
                                <div className="w-1 h-1 bg-white/20" /> NAME
                            </label>
                            <input
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Designate item..."
                                className="w-full bg-black/50 border border-white/5 text-white px-4 py-3.5 rounded-xl text-xs font-bold outline-none focus:border-white/20 transition-all placeholder:text-gray-700"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-[#c2410c] uppercase tracking-widest pl-1 flex items-center gap-2">
                                <div className="w-1 h-1 bg-[#c2410c]" /> MARKET VALUATION
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={cost}
                                    onChange={e => setCost(Number(e.target.value))}
                                    className="w-full bg-black/50 border border-white/5 text-[#c2410c] px-4 py-3.5 rounded-xl text-sm font-black outline-none focus:border-[#c2410c]/30 transition-all"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[9px] font-black text-[#c2410c]/40 tracking-widest uppercase">CREDITS</span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest pl-1 flex items-center gap-2">
                                <div className="w-1 h-1 bg-white/20" /> TACTICAL DESCRIPTION
                            </label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="System technical data..."
                                rows={4}
                                className="w-full bg-black/50 border border-white/5 text-gray-400 px-4 py-4 rounded-xl text-[11px] leading-relaxed outline-none focus:border-white/20 transition-all resize-none italic shadow-inner"
                            />
                        </div>
                    </div>

                    <div className="space-y-6">
                        {/* Categories List */}
                        <div className="space-y-3">
                            <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest pl-1 flex items-center gap-2">
                                <div className="w-1 h-1 bg-white/20" /> CLASSIFICATION
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {CATEGORIES.map(cat => (
                                    <button
                                        key={cat.value}
                                        onClick={() => setCategory(cat.value)}
                                        className={`px-3 py-2 rounded-lg border text-[9px] font-black tracking-widest uppercase transition-all flex items-center gap-2 ${category === cat.value
                                            ? "bg-white/10 border-white/20 text-white"
                                            : "bg-black/20 border-white/5 text-gray-600 hover:border-white/10"
                                            }`}
                                    >
                                        <div className="w-1 h-1 rounded-full" style={{ backgroundColor: cat.color }} />
                                        {cat.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Rarity Selector */}
                        <div className="space-y-3">
                            <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest pl-1 flex items-center gap-2">
                                <div className="w-1 h-1 bg-white/20" /> RARITY GRADE
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {RARITIES.map(r => (
                                    <button
                                        key={r.value}
                                        onClick={() => setRarity(r.value)}
                                        className={`p-3 rounded-lg border text-[9px] font-black tracking-widest uppercase transition-all flex flex-col items-center gap-1.5 relative overflow-hidden ${rarity === r.value
                                            ? `${r.class} bg-white/[0.03]`
                                            : "bg-black/20 border-white/5 text-gray-700 hover:border-white/10"
                                            }`}
                                    >
                                        {rarity === r.value && r.value === 'ashmarked' && <div className="absolute inset-0 rarity-ashmarked-bg" />}
                                        <div className={`w-2 h-2 rounded-full ${rarity === r.value ? "opacity-100" : "opacity-20"}`} style={{ backgroundColor: `var(--rarity-color)` }} />
                                        <span className={rarity === r.value ? "text-white" : "text-gray-700"}>{r.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Mechanical Effects Section */}
                <div className="space-y-6 pt-6 border-t border-white/5">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-6 bg-orange-500 rounded-full" />
                            <h3 className="text-[11px] font-black text-white uppercase tracking-[0.2em]">MECHANICAL LOADOUT</h3>
                        </div>
                        <button
                            onClick={() => setEffects([...effects, { type: 'STAT_MODIFIER', target: 'strength', value: 1 }])}
                            className="px-4 py-1.5 bg-orange-950/20 hover:bg-orange-900/40 border border-orange-900/30 text-orange-500 text-[10px] font-black uppercase tracking-widest rounded transition-all flex items-center gap-2"
                        >
                            <span>+</span> INSTALL MOD
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {effects.map((eff, i) => {
                            const magnitudeLabel = `${eff.value >= 0 ? '+' : ''}${eff.value}`;
                            const targetLabel = (eff.target || "").charAt(0).toUpperCase() + (eff.target || "").slice(1);

                            return (
                                <div key={i} className="bg-[#111111] border border-white/5 rounded-2xl p-5 relative group hover:border-orange-500/30 transition-all shadow-xl">
                                    <button
                                        onClick={() => setEffects(effects.filter((_, idx) => idx !== i))}
                                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-950 text-red-500 rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-all border border-red-900/50 hover:bg-red-900 hover:text-white z-10"
                                    >
                                        ✕
                                    </button>

                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[8px] font-black text-gray-600 uppercase tracking-widest pl-1">MOD TYPE</label>
                                                <div className="relative">
                                                    <select
                                                        value={eff.type}
                                                        onChange={e => {
                                                            const next = [...effects];
                                                            next[i] = { ...eff, type: e.target.value };
                                                            setEffects(next);
                                                        }}
                                                        className="w-full bg-black/60 border border-white/5 text-orange-400 text-[10px] font-bold uppercase rounded-xl px-3 py-2.5 outline-none appearance-none cursor-pointer focus:border-orange-500/30 transition-all"
                                                    >
                                                        <option value="STAT_MODIFIER">STAT MOD</option>
                                                        <option value="COMBAT_BONUS">COMBAT</option>
                                                        <option value="RESOURCE_MODIFIER">RESOURCE</option>
                                                        <option value="EXPLORATION_BONUS">EXPLOR</option>
                                                    </select>
                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[8px] text-orange-900">▼</div>
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <label className="text-[8px] font-black text-gray-600 uppercase tracking-widest pl-1">TARGET KEY</label>
                                                <div className="relative">
                                                    <select
                                                        value={eff.target || "strength"}
                                                        onChange={e => {
                                                            const next = [...effects];
                                                            next[i] = { ...eff, target: e.target.value };
                                                            setEffects(next);
                                                        }}
                                                        className="w-full bg-black/60 border border-white/5 text-white text-[10px] font-bold uppercase rounded-xl px-3 py-2.5 outline-none appearance-none cursor-pointer focus:border-orange-500/30 transition-all"
                                                    >
                                                        <optgroup label="CORE STATS" className="bg-black text-[10px]">
                                                            <option value="strength">Strength</option>
                                                            <option value="agility">Agility</option>
                                                            <option value="intelligence">Intelligence</option>
                                                            <option value="wisdom">Wisdom</option>
                                                            <option value="endurance">Endurance</option>
                                                            <option value="charisma">Charisma</option>
                                                        </optgroup>
                                                        <optgroup label="COMBAT" className="bg-black text-[10px]">
                                                            <option value="hp">Health Points</option>
                                                            <option value="maxHp">Max Health</option>
                                                            <option value="ap">Action Points</option>
                                                            <option value="evasion">Evasion</option>
                                                            <option value="crit_rate">Crit Rate</option>
                                                        </optgroup>
                                                        <optgroup label="RESOURCES" className="bg-black text-[10px]">
                                                            <option value="food">Food Supply</option>
                                                            <option value="water">Water Supply</option>
                                                            <option value="fuel">Fuel Status</option>
                                                            <option value="parts">Mechanical Parts</option>
                                                            <option value="ammo">Ammunition</option>
                                                            <option value="meds">Medical Supplies</option>
                                                        </optgroup>
                                                    </select>
                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[8px] text-gray-700">▼</div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <div className="flex justify-between items-center px-1">
                                                <label className="text-[8px] font-black text-gray-600 uppercase tracking-widest">MAGNITUDE</label>
                                                <span className={`text-[9px] font-black uppercase tracking-widest ${eff.value >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                    {magnitudeLabel} {targetLabel}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <input
                                                    type="number"
                                                    value={eff.value}
                                                    onChange={e => {
                                                        const next = [...effects];
                                                        next[i] = { ...eff, value: Number(e.target.value) };
                                                        setEffects(next);
                                                    }}
                                                    className="w-full bg-black/60 border border-white/5 text-orange-500 text-lg font-black rounded-xl px-4 py-2 outline-none focus:border-orange-500/30 transition-all placeholder:text-gray-800"
                                                />
                                                <div className="flex flex-col gap-1">
                                                    <button onClick={() => {
                                                        const next = [...effects];
                                                        next[i] = { ...eff, value: eff.value + 1 };
                                                        setEffects(next);
                                                    }} className="w-8 h-6 bg-white/5 hover:bg-orange-500/20 rounded flex items-center justify-center text-[10px] transition-all text-white">▲</button>
                                                    <button onClick={() => {
                                                        const next = [...effects];
                                                        next[i] = { ...eff, value: eff.value - 1 };
                                                        setEffects(next);
                                                    }} className="w-8 h-6 bg-white/5 hover:bg-orange-500/20 rounded flex items-center justify-center text-[10px] transition-all text-white">▼</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {effects.length === 0 && (
                        <div className="group cursor-pointer py-10 border border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center gap-3 hover:bg-white/[0.02] hover:border-orange-500/20 transition-all"
                            onClick={() => setEffects([{ type: 'STAT_MODIFIER', target: 'strength', value: 1 }])}>
                            <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-gray-600 group-hover:text-orange-500 transition-all">
                                <span className="text-xl">+</span>
                            </div>
                            <span className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em] group-hover:text-orange-900 transition-all italic">
                                NO MECHANICAL MODS INSTALLED
                            </span>
                        </div>
                    )}
                </div>

                {/* Icon Selection Toggle */}
                <div className="pt-4 flex justify-end">
                    <button
                        onClick={() => setIsGalleryOpen(true)}
                        className="text-[9px] font-black text-gray-500 hover:text-white uppercase tracking-widest flex items-center gap-2 transition-all px-4 py-2 bg-white/5 rounded-lg border border-white/5"
                    >
                        📸 Modify Visual Artifact
                    </button>
                </div>
            </div>
        </div>
    );
}
