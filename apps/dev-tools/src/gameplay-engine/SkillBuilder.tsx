import React, { useState, useEffect, useMemo } from "react";
import { Skill, GameRegistry, SkillTargetType, SkillAreaType, SkillCategory } from "@ashtrail/core";
import { IconGallerySelector } from "../components/IconGallerySelector";

export function SkillBuilder() {
    const [savedSkills, setSavedSkills] = useState<Skill[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [id, setId] = useState(`skill-${Date.now()}`);
    const [name, setName] = useState("");
    const [category, setCategory] = useState<SkillCategory>("base");
    const [description, setDescription] = useState("");
    const [icon, setIcon] = useState("✨");
    const [apCost, setApCost] = useState(3);
    const [minRange, setMinRange] = useState(1);
    const [maxRange, setMaxRange] = useState(1);
    const [areaType, setAreaType] = useState<SkillAreaType>("single");
    const [areaSize, setAreaSize] = useState(0);
    const [targetType, setTargetType] = useState<SkillTargetType>("enemy");
    const [cooldown, setCooldown] = useState(0);
    const [effectType, setEffectType] = useState<"physical" | "magical" | "support">("physical");
    const [damage, setDamage] = useState(0);
    const [healing, setHealing] = useState(0);
    const [pushDistance, setPushDistance] = useState(0);

    // Gallery State
    const [isGalleryOpen, setIsGalleryOpen] = useState(false);

    // Filter State
    const [searchText, setSearchText] = useState("");
    const [filterCategory, setFilterCategory] = useState<SkillCategory | "all">("all");

    useEffect(() => {
        setSavedSkills(GameRegistry.getAllSkills());
    }, []);

    const filteredSkills = useMemo(() => {
        return savedSkills.filter(s => {
            const matchesSearch = s.name.toLowerCase().includes(searchText.toLowerCase()) ||
                s.description.toLowerCase().includes(searchText.toLowerCase());
            const matchesCategory = filterCategory === "all" || s.category === filterCategory;
            return matchesSearch && matchesCategory;
        });
    }, [savedSkills, searchText, filterCategory]);

    const loadSkill = (s: Skill) => {
        setEditingId(s.id);
        setId(s.id);
        setName(s.name);
        setCategory(s.category || "base");
        setDescription(s.description);
        setIcon(s.icon || "✨");
        setApCost(s.apCost);
        setMinRange(s.minRange);
        setMaxRange(s.maxRange);
        setAreaType(s.areaType);
        setAreaSize(s.areaSize);
        setTargetType(s.targetType);
        setCooldown(s.cooldown);
        setEffectType(s.effectType || "physical");
        setDamage(s.damage || 0);
        setHealing(s.healing || 0);
        setPushDistance(s.pushDistance || 0);
    };

    const resetForm = () => {
        setEditingId(null);
        setId(`skill-${Date.now()}`);
        setName("");
        setCategory("base");
        setDescription("");
        setIcon("✨");
        setApCost(3);
        setMinRange(1);
        setMaxRange(1);
        setAreaType("single");
        setAreaSize(0);
        setTargetType("enemy");
        setCooldown(0);
        setEffectType("physical");
        setDamage(0);
        setHealing(0);
        setPushDistance(0);
    };

    const handleSave = async () => {
        const payload: Skill = {
            id,
            name,
            category,
            description,
            icon,
            apCost,
            minRange,
            maxRange,
            areaType,
            areaSize,
            targetType,
            cooldown,
            effectType,
        };
        if (damage > 0) payload.damage = damage;
        if (healing > 0) payload.healing = healing;
        if (pushDistance > 0) payload.pushDistance = pushDistance;

        try {
            const res = await fetch("http://127.0.0.1:8787/api/data/skills", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
                setSavedSkills(GameRegistry.getAllSkills());
                setEditingId(id);
            }
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="flex w-full h-full gap-6">
            <IconGallerySelector
                isOpen={isGalleryOpen}
                onClose={() => setIsGalleryOpen(false)}
                onSelect={(url) => {
                    setIcon(url);
                    setIsGalleryOpen(false);
                }}
            />

            {/* Left Sidebar: List of Skills */}
            <aside className="w-[300px] flex flex-col gap-4 shrink-0 transition-transform duration-500 ease-in-out">
                <div className="bg-[#1e1e1e]/60 border border-white/5 rounded-2xl shadow-lg backdrop-blur-md p-4 flex flex-col gap-3 flex-1 overflow-hidden">
                    <div className="flex justify-between items-center border-b border-indigo-900/30 pb-2">
                        <h3 className="text-[10px] font-black text-indigo-500/70 uppercase tracking-widest">
                            Registry ({filteredSkills.length})
                        </h3>
                        <button onClick={resetForm} className="px-2 py-1 text-[9px] font-bold uppercase text-white bg-indigo-500/50 rounded hover:bg-indigo-400/50">
                            + New
                        </button>
                    </div>

                    {/* Search & Filters */}
                    <div className="space-y-2 py-1">
                        <input
                            type="text"
                            placeholder="Search skills..."
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] text-white outline-none focus:border-indigo-500/40 transition-all"
                        />
                        <div className="flex gap-1">
                            {["all", "base", "occupation", "unique"].map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setFilterCategory(cat as any)}
                                    className={`flex-1 py-1 text-[8px] font-black uppercase rounded border transition-all ${filterCategory === cat
                                        ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-400"
                                        : "bg-black/20 border-white/5 text-gray-600 hover:border-white/20 hover:text-gray-400"}`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                        {filteredSkills.map(s => (
                            <button
                                key={s.id}
                                onClick={() => loadSkill(s)}
                                className={`w-full text-left p-3 border rounded-lg flex flex-col gap-1 transition-all ${editingId === s.id ? "bg-indigo-500/20 border-indigo-500" : "bg-black/40 border-white/5 hover:border-white/20"}`}
                            >
                                <div className="flex justify-between items-center w-full">
                                    <span className="text-[11px] font-bold uppercase text-indigo-400 line-clamp-1 flex items-center gap-2">
                                        {s.icon?.startsWith("/api/icons/") ? (
                                            <img src={s.icon} alt="" className="w-5 h-5 rounded border border-white/10 object-cover bg-black/40" />
                                        ) : (
                                            <span className="text-sm">{s.icon}</span>
                                        )}
                                        {s.name}
                                    </span>
                                    <span className="text-[9px] text-gray-500 font-mono">{s.apCost} AP</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${s.category === 'unique' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                                        s.category === 'occupation' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                            'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                                        }`}>
                                        {s.category}
                                    </span>
                                    <p className="text-[10px] text-gray-500 line-clamp-1 mt-0">{s.description}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </aside>

            {/* Main Content: Skill Editor */}
            <div className="flex-1 overflow-hidden transition-all duration-500 ease-in-out">
                <div className="w-full h-full bg-[#1e1e1e]/60 rounded-2xl border border-white/5 shadow-2xl p-8 overflow-y-auto custom-scrollbar space-y-6">
                    <h2 className="text-xl font-black tracking-widest text-indigo-400 uppercase">Skill Builder</h2>

                    {/* Basic Info */}
                    <div className="grid grid-cols-6 gap-4">
                        <div className="col-span-1 space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Icon</label>
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => setIsGalleryOpen(true)}
                                    className="w-full aspect-square bg-black/50 border border-white/10 rounded-xl flex items-center justify-center relative group hover:border-indigo-500/30 transition-all overflow-hidden"
                                >
                                    {icon.startsWith("/api/icons/") ? (
                                        <img src={icon} alt="Icon" className="w-full h-full rounded object-cover p-2" />
                                    ) : (
                                        <span className="text-2xl">{icon}</span>
                                    )}
                                    <div className="absolute inset-0 bg-indigo-500/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <span className="text-[8px] font-black uppercase text-white bg-black/60 px-2 py-1 rounded">Change</span>
                                    </div>
                                </button>
                                {icon.startsWith("/api/icons/") && (
                                    <button
                                        onClick={() => setIcon("✨")}
                                        className="text-[8px] font-bold uppercase text-gray-600 hover:text-red-400 transition-colors"
                                    >
                                        Use Emoji
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="col-span-3 space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Name</label>
                            <input value={name} onChange={e => setName(e.target.value)} placeholder="Skill Name..." className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-500/50 transition-all" />
                            {!icon.startsWith("/api/icons/") && (
                                <div className="mt-1">
                                    <label className="text-[8px] font-black text-gray-600 uppercase tracking-widest">Emoji Icon</label>
                                    <input value={icon} onChange={e => setIcon(e.target.value)} className="w-full bg-transparent text-gray-400 border-none px-0 py-0 text-xs focus:ring-0" />
                                </div>
                            )}
                        </div>
                        <div className="col-span-2 space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">ID</label>
                            <input value={id} onChange={e => setId(e.target.value)} readOnly className="w-full bg-black/50 border border-white/10 text-gray-500 px-4 py-3 rounded-xl text-sm font-mono opacity-50 cursor-not-allowed" />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-1 space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Category</label>
                            <select value={category} onChange={e => setCategory(e.target.value as SkillCategory)} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-500/50 transition-all">
                                <option value="base">Base</option>
                                <option value="occupation">Occupation</option>
                                <option value="unique">Unique</option>
                            </select>
                        </div>
                        <div className="col-span-2 space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Description</label>
                            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this skill do?" rows={1} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-500/50 transition-all resize-none" />
                        </div>
                    </div>

                    {/* Combat Properties */}
                    <div className="grid grid-cols-4 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-teal-500 uppercase tracking-widest">AP Cost</label>
                            <input type="number" value={apCost} onChange={e => setApCost(Number(e.target.value))} min={0} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-500/50" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-teal-500 uppercase tracking-widest">Cooldown</label>
                            <input type="number" value={cooldown} onChange={e => setCooldown(Number(e.target.value))} min={0} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-500/50" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-teal-500 uppercase tracking-widest">Damage</label>
                            <input type="number" value={damage} onChange={e => setDamage(Number(e.target.value))} min={0} className="w-full bg-black/50 border border-white/10 text-red-400 px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-500/50" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-teal-500 uppercase tracking-widest">Healing</label>
                            <input type="number" value={healing} onChange={e => setHealing(Number(e.target.value))} min={0} className="w-full bg-black/50 border border-white/10 text-green-400 px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-500/50" />
                        </div>
                    </div>

                    {/* Area & Range */}
                    <div className="grid grid-cols-5 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Min Range</label>
                            <input type="number" value={minRange} onChange={e => setMinRange(Number(e.target.value))} min={0} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-500/50" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Max Range</label>
                            <input type="number" value={maxRange} onChange={e => setMaxRange(Number(e.target.value))} min={0} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-500/50" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Area Type</label>
                            <select value={areaType} onChange={e => setAreaType(e.target.value as SkillAreaType)} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-500/50">
                                <option value="single">Single</option>
                                <option value="circle">Circle</option>
                                <option value="cross">Cross</option>
                                <option value="line">Line</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Area Size</label>
                            <input type="number" value={areaSize} onChange={e => setAreaSize(Number(e.target.value))} min={0} disabled={areaType === "single"} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-500/50 disabled:opacity-50" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-orange-500 uppercase tracking-widest">Push Dist</label>
                            <input type="number" value={pushDistance} onChange={e => setPushDistance(Number(e.target.value))} min={0} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-500/50" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Target Type</label>
                            <select value={targetType} onChange={e => setTargetType(e.target.value as SkillTargetType)} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-500/50 transition-all">
                                <option value="enemy">Enemy</option>
                                <option value="ally">Ally</option>
                                <option value="self">Self</option>
                                <option value="cell">Cell (Ground)</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Effect Type</label>
                            <select value={effectType} onChange={e => setEffectType(e.target.value as any)} className="w-full bg-black/50 border border-white/10 text-white px-4 py-3 rounded-xl text-sm outline-none focus:border-indigo-500/50 transition-all">
                                <option value="physical">Physical</option>
                                <option value="magical">Magical</option>
                                <option value="support">Support</option>
                            </select>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-white/10 space-y-2">
                        <button
                            onClick={handleSave}
                            disabled={!name}
                            className="w-full py-4 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-30 text-white font-black uppercase tracking-[0.3em] rounded-xl transition-all text-sm shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                        >
                            💾 {editingId ? "Update Skill" : "Save Skill to Disk"}
                        </button>
                    </div>

                </div>
            </div>
        </div>
    );
}
