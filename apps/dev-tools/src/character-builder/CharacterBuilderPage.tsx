import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Character, Trait, Occupation, Stats, GameRegistry, OccupationCategory, Item, ItemRarity, ItemCategory } from "@ashtrail/core";
import { TabBar } from "@ashtrail/ui";

type BuilderTab = "IDENTITY" | "TRAITS" | "STATS" | "OCCUPATION" | "SKILLS" | "EQUIPEMENT" | "CHARACTER_SHEET" | "INVENTORY" | "SAVE";

const DEFAULT_STATS: Stats = { strength: 3, agility: 3, intelligence: 3, wisdom: 3, endurance: 3, charisma: 3 };

const RARITY_ORDER: Record<ItemRarity, number> = {
    ashmarked: 5,
    relic: 4,
    specialized: 3,
    "pre-ash": 2,
    reinforced: 1,
    salvaged: 0
};

const ITEMS_BY_CATEGORY: Record<string, string[]> = {
    weapon: ["Stun Baton", "Vibration Blade", "Pulse Rifle", "Rusty Pipe", "Spiked Bat", "Serrated Knife"],
    consumable: ["Med Kit", "Bandage", "Stimulant", "Filtered Water", "Nutrient Bar", "Antigen"],
    resource: ["Scrap Metal", "Electronics", "Chemicals", "Fiberglass"],
    junk: ["Broken Bottle", "Rusted Nut", "Plastic Waste", "Old Tape"],
    armor: ["Tactical Vest", "Reinforced Helmet", "Scrap Plating", "Leather Guards"]
};

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
    const [level, setLevel] = useState(1);

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

    // Inventory State
    const [inventory, setInventory] = useState<Item[]>([]);
    const [inventorySearch, setInventorySearch] = useState("");
    const [inventoryFilter, setInventoryFilter] = useState("ALL");
    const [activeBagIndex, setActiveBagIndex] = useState(0);
    const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, slotIndex: number | null } | null>(null);
    const [hoverInfo, setHoverInfo] = useState<{ x: number, y: number, item: Item } | null>(null);
    const [animatingSlot, setAnimatingSlot] = useState<{ index: number, type: 'destroy' | 'throw' } | null>(null);

    const sortByRarity = () => {
        setInventory(prev => [...prev].sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]));
    };

    const sortByValue = () => {
        setInventory(prev => [...prev].sort((a, b) => b.cost - a.cost));
    };

    const removeSlotItem = (index: number) => {
        const itemToRemove = filteredInventory[index];
        if (itemToRemove) {
            setInventory(prev => prev.filter(item => item.id !== itemToRemove.id));
        }
    };

    const filteredInventory = useMemo(() => {
        return inventory.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(inventorySearch.toLowerCase());
            const matchesFilter = inventoryFilter === "ALL" || item.category === inventoryFilter.toLowerCase();
            const matchesBag = (item.bagIndex || 0) === activeBagIndex;
            return matchesSearch && matchesFilter && matchesBag;
        });
    }, [inventory, inventorySearch, inventoryFilter, activeBagIndex]);

    // Library search state
    const [librarySearch, setLibrarySearch] = useState("");

    const allLibraryItems = useMemo(() => {
        return GameRegistry.getAllItems().filter(item =>
            item.name.toLowerCase().includes(librarySearch.toLowerCase()) ||
            item.category.toLowerCase().includes(librarySearch.toLowerCase())
        );
    }, [librarySearch]);

    const addItemToInventory = (item: Item) => {
        const newItem: Item = {
            ...item,
            id: `${item.id}-${Date.now()}`,
            bagIndex: activeBagIndex,
        };
        setInventory(prev => [...prev, newItem]);
    };

    // Currency Values
    const [gold] = useState(10);
    const [silver] = useState(24);
    const [copper] = useState(0);
    const totalCredits = (gold * 100) + (silver * 10) + copper;

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
        setLevel(char.level || 1);
        setSelectedTraits(char.traits || []);
        setStats(char.stats);
        setSelectedOccupation(char.occupation || null);
        setInventory(char.inventory || []);
        // Recalculate points (approximate)
        const usedTraitPoints = (char.traits || []).reduce((sum, t) => sum + t.cost, 0);
        setTraitPoints(15 - usedTraitPoints);
        const usedStatPoints = Object.values(char.stats).reduce((sum, v) => (sum as number) + (v as number), 0) - 18;
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
        setLevel(1);
        setSelectedTraits([]);
        setTraitPoints(15);
        setStats({ ...DEFAULT_STATS });
        setStatsPoints(18);
        setSelectedOccupation(null);
        setActiveTab("IDENTITY");
        // Also reset inventory to fresh mock data
        const rarities: ItemRarity[] = ["salvaged", "reinforced", "pre-ash", "specialized", "relic", "ashmarked"];
        const mockInventory: Item[] = [];
        const categories = Object.keys(ITEMS_BY_CATEGORY) as (keyof typeof ITEMS_BY_CATEGORY)[];
        categories.forEach((cat) => {
            ITEMS_BY_CATEGORY[cat].forEach((name, i) => {
                mockInventory.push({
                    id: `item-reset-${cat}-${i}-${Date.now()}`,
                    name,
                    category: cat as ItemCategory,
                    rarity: rarities[Math.floor(Math.random() * rarities.length)],
                    cost: Math.floor(Math.random() * 500) + 50,
                    description: `Freshly issued ${cat}.`,
                    bagIndex: Math.floor(Math.random() * 6)
                });
            });
        });
        setInventory(mockInventory);
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
            level: level,
            inventory: inventory
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
                <style>{`
                    @keyframes dustSweep {
                        0% { transform: translateX(-100%) skewX(-20deg); opacity: 0; }
                        20% { opacity: 0.7; }
                        80% { opacity: 0.7; }
                        100% { transform: translateX(180%) skewX(-20deg); opacity: 0; }
                    }
                    @keyframes ashSettling {
                        0% { opacity: 0; transform: scale(0.98); filter: brightness(0.2) contrast(1.2); }
                        100% { opacity: 1; transform: scale(1); filter: brightness(1) contrast(1); }
                    }
                    .animate-dust-sweep {
                        animation: dustSweep 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    }
                    .animate-ash-settling {
                        animation: ashSettling 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                    }
                    @keyframes itemDestroy {
                        0% { transform: translate(0, 0) scale(1); filter: brightness(1); }
                        5% { transform: translate(1px, -1px); }
                        10% { transform: translate(-1px, 1px); filter: brightness(1.2); }
                        15% { transform: translate(1px, 1px); }
                        20% { transform: translate(-1px, -1px); clip-path: polygon(0% 0%, 50% 0%, 50% 50%, 0% 50%); }
                        25% { transform: translate(2px, 0); clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%); }
                        30% { transform: scale(1.02); filter: contrast(1.5); }
                        100% { transform: translateY(15px) scale(0.9) rotate(2deg); opacity: 0; filter: brightness(0.2) grayscale(1); }
                    }
                    @keyframes itemThrow {
                        0% { transform: translateX(0) skewX(0); opacity: 1; filter: blur(0); }
                        20% { transform: translateX(-15px) skewX(10deg); filter: blur(1px); }
                        100% { transform: translateX(300px) skewX(-30deg); opacity: 0; filter: blur(15px) brightness(3); }
                    }
                    @keyframes dustLash {
                        0% { transform: translateX(-100%) skewX(-20deg); opacity: 0; }
                        50% { opacity: 0.8; }
                        100% { transform: translateX(200%) skewX(-20deg); opacity: 0; }
                    }
                    .animate-item-destroy {
                        animation: itemDestroy 0.5s steps(20, end) forwards;
                    }
                    .animate-item-throw {
                        animation: itemThrow 0.6s cubic-bezier(0.44, 0.05, 0.55, 0.95) forwards;
                    }
                    .animate-dust-lash {
                        animation: dustLash 0.6s ease-out forwards;
                    }

                    /* Rarity Styles (Border focused) */
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
                        --rarity-color: #ef4444;
                    }
                    @keyframes permanentRipple {
                        0% { transform: scale(0.95); opacity: 0.1; }
                        50% { transform: scale(1.05); opacity: 0.3; }
                        100% { transform: scale(0.95); opacity: 0.1; }
                    }
                    .ashmarked-permanent-ripple {
                        background: radial-gradient(circle, #991b1b 0%, transparent 70%);
                        animation: permanentRipple 4s ease-in-out infinite;
                    }
                `}</style>

                {/* Left: Saved Characters Sidebar */}
                {activeTab !== "INVENTORY" && activeTab !== "EQUIPEMENT" && (
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
                )}

                {/* Center: Builder Form */}
                <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                    {/* Tab Navigation */}
                    <div className="shrink-0 flex items-center justify-center p-1 bg-[#1e1e1e]/60 border border-white/5 rounded-2xl shadow-lg backdrop-blur-md">
                        <TabBar
                            tabs={["IDENTITY", "TRAITS", "STATS", "OCCUPATION", "SKILLS", "EQUIPEMENT", "CHARACTER_SHEET", "INVENTORY", "SAVE"]}
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
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Level</label>
                                                <input type="number" value={level} onChange={e => setLevel(Math.max(1, parseInt(e.target.value) || 1))} min={1} className="w-full bg-black/50 border border-white/10 text-white px-4 py-2.5 rounded-lg text-sm outline-none focus:border-indigo-500/50 transition-all" />
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

                        {/* ═══ SKILLS TAB ═══ */}
                        {activeTab === "SKILLS" && (
                            <div className="space-y-6">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-xl font-black tracking-[0.2em] text-indigo-400 uppercase">Neural Skills & Combat Masteries</h2>
                                    <div className="h-px flex-1 bg-gradient-to-r from-indigo-500/20 to-transparent" />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className="group bg-black/40 border border-white/5 p-6 rounded-2xl hover:border-indigo-500/30 transition-all flex flex-col gap-4 opacity-50 cursor-not-allowed">
                                            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl grayscale text-white">
                                                🧠
                                            </div>
                                            <div>
                                                <h3 className="text-xs font-black text-white uppercase tracking-wider">Skill Node {i}</h3>
                                                <p className="text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-widest">Locked / Under Construction</p>
                                            </div>
                                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                                <div className="h-full bg-indigo-500/30 w-0" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ═══ EQUIPEMENT TAB ═══ */}
                        {activeTab === "EQUIPEMENT" && (
                            <div className="flex flex-col h-full relative font-mono overflow-hidden py-4 px-2 gap-6 animate-ash-settling" onClick={() => setContextMenu(null)}>
                                <div className="flex-1 flex items-start justify-center overflow-y-auto custom-scrollbar pt-6 pb-12">
                                    <div className="w-full max-w-[1100px] flex items-start justify-center gap-6">

                                        {/* Character Block */}
                                        <div className="flex items-start gap-2">

                                            {/* Left Slots Column */}
                                            <div className="flex flex-col gap-4 shrink-0 pt-16">
                                                {[
                                                    { id: "head", label: "Head" },
                                                    { id: "chest", label: "Chest" },
                                                    { id: "gloves", label: "Gloves" },
                                                ].map(slot => (
                                                    <div key={slot.id} className="flex items-center gap-3 group">
                                                        <div className="w-14 h-14 bg-black/60 border border-white/10 hover:border-[#c2410c]/50 transition-all flex items-center justify-center relative cursor-pointer shadow-lg">
                                                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0)_20%,rgba(0,0,0,0.4)_100%)] pointer-events-none" />
                                                            <div className="absolute top-0.5 left-0.5 w-0.5 h-0.5 bg-white/10" />
                                                            <div className="absolute bottom-0.5 right-0.5 w-0.5 h-0.5 bg-white/10" />
                                                            <span className="text-[10px] text-gray-800 font-black uppercase pointer-events-none">{slot.id.substring(0, 3)}</span>
                                                        </div>
                                                        <div className="w-14 flex flex-col">
                                                            <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest">{slot.label}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Center: Character Preview & Weapons */}
                                            <div className="flex flex-col items-center gap-6 shrink-0">
                                                <div className="w-[240px] h-[420px] bg-black/20 border border-white/5 rounded-[40px] relative shadow-2xl flex items-center justify-center overflow-hidden">
                                                    {/* Gritty Grid Overlay */}
                                                    <div className="absolute inset-0 bg-[linear-gradient(rgba(194,65,12,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(194,65,12,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none opacity-40" />
                                                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#c2410c]/10 to-transparent pointer-events-none" />

                                                    {/* Background Emblem */}
                                                    <div className="absolute w-[80%] h-[80%] opacity-[0.03] flex items-center justify-center grayscale scale-125 rotate-6">
                                                        <svg viewBox="0 0 100 100" fill="currentColor"><path d="M50 0 L100 25 L100 75 L50 100 L0 75 L0 25 Z" /></svg>
                                                    </div>

                                                    {/* Silhouette */}
                                                    <div className="relative z-10 text-[120px] opacity-20 select-none grayscale animate-pulse">👤</div>

                                                    {/* Level & Name Overlay */}
                                                    <div className="absolute top-6 flex flex-col items-center">
                                                        <div className="text-[8px] text-orange-500/70 font-black tracking-[0.3em] uppercase">
                                                            {selectedOccupation?.name || "SOLDAT"} | LVL {level}
                                                        </div>
                                                        <div className="text-[10px] text-white font-black tracking-[0.2em] mt-1 uppercase text-center px-4">{name || "UNNAMED"}</div>
                                                        <div className="w-8 h-0.5 bg-[#c2410c] mt-2 shadow-[0_0_8px_rgba(194,65,12,0.4)]" />
                                                    </div>

                                                    {/* Scanlines effect */}
                                                    <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%)] bg-[size:100%_2px] z-20 opacity-5" />
                                                </div>

                                                {/* Bottom Slots (Weapons) */}
                                                <div className="flex items-start gap-6">
                                                    {[
                                                        { id: "mainHand", label: "Main Hand" },
                                                        { id: "offHand", label: "Off Hand" },
                                                    ].map(slot => (
                                                        <div key={slot.id} className="flex flex-col items-center gap-2">
                                                            <div className="w-16 h-16 bg-black/60 border border-white/10 hover:border-[#c2410c]/50 transition-all flex items-center justify-center relative cursor-pointer shadow-lg">
                                                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0)_20%,rgba(0,0,0,0.4)_100%)] pointer-events-none" />
                                                                <span className="text-[10px] text-gray-800 font-black uppercase pointer-events-none">WPN</span>
                                                            </div>
                                                            <span className="text-[8px] text-gray-500 font-black uppercase tracking-widest text-center">{slot.label}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Right Slots Column */}
                                            <div className="flex flex-col gap-4 shrink-0 pt-16">
                                                <div className="flex flex-col gap-4">
                                                    {[
                                                        { id: "waist", label: "Waist" },
                                                        { id: "legs", label: "Legs" },
                                                    ].map(slot => (
                                                        <div key={slot.id} className="flex items-center gap-3 group">
                                                            <div className="w-14 flex flex-col text-right">
                                                                <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest">{slot.label}</span>
                                                            </div>
                                                            <div className="w-14 h-14 bg-black/60 border border-white/10 hover:border-[#c2410c]/50 transition-all flex items-center justify-center relative cursor-pointer shadow-lg">
                                                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0)_20%,rgba(0,0,0,0.4)_100%)] pointer-events-none" />
                                                                <div className="absolute top-0.5 left-0.5 w-0.5 h-0.5 bg-white/10" />
                                                                <div className="absolute bottom-0.5 right-0.5 w-0.5 h-0.5 bg-white/10" />
                                                                <span className="text-[10px] text-gray-800 font-black uppercase pointer-events-none">{slot.id.substring(0, 3)}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Stats Panel Column */}
                                            <div className="w-[300px] h-[420px] bg-black/40 border border-[#c2410c]/20 p-6 rounded-xl shadow-2xl backdrop-blur-md relative overflow-hidden group flex flex-col">
                                                <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-1.5 h-1.5 bg-[#c2410c] shadow-[0_0_8px_#c2410c]" />
                                                        <span className="text-[11px] text-white font-black uppercase tracking-[0.2em]">STATS</span>
                                                    </div>
                                                </div>

                                                <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-2 min-h-0">
                                                    {/* CHARACTER SECTION */}
                                                    <div className="space-y-2">
                                                        <div className="text-[8px] font-black text-[#c2410c] uppercase tracking-[0.2em] mb-3 opacity-80 flex items-center gap-2">
                                                            <div className="w-1 h-1 bg-[#c2410c]/40" />
                                                            CHARACTER
                                                        </div>
                                                        {[
                                                            { label: "HP (Endurance)", value: 10 + stats.endurance * 5 },
                                                            { label: "AP (Agility)", value: stats.agility <= 5 ? 7 : stats.agility <= 10 ? 10 : stats.agility <= 15 ? 12 : 15 },
                                                            { label: "Crit (Int)", value: `${stats.intelligence * 2}%` },
                                                            { label: "Resist (Wis)", value: `${stats.wisdom * 5}%` },
                                                            { label: "Social (Cha)", value: `${stats.charisma * 3}%` },
                                                        ].map(item => (
                                                            <div key={item.label} className="flex justify-between items-center group/row border-b border-white/[0.02] pb-1">
                                                                <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider group-hover/row:text-orange-400 transition-colors">{item.label}</span>
                                                                <span className="text-[11px] text-white font-black font-mono tracking-widest">{item.value}</span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* COMBAT SECTION */}
                                                    <div className="space-y-2 pt-2">
                                                        <div className="text-[8px] font-black text-[#c2410c] uppercase tracking-[0.2em] mb-3 opacity-80 flex items-center gap-2">
                                                            <div className="w-1 h-1 bg-[#c2410c]/40" />
                                                            COMBAT
                                                        </div>
                                                        {[
                                                            { label: "Strength", value: stats.strength },
                                                            { label: "Min dmg", value: (4 + stats.strength * 0.2).toFixed(1) },
                                                            { label: "Max dmg", value: (5 + stats.strength * 0.4).toFixed(1) },
                                                        ].map(item => (
                                                            <div key={item.label} className="flex justify-between items-center group/row border-b border-white/[0.02] pb-1">
                                                                <span className="text-[9px] text-gray-500 font-black uppercase tracking-wider group-hover/row:text-orange-400 transition-colors">{item.label}</span>
                                                                <span className="text-[11px] text-white font-black font-mono tracking-widest">{item.value}</span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* EQUIPMENT EFFECTS SECTION */}
                                                    <div className="space-y-2 pt-2">
                                                        <div className="text-[8px] font-black text-[#c2410c] uppercase tracking-[0.2em] mb-3 opacity-80 flex items-center gap-2">
                                                            <div className="w-1 h-1 bg-[#c2410c]/40" />
                                                            EQUIPMENT EFFECTS
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <div className="flex justify-between items-center bg-white/[0.02] px-2 py-1.5 rounded border border-white/5">
                                                                <span className="text-[8px] text-orange-400 font-black uppercase">ASHWALKER SET</span>
                                                                <span className="text-[8px] text-gray-500 font-bold uppercase">2/4</span>
                                                            </div>
                                                            <div className="flex flex-col gap-1 px-2">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-[7px] text-gray-500 font-black uppercase italic">Set bonus: +5% Agility</span>
                                                                </div>
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-[7px] text-gray-500 font-black uppercase italic">+10 Max HP (Gloves)</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}


                        {/* ═══ CHARACTER SHEET TAB ═══ */}
                        {activeTab === "CHARACTER_SHEET" &&
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-ash-settling">
                                {/* Column 1: Profile & Stats */}
                                <div className="space-y-6">
                                    <div className="bg-black/40 p-5 border border-white/5 rounded-xl shadow-xl flex gap-6 items-start">
                                        <div className="w-24 h-24 bg-black/60 border border-white/10 flex items-center justify-center text-3xl opacity-50 relative overflow-hidden group">
                                            👤
                                            <div className="absolute inset-0 bg-indigo-500/5 group-hover:bg-indigo-500/10 transition-colors" />
                                        </div>
                                        <div className="space-y-2 flex-1">
                                            <h3 className="text-xl font-black italic tracking-widest text-white uppercase">{name || "UNNAMED UNIT"}</h3>
                                            <div className="flex flex-wrap gap-2">
                                                <div className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/30 rounded text-[9px] font-bold text-indigo-400 uppercase tracking-widest">
                                                    {age} YEARS
                                                </div>
                                                <div className="px-2 py-0.5 bg-gray-500/10 border border-white/10 rounded text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                                                    {gender}
                                                </div>
                                                {selectedOccupation && (
                                                    <div className="px-2 py-0.5 bg-[#c2410c]/10 border border-[#c2410c]/30 rounded text-[9px] font-bold text-[#c2410c] uppercase tracking-widest">
                                                        {selectedOccupation.name}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-black/40 p-5 border border-white/5 rounded-xl shadow-xl">
                                        <h4 className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 bg-indigo-500" />
                                            Neural Attributes
                                        </h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            {(Object.entries(stats) as [keyof Stats, number][]).map(([stat, val]) => (
                                                <div key={stat} className="space-y-1.5">
                                                    <div className="flex justify-between text-[8px] uppercase tracking-widest text-gray-500 font-bold px-1">
                                                        <span>{stat}</span>
                                                        <span className="text-white">{val}</span>
                                                    </div>
                                                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                                        <div
                                                            className="h-full bg-indigo-500/60 shadow-[0_0_8px_rgba(99,102,241,0.3)]"
                                                            style={{ width: `${(val / 10) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Column 2: Traits & Inventory */}
                                <div className="space-y-6">
                                    <div className="bg-black/40 p-5 border border-white/5 rounded-xl shadow-xl">
                                        <h4 className="text-[9px] font-black text-[#c2410c] uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 bg-[#c2410c]" />
                                            Biological Data & Records
                                        </h4>
                                        <div className="space-y-4">
                                            {history ? (
                                                <p className="text-[10px] text-gray-400 italic leading-relaxed border-l-2 border-[#c2410c]/20 pl-4 py-1">
                                                    {history}
                                                </p>
                                            ) : (
                                                <div className="text-[9px] text-gray-600 italic py-2">No historical records available for this unit.</div>
                                            )}

                                            <div className="pt-2">
                                                <div className="text-[8px] text-gray-500 font-black uppercase tracking-widest mb-2">Neural Signatures</div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {selectedTraits.length > 0 ? selectedTraits.map(t => (
                                                        <div
                                                            key={t.id}
                                                            className={`px-2 py-0.5 border rounded text-[8px] font-bold uppercase tracking-wider ${t.type === "positive" ? "bg-blue-900/10 border-blue-500/30 text-blue-400" :
                                                                t.type === "negative" ? "bg-red-900/10 border-red-500/30 text-red-400" :
                                                                    "bg-gray-900/10 border-white/10 text-gray-400"
                                                                }`}
                                                        >
                                                            {t.name}
                                                        </div>
                                                    )) : (
                                                        <div className="text-[8px] text-gray-700 italic">No neural traits active.</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-black/40 p-5 border border-white/5 rounded-xl shadow-xl">
                                        <h4 className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 bg-gray-500" />
                                            Equipment Overview
                                        </h4>
                                        <div className="space-y-2">
                                            <div className="grid grid-cols-4 gap-2">
                                                {[0, 1, 2, 3, 4, 5].map(bagIdx => {
                                                    const bagItems = inventory.filter(i => (i.bagIndex || 0) === bagIdx);
                                                    return (
                                                        <div key={bagIdx} className="p-2 border border-white/5 bg-black/40 rounded flex flex-col items-center gap-1">
                                                            <div className="text-[7px] text-gray-600 font-bold">BAG {bagIdx + 1}</div>
                                                            <div className="text-[10px] text-white font-black">{bagItems.length}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/5">
                                                <span className="text-[8px] text-gray-600 font-black uppercase tracking-widest">Total Valuation</span>
                                                <span className="text-[10px] text-[#c2410c] font-black uppercase tracking-widest">
                                                    {inventory.reduce((sum, item) => sum + item.cost, 0).toLocaleString()} Credits
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        }

                        {/* ═══ INVENTORY TAB ═══ */}
                        {activeTab === "INVENTORY" &&
                            <div id="inventory-view-root" className="flex h-full relative font-mono overflow-hidden py-4 px-2 gap-6" onClick={() => setContextMenu(null)}>
                                {/* Left Sidebar: Item Library */}
                                <aside className="w-[300px] flex flex-col gap-4 shrink-0 bg-black/40 border border-white/5 p-4 rounded-xl shadow-2xl backdrop-blur-md">
                                    <div className="flex flex-col gap-1.5 border-b border-white/5 pb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-3 bg-[#c2410c]" />
                                            <label className="text-[10px] text-white font-black uppercase tracking-[0.2em]">Item Database</label>
                                        </div>
                                        <input
                                            value={librarySearch}
                                            onChange={e => setLibrarySearch(e.target.value)}
                                            placeholder="SEARCH DATABASE..."
                                            className="w-full bg-black/40 border border-white/10 text-[10px] text-gray-400 px-3 py-2 rounded outline-none focus:border-[#c2410c]/40 transition-all font-mono italic"
                                        />
                                    </div>

                                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                                        {allLibraryItems.length > 0 ? allLibraryItems.map(item => (
                                            <button
                                                key={item.id}
                                                onClick={() => addItemToInventory(item)}
                                                className={`w-full text-left p-3 bg-black/20 border border-white/5 rounded-lg flex items-center gap-3 group hover:border-[#c2410c]/40 hover:bg-white/[0.02] transition-all relative overflow-hidden active:scale-95`}
                                            >
                                                <div className="w-10 h-10 bg-black/40 border border-white/10 rounded flex items-center justify-center text-lg relative z-10">
                                                    {item.icon && item.icon.startsWith("/api/icons/") ? (
                                                        <img src={item.icon} className="w-full h-full object-cover p-1" />
                                                    ) : (
                                                        <span>{item.icon || "📦"}</span>
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-0.5 relative z-10 truncate">
                                                    <span className="text-[10px] font-black text-white uppercase tracking-wider truncate">{item.name}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[8px] text-gray-500 font-bold uppercase">{item.category}</span>
                                                        <span className="text-[8px] text-[#c2410c]/80 font-black">{item.cost} CR</span>
                                                    </div>
                                                </div>
                                                {/* Hover Glow */}
                                                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[#c2410c] scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                                            </button>
                                        )) : (
                                            <div className="text-[9px] text-gray-600 italic text-center py-10 opacity-50">No items matching your query.</div>
                                        )}
                                    </div>

                                    <div className="pt-3 border-t border-white/5">
                                        <p className="text-[8px] text-gray-600 font-bold text-center uppercase tracking-widest leading-relaxed">
                                            SELECT AN ITEM TO ADD IT TO YOUR CURRENT BAG AS AN ACTIVE UNIT
                                        </p>
                                    </div>
                                </aside>

                                <div className="flex-1 flex flex-col items-center overflow-y-auto custom-scrollbar">
                                    <div className="w-full max-w-[700px] flex flex-col gap-5">
                                        {/* Top Row: Bags & Money */}
                                        <div className="flex items-end justify-between">
                                            {/* Tactical Bag Slots */}
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-1.5 px-1">
                                                    <div className="w-1 h-2.5 bg-[#c2410c]" />
                                                    <label className="text-[9px] text-gray-500 font-black uppercase tracking-widest">INVENTORY</label>
                                                </div>
                                                <div className="flex gap-1 p-1 bg-black/60 border border-white/5 shadow-xl">
                                                    {[0, 1, 2, 3, 4, 5].map((idx) => (
                                                        <div
                                                            key={idx}
                                                            onClick={() => setActiveBagIndex(idx)}
                                                            className={`w-11 h-11 border flex items-center justify-center relative group cursor-pointer transition-all ${activeBagIndex === idx ? "bg-[#c2410c]/20 border-[#c2410c] shadow-[0_0_10px_rgba(194,65,12,0.1)]" : "bg-white/[0.01] border-white/10 hover:border-[#c2410c]/30 hover:bg-white/[0.03]"}`}
                                                        >
                                                            {idx === 5 ? (
                                                                <svg className="w-5 h-5 text-gray-500 group-hover:text-gray-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                                                </svg>
                                                            ) : (
                                                                <svg className="w-5 h-5 text-gray-600 group-hover:text-gray-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                                                </svg>
                                                            )}

                                                            <div className="absolute bottom-0.5 right-0.5 flex gap-0.5 scale-75">
                                                                <div className={`w-1 h-2.5 ${idx === 3 ? "bg-red-900/40" : "bg-[#c2410c]/40"}`} />
                                                                <div className={`w-1 h-2.5 ${idx === 3 ? "bg-red-600" : "bg-[#c2410c]"}`} />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Currency - Dossier Style */}
                                            <div className="flex flex-col items-end gap-1">
                                                <div className="flex items-center gap-2.5 bg-[#c2410c]/5 border border-[#c2410c]/20 px-3 py-1.5">
                                                    <span className="text-[8px] text-gray-600 font-black uppercase tracking-widest mr-1">CREDITS:</span>
                                                    <span className="text-sm font-black text-[#c2410c]">{totalCredits.toLocaleString()}</span>
                                                </div>
                                                <div className="flex gap-2 pr-1 scale-90">
                                                    <div className="flex items-center gap-1 opacity-50">
                                                        <span className="text-[9px] text-white font-bold">{gold.toString().padStart(2, '0')}</span>
                                                        <div className="w-2 h-2 rounded-full bg-yellow-600" />
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-50">
                                                        <span className="text-[9px] text-white font-bold">{silver.toString().padStart(2, '0')}</span>
                                                        <div className="w-2 h-2 rounded-full bg-slate-400" />
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-50">
                                                        <span className="text-[9px] text-white font-bold">{copper.toString().padStart(2, '0')}</span>
                                                        <div className="w-2 h-2 rounded-full bg-orange-700" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Controls Module */}
                                        <div className="flex flex-col gap-3 bg-black/20 p-3 border border-white/5">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex-1 flex items-center bg-black/60 border border-white/10 focus-within:border-[#c2410c]/30 transition-all">
                                                    <div className="pl-3 text-gray-700">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                        </svg>
                                                    </div>
                                                    <input
                                                        value={inventorySearch}
                                                        onChange={e => setInventorySearch(e.target.value)}
                                                        placeholder="SEARCH DATA..."
                                                        className="w-full bg-transparent px-3 py-2 text-[10px] text-white placeholder:text-gray-800 outline-none uppercase tracking-widest"
                                                    />
                                                </div>

                                                <div className="flex items-center bg-black/40 border border-white/10">
                                                    {(["ALL", "WEAPON", "CONSUMABLE", "RESOURCE", "JUNK", "ARMOR"] as const).map(f => (
                                                        <button
                                                            key={f}
                                                            onClick={() => setInventoryFilter(f)}
                                                            className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all ${inventoryFilter === f ? "bg-[#c2410c] text-white" : "text-gray-600 hover:text-gray-300 hover:bg-white/5"}`}
                                                        >
                                                            {f}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 scale-95 origin-left">
                                                <div className="text-[8px] text-gray-700 uppercase tracking-widest mr-1">SORT:</div>
                                                <button
                                                    onClick={sortByValue}
                                                    className="flex items-center gap-1.5 px-2 py-1 bg-white/[0.02] border border-white/5 text-[8px] text-gray-500 font-bold hover:text-white transition-all uppercase tracking-widest"
                                                >
                                                    VALUE
                                                </button>
                                                <button
                                                    onClick={sortByRarity}
                                                    className="flex items-center gap-1.5 px-2 py-1 bg-white/[0.02] border border-white/5 text-[8px] text-gray-500 font-bold hover:text-white transition-all uppercase tracking-widest"
                                                >
                                                    RARITY
                                                </button>
                                            </div>
                                        </div>

                                        {/* Main Storage Unit */}
                                        <div className="bg-black/40 border border-white/5 p-5 relative overflow-hidden group">
                                            <div className="absolute inset-0 bg-[linear-gradient(rgba(194,65,12,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(194,65,12,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

                                            {/* Bag Switch Dust Sweep Effect */}
                                            <div
                                                key={`dust-${activeBagIndex}`}
                                                className="absolute inset-0 z-30 pointer-events-none animate-dust-sweep"
                                                style={{
                                                    background: 'linear-gradient(90deg, transparent, rgba(161, 98, 7, 0.1), rgba(194, 65, 12, 0.3), rgba(75, 85, 99, 0.5), transparent)',
                                                    width: '200%',
                                                    filter: 'blur(30px) contrast(1.2)'
                                                }}
                                            />

                                            <div
                                                key={activeBagIndex}
                                                className="grid grid-cols-10 gap-2 relative z-10 animate-ash-settling"
                                            >
                                                {Array.from({ length: 40 }).map((_, idx) => {
                                                    const item = filteredInventory[idx];
                                                    const itemRarity = item?.rarity || "none";

                                                    const rarityClasses = {
                                                        salvaged: "rarity-salvaged bg-black/60",
                                                        reinforced: "rarity-reinforced bg-black/60",
                                                        "pre-ash": "rarity-pre-ash bg-black/60",
                                                        specialized: "rarity-specialized bg-black/60",
                                                        relic: "rarity-relic bg-black/60",
                                                        ashmarked: "rarity-ashmarked bg-black/60",
                                                        none: "border-white/5 hover:border-[#c2410c]/40 bg-black/60"
                                                    };

                                                    return (
                                                        <div
                                                            key={idx}
                                                            onClick={() => setSelectedSlotIndex(idx)}
                                                            onMouseEnter={(e) => {
                                                                if (item && !contextMenu) {
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    const root = document.getElementById('inventory-view-root');
                                                                    const rootRect = root?.getBoundingClientRect() || { left: 0, top: 0 };
                                                                    const scrollOffset = root?.scrollTop || 0;

                                                                    setHoverInfo({
                                                                        x: rect.right - rootRect.left + 8,
                                                                        y: rect.top - rootRect.top + scrollOffset,
                                                                        item
                                                                    });
                                                                }
                                                            }}
                                                            onMouseLeave={() => setHoverInfo(null)}
                                                            onContextMenu={(e) => {
                                                                e.preventDefault();
                                                                setHoverInfo(null);
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                const root = document.getElementById('inventory-view-root');
                                                                const rootRect = root?.getBoundingClientRect() || { left: 0, top: 0 };

                                                                const scrollOffset = root?.scrollTop || 0;

                                                                setContextMenu({
                                                                    x: rect.right - rootRect.left + 1,
                                                                    y: rect.top - rootRect.top + scrollOffset,
                                                                    slotIndex: idx
                                                                });
                                                                setSelectedSlotIndex(idx);
                                                            }}
                                                            className={`aspect-square border flex items-center justify-center relative group cursor-pointer transition-all 
                                                            ${selectedSlotIndex === idx ? "border-[#c2410c] shadow-[inset_0_0_8px_rgba(194,65,12,0.1)]" : rarityClasses[itemRarity as keyof typeof rarityClasses]}
                                                            ${animatingSlot?.index === idx && animatingSlot.type === 'destroy' ? 'animate-item-destroy z-50 pointer-events-none' : ''}
                                                            ${animatingSlot?.index === idx && animatingSlot.type === 'throw' ? 'animate-item-throw z-50 pointer-events-none' : ''}
                                                        `}
                                                        >
                                                            <div className="absolute top-0 left-0 w-0.5 h-0.5 bg-white/10" />
                                                            <div className="absolute bottom-0 right-0 w-0.5 h-0.5 bg-white/10" />

                                                            {selectedSlotIndex === idx && (
                                                                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[#c2410c] z-20" />
                                                            )}

                                                            {/* Rarity Bar (Subtle) */}
                                                            {itemRarity !== "none" && (
                                                                <div className={`absolute inset-x-0 bottom-0 h-px opacity-40 z-10 
                                                                ${itemRarity === 'salvaged' ? 'bg-gray-300' :
                                                                        itemRarity === 'reinforced' ? 'bg-[#444444]' :
                                                                            itemRarity === 'pre-ash' ? 'bg-[#1e40af]' :
                                                                                itemRarity === 'specialized' ? 'bg-[#4c1d95]' :
                                                                                    itemRarity === 'relic' ? 'bg-amber-700' :
                                                                                        'bg-red-900'}`}
                                                                />
                                                            )}

                                                            {/* Ashmarked permanent ripple effect */}
                                                            {itemRarity === "ashmarked" && (
                                                                <div className="absolute inset-0 rounded-sm pointer-events-none ashmarked-permanent-ripple opacity-20" />
                                                            )}

                                                            <div className={`text-[8px] font-black transition-colors uppercase relative z-10 ${selectedSlotIndex === idx ? "text-[#c2410c]" : item ? "text-gray-300" : "text-gray-900 group-hover:text-gray-700"}`}>
                                                                {item ? item.name.substring(0, 3) : (idx < 9 ? `0${idx + 1}` : idx + 1)}
                                                            </div>

                                                            {item && (
                                                                <div className="absolute top-0 right-0 p-0.5 flex flex-col items-end gap-0.5 pointer-events-none">
                                                                    <div className="text-[6px] text-gray-600 font-mono">{(item.cost || 0)}</div>
                                                                </div>
                                                            )}

                                                            {/* Fragmentation particles for Destroy effect (Explosion) */}
                                                            {animatingSlot?.index === idx && animatingSlot.type === 'destroy' && (
                                                                <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
                                                                    <div className="absolute inset-0 bg-white/20 animate-ping duration-300" />
                                                                    <div className="w-full h-full border-4 border-[#c2410c]/40 animate-ping delay-100" />
                                                                    {/* Cracking overlays */}
                                                                    <div className="absolute inset-0 opacity-40 mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/pinstriped-suit.png')] animate-pulse" />
                                                                </div>
                                                            )}

                                                            {/* Dust Sweep overlay for Throw effect */}
                                                            {animatingSlot?.index === idx && animatingSlot.type === 'throw' && (
                                                                <div
                                                                    className="absolute inset-0 z-50 pointer-events-none animate-dust-lash overflow-hidden"
                                                                    style={{
                                                                        background: 'linear-gradient(90deg, transparent, rgba(194, 65, 12, 0.6), rgba(75, 85, 99, 0.8), transparent)',
                                                                        width: '300%',
                                                                        filter: 'blur(10px)'
                                                                    }}
                                                                />
                                                            )}

                                                            {/* Glass Shatter effect overlay */}
                                                            {animatingSlot?.index === idx && animatingSlot.type === 'destroy' && (
                                                                <div className="absolute inset-0 z-50 pointer-events-none opacity-60">
                                                                    <svg viewBox="0 0 100 100" className="w-full h-full stroke-[#c2410c] stroke-[0.5] fill-none">
                                                                        <path d="M0,0 L50,55 L100,20 M50,55 L30,100 M50,55 L100,80 M20,0 L50,55 M0,70 L50,55 M50,55 L80,0" />
                                                                        <circle cx="50" cy="55" r="1.5" className="fill-[#c2410c]" />
                                                                    </svg>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%)] bg-[size:100%_2px] z-20 opacity-10" />
                                        </div>
                                    </div>

                                    {/* Context Menu - Positioned Absolutely relative to the tab container */}
                                    {contextMenu && (
                                        <div
                                            className="absolute z-[1000] w-36 bg-[#0d0d0d] border border-[#c2410c]/30 shadow-2xl py-0.5 animate-in fade-in zoom-in-95 duration-75 origin-top-left"
                                            style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <div className="px-3 py-1 border-b border-white/5 mb-0.5 bg-white/[0.02]">
                                                <span className="text-[7px] font-black text-[#c2410c] uppercase tracking-[0.2em]">SLOT {contextMenu.slotIndex! + 1}</span>
                                            </div>
                                            <button className="w-full text-left px-3 py-1.5 text-[9px] text-gray-400 font-bold hover:bg-[#c2410c] hover:text-white transition-all uppercase tracking-widest flex items-center justify-between">
                                                USE <span>»</span>
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (contextMenu.slotIndex !== null) {
                                                        setAnimatingSlot({ index: contextMenu.slotIndex, type: 'throw' });
                                                        setTimeout(() => {
                                                            removeSlotItem(contextMenu.slotIndex!);
                                                            setAnimatingSlot(null);
                                                        }, 600);
                                                        setContextMenu(null);
                                                    }
                                                }}
                                                className="w-full text-left px-3 py-1.5 text-[9px] text-gray-400 font-bold hover:bg-white/5 hover:text-white transition-all uppercase tracking-widest flex items-center justify-between"
                                            >
                                                THROW <span>»</span>
                                            </button>
                                            <div className="h-px bg-white/5 my-0.5" />
                                            <button
                                                onClick={() => {
                                                    if (contextMenu.slotIndex !== null) {
                                                        setAnimatingSlot({ index: contextMenu.slotIndex, type: 'destroy' });
                                                        setTimeout(() => {
                                                            removeSlotItem(contextMenu.slotIndex!);
                                                            setAnimatingSlot(null);
                                                        }, 500);
                                                        setContextMenu(null);
                                                    }
                                                }}
                                                className="w-full text-left px-3 py-1.5 text-[9px] text-red-600 font-black hover:bg-red-600/20 hover:text-white transition-all uppercase tracking-widest flex items-center justify-between"
                                            >
                                                DESTROY <span>»</span>
                                            </button>
                                        </div>
                                    )}

                                    {/* Hover Info Panel - Purely Informational */}
                                    {hoverInfo && !contextMenu && (
                                        <div
                                            className="absolute z-[999] w-44 bg-[#0d0d0d] border border-white/10 shadow-2xl p-3 animate-in fade-in slide-in-from-left-1 duration-200 pointer-events-none"
                                            style={{ top: `${hoverInfo.y}px`, left: `${hoverInfo.x}px` }}
                                        >
                                            <div className="flex flex-col gap-2">
                                                <div className="border-b border-white/5 pb-2">
                                                    <div className="text-[10px] font-black text-white uppercase tracking-wider leading-tight">
                                                        {hoverInfo.item.name}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        <div className={`w-1 h-1 rounded-full ${hoverInfo.item.rarity === 'ashmarked' ? 'bg-red-600 shadow-[0_0_5px_rgba(220,38,38,0.5)]' :
                                                            hoverInfo.item.rarity === 'relic' ? 'bg-amber-500' :
                                                                hoverInfo.item.rarity === 'specialized' ? 'bg-purple-600' :
                                                                    'bg-gray-500'
                                                            }`} />
                                                        <span className="text-[7px] font-bold text-gray-500 uppercase tracking-widest">
                                                            {hoverInfo.item.rarity}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-y-1.5">
                                                    <div className="text-[7px] text-gray-600 font-black uppercase tracking-widest">Type:</div>
                                                    <div className="text-[7px] text-gray-400 font-bold uppercase tracking-widest text-right">
                                                        {hoverInfo.item.category}
                                                    </div>

                                                    <div className="text-[7px] text-gray-600 font-black uppercase tracking-widest">Value:</div>
                                                    <div className="text-[7px] text-[#c2410c] font-black uppercase tracking-widest text-right">
                                                        {hoverInfo.item.cost}C
                                                    </div>
                                                </div>

                                                {hoverInfo.item.description && (
                                                    <div className="mt-1 pt-2 border-t border-white/5">
                                                        <p className="text-[8px] text-gray-500 leading-relaxed italic">
                                                            {hoverInfo.item.description}
                                                        </p>
                                                    </div>
                                                )}

                                                {hoverInfo.item.effects && hoverInfo.item.effects.length > 0 && (
                                                    <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                                                        <div className="text-[6px] font-black text-orange-500/70 uppercase tracking-widest mb-1">Effects:</div>
                                                        {hoverInfo.item.effects.map((eff: any, idx: number) => (
                                                            <div key={idx} className="flex justify-between items-center bg-white/[0.02] px-1.5 py-1 rounded border border-white/5">
                                                                <span className="text-[7px] font-black text-gray-500 uppercase tracking-widest truncate max-w-[80px]">
                                                                    {eff.target}
                                                                </span>
                                                                <span className={`text-[8px] font-black ${eff.value >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                                    {eff.value >= 0 ? '+' : ''}{eff.value}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        }

                        {/* ═══ SAVE TAB ═══ */}
                        {activeTab === "SAVE" &&
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

                                    {/* Simple Status visualization */}
                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                                        {Object.entries(stats).map(([s, v]) => (
                                            <div key={s} className="flex justify-between items-center">
                                                <span className="text-[10px] text-gray-400 uppercase tracking-widest font-black">{s}</span>
                                                <span className="text-sm text-indigo-400 font-bold">{v}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Traits Recap */}
                                {selectedTraits.length > 0 && (
                                    <div className="bg-black/20 p-4 border border-white/5 rounded-xl">
                                        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Imprinted Traits</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedTraits.map(t => (
                                                <span key={t.id} className="px-2 py-1 bg-white/5 rounded text-[10px] text-gray-300 font-bold uppercase tracking-widest border border-white/10">
                                                    {t.icon} {t.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

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
                        }
                    </div>
                </div>
            </div>
        </div>
    );
}
