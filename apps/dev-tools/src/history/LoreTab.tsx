import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { type GenerationHistoryItem, type TemporalityConfig } from "../hooks/useGenerationHistory";
import { Button, Card } from "@ashtrail/ui";
import { type Area } from "./locationTypes";
import { type Faction } from "./FactionsTab";
import { type Character } from "./CharactersTab";
import { DateSelector } from "../components/DateSelector";
import { AshtrailDate, formatAshtrailDate } from "../lib/calendar";
import { AiGenerateModal } from "./AiGenerateModal";
import type { LorePriority, LoreSnippet } from "../types/lore";

interface LoreTabProps {
    selectedWorld: GenerationHistoryItem | null;
    onSelectWorld: (world: GenerationHistoryItem) => void;
}

const MAIN_LORE_ID = "main-lore";
const DEFAULT_DATE: AshtrailDate = { year: 31, era: "AC", month: 1, day: 1 };
const PRIORITY_OPTIONS: Exclude<LorePriority, "main">[] = ["critical", "major", "minor"];

function normalizeSnippet(input: Partial<LoreSnippet> & { id?: string }): LoreSnippet {
    const priority = input.id === MAIN_LORE_ID || input.priority === "main" ? "main" : (input.priority || "minor");
    return {
        id: input.id || crypto.randomUUID(),
        title: priority === "main" ? "Main Lore" : (input.title || ""),
        priority,
        date: priority === "main" ? null : (input.date || { ...DEFAULT_DATE }),
        location: priority === "main" ? "World" : (input.location || "Unknown"),
        content: input.content || "",
        involvedFactions: input.involvedFactions || [],
        involvedCharacters: input.involvedCharacters || [],
    };
}

function sortSnippets(snippets: LoreSnippet[]) {
    const rank: Record<LorePriority, number> = {
        main: 0,
        critical: 1,
        major: 2,
        minor: 3,
    };
    return [...snippets].sort((a, b) => {
        if (a.id === MAIN_LORE_ID) return -1;
        if (b.id === MAIN_LORE_ID) return 1;
        if (rank[a.priority] !== rank[b.priority]) return rank[a.priority] - rank[b.priority];
        return (a.title || a.location).localeCompare(b.title || b.location);
    });
}

