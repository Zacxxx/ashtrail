import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Character, Trait, Occupation, Stats, GameRegistry, OccupationCategory } from "@ashtrail/core";
import { TabBar } from "@ashtrail/ui";

type BuilderTab = "IDENTITY" | "TRAITS" | "STATS" | "OCCUPATION" | "INVENTORY" | "SAVE";

const DEFAULT_STATS: Stats = { strength: 3, agility: 3, intelligence: 3, wisdom: 3, endurance: 3, charisma: 3 };

export function CharacterBuilderPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [savedCharacters, setSavedCharacters] = useState<Character[]>([]);
    const [activeTab, setActiveTab] = useState<BuilderTab>("IDENTITY");

    // ── Character Form State ──
    const [charId, setCharId] = useState(`char-${Date.now()}`);
    const [name, setName] = useState("");
    const [age, setAge] = useState(25);
    const [gender, setGender] = useState("Male");
    const [history, setHistory] = useState("");
    const [appearancePrompt, setAppearancePrompt] = useState("");
    const [isNPC, setIsNPC] = useState(false);

    // Traits
    const [selectedTraits, setSelectedTraits] = useState<Trait[]>([]);
    const [traitPoints, setTraitPoints] = useState(15);
    const [traitSearch, setTraitSearch] = useState("");

    // Stats
    const [stats, setStats] = useState<Stats>({ ...DEFAULT_STATS });
    const [statsPoints, setStatsPoints] = useState(18);

    // Occupation
    const [selectedOccupation, setSelectedOccupation] = useState<Occupation | null>(null);
    const [occCategory, setOccCategory] = useState<OccupationCategory | "ALL">("ALL");

    // Load character for editing
    const [editingId, setEditingId] = useState<string | null>(null);

    useEffect(() => {
        async function load() {
            await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
            setSavedCharacters(GameRegistry.getAllCharacters());
            setIsLoading(false);
        }
        load();
    }, []);

    const allTraits = GameRegistry.getAllTraits().filter(t => !t.id.startsWith("age-"));
    const allOccupations = GameRegistry.getAllOccupations();

    const filteredTraits = useMemo(() => {
        const s = traitSearch.toLowerCase();
        const available = allTraits.filter(t => !selectedTraits.some(st => st.id === t.id));
        return {
            positive: available.filter(t => t.type === "positive" && (t.name.toLowerCase().includes(s) || t.description.toLowerCase().includes(s))),
            negative: available.filter(t => t.type === "negative" && (t.name.toLowerCase().includes(s) || t.description.toLowerCase().includes(s))),
            neutral: available.filter(t => t.type === "neutral" && (t.name.toLowerCase().includes(s) || t.description.toLowerCase().includes(s))),
        };
    }, [traitSearch, selectedTraits, allTraits]);

    const filteredOccupations = useMemo(() => {
        return allOccupations.filter(o => occCategory === "ALL" || o.category === occCategory);
    }, [occCategory, allOccupations]);

    const toggleTrait = (trait: Trait) => {
        const isSelected = selectedTraits.find(t => t.id === trait.id);
        if (isSelected) {
            setSelectedTraits(p => p.filter(t => t.id !== trait.id));
            setTraitPoints(p => p + trait.cost);
        } else {
            if (traitPoints >= trait.cost || trait.cost < 0) {
                setSelectedTraits(p => [...p, trait]);
                setTraitPoints(p => p - trait.cost);
            }
        }
    };

    const adjustStat = (stat: keyof Stats, delta: number) => {
        if (delta > 0 && statsPoints <= 0) return;
        if (delta < 0 && stats[stat] <= 1) return;
        setStats(p => ({ ...p, [stat]: p[stat] + delta }));
        setStatsPoints(p => p - delta);
    };

    const loadCharacter = (char: Character) => {
        setEditingId(char.id);
        setCharId(char.id);
        setName(char.name);
        setAge(char.age);
        setGender(char.gender);
        setHistory(char.history);
        setAppearancePrompt(char.appearancePrompt);
        setIsNPC(char.isNPC || false);
        setSelectedTraits(char.traits || []);
        setStats(char.stats);
        setSelectedOccupation(char.occupation || null);
        // Recalculate points (approximate)
        const usedTraitPoints = (char.traits || []).reduce((sum, t) => sum + t.cost, 0);
        setTraitPoints(15 - usedTraitPoints);
        const usedStatPoints = Object.values(char.stats).reduce((sum, v) => sum + v, 0) - 18;
        setStatsPoints(18 - usedStatPoints);
        setActiveTab("IDENTITY");
    };

    const resetForm = () => {
        setEditingId(null);
        setCharId(`char-${Date.now()}`);
        setName("");
        setAge(25);
        setGender("Male");
        setHistory("");
        setAppearancePrompt("");
        setIsNPC(false);
        setSelectedTraits([]);
        setTraitPoints(15);
        setStats({ ...DEFAULT_STATS });
        setStatsPoints(18);
        setSelectedOccupation(null);
        setActiveTab("IDENTITY");
    };

    const handleSave = async () => {
        const finalStats = { ...stats };
        const character: Character = {
            id: charId,
            isNPC,
            name,
            age,
            gender,
            history,
            appearancePrompt,
            stats: finalStats,
            traits: selectedTraits,
            occupation: selectedOccupation || undefined,
            hp: 10 + finalStats.endurance * 5,
            maxHp: 10 + finalStats.endurance * 5,
            xp: 0,
            level: 1,
            inventory: []
        };

        try {
            const res = await fetch("http://127.0.0.1:8787/api/data/characters", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(character),
            });
            if (res.ok) {
                // Refresh list
                await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
                setSavedCharacters(GameRegistry.getAllCharacters());
                setEditingId(character.id);
            }
        } catch (e) {
            console.error("Failed to save character:", e);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-[#1e1e1e] text-gray-500">Loading...</div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-[#1e1e1e] text-gray-300 font-sans tracking-wide overflow-hidden relative">
            <div className="absolute inset-0 z-0 pointer-events-none opacity-40 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-[#030508] to-[#030508]" />

            {/* ══ Header ══ */}
            <header className="absolute top-0 left-0 right-0 z-30 bg-[#030508]/90 backdrop-blur-md border-b border-white/5 pointer-events-auto">
                <div className="h-16 flex items-center justify-between px-6 w-full">
                    <div className="flex items-center gap-6">
                        <Link to="/" className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-all">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        </Link>
                        <h1 className="text-xs font-black tracking-[0.3em] text-white">CHARACTER BUILDER</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={resetForm} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 border border-white/10 rounded-lg hover:bg-white/5 transition-all">
                            + New
                        </button>
                    </div>
                </div>
            </header>

            {/* ══ Main Layout ══ */}
            <div className="flex-1 flex overflow-hidden relative z-10 pt-[80px] pb-6 px-6 gap-6">
                {/* Left: Saved Characters Sidebar */}
                <aside className="w-[260px] flex flex-col gap-4 shrink-0">
                    <div className="bg-[#1e1e1e]/60 border border-white/5 rounded-2xl shadow-lg backdrop-blur-md p-4 flex flex-col gap-3 flex-1 overflow-hidden">
                        <h3 className="text-[10px] font-black text-indigo-500/70 uppercase tracking-widest border-b border-indigo-900/30 pb-2">
                            Saved Characters ({savedCharacters.length})
                        </h3>
                        <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                            {savedCharacters.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => loadCharacter(c)}
                                    className={`w-full text-left p-3 border rounded-lg flex flex-col gap-1 transition-all ${editingId === c.id
                                        ? "bg-indigo-500/20 border-indigo-500"
                                        : "bg-black/40 border-white/5 hover:border-white/20"
                                        }`}
                                >
                                    <div className="flex justify-between items-center w-full">
                                        <span className="text-[11px] font-bold uppercase text-indigo-400 line-clamp-1">{c.name}</span>
                                        {c.isNPC && <span className="text-[8px] bg-red-500/20 text-red-300 px-1 py-0.5 rounded uppercase">NPC</span>}
                                    </div>
                                    <p className="text-[10px] text-gray-500">Lvl {c.level} | {c.occupation?.name || "None"}</p>
                                </button>
                            ))}
                            {savedCharacters.length === 0 && (
                                <p className="text-xs text-gray-600 italic text-center py-4">No characters saved yet.</p>
                            )}
                        </div>
                    </div>
                </aside>

                {/* Center: Builder Form */}
                <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                    {/* Tab Navigation */}
                    <div className="shrink-0 flex items-center justify-center p-1 bg-[#1e1e1e]/60 border border-white/5 rounded-2xl shadow-lg backdrop-blur-md">
                        <TabBar
                            tabs={["IDENTITY", "TRAITS", "STATS", "OCCUPATION", "INVENTORY", "SAVE"]}
                            activeTab={activeTab}
                            onTabChange={(t) => setActiveTab(t as BuilderTab)}
                        />
                    </div>

                    {/* Form Content */}
                    <div className="flex-1 bg-[#1e1e1e]/60 border border-white/5 rounded-2xl shadow-lg backdrop-blur-md p-6 overflow-y-auto custom-scrollbar">

                        {/* ═══ IDENTITY TAB ═══ */}
                        {activeTab === "IDENTITY" && (
                            <div className="space-y-6 max-w-2xl">
                                <h2 className="text-lg font-black tracking-widest text-indigo-400 uppercase">Identity</h2>

                                {/* NPC Toggle */}
                                <div className="flex items-center justify-between bg-black/40 p-4 rounded-xl border border-white/5">
                                    <div>
                                        <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Character Type</span>
                                        <p className="text-[10px] text-gray-500 mt-0.5">NPCs/Archetypes are templates used by the game engine, not playable characters.</p>
                                    </div>
                                    <button
                                        onClick={() => setIsNPC(!isNPC)}
                                        className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg border transition-all ${isNPC
                                            ? "bg-red-500/20 border-red-500/50 text-red-400"
                                            : "bg-indigo-500/20 border-indigo-500/50 text-indigo-400"
                                            }`}
                                    >
                                        {isNPC ? "NPC / Archetype" : "Player Character"}
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Name</label>
                                        <input value={name} onChange={e => setName(e.target.value)} placeholder="Enter name..." className="w-full bg-black/50 border border-white/10 text-white px-4 py-2.5 rounded-lg text-sm outline-none focus:border-indigo-500/50 transition-all" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Age</label>
                                            <input type="number" value={age} onChange={e => setAge(Math.max(18, parseInt(e.target.value) || 18))} min={18} className="w-full bg-black/50 border border-white/10 text-white px-4 py-2.5 rounded-lg text-sm outline-none focus:border-indigo-500/50 transition-all" />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Gender</label>
                                            <select value={gender} onChange={e => setGender(e.target.value)} className="w-full bg-black/50 border border-white/10 text-white px-4 py-2.5 rounded-lg text-sm outline-none focus:border-indigo-500/50 transition-all">
                                                <option>Male</option>
                                                <option>Female</option>
                                                <option>Non-Binary</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Background History</label>
                                    <textarea value={history} onChange={e => setHistory(e.target.value)} placeholder="What is this character's story?" rows={3} className="w-full bg-black/50 border border-white/10 text-white px-4 py-2.5 rounded-lg text-sm outline-none focus:border-indigo-500/50 transition-all resize-none" />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Appearance Description</label>
                                    <textarea value={appearancePrompt} onChange={e => setAppearancePrompt(e.target.value)} placeholder="Physical appearance descriptor..." rows={2} className="w-full bg-black/50 border border-white/10 text-white px-4 py-2.5 rounded-lg text-sm outline-none focus:border-indigo-500/50 transition-all resize-none" />
                                </div>
                            </div>
                        )}

                        {/* ═══ TRAITS TAB ═══ */}
                        {activeTab === "TRAITS" && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h2 className="text-lg font-black tracking-widest text-indigo-400 uppercase">Traits</h2>
                                    <div className="flex items-center gap-4">
                                        <span className="text-xs font-mono text-gray-400">Points: <span className={traitPoints >= 0 ? "text-green-400" : "text-red-400"}>{traitPoints}</span></span>
                                        <input value={traitSearch} onChange={e => setTraitSearch(e.target.value)} placeholder="Search..." className="bg-black/50 border border-white/10 text-white px-3 py-1.5 rounded-lg text-xs outline-none w-48" />
                                    </div>
                                </div>

                                {/* Selected Traits */}
                                {selectedTraits.length > 0 && (
                                    <div className="space-y-2">
                                        <h3 className="text-[10px] font-black text-indigo-500/70 uppercase tracking-widest">Selected ({selectedTraits.length})</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedTraits.map(t => (
                                                <button key={t.id} onClick={() => toggleTrait(t)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all hover:opacity-70 ${t.type === "positive" ? "bg-blue-500/20 border-blue-500/30 text-blue-400" : t.type === "negative" ? "bg-red-500/20 border-red-500/30 text-red-400" : "bg-gray-500/20 border-gray-500/30 text-gray-400"}`}>
                                                    {t.name} ✕
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Available Traits by type */}
                                {(["positive", "negative", "neutral"] as const).map(type => {
                                    const list = filteredTraits[type];
                                    if (list.length === 0) return null;
                                    return (
                                        <div key={type} className="space-y-2">
                                            <h3 className={`text-[10px] font-black uppercase tracking-widest border-b pb-1 ${type === "positive" ? "text-blue-400 border-blue-900/30" : type === "negative" ? "text-red-400 border-red-900/30" : "text-gray-400 border-gray-800"}`}>
                                                {type} ({list.length})
                                            </h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                                {list.map(t => (
                                                    <button key={t.id} onClick={() => toggleTrait(t)} className="w-full text-left p-3 bg-black/40 border border-white/5 rounded-lg hover:border-white/20 transition-all">
                                                        <div className="flex justify-between items-center">
                                                            <span className={`text-[11px] font-bold uppercase ${type === "positive" ? "text-blue-400" : type === "negative" ? "text-red-400" : "text-gray-400"}`}>{t.name}</span>
                                                            <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-gray-300 font-mono">{t.cost}</span>
                                                        </div>
                                                        <p className="text-[10px] text-gray-500 line-clamp-2 mt-1">{t.description}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* ═══ STATS TAB ═══ */}
                        {activeTab === "STATS" && (
                            <div className="space-y-6 max-w-xl">
                                <div className="flex justify-between items-center">
                                    <h2 className="text-lg font-black tracking-widest text-indigo-400 uppercase">Stats</h2>
                                    <span className="text-xs font-mono text-gray-400">Points: <span className={statsPoints >= 0 ? "text-green-400" : "text-red-400"}>{statsPoints}</span></span>
                                </div>
                                <div className="space-y-3">
                                    {(Object.keys(stats) as (keyof Stats)[]).map(stat => (
                                        <div key={stat} className="flex items-center justify-between bg-black/40 p-4 rounded-xl border border-white/5">
                                            <span className="text-sm font-bold uppercase tracking-widest text-gray-300 w-32">{stat}</span>
                                            <div className="flex items-center gap-4">
                                                <button onClick={() => adjustStat(stat, -1)} className="w-8 h-8 bg-white/5 border border-white/10 rounded text-gray-400 hover:bg-white/10 transition-all font-bold">−</button>
                                                <span className="text-xl font-mono font-bold text-indigo-400 w-8 text-center">{stats[stat]}</span>
                                                <button onClick={() => adjustStat(stat, 1)} className="w-8 h-8 bg-white/5 border border-white/10 rounded text-gray-400 hover:bg-white/10 transition-all font-bold">+</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ═══ OCCUPATION TAB ═══ */}
                        {activeTab === "OCCUPATION" && (
                            <div className="space-y-4">
                                <h2 className="text-lg font-black tracking-widest text-indigo-400 uppercase">Occupation</h2>
                                <div className="flex gap-2 flex-wrap">
                                    {(["ALL", "SECURITY", "TECHNICAL", "CRAFT", "ADMIN", "SOCIAL", "FIELD"] as const).map(cat => (
                                        <button key={cat} onClick={() => setOccCategory(cat)} className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg border transition-all ${occCategory === cat ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-400" : "bg-black/40 border-white/10 text-gray-500 hover:text-white"}`}>
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {filteredOccupations.map(o => (
                                        <button key={o.id} onClick={() => setSelectedOccupation(o)} className={`w-full text-left p-4 border rounded-xl flex flex-col gap-2 transition-all ${selectedOccupation?.id === o.id ? "bg-indigo-500/20 border-indigo-500" : "bg-black/40 border-white/5 hover:border-white/20"}`}>
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm font-bold uppercase text-indigo-400">{o.name}</span>
                                                <span className="text-[8px] bg-white/10 px-1.5 py-0.5 rounded uppercase text-gray-400">{o.category}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 line-clamp-2">{o.description}</p>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {o.perks.map((p, i) => (
                                                    <span key={i} className="text-[9px] bg-teal-500/10 text-teal-400 px-1.5 py-0.5 rounded border border-teal-500/20">{p}</span>
                                                ))}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ═══ INVENTORY TAB (WIP) ═══ */}
                        {activeTab === "INVENTORY" && (
                            <div className="flex flex-col items-center justify-center h-full text-center py-20">
                                <div className="text-4xl mb-4 opacity-50">🎒</div>
                                <h2 className="text-lg font-black tracking-widest text-yellow-500/50 uppercase mb-2">Inventory</h2>
                                <p className="text-sm text-gray-500 max-w-md">
                                    Starting inventory management is coming soon. This will integrate with the Items registry to allow assigning equipment and consumables to characters.
                                </p>
                            </div>
                        )}

                        {/* ═══ SAVE TAB ═══ */}
                        {activeTab === "SAVE" && (
                            <div className="space-y-6 max-w-2xl">
                                <h2 className="text-lg font-black tracking-widest text-indigo-400 uppercase">Review & Save</h2>

                                {/* Summary */}
                                <div className="bg-black/40 p-6 rounded-xl border border-white/5 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-2xl font-black text-white">{name || "Unnamed"}</span>
                                        <div className="flex gap-2">
                                            {isNPC && <span className="px-2 py-1 bg-red-500/20 text-red-400 text-[10px] font-black uppercase rounded border border-red-500/20">NPC</span>}
                                            <span className="px-2 py-1 bg-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase rounded border border-indigo-500/20">
                                                {selectedOccupation?.name || "No Occupation"}
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500">Age {age} | {gender} | HP: {10 + stats.endurance * 5}</p>

                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-3 gap-2 mt-2">
                                        {(Object.entries(stats) as [string, number][]).map(([k, v]) => (
                                            <div key={k} className="flex justify-between bg-white/5 p-2 rounded text-xs">
                                                <span className="text-gray-500 uppercase">{k}</span>
                                                <span className="text-indigo-400 font-mono font-bold">{v}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Traits */}
                                    {selectedTraits.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {selectedTraits.map(t => (
                                                <span key={t.id} className={`text-[9px] px-1.5 py-0.5 rounded border ${t.type === "positive" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : t.type === "negative" ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-gray-500/10 text-gray-400 border-gray-500/20"}`}>{t.name}</span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <p className="text-[10px] text-gray-500 font-mono">
                                        ID: {charId} | Will save to: generated/characters/{charId}.json
                                    </p>
                                    <button
                                        onClick={handleSave}
                                        disabled={!name}
                                        className="w-full py-4 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-30 text-white font-black uppercase tracking-[0.3em] rounded-xl transition-all text-sm"
                                    >
                                        💾 {editingId ? "Update Character" : "Save Character to Disk"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
