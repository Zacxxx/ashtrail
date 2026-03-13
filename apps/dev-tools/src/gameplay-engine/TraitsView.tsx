import React, { useState, useEffect } from "react";
import { Trait, GameRegistry, GameplayEffect, getTraitSourceLabel, isOccupationLinkedTrait } from "@ashtrail/core";
import { IconGallerySelector } from "../components/IconGallerySelector";
import { ModifierEditor } from "../components/ModifierEditor";

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
    const [effects, setEffects] = useState<GameplayEffect[]>([]);
    const [grantsSkillIds, setGrantsSkillIds] = useState<string[]>([]);
    const [selectedSkillId, setSelectedSkillId] = useState("");
    const allSkills = GameRegistry.getAllSkills();

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
            setEffects(trait.effects || []);
            setGrantsSkillIds(trait.grantsSkillIds || []);
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
        setEffects([]);
        setGrantsSkillIds([]);
        setSelectedSkillId("");
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
            effects,
            grantsSkillIds: grantsSkillIds.length > 0 ? grantsSkillIds : undefined,
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

    const addGrantedSkill = () => {
        const nextId = selectedSkillId.trim();
        if (!nextId || grantsSkillIds.includes(nextId)) return;
        setGrantsSkillIds(prev => [...prev, nextId]);
        setSelectedSkillId("");
    };

    const removeGrantedSkill = (skillId: string) => {
        setGrantsSkillIds(prev => prev.filter(id => id !== skillId));
    };

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
                <div className="space-y-2">
                    <h2 className="text-xl font-black tracking-widest text-orange-400 uppercase">Trait Editor</h2>
                    {editingTrait && (
                        <div className="flex flex-wrap gap-2">
                            <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-widest ${isOccupationLinkedTrait(editingTrait)
                                ? "border-teal-500/20 bg-teal-500/10 text-teal-200"
                                : "border-white/10 bg-white/5 text-gray-300"
                                }`}>
                                {isOccupationLinkedTrait(editingTrait) ? "Occupation-linked" : "Standard"}
                            </span>
                            <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-gray-400">
                                {getTraitSourceLabel(editingTrait)}
                            </span>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={async () => {
                            if (window.confirm(`Delete trait ${name}?`)) {
                                try {
                                    const res = await fetch(`http://127.0.0.1:8787/api/data/traits/${id}`, { method: "DELETE" });
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

            <ModifierEditor
                effects={effects}
                onChange={setEffects}
                colorScheme="orange"
            />

            <div className="space-y-3 border-t border-white/10 pt-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Granted Skills</h3>
                    <span className="text-[9px] font-mono text-gray-500">{grantsSkillIds.length} linked</span>
                </div>
                <div className="flex gap-2">
                    <select
                        value={selectedSkillId}
                        onChange={e => setSelectedSkillId(e.target.value)}
                        className="flex-1 bg-black/50 border border-white/10 text-white px-3 py-2 rounded-xl text-xs outline-none focus:border-orange-500/50 transition-all"
                    >
                        <option value="">Select a skill to grant...</option>
                        {allSkills
                            .filter(skill => !grantsSkillIds.includes(skill.id))
                            .map(skill => (
                                <option key={skill.id} value={skill.id}>{skill.name}</option>
                            ))}
                    </select>
                    <button
                        onClick={addGrantedSkill}
                        disabled={!selectedSkillId}
                        className="px-3 py-2 rounded-xl border border-orange-500/30 bg-orange-500/10 text-[10px] font-black uppercase tracking-widest text-orange-300 disabled:opacity-30"
                    >
                        Link
                    </button>
                </div>
                {grantsSkillIds.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2">
                        {grantsSkillIds.map(skillId => {
                            const skill = allSkills.find(entry => entry.id === skillId);
                            return (
                                <div key={skillId} className="flex items-center justify-between bg-black/30 border border-white/5 rounded-xl px-3 py-2">
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-white">
                                            {skill?.name || skillId}
                                        </div>
                                        <div className="text-[9px] font-mono text-gray-500">{skillId}</div>
                                    </div>
                                    <button
                                        onClick={() => removeGrantedSkill(skillId)}
                                        className="text-[9px] font-black uppercase text-red-400 hover:text-red-300"
                                    >
                                        Remove
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="bg-black/20 border border-dashed border-white/5 rounded-xl p-4 text-[10px] font-mono uppercase text-gray-500">
                        No skills granted by this trait.
                    </div>
                )}
            </div>

            <div className="space-y-2 border-t border-white/10 pt-6">
                <h3 className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Resolved Metrics Preview</h3>
                {(effects.length > 0 || grantsSkillIds.length > 0) ? (
                    <div className="grid grid-cols-1 gap-2">
                        {effects.map((effect, index) => (
                            <div key={`${effect.id || index}-preview`} className="bg-black/40 border border-white/5 rounded-xl p-3 text-[10px] font-mono">
                                <div className="text-white uppercase font-black tracking-widest">{effect.name || effect.target || effect.type}</div>
                                <div className="text-gray-500 mt-1">
                                    {effect.scope || 'global'} • {effect.target || effect.type} • {effect.isPercentage ? `${effect.value}%` : effect.value}
                                </div>
                            </div>
                        ))}
                        {grantsSkillIds.map((skillId) => {
                            const skill = allSkills.find((entry) => entry.id === skillId);
                            return (
                                <div key={`${skillId}-preview`} className="bg-black/40 border border-orange-500/10 rounded-xl p-3 text-[10px] font-mono">
                                    <div className="text-orange-200 uppercase font-black tracking-widest">{skill?.name || skillId}</div>
                                    <div className="text-gray-500 mt-1">Granted skill • {skillId}</div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="bg-black/20 border border-dashed border-white/5 rounded-xl p-4 text-[10px] font-mono uppercase text-gray-500">
                        No gameplay modifiers configured yet.
                    </div>
                )}
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
