import React, { useState, useEffect } from "react";
import { Item, GameRegistry, ItemCategory } from "@ashtrail/core";
import { IconGallerySelector } from "../components/IconGallerySelector";

interface ItemsViewProps {
    item: Item | null;
}

export function ItemsView({ item }: ItemsViewProps) {
    const [editingItem, setEditingItem] = useState<Item | null>(null);

    // Form State
    const [id, setId] = useState("");
    const [name, setName] = useState("");
    const [category, setCategory] = useState<ItemCategory>("weapon");
    const [description, setDescription] = useState("");
    const [cost, setCost] = useState(0);
    const [icon, setIcon] = useState("📦");

    // Gallery State
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);

    useEffect(() => {
        if (item) {
            setEditingItem(item);
            setId(item.id);
            setName(item.name);
            setCategory(item.category);
            setDescription(item.description);
            setCost(item.cost);
            setIcon(item.icon || "📦");
        } else {
            setEditingItem(null);
        }
    }, [item]);

    const handleSave = async () => {
        const payload: Item = {
            id,
            name,
            category,
            description,
            cost,
            icon,
            effects: item?.effects, // Preserve effects for now as we don't have a UI for them yet
        };

        try {
            const res = await fetch("http://127.0.0.1:8787/api/data/items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
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
        <div className="w-full h-full max-w-[1000px] bg-[#1e1e1e]/60 rounded-2xl border border-white/5 shadow-2xl p-8 overflow-y-auto custom-scrollbar space-y-6">
            <IconGallerySelector
                isOpen={isGalleryOpen}
                onClose={() => setIsGalleryOpen(false)}
                onSelect={(url) => {
                    setIcon(url);
                    setIsGalleryOpen(false);
                }}
            />

            <div className="flex justify-between items-center">
                <h2 className="text-xl font-black tracking-widest text-yellow-500 uppercase">Item Editor</h2>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-gray-500">{id}</span>
                </div>
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-6 gap-4">
                <div className="col-span-1 space-y-1">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Icon</label>
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={() => setIsGalleryOpen(true)}
                            className="w-full aspect-square bg-black/50 border border-white/10 rounded-xl flex items-center justify-center relative group hover:border-yellow-500/30 transition-all overflow-hidden"
                        >
                            {icon.startsWith("/api/icons/") ? (
                                <img src={icon} alt="Icon" className="w-full h-full rounded object-cover p-2" />
                            ) : (
                                <span className="text-2xl">{icon}</span>
                            )}
                            <div className="absolute inset-0 bg-yellow-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="text-[8px] font-black uppercase text-white bg-black/60 px-2 py-1 rounded">Change</span>
                            </div>
                        </button>
                        {icon.startsWith("/api/icons/") && (
                            <button
                                onClick={() => setIcon("📦")}
                                className="text-[8px] font-bold uppercase text-gray-600 hover:text-red-400 transition-colors"
                            >
                                Use Emoji
                            </button>
                        )}
                    </div>
                </div>
                <div className="col-span-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Name</label>
                            <input value={name} onChange={e => setName(e.target.value)} placeholder="Item Name..." className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-yellow-500/50 transition-all" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Category</label>
                            <select value={category} onChange={e => setCategory(e.target.value as ItemCategory)} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-yellow-500/50 transition-all">
                                <option value="weapon">Weapon</option>
                                <option value="armor">Armor</option>
                                <option value="consumable">Consumable</option>
                                <option value="tool">Tool</option>
                                <option value="relic">Relic</option>
                            </select>
                        </div>
                    </div>
                    {!icon.startsWith("/api/icons/") && (
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Emoji Icon</label>
                            <input value={icon} onChange={e => setIcon(e.target.value)} className="w-full bg-transparent text-gray-400 border-none px-0 py-0 text-xs focus:ring-0" />
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1 space-y-1">
                    <label className="text-[10px] font-black text-yellow-500 uppercase tracking-widest">Cost</label>
                    <input type="number" value={cost} onChange={e => setCost(Number(e.target.value))} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-yellow-500/50 transition-all" />
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Description</label>
                <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe this item..."
                    rows={4}
                    className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-yellow-500/50 transition-all resize-none shadow-inner"
                />
            </div>

            {item.effects && item.effects.length > 0 && (
                <div className="space-y-3">
                    <label className="text-[10px] font-black text-teal-500 uppercase tracking-widest">Mechanical Effects (Read-Only)</label>
                    <div className="grid grid-cols-2 gap-2">
                        {item.effects.map((eff, i) => (
                            <div key={i} className="p-3 bg-black/40 border border-white/5 rounded-lg text-[10px] font-mono">
                                <span className="text-teal-400 capitalize">{eff.type.replace('_', ' ')}</span>
                                <span className="text-gray-500 mx-2">→</span>
                                <span className="text-white">{eff.value > 0 ? '+' : ''}{eff.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="pt-4 border-t border-white/10">
                <button
                    onClick={handleSave}
                    disabled={!name}
                    className="w-full py-4 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-30 text-white font-black uppercase tracking-[0.3em] rounded-xl transition-all text-sm shadow-[0_0_15px_rgba(202,138,4,0.5)]"
                >
                    💾 Save Item Data
                </button>
            </div>
        </div>
    );
}
