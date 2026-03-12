import React, { useState, useEffect } from "react";
import { Occupation, GameRegistry, OccupationCategory, GameplayEffect } from "@ashtrail/core";
import { IconGallerySelector } from "../components/IconGallerySelector";
import { ModifierEditor } from "../components/ModifierEditor";

interface OccupationsViewProps {
    occupation: Occupation | null;
    onSave?: () => void;
}

export function OccupationsView({ occupation, onSave }: OccupationsViewProps) {
    const [editingOccupation, setEditingOccupation] = useState<Occupation | null>(null);

    // Form State
    const [id, setId] = useState("");
    const [name, setName] = useState("");
    const [category, setCategory] = useState<OccupationCategory>("FIELD");
    const [description, setDescription] = useState("");
    const [shortDescription, setShortDescription] = useState("");
    const [effects, setEffects] = useState<GameplayEffect[]>([]);
    const [icon, setIcon] = useState("⚙️");
    const talentTree = occupation ? GameRegistry.getTalentTree(occupation.id) : undefined;

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

            // Migration: if occupation has perks (legacy), convert them to effects
            const legacyPerks = (occupation as any).perks || [];
            if (legacyPerks.length > 0 && (!occupation.effects || occupation.effects.length === 0)) {
                const migrated = legacyPerks.map((p: string, idx: number) => ({
                    id: `migrated-${idx}-${Date.now()}`,
                    name: p,
                    description: "Migrated from legacy perks",
                    type: 'LORE_EFFECT',
                    value: 0,
                    trigger: 'passive'
                }));
                setEffects(migrated);
            } else {
                setEffects(occupation.effects || []);
            }
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
            effects,
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
                if (onSave) onSave();
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
                <div className="flex items-center gap-4">
                    <button
                        onClick={async () => {
                            if (window.confirm(`Delete occupation ${name}?`)) {
                                try {
                                    const res = await fetch(`http://127.0.0.1:8787/api/data/occupations/${id}`, { method: "DELETE" });
                                    if (res.ok) {
                                        await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
                                        if (onSave) onSave();
                                    }
                                } catch (e) { console.error(e); }
                            }
                        }}
                        className="px-3 py-1 bg-red-950/30 hover:bg-red-900/50 text-red-500 border border-red-900/30 text-[10px] font-bold uppercase rounded transition-all"
                    >
                        Delete
                    </button>
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

            <ModifierEditor
                effects={effects}
                onChange={setEffects}
                colorScheme="teal"
            />

            <div className="space-y-2 border-t border-white/10 pt-6">
                <h3 className="text-[10px] font-black text-teal-400 uppercase tracking-widest">Resolved Metrics Preview</h3>
                {effects.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                        {effects.map((effect, index) => (
                            <div key={`${effect.id || index}-preview`} className="bg-black/40 border border-white/5 rounded-xl p-3 text-[10px] font-mono">
                                <div className="text-white uppercase font-black tracking-widest">{effect.name || effect.target || effect.type}</div>
                                <div className="text-gray-500 mt-1">
                                    {effect.scope || 'global'} • {effect.target || effect.type} • {effect.isPercentage ? `${effect.value}%` : effect.value}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-black/20 border border-dashed border-white/5 rounded-xl p-4 text-[10px] font-mono uppercase text-gray-500">
                        No gameplay modifiers configured yet.
                    </div>
                )}
            </div>

            <div className="space-y-3 border-t border-white/10 pt-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Talent Tree Inspection</h3>
                    <span className="text-[9px] font-mono text-gray-500">{talentTree?.nodes.length || 0} nodes</span>
                </div>
                {talentTree ? (
                    <div className="grid grid-cols-1 gap-2 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
                        {talentTree.nodes.map(node => (
                            <div key={node.id} className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-white">{node.name}</div>
                                        <div className="text-[9px] text-gray-500 font-mono">{node.id} • {node.type}</div>
                                    </div>
                                    <span className="text-[9px] font-mono text-cyan-300">cost {node.cost || 1}</span>
                                </div>
                                <div className="text-[10px] text-gray-500">{node.description}</div>
                                {node.effects && node.effects.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {node.effects.map((effect, index) => (
                                            <span key={`${node.id}-${index}`} className="text-[8px] font-mono uppercase px-2 py-1 rounded border border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                                                {effect.name || effect.target || effect.type}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {node.grantsSkillIds && node.grantsSkillIds.length > 0 && (
                                    <div className="text-[9px] font-mono text-orange-300">
                                        grants: {node.grantsSkillIds.join(", ")}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-black/30 border border-dashed border-white/5 rounded-xl p-4 text-[10px] font-mono uppercase text-gray-500">
                        No talent tree registered for this occupation.
                    </div>
                )}
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
