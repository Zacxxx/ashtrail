import React, { useState, useCallback, useMemo } from "react";
import { Modal, Slider } from "@ashtrail/ui";
import { Character, GameRegistry, Trait, Occupation, Stats, CharacterType } from "@ashtrail/core";

interface CharacterGeneratorModalProps {
    open: boolean;
    onClose: () => void;
    worldId: string;
    onConfirm: (characters: Character[]) => void;
    worldLore?: string;
    baseTypes: { id: string, name: string }[];
}

export function CharacterGeneratorModal({
    open,
    onClose,
    worldId,
    onConfirm,
    worldLore,
    baseTypes
}: CharacterGeneratorModalProps) {
    const [prompt, setPrompt] = useState("");
    const [count, setCount] = useState(3);
    const [characterType, setCharacterType] = useState<CharacterType>("Human");
    const [faction, setFaction] = useState<string>("");
    const [location, setLocation] = useState<string>("");

    // Dynamic lists from world settings
    const [availableFactions, setAvailableFactions] = useState<{ name: string }[]>([]);
    const [availableLocations, setAvailableLocations] = useState<{ name: string }[]>([]);

    React.useEffect(() => {
        if (!worldId) return;

        // Fetch Factions
        fetch(`http://127.0.0.1:8787/api/planet/factions/${worldId}`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setAvailableFactions(data);
            })
            .catch(console.error);

        // Fetch Locations (using geography endpoint)
        fetch(`http://127.0.0.1:8787/api/planet/geography/${worldId}`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setAvailableLocations(data);
            })
            .catch(console.error);
    }, [worldId]);
    const [sex, setSex] = useState<"Male" | "Female" | "Any">("Any");
    const [minLevel, setMinLevel] = useState(1);
    const [maxLevel, setMaxLevel] = useState(5);

    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previews, setPreviews] = useState<{ entity: any, selected: boolean }[]>([]);
    const [step, setStep] = useState<"config" | "preview">("config");

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        setIsGenerating(true);
        setError(null);

        try {
            const res = await fetch("/api/characters/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    count,
                    prompt: prompt.trim(),
                    worldLore,
                    faction,
                    location,
                    characterType,
                    variance: { sex, minLevel, maxLevel }
                }),
            });

            if (!res.ok) {
                const msg = await res.text();
                throw new Error(msg || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const text: string = data.rawJson || "";
            const parsed = JSON.parse(text);

            if (!Array.isArray(parsed)) throw new Error("Expected JSON array from AI.");

            setPreviews(parsed.map((entity: any) => ({ entity, selected: true })));
            setStep("preview");
        } catch (e: any) {
            setError(e.message || "Generation failed.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleConfirm = useCallback(() => {
        const selected = previews.filter(p => p.selected).map(p => p.entity);
        if (selected.length === 0) return;

        // Resolve traits and occupations against the GameRegistry
        const allTraits = GameRegistry.getAllTraits();
        const allOccupations = GameRegistry.getAllOccupations();

        const formattedCharacters: Character[] = selected.map((s: any) => {
            // Find Traits
            const resolvedTraits: Trait[] = [];
            if (Array.isArray(s.traitNames)) {
                s.traitNames.forEach((tName: string) => {
                    const match = allTraits.find(t => t.name.toLowerCase() === tName.toLowerCase());
                    if (match) resolvedTraits.push(match);
                });
            }

            // Find Occupation
            let resolvedOccupation: Occupation | undefined = undefined;
            if (s.occupationName) {
                resolvedOccupation = allOccupations.find(o => o.name.toLowerCase() === s.occupationName.toLowerCase());
            }

            const stats: Stats = {
                strength: s.stats?.strength || 3,
                agility: s.stats?.agility || 3,
                intelligence: s.stats?.intelligence || 3,
                wisdom: s.stats?.wisdom || 3,
                endurance: s.stats?.endurance || 3,
                charisma: s.stats?.charisma || 3,
            };

            // Estimate HP based on basic formula (from GameRules in a real app, duplicating simple logic here)
            const hp = 10 + stats.endurance * 5;

            return {
                id: `char-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                isNPC: true, // Generated characters are usually NPCs
                type: characterType,
                worldId,
                name: s.name || "Unknown",
                age: s.age || 25,
                gender: s.gender || sex,
                history: s.history || "",
                appearancePrompt: s.backstory || "",
                stats,
                traits: resolvedTraits,
                occupation: resolvedOccupation,
                hp,
                maxHp: hp,
                xp: 0,
                level: s.level || minLevel,
                inventory: [],
                skills: [],
                faction: faction || undefined,
                backstory: s.backstory || "",
            };
        });

        onConfirm(formattedCharacters);
        onClose();
        // keep state around if reopening or clear it?
        setStep("config");
        setPreviews([]);
        setPrompt("");
    }, [previews, onConfirm, onClose, characterType, worldId, sex, minLevel, faction]);


    const toggleSelection = (idx: number) => {
        setPreviews(prev => prev.map((p, i) => i === idx ? { ...p, selected: !p.selected } : p));
    };

    const toggleAll = () => {
        const allSelected = previews.every(p => p.selected);
        setPreviews(prev => prev.map(p => ({ ...p, selected: !allSelected })));
    };

    const selectedCount = previews.filter(p => p.selected).length;

    return (
        <Modal open={open} onClose={() => { setStep("config"); onClose(); }} title="✨ AI CHARACTER GENERATOR" maxWidth="max-w-4xl">
            <div className="p-6 space-y-6">
                {step === "config" && (
                    <>
                        <div className="flex gap-6">
                            {/* Left Col */}
                            <div className="flex-1 space-y-6">
                                <div>
                                    <label className="block text-[9px] font-bold text-gray-500 tracking-widest uppercase mb-2">
                                        Creative Direction & Prompt
                                    </label>
                                    <textarea
                                        value={prompt}
                                        onChange={e => setPrompt(e.target.value)}
                                        rows={4}
                                        placeholder="e.g. 'Veteran scavengers from the northern wastes...' or 'A squad of elite guards...'"
                                        className="w-full bg-[#080d14] border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30 resize-none font-mono leading-relaxed"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[9px] font-bold text-gray-500 tracking-widest uppercase mb-2">Base Type (Species)</label>
                                        <select
                                            value={characterType}
                                            onChange={e => setCharacterType(e.target.value)}
                                            className="w-full bg-[#080d14] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500/50 uppercase"
                                        >
                                            {baseTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-bold text-gray-500 tracking-widest uppercase mb-2">Sex Restriction</label>
                                        <select
                                            value={sex}
                                            onChange={e => setSex(e.target.value as any)}
                                            className="w-full bg-[#080d14] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500/50 uppercase"
                                        >
                                            <option value="Any">Any / Mixed</option>
                                            <option value="Male">Male Only</option>
                                            <option value="Female">Female Only</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[9px] font-bold text-gray-500 tracking-widest uppercase mb-2">Faction Anchor</label>
                                        <select
                                            value={faction}
                                            onChange={e => setFaction(e.target.value)}
                                            className="w-full bg-[#080d14] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500/50"
                                        >
                                            <option value="">-- None / Free --</option>
                                            {availableFactions.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[9px] font-bold text-gray-500 tracking-widest uppercase mb-2">Location Anchor</label>
                                        <select
                                            value={location}
                                            onChange={e => setLocation(e.target.value)}
                                            className="w-full bg-[#080d14] border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-indigo-500/50"
                                        >
                                            <option value="">-- Everywhere --</option>
                                            {availableLocations.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Right Col */}
                            <div className="w-[280px] space-y-6">
                                <div>
                                    <label className="block text-[9px] font-bold text-gray-500 tracking-widest uppercase mb-3">
                                        BATCH COUNT — <span className="text-indigo-400">{count}</span>
                                    </label>
                                    <Slider
                                        label="Count"
                                        min={1} max={10} step={1} value={count}
                                        onChange={setCount}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-bold text-gray-500 tracking-widest uppercase mb-3">
                                        LEVEL RANGE — <span className="text-red-400">{minLevel}</span> to <span className="text-red-400">{maxLevel}</span>
                                    </label>
                                    <div className="flex gap-4">
                                        <div className="flex-1">
                                            <Slider label="Min Level" min={1} max={50} step={1} value={minLevel} onChange={v => { setMinLevel(v); if (v > maxLevel) setMaxLevel(v); }} />
                                        </div>
                                        <div className="flex-1">
                                            <Slider label="Max Level" min={1} max={50} step={1} value={maxLevel} onChange={v => { setMaxLevel(v); if (v < minLevel) setMinLevel(v); }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                                <p className="text-[10px] text-red-400 font-mono">{error}</p>
                            </div>
                        )}

                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || !prompt.trim()}
                            className={`w-full py-4 mt-4 rounded-xl text-[12px] font-black tracking-[0.2em] border transition-all ${isGenerating
                                ? "border-white/5 bg-white/5 text-gray-500 cursor-wait"
                                : (!prompt.trim())
                                    ? "border-white/5 bg-white/5 text-gray-600 cursor-not-allowed"
                                    : `border-indigo-500/30 bg-indigo-500/10 text-indigo-400 hover:brightness-125`
                                }`}
                        >
                            {isGenerating ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="inline-block w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                                    GENERATING BATCH...
                                </span>
                            ) : (
                                `✨ GENERATE ${count} CHARACTERS`
                            )}
                        </button>
                    </>
                )}

                {step === "preview" && (
                    <div className="flex flex-col h-[60vh]">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="text-sm font-bold text-white tracking-widest">REVIEW CHARACTERS</h3>
                                <p className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wider">
                                    {selectedCount} of {previews.length} selected
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={toggleAll}
                                    className="px-3 py-1.5 rounded-lg text-[9px] font-bold tracking-wider border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all"
                                >
                                    {previews.every(p => p.selected) ? "DESELECT ALL" : "SELECT ALL"}
                                </button>
                                <button
                                    onClick={() => setStep("config")}
                                    className="px-3 py-1.5 rounded-lg text-[9px] font-bold tracking-wider border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all"
                                >
                                    ← BACK
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                            {previews.map((preview, idx) => {
                                const entity = preview.entity;
                                return (
                                    <div
                                        key={idx}
                                        onClick={() => toggleSelection(idx)}
                                        className={`flex flex-col gap-2 p-4 rounded-xl border cursor-pointer transition-all ${preview.selected
                                            ? "border-indigo-500/50 bg-indigo-500/5"
                                            : "bg-black/20 border-white/5 opacity-50"
                                            }`}
                                    >
                                        <div className="flex items-start gap-4">
                                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-1 transition-all ${preview.selected ? "border-indigo-500 bg-indigo-500" : "border-white/20"}`}>
                                                {preview.selected && (
                                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                                    <div>
                                                        <h4 className="text-lg font-black text-indigo-300 tracking-wider uppercase">{entity.name}</h4>
                                                        <span className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">
                                                            Lvl {entity.level} · {entity.gender} · {entity.age}yo · {entity.occupationName || "Unemployed"}
                                                        </span>
                                                    </div>
                                                </div>
                                                <p className="text-[11px] text-gray-400 mt-2 italic leading-relaxed">
                                                    "{entity.backstory}"
                                                </p>
                                                <div className="flex justify-between items-end mt-3">
                                                    <div className="flex gap-2">
                                                        {entity.traitNames?.map((t: string) => (
                                                            <span key={t} className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-md text-[9px] font-black uppercase tracking-wider">{t}</span>
                                                        ))}
                                                    </div>
                                                    <div className="text-[9px] font-mono text-gray-500 flex gap-2">
                                                        <span>STR: <span className="text-red-400">{entity.stats?.strength}</span></span>
                                                        <span>AGI: <span className="text-blue-400">{entity.stats?.agility}</span></span>
                                                        <span>INT: <span className="text-purple-400">{entity.stats?.intelligence}</span></span>
                                                        <span>WIS: <span className="text-yellow-400">{entity.stats?.wisdom}</span></span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="pt-4 mt-2 border-t border-white/5 flex">
                            <button
                                onClick={handleConfirm}
                                disabled={selectedCount === 0}
                                className={`w-full py-4 rounded-xl text-[12px] font-black tracking-[0.2em] border transition-all ${selectedCount === 0
                                    ? "border-white/5 bg-white/5 text-gray-600 cursor-not-allowed"
                                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:brightness-125 hover:bg-emerald-500/20"
                                    }`}
                            >
                                ✓ IMPORT {selectedCount} CHARACTERS TO REGISTRY
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}