export function LoreTab({ selectedWorld }: LoreTabProps) {
    const [snippets, setSnippets] = useState<LoreSnippet[]>([]);
    const [areas, setAreas] = useState<Area[]>([]);
    const [factions, setFactions] = useState<Faction[]>([]);
    const [characters, setCharacters] = useState<Character[]>([]);
    const [temporality, setTemporality] = useState<TemporalityConfig | null>(null);
    const [selectedSnippetId, setSelectedSnippetId] = useState<string | null>(MAIN_LORE_ID);
    const [isDrafting, setIsDrafting] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [showGenModal, setShowGenModal] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    const [draftTitle, setDraftTitle] = useState("");
    const [draftPriority, setDraftPriority] = useState<Exclude<LorePriority, "main">>("minor");
    const [draftDate, setDraftDate] = useState<AshtrailDate>({ ...DEFAULT_DATE });
    const [draftLocation, setDraftLocation] = useState("Unknown");
    const [draftFactions, setDraftFactions] = useState<string[]>([]);
    const [draftCharacters, setDraftCharacters] = useState<string[]>([]);
    const [draftText, setDraftText] = useState("");

    const isHydratedRef = useRef(false);
    const lastSavedRef = useRef("");

    const selectedSnippet = useMemo(
        () => snippets.find(snippet => snippet.id === selectedSnippetId) || null,
        [selectedSnippetId, snippets],
    );

    useEffect(() => {
        if (!selectedWorld) {
            setSnippets([]);
            setAreas([]);
            setFactions([]);
            setCharacters([]);
            setTemporality(null);
            setSelectedSnippetId(MAIN_LORE_ID);
            isHydratedRef.current = false;
            return;
        }

        let isCancelled = false;
        async function loadWorldLore() {
            setIsLoading(true);
            isHydratedRef.current = false;
            try {
                const [areasRes, factionsRes, charactersRes, temporalityRes, loreRes] = await Promise.all([
                    fetch(`http://localhost:8787/api/planet/locations/${selectedWorld.id}`),
                    fetch(`http://localhost:8787/api/planet/factions/${selectedWorld.id}`),
                    fetch(`http://localhost:8787/api/planet/characters/${selectedWorld.id}`),
                    fetch(`http://localhost:8787/api/planet/temporality/${selectedWorld.id}`),
                    fetch(`http://localhost:8787/api/planet/lore-snippets/${selectedWorld.id}`),
                ]);
                const [areasData, factionsData, charsData, temporalityData, loreData] = await Promise.all([
                    areasRes.json(),
                    factionsRes.json(),
                    charactersRes.json(),
                    temporalityRes.json(),
                    loreRes.json(),
                ]);
                if (isCancelled) return;

                const normalized = sortSnippets((Array.isArray(loreData) ? loreData : []).map(normalizeSnippet));
                setAreas(Array.isArray(areasData) ? areasData : []);
                setFactions(Array.isArray(factionsData) ? factionsData : []);
                setCharacters(Array.isArray(charsData) ? charsData : []);
                setTemporality(temporalityData && temporalityData.eras ? temporalityData : null);
                setSnippets(normalized);
                setSelectedSnippetId(normalized[0]?.id || MAIN_LORE_ID);
                const serialized = JSON.stringify(normalized);
                lastSavedRef.current = serialized;
                isHydratedRef.current = true;
                setSaveState("idle");
            } catch (error) {
                console.error("Failed to load lore data", error);
                setSaveState("error");
            } finally {
                if (!isCancelled) setIsLoading(false);
            }
        }
        loadWorldLore();
        return () => {
            isCancelled = true;
        };
    }, [selectedWorld]);

    useEffect(() => {
        if (!selectedWorld || !isHydratedRef.current) return;
        const serialized = JSON.stringify(snippets);
        if (serialized === lastSavedRef.current) return;

        const timeout = window.setTimeout(async () => {
            setSaveState("saving");
            try {
                const response = await fetch(`http://localhost:8787/api/planet/lore-snippets/${selectedWorld.id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(snippets),
                });
                if (!response.ok) throw new Error("Failed to persist lore");
                const savedData = await response.json();
                const normalized = sortSnippets((Array.isArray(savedData) ? savedData : []).map(normalizeSnippet));
                const normalizedSerialized = JSON.stringify(normalized);
                lastSavedRef.current = normalizedSerialized;
                setSaveState("saved");
                if (normalizedSerialized !== serialized) {
                    setSnippets(normalized);
                }
            } catch (error) {
                console.error("Failed to save lore snippets", error);
                setSaveState("error");
            }
        }, 450);

        return () => window.clearTimeout(timeout);
    }, [snippets, selectedWorld]);

    const resetDraft = () => {
        setDraftTitle("");
        setDraftPriority("minor");
        setDraftDate(temporality?.currentDate || { ...DEFAULT_DATE });
        setDraftLocation("Unknown");
        setDraftFactions([]);
        setDraftCharacters([]);
        setDraftText("");
    };

    const handleAddLore = () => {
        resetDraft();
        setIsDrafting(true);
        setSelectedSnippetId(null);
    };

    const handleSelectSnippet = (snippetId: string) => {
        setIsDrafting(false);
        setSelectedSnippetId(snippetId);
    };

    const handleDeleteSnippet = (id: string) => {
        if (id === MAIN_LORE_ID) return;
        const remaining = snippets.filter(snippet => snippet.id !== id);
        setSnippets(sortSnippets(remaining));
        setSelectedSnippetId(MAIN_LORE_ID);
    };

    const toggleDraftFaction = (name: string) => {
        setDraftFactions(prev => prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]);
    };

    const toggleDraftCharacter = (name: string) => {
        setDraftCharacters(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
    };

    const handleCreateSnippet = () => {
        const created = normalizeSnippet({
            title: draftTitle.trim(),
            priority: draftPriority,
            date: draftDate,
            location: draftLocation,
            content: draftText,
            involvedFactions: draftFactions,
            involvedCharacters: draftCharacters,
        });
        const next = sortSnippets([...snippets, created]);
        setSnippets(next);
        setSelectedSnippetId(created.id);
        setIsDrafting(false);
        resetDraft();
    };

    const handleGenerateSnippet = async () => {
        if (!selectedWorld || !draftText.trim()) return;
        setIsGenerating(true);
        try {
            const response = await fetch("http://127.0.0.1:8788/api/gm/generate-history-event", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    context: {
                        dateStr: formatAshtrailDate(draftDate, temporality || undefined),
                        temporalityRules: temporality
                            ? `This world uses a custom calendar. Eras are ${temporality.eras.before} and ${temporality.eras.after}.`
                            : "Standard time reckoning.",
                        factions: draftFactions.length > 0 ? draftFactions.join(", ") : "Unknown actors",
                        characters: draftCharacters.length > 0 ? draftCharacters.join(", ") : "No specific characters",
                        worldLore: selectedWorld.prompt || "An unknown world",
                        areas: draftLocation,
                        previousEvents: snippets
                            .filter(snippet => snippet.date)
                            .map(snippet => ({
                                date: formatAshtrailDate(snippet.date as AshtrailDate, temporality || undefined),
                                description: snippet.content,
                            })),
                    },
                    action: draftText,
                }),
            });
            if (!response.ok) throw new Error("Generation failed");
            const data = await response.json();
            const created = normalizeSnippet({
                title: draftTitle.trim(),
                priority: draftPriority,
                date: draftDate,
                location: draftLocation,
                content: data.text || "",
                involvedFactions: draftFactions,
                involvedCharacters: draftCharacters,
            });
            const next = sortSnippets([...snippets, created]);
            setSnippets(next);
            setSelectedSnippetId(created.id);
            setIsDrafting(false);
            resetDraft();
        } catch (error) {
            console.error("Failed to generate lore snippet", error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSaveBatch = (items: any[]) => {
        const mapped = items.map(item => normalizeSnippet({
            ...item,
            priority: "minor",
        }));
        const next = sortSnippets([...snippets, ...mapped]);
        setSnippets(next);
        setSelectedSnippetId(mapped[0]?.id || selectedSnippetId);
    };

    const updateSelectedSnippet = (patch: Partial<LoreSnippet>) => {
        if (!selectedSnippet) return;
        const updated = normalizeSnippet({ ...selectedSnippet, ...patch });
        setSnippets(prev => sortSnippets(prev.map(snippet => snippet.id === selectedSnippet.id ? updated : snippet)));
        setSelectedSnippetId(updated.id);
    };

    return (
        <div className="flex-1 flex gap-8 overflow-hidden min-h-0 px-6 pb-6">
            <div className="w-[360px] flex flex-col gap-4 bg-[#121820] border border-white/5 rounded-xl p-4 overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
                    <div>
                        <h2 className="text-sm font-bold tracking-widest text-cyan-500 uppercase">Lore Snippets</h2>
                        <p className="text-[10px] tracking-widest text-gray-500 uppercase">{snippets.length} persisted</p>
                    </div>
                    <div className="flex gap-2">
                        <Link to="/game-master?tab=context" className="px-3 py-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-[10px] font-bold tracking-widest uppercase hover:bg-indigo-500/20 transition-colors">
                            GM
                        </Link>
                        <Button onClick={() => setShowGenModal(true)} className="bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 px-3 py-1 font-bold text-xs">
                            ✨ GEN
                        </Button>
                        <Button onClick={handleAddLore} className="bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20 px-3 py-1 font-bold text-xs">
                            + ADD
                        </Button>
                    </div>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-black/20 border border-white/5 px-3 py-2">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Save Status</span>
                    <span className={`text-[10px] font-bold tracking-widest uppercase ${saveState === "saving" ? "text-amber-400" : saveState === "saved" ? "text-emerald-400" : saveState === "error" ? "text-red-400" : "text-gray-500"}`}>
                        {saveState}
                    </span>
                </div>

                {!selectedWorld ? (
                    <div className="text-center text-gray-600 text-[10px] uppercase font-bold tracking-widest py-8 border border-dashed border-white/10 rounded-lg">Select a world first</div>
                ) : isLoading ? (
                    <div className="text-center text-cyan-400 text-[10px] uppercase font-bold tracking-widest py-8 border border-dashed border-cyan-500/20 rounded-lg animate-pulse">Loading lore...</div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {snippets.map(snippet => (
                            <button
                                key={snippet.id}
                                onClick={() => handleSelectSnippet(snippet.id)}
                                className={`p-3 rounded-lg border text-left transition-all ${selectedSnippetId === snippet.id && !isDrafting ? "bg-cyan-500/10 border-cyan-500/30" : "bg-black/20 border-white/5 hover:border-white/20"}`}
                            >
                                <div className="flex items-start justify-between gap-3 mb-2">
                                    <div>
                                        <div className="text-sm font-bold text-gray-200">{snippet.title || snippet.location}</div>
                                        <div className="text-[10px] uppercase tracking-widest text-gray-500">{snippet.priority}</div>
                                    </div>
                                    {snippet.date ? (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/50 text-cyan-400">
                                            {formatAshtrailDate(snippet.date, temporality || undefined)}
                                        </span>
                                    ) : (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/50 text-indigo-300">CANON</span>
                                    )}
                                </div>
                                <div className="text-[10px] text-gray-500 line-clamp-3">{snippet.content || "Empty lore snippet."}</div>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="flex-1 bg-[#121820] border border-white/5 rounded-xl flex flex-col relative overflow-hidden">
                {!selectedWorld ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                        <div className="text-4xl mb-4">🌍</div>
                        <h3 className="text-lg font-bold tracking-widest text-gray-400 mb-2 uppercase">Select a World</h3>
                        <p className="text-sm text-gray-500 max-w-sm">
                            Pick a world to begin editing canonical lore and ambient snippets for this setting.
                        </p>
                    </div>
                ) : isDrafting ? (
                    <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
                        <Card className="flex flex-col gap-6 bg-[#0a0f14] border-cyan-500/20 shadow-lg p-6 shrink-0 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500/0 via-cyan-500/50 to-cyan-500/0" />
                            <div className="flex items-center justify-between border-b border-white/5 pb-4">
                                <h2 className="text-sm font-black tracking-[0.15em] text-cyan-400 uppercase">Lore Snippet Editor</h2>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                <label className="flex flex-col gap-2">
                                    <span className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Title</span>
                                    <input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} className="w-full bg-[#05080c] border border-white/5 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/50" placeholder="Optional snippet title" />
                                </label>
                                <label className="flex flex-col gap-2">
                                    <span className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Priority</span>
                                    <select value={draftPriority} onChange={e => setDraftPriority(e.target.value as Exclude<LorePriority, "main">)} className="w-full bg-[#05080c] border border-white/5 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/50">
                                        {PRIORITY_OPTIONS.map(priority => <option key={priority} value={priority}>{priority.toUpperCase()}</option>)}
                                    </select>
                                </label>
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Target Date</label>
                                    <DateSelector config={temporality || undefined} date={draftDate} onChange={setDraftDate} />
                                </div>
                                <label className="flex flex-col gap-2">
                                    <span className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Location</span>
                                    <select value={draftLocation} onChange={e => setDraftLocation(e.target.value)} className="w-full bg-[#05080c] border border-white/5 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/50">
                                        <option value="Unknown">Unknown Location</option>
                                        {areas.map(area => <option key={area.id} value={area.name}>{area.name}</option>)}
                                    </select>
                                </label>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Involved Factions</label>
                                <div className="flex flex-wrap gap-2">
                                    {factions.map(faction => (
                                        <button
                                            key={faction.id}
                                            onClick={() => toggleDraftFaction(faction.name)}
                                            className={`text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${draftFactions.includes(faction.name) ? "bg-purple-500/20 border-purple-500/50 text-purple-300" : "bg-[#05080c] border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300"}`}
                                        >
                                            {faction.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex flex-col gap-2">
                                <label className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Involved Characters</label>
                                <div className="flex flex-wrap gap-2">
                                    {characters.map(character => (
                                        <button
                                            key={character.id}
                                            onClick={() => toggleDraftCharacter(character.name)}
                                            className={`text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${draftCharacters.includes(character.name) ? "bg-amber-500/20 border-amber-500/50 text-amber-300" : "bg-[#05080c] border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300"}`}
                                        >
                                            {character.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <label className="flex flex-col gap-2">
                                <span className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Content or AI brief</span>
                                <textarea
                                    value={draftText}
                                    onChange={e => setDraftText(e.target.value)}
                                    className="w-full bg-[#05080c] border border-white/5 rounded-xl p-5 text-sm text-gray-300 focus:outline-none focus:border-cyan-500/50 min-h-[180px] resize-none"
                                    placeholder="Write the lore snippet directly, or describe the event you want the AI to draft."
                                />
                            </label>

                            <div className="flex gap-3">
                                <Button onClick={handleCreateSnippet} disabled={!draftText.trim()} className="flex-1 bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/20">
                                    Save Snippet
                                </Button>
                                <Button onClick={handleGenerateSnippet} disabled={!draftText.trim() || isGenerating} className="flex-1 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20">
                                    {isGenerating ? "Generating..." : "Generate with AI"}
                                </Button>
                            </div>
                        </Card>
                    </div>
                ) : selectedSnippet ? (
                    <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
                        <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
                            <div>
                                <h2 className="text-lg font-bold tracking-widest text-gray-100 uppercase">{selectedSnippet.id === MAIN_LORE_ID ? "Main Lore" : "Lore Snippet"}</h2>
                                <p className="text-[10px] tracking-widest uppercase text-gray-500 mt-1">
                                    {selectedSnippet.id === MAIN_LORE_ID ? "Canonical world ambience used by the GM" : "Autosaved to the selected world folder"}
                                </p>
                            </div>
                            {selectedSnippet.id !== MAIN_LORE_ID && (
                                <Button onClick={() => handleDeleteSnippet(selectedSnippet.id)} className="bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 px-4 py-1.5 text-xs tracking-widest">
                                    Delete
                                </Button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                            <label className="flex flex-col gap-2">
                                <span className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">Title</span>
                                <input
                                    value={selectedSnippet.title || ""}
                                    onChange={e => updateSelectedSnippet({ title: selectedSnippet.id === MAIN_LORE_ID ? "Main Lore" : e.target.value })}
                                    disabled={selectedSnippet.id === MAIN_LORE_ID}
                                    className="bg-[#0a0f14] border border-white/5 rounded-xl p-4 text-sm text-gray-200 disabled:text-gray-500 disabled:bg-black/30 focus:outline-none focus:border-cyan-500/50"
                                />
                            </label>

                            <label className="flex flex-col gap-2">
                                <span className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">Priority</span>
                                <select
                                    value={selectedSnippet.priority}
                                    onChange={e => updateSelectedSnippet({ priority: e.target.value as LorePriority })}
                                    disabled={selectedSnippet.id === MAIN_LORE_ID}
                                    className="bg-[#0a0f14] border border-white/5 rounded-xl p-4 text-sm text-gray-200 disabled:text-gray-500 disabled:bg-black/30 focus:outline-none focus:border-cyan-500/50"
                                >
                                    {selectedSnippet.id === MAIN_LORE_ID ? (
                                        <option value="main">MAIN</option>
                                    ) : (
                                        PRIORITY_OPTIONS.map(priority => <option key={priority} value={priority}>{priority.toUpperCase()}</option>)
                                    )}
                                </select>
                            </label>
                        </div>

                        {selectedSnippet.id !== MAIN_LORE_ID && (
                            <>
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                                    <div className="flex flex-col gap-2">
                                        <label className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">Target Date</label>
                                        <DateSelector config={temporality || undefined} date={selectedSnippet.date || DEFAULT_DATE} onChange={date => updateSelectedSnippet({ date })} />
                                    </div>
                                    <label className="flex flex-col gap-2">
                                        <span className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">Location</span>
                                        <select value={selectedSnippet.location} onChange={e => updateSelectedSnippet({ location: e.target.value })} className="bg-[#0a0f14] border border-white/5 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/50">
                                            <option value="Unknown">Unknown Location</option>
                                            {areas.map(area => <option key={area.id} value={area.name}>{area.name}</option>)}
                                        </select>
                                    </label>
                                </div>

                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
                                    <label className="flex flex-col gap-2">
                                        <span className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">Involved Factions</span>
                                        <input
                                            value={(selectedSnippet.involvedFactions || []).join(", ")}
                                            onChange={e => updateSelectedSnippet({ involvedFactions: e.target.value.split(",").map(value => value.trim()).filter(Boolean) })}
                                            className="bg-[#0a0f14] border border-white/5 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/50"
                                            placeholder="Comma separated faction names"
                                        />
                                    </label>
                                    <label className="flex flex-col gap-2">
                                        <span className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">Involved Characters</span>
                                        <input
                                            value={(selectedSnippet.involvedCharacters || []).join(", ")}
                                            onChange={e => updateSelectedSnippet({ involvedCharacters: e.target.value.split(",").map(value => value.trim()).filter(Boolean) })}
                                            className="bg-[#0a0f14] border border-white/5 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-cyan-500/50"
                                            placeholder="Comma separated character names"
                                        />
                                    </label>
                                </div>
                            </>
                        )}

                        <div className="flex flex-col gap-2 flex-1">
                            <label className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">Content</label>
                            <textarea
                                value={selectedSnippet.content}
                                onChange={e => updateSelectedSnippet({ content: e.target.value })}
                                className="bg-[#05080c] border border-white/5 rounded-xl p-6 text-[13px] focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 focus:outline-none text-gray-300 w-full flex-1 min-h-[280px] custom-scrollbar shadow-inner leading-[1.8] transition-all duration-300 resize-none"
                                placeholder={selectedSnippet.id === MAIN_LORE_ID ? "Write the foundational world lore and ambience here." : "Write the lore snippet here."}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-30 pointer-events-none">
                        <div className="text-5xl mb-4">📜</div>
                        <p className="font-bold tracking-widest uppercase text-gray-400">Select a Snippet or Add New</p>
                    </div>
                )}
            </div>

            <AiGenerateModal
                open={showGenModal}
                onClose={() => setShowGenModal(false)}
                entityType="lore"
                existingItems={snippets}
                additionalContext={
                    selectedWorld
                        ? `World: ${selectedWorld.name || selectedWorld.prompt || "Unknown"}. Current lore priorities: ${snippets.map(snippet => `${snippet.priority}:${snippet.title || snippet.location}`).join(", ")}. Factions: ${factions.map(faction => faction.name).join(", ")}. Areas: ${areas.map(area => area.name).join(", ")}. Characters: ${characters.map(character => character.name).join(", ")}.`
                        : ""
                }
                onConfirm={handleSaveBatch}
            />
        </div>
    );
}
