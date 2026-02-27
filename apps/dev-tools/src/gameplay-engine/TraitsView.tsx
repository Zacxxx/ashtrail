import React, { useState, useEffect } from "react";
import { Trait, GameRegistry } from "@ashtrail/core";
import { IconGallerySelector } from "../components/IconGallerySelector";

interface TraitsViewProps {
    trait: Trait | null;
    onSave?: () => void;
}

export function TraitsView({ trait, onSave }: TraitsViewProps) {
    const [editingTrait, setEditingTrait] = useState<Trait | null>(null);

    // Form State
    const [id, setId] = useState("");
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [cost, setCost] = useState(0);
    const [type, setType] = useState<'positive' | 'negative' | 'neutral'>('neutral');
    const [impact, setImpact] = useState("");
    const [icon, setIcon] = useState("🧬");

    // Gallery State
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);

    useEffect(() => {
        if (trait) {
            setEditingTrait(trait);
            setId(trait.id);
            setName(trait.name);
            setDescription(trait.description);
            setCost(trait.cost);
            setType(trait.type);
            setImpact(trait.impact || "");
            setIcon(trait.icon || "🧬");
        } else {
            setEditingTrait(null);
            resetForm();
        }
    }, [trait]);

    const resetForm = () => {
        setId(`trait - ${Date.now()} `);
        setName("");
        setDescription("");
        setCost(0);
        setType('neutral');
        setImpact("");
        setIcon("🧬");
    };

    const handleSave = async () => {
        const payload: Trait = {
            id,
            name,
            description,
            cost,
            type,
            impact: impact || undefined,
            icon,
        };

        try {
            const res = await fetch("http://127.0.0.1:8787/api/data/traits", {
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
            // The instruction implies calling onSave() here, but it's usually not desired on error.
            // If the intent was to refresh data even on error, uncomment the line below.
            // if (onSave) onSave();
        }
    };

    if (!trait) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                <span className="text-4xl mb-4 opacity-20">🧬</span>
                <p className="font-mono text-sm tracking-widest uppercase">Select a Trait to edit or create a new one</p>
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
                <h2 className="text-xl font-black tracking-widest text-orange-400 uppercase">Trait Editor</h2>
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
                            className="w-full aspect-square bg-black/50 border border-white/10 rounded-xl flex items-center justify-center relative group hover:border-orange-500/30 transition-all overflow-hidden"
                        >
                            {icon.startsWith("/api/icons/") ? (
                                <img src={icon} alt="Icon" className="w-full h-full rounded object-cover p-2" />
                            ) : (
                                <span className="text-2xl">{icon}</span>
                            )}
                            <div className="absolute inset-0 bg-orange-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="text-[8px] font-black uppercase text-white bg-black/60 px-2 py-1 rounded">Change</span>
                            </div>
                        </button>
                        {icon.startsWith("/api/icons/") && (
                            <button
                                onClick={() => setIcon("🧬")}
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
                            <input value={name} onChange={e => setName(e.target.value)} placeholder="Trait Name..." className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-orange-500/50 transition-all" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Type</label>
                            <select value={type} onChange={e => setType(e.target.value as any)} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-orange-500/50 transition-all">
                                <option value="positive">Positive</option>
                                <option value="negative">Negative</option>
                                <option value="neutral">Neutral</option>
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
                    <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Cost</label>
                    <input type="number" value={cost} onChange={e => setCost(Number(e.target.value))} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-orange-500/50 transition-all" />
                </div>
                <div className="col-span-2 space-y-1">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Legacy Impact Note</label>
                    <input value={impact} onChange={e => setImpact(e.target.value)} placeholder="Impact on gameplay..." className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-orange-500/50 transition-all" />
                </div>
            </div>

            <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Description</label>
                <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Describe this trait..."
                    rows={4}
                    className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-orange-500/50 transition-all resize-none shadow-inner"
                />
            </div>

            <div className="pt-4 border-t border-white/10">
                <button
                    onClick={handleSave}
                    disabled={!name}
                    className="w-full py-4 bg-orange-600 hover:bg-orange-500 disabled:opacity-30 text-white font-black uppercase tracking-[0.3em] rounded-xl transition-all text-sm shadow-[0_0_15px_rgba(234,88,12,0.5)]"
                >
                    💾 Save Trait Data
                </button>
            </div>
        </div>
    );
}
