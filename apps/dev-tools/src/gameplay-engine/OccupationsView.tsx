import React, { useState, useEffect } from "react";
import { Occupation, GameRegistry, OccupationCategory } from "@ashtrail/core";
import { IconGallerySelector } from "../components/IconGallerySelector";

interface OccupationsViewProps {
    occupation: Occupation | null;
}

export function OccupationsView({ occupation }: OccupationsViewProps) {
    const [editingOccupation, setEditingOccupation] = useState<Occupation | null>(null);

    // Form State
    const [id, setId] = useState("");
    const [name, setName] = useState("");
    const [category, setCategory] = useState<OccupationCategory>("FIELD");
    const [description, setDescription] = useState("");
    const [shortDescription, setShortDescription] = useState("");
    const [perks, setPerks] = useState<string[]>([]);
    const [icon, setIcon] = useState("⚙️");

    // Gallery State
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);

    useEffect(() => {
        if (occupation) {
            setEditingOccupation(occupation);
            setId(occupation.id);
            setName(occupation.name);
            setCategory(occupation.category);
            setDescription(occupation.description);
            setShortDescription(occupation.shortDescription);
            setPerks(occupation.perks);
            setIcon(occupation.icon || "⚙️");
        } else {
            setEditingOccupation(null);
        }
    }, [occupation]);

    const handleSave = async () => {
        const payload: Occupation = {
            id,
            name,
            category,
            description,
            shortDescription,
            perks,
            icon,
        };

        try {
            const res = await fetch("http://127.0.0.1:8787/api/data/occupations", {
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

    if (!occupation) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                <span className="text-4xl mb-4 opacity-20">⚙️</span>
                <p className="font-mono text-sm tracking-widest uppercase">Select an Occupation to edit</p>
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
                <h2 className="text-xl font-black tracking-widest text-teal-400 uppercase">Occupation Editor</h2>
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
                            className="w-full aspect-square bg-black/50 border border-white/10 rounded-xl flex items-center justify-center relative group hover:border-teal-500/30 transition-all overflow-hidden"
                        >
                            {icon.startsWith("/api/icons/") ? (
                                <img src={icon} alt="Icon" className="w-full h-full rounded object-cover p-2" />
                            ) : (
                                <span className="text-2xl">{icon}</span>
                            )}
                            <div className="absolute inset-0 bg-teal-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span className="text-[8px] font-black uppercase text-white bg-black/60 px-2 py-1 rounded">Change</span>
                            </div>
                        </button>
                        {icon.startsWith("/api/icons/") && (
                            <button
                                onClick={() => setIcon("⚙️")}
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
                            <input value={name} onChange={e => setName(e.target.value)} placeholder="Occupation Name..." className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-teal-500/50 transition-all" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Category</label>
                            <select value={category} onChange={e => setCategory(e.target.value as OccupationCategory)} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-teal-500/50 transition-all">
                                <option value="SECURITY">Security</option>
                                <option value="TECHNICAL">Technical</option>
                                <option value="CRAFT">Craft</option>
                                <option value="ADMIN">Admin</option>
                                <option value="SOCIAL">Social</option>
                                <option value="FIELD">Field</option>
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

            <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Short Description</label>
                <input value={shortDescription} onChange={e => setShortDescription(e.target.value)} placeholder="A punchy one-liner..." className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-teal-500/50 transition-all" />
            </div>

            <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Full Description</label>
                <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Provide a detailed overview of this occupation..."
                    rows={4}
                    className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-teal-500/50 transition-all resize-none shadow-inner"
                />
            </div>

            <div className="space-y-3">
                <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Starting Perks</label>
                <div className="flex flex-col gap-2">
                    {perks.map((perk, i) => (
                        <div key={i} className="flex gap-2">
                            <input
                                value={perk}
                                onChange={e => {
                                    const next = [...perks];
                                    next[i] = e.target.value;
                                    setPerks(next);
                                }}
                                className="flex-1 bg-black/50 border border-white/10 text-white px-4 py-2 rounded-lg text-xs outline-none focus:border-orange-500/50"
                            />
                            <button
                                onClick={() => setPerks(perks.filter((_, idx) => idx !== i))}
                                className="px-3 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition-colors"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                    <button
                        onClick={() => setPerks([...perks, "New Perk"])}
                        className="py-2 border border-dashed border-white/10 text-[10px] font-black uppercase text-gray-500 hover:border-orange-500/30 hover:text-orange-400 transition-all rounded-lg"
                    >
                        + Add Perk
                    </button>
                </div>
            </div>

            <div className="pt-4 border-t border-white/10">
                <button
                    onClick={handleSave}
                    disabled={!name}
                    className="w-full py-4 bg-teal-600 hover:bg-teal-500 disabled:opacity-30 text-white font-black uppercase tracking-[0.3em] rounded-xl transition-all text-sm shadow-[0_0_15px_rgba(20,184,166,0.5)]"
                >
                    💾 Save Occupation Data
                </button>
            </div>
        </div>
    );
}
