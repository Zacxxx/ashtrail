import { useState, useEffect } from "react";
import { type GenerationHistoryItem, type TemporalityConfig } from "../hooks/useGenerationHistory";
import { Button, Card } from "@ashtrail/ui";
import { type Area } from "./LocationsTab";
import { type Faction } from "./FactionsTab";
import { type Character } from "./CharactersTab";
import { DateSelector } from "../components/DateSelector";
import { AshtrailDate, formatAshtrailDate } from "../lib/calendar";
import { AiGenerateModal } from "./AiGenerateModal";

interface LoreTabProps {
    selectedWorld: GenerationHistoryItem | null;
    onSelectWorld: (world: GenerationHistoryItem) => void;
}

interface LoreSnippet {
    id: string;
    date: AshtrailDate;
    location: string;
    content: string;
    involvedFactions?: string[];
    involvedCharacters?: string[];
}

export function LoreTab({ selectedWorld, onSelectWorld }: LoreTabProps) {
    const [snippets, setSnippets] = useState<LoreSnippet[]>([]);

    // Linked Entities Data
    const [areas, setAreas] = useState<Area[]>([]);
    const [factions, setFactions] = useState<Faction[]>([]);
    const [characters, setCharacters] = useState<Character[]>([]);
    const [temporality, setTemporality] = useState<TemporalityConfig | null>(null);

    useEffect(() => {
        if (!selectedWorld) {
            setAreas([]);
            setFactions([]);
            setCharacters([]);
            setTemporality(null);
            return;
        }

        Promise.all([
            fetch(`http://localhost:8787/api/planet/areas/${selectedWorld.id}`).then(res => res.json()),
            fetch(`http://localhost:8787/api/planet/factions/${selectedWorld.id}`).then(res => res.json()),
            fetch(`http://localhost:8787/api/planet/characters/${selectedWorld.id}`).then(res => res.json()),
            fetch(`http://localhost:8787/api/planet/temporality/${selectedWorld.id}`).then(res => res.json())
        ])
            .then(([areasData, factionsData, charsData, temporalityData]) => {
                setAreas(Array.isArray(areasData) ? areasData : []);
                setFactions(Array.isArray(factionsData) ? factionsData : []);
                setCharacters(Array.isArray(charsData) ? charsData : []);

                if (temporalityData && temporalityData.eras) {
                    setTemporality(temporalityData);
                    setDraftDate(temporalityData.currentDate);
                } else {
                    setTemporality(null);
                }
            })
            .catch(err => console.error("Failed to load entities for lore tab", err));
    }, [selectedWorld]);

    // Editor View State
    const [viewingSnippet, setViewingSnippet] = useState<LoreSnippet | null>(null);
    const [isDrafting, setIsDrafting] = useState(false);

    // Snippet Draft State
    const [draftDate, setDraftDate] = useState<AshtrailDate>({ year: 31, era: 'AC', month: 1, day: 1 });
    const [draftLocation, setDraftLocation] = useState("Unknown");
    const [draftFactions, setDraftFactions] = useState<string[]>([]);
    const [draftCharacters, setDraftCharacters] = useState<string[]>([]);
    const [draftAction, setDraftAction] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [showGenModal, setShowGenModal] = useState(false);

    const handleAddLore = () => {
        setIsDrafting(true);
        setViewingSnippet(null);
        setDraftFactions([]);
        setDraftCharacters([]);
    };

    const handleDeleteSnippet = (id: string) => {
        setSnippets(prev => prev.filter(s => s.id !== id));
        if (viewingSnippet?.id === id) setViewingSnippet(null);
    };

    const handleGenerateSnippet = async () => {
        if (!selectedWorld) return;
        if (!draftLocation.trim() || !draftAction.trim()) return;

        setIsGenerating(true);
        try {
            // Reusing the same endpoint, but we pass localized context
            const res = await fetch('http://localhost:8788/api/gm/generate-history-event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context: {
                        dateStr: formatAshtrailDate(draftDate, temporality || undefined),
                        temporalityRules: temporality
                            ? `This world uses a custom calendar. Eras are ${temporality.eras.before} and ${temporality.eras.after}. The current date is ${formatAshtrailDate(draftDate, temporality)}.`
                            : "Standard time reckoning.",
                        factions: draftFactions.length > 0 ? draftFactions.join(", ") : "Unknown Actors",
                        characters: draftCharacters.length > 0 ? draftCharacters.join(", ") : "No specific characters",
                        worldLore: selectedWorld.prompt || "An unknown world",
                        areas: draftLocation,
                        previousEvents: snippets.map(s => ({ date: formatAshtrailDate(s.date, temporality || undefined), description: s.content }))
                    },
                    action: draftAction
                })
            });

            if (!res.ok) throw new Error("Generation failed");

            const data = await res.json();

            const newSnippet: LoreSnippet = {
                id: crypto.randomUUID(),
                date: draftDate,
                location: draftLocation,
                content: data.text,
                involvedFactions: draftFactions,
                involvedCharacters: draftCharacters
            };

            setSnippets(prev => [...prev, newSnippet]);
            setViewingSnippet(newSnippet);
            setIsDrafting(false);
            setDraftAction("");

        } catch (e) {
            console.error("Failed to generate lore snippet", e);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSaveBatch = async (items: any[]) => {
        if (!selectedWorld) return;
        const newSnippets = [...snippets, ...items];
        setSnippets(newSnippets);
        try {
            await fetch(`http://localhost:8787/api/planet/lore-snippets/${selectedWorld.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSnippets)
            });
        } catch (e) {
            console.error("Failed to save lore snippets batch", e);
        }
    };

    const toggleDraftFaction = (name: string) => {
        setDraftFactions(prev => prev.includes(name) ? prev.filter(f => f !== name) : [...prev, name]);
    };

    const toggleDraftCharacter = (name: string) => {
        setDraftCharacters(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
    };

    return (
        <div className="flex-1 flex gap-8 overflow-hidden min-h-0">
            {/* List Panel */}
            <div className="w-[350px] flex flex-col gap-4 bg-[#121820] border border-white/5 rounded-xl p-4 overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
                    <div>
                        <h2 className="text-sm font-bold tracking-widest text-cyan-500 uppercase">Lore Snippets</h2>
                        <p className="text-[10px] tracking-widest text-gray-500 uppercase">{snippets.length} woven</p>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={() => setShowGenModal(true)} className="bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 px-3 py-1 font-bold text-xs">
                            ✨ GEN
                        </Button>
                        <Button onClick={handleAddLore} className="bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20 px-3 py-1 font-bold text-xs">
                            + ADD
                        </Button>
                    </div>
                </div>

                {!selectedWorld ? (
                    <div className="text-center text-gray-600 text-[10px] uppercase font-bold tracking-widest py-8 border border-dashed border-white/10 rounded-lg">Select a world first</div>
                ) : snippets.length === 0 && !isDrafting ? (
                    <div className="text-center text-gray-600 text-[10px] uppercase font-bold tracking-widest py-8 border border-dashed border-white/10 rounded-lg">No lore snippets yet.</div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {snippets.map(snippet => (
                            <div
                                key={snippet.id}
                                onClick={() => { setViewingSnippet(snippet); setIsDrafting(false); }}
                                className={`p-3 rounded-lg border cursor-pointer transition-all ${viewingSnippet?.id === snippet.id && !isDrafting ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-black/20 border-white/5 hover:border-white/20'}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className="text-sm font-bold text-gray-200">{snippet.location}</h3>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/50 text-cyan-400">{formatAshtrailDate(snippet.date, temporality || undefined)}</span>
                                </div>
                                <div className="text-[10px] text-gray-500 truncate">
                                    {snippet.content}
                                </div>
                            </div>
                        ))}
                        {isDrafting && (
                            <div className="p-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 opacity-70">
                                <span className="text-xs text-cyan-500 font-bold tracking-widest">DRAFTING NEW LORE...</span>
                            </div>
                        )}
                        {isGenerating && (
                            <div className="p-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 animate-pulse">
                                <span className="text-xs text-cyan-500 font-bold tracking-widest">WEAVING LORE...</span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Editor/Viewer Panel */}
            <div className="flex-1 bg-[#121820] border border-white/5 rounded-xl flex flex-col relative overflow-hidden">
                {!selectedWorld ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                        <div className="text-4xl mb-4">🌍</div>
                        <h3 className="text-lg font-bold tracking-widest text-gray-400 mb-2 uppercase">Select a World</h3>
                        <p className="text-sm text-gray-500 max-w-sm">
                            Pick a planet from the gallery on the left to begin generating time and space bound lore snippets for this world.
                        </p>
                    </div>
                ) : isDrafting ? (
                    <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
                        <Card className="flex flex-col gap-6 bg-[#0a0f14] border-cyan-500/20 shadow-lg p-6 shrink-0 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500/0 via-cyan-500/50 to-cyan-500/0"></div>

                            <div className="flex items-center justify-between border-b border-white/5 pb-4">
                                <h2 className="text-sm font-black tracking-[0.15em] text-cyan-400 uppercase drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]">
                                    LORE SNIPPET EDITOR
                                </h2>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="flex flex-col gap-2 relative col-span-2 lg:col-span-1">
                                    <label className="text-[10px] font-bold text-gray-400 tracking-widest uppercase mb-1">Target Date</label>
                                    <DateSelector
                                        config={temporality || undefined}
                                        date={draftDate}
                                        onChange={setDraftDate}
                                    />
                                </div>
                                <div className="flex flex-col gap-2 relative col-span-2 lg:col-span-1">
                                    <label className="text-[10px] font-bold text-gray-400 tracking-widest uppercase mb-1">Location (Space)</label>
                                    <select
                                        value={draftLocation}
                                        onChange={e => setDraftLocation(e.target.value)}
                                        className="w-full bg-[#05080c] border border-white/5 rounded-xl p-4 text-sm focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 focus:outline-none text-gray-200 shadow-inner appearance-none transition-all duration-300"
                                    >
                                        <option value="Unknown">Unknown Location</option>
                                        {areas.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2 relative mt-2">
                                <label className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Involved Factions</label>
                                <div className="flex flex-wrap gap-2">
                                    {factions.map(f => (
                                        <button
                                            key={f.id}
                                            onClick={() => toggleDraftFaction(f.name)}
                                            className={`text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${draftFactions.includes(f.name) ? 'bg-purple-500/20 border-purple-500/50 text-purple-300' : 'bg-[#05080c] border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300'}`}
                                        >
                                            {f.name}
                                        </button>
                                    ))}
                                    {factions.length === 0 && <span className="text-[10px] text-gray-600">No factions exist</span>}
                                </div>
                            </div>

                            <div className="flex flex-col gap-2 relative mt-1">
                                <label className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Involved Characters</label>
                                <div className="flex flex-wrap gap-2">
                                    {characters.map(c => (
                                        <button
                                            key={c.id}
                                            onClick={() => toggleDraftCharacter(c.name)}
                                            className={`text-[10px] uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all ${draftCharacters.includes(c.name) ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' : 'bg-[#05080c] border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300'}`}
                                        >
                                            {c.name}
                                        </button>
                                    ))}
                                    {characters.length === 0 && <span className="text-[10px] text-gray-600">No characters exist</span>}
                                </div>
                            </div>

                            <div className="flex flex-col gap-2 relative mt-4">
                                <label className="text-[10px] font-bold text-gray-400 tracking-widest uppercase">Proposed Action / Event</label>
                                <textarea
                                    className="w-full bg-[#05080c] border border-white/5 rounded-xl p-5 text-sm focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 focus:outline-none min-h-[120px] text-gray-300 custom-scrollbar shadow-inner leading-relaxed transition-all duration-300 placeholder-gray-600 resize-none"
                                    value={draftAction}
                                    onChange={e => setDraftAction(e.target.value)}
                                    placeholder="Describe the isolated event to generate lore for..."
                                    disabled={isGenerating}
                                />
                            </div>

                            <div className="mt-2">
                                <Button
                                    onClick={handleGenerateSnippet}
                                    disabled={isGenerating || !draftAction.trim() || !draftLocation.trim()}
                                    className={`w-full py-4 rounded-xl text-[11px] font-black tracking-[0.15em] border transition-all ${isGenerating
                                        ? "bg-white/5 border-white/5 text-gray-500 cursor-wait"
                                        : (!draftAction.trim() || !draftLocation.trim())
                                            ? "bg-white/5 border-white/5 text-gray-600 cursor-not-allowed"
                                            : "bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-400 hover:text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                                        }`}
                                >
                                    {isGenerating ? (
                                        <span className="flex items-center justify-center gap-3">
                                            <span className="inline-block w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                                            WEAVING THE TAPESTRY...
                                        </span>
                                    ) : (
                                        "✨ COMMIT LORE SNIPPET"
                                    )}
                                </Button>
                            </div>
                        </Card>
                    </div>
                ) : viewingSnippet ? (
                    <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
                        <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
                            <h2 className="text-lg font-bold tracking-widest text-gray-100 uppercase">View Lore Snippet</h2>
                            <div className="flex gap-3">
                                <Button onClick={() => handleDeleteSnippet(viewingSnippet.id)} className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30 px-4 py-1.5 text-xs tracking-widest">
                                    DELETE
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mb-6">
                            <div className="flex flex-col gap-2 relative">
                                <label className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">Target Date</label>
                                <div className="bg-[#0a0f14] border border-white/5 rounded-xl p-4 text-sm text-cyan-400 font-mono">
                                    {formatAshtrailDate(viewingSnippet.date, temporality || undefined)}
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 relative">
                                <label className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">Location (Space)</label>
                                <div className="bg-[#0a0f14] border border-white/5 rounded-xl p-4 text-sm text-gray-200">
                                    {viewingSnippet.location}
                                </div>
                            </div>
                        </div>

                        {(viewingSnippet.involvedFactions?.length || viewingSnippet.involvedCharacters?.length) ? (
                            <div className="flex flex-col gap-3 mb-6 bg-[#0a0f14] border border-white/5 rounded-xl p-4">
                                {viewingSnippet.involvedFactions && viewingSnippet.involvedFactions.length > 0 && (
                                    <div className="flex flex-col gap-2">
                                        <span className="text-[9px] font-bold text-gray-500 tracking-widest uppercase">Involved Factions</span>
                                        <div className="flex flex-wrap gap-2">
                                            {viewingSnippet.involvedFactions.map(f => (
                                                <span key={f} className="text-[10px] tracking-widest uppercase bg-purple-500/10 border border-purple-500/30 text-purple-400 px-2 py-1 rounded">{f}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {viewingSnippet.involvedCharacters && viewingSnippet.involvedCharacters.length > 0 && (
                                    <div className="flex flex-col gap-2 mt-2">
                                        <span className="text-[9px] font-bold text-gray-500 tracking-widest uppercase">Involved Characters</span>
                                        <div className="flex flex-wrap gap-2">
                                            {viewingSnippet.involvedCharacters.map(c => (
                                                <span key={c} className="text-[10px] tracking-widest uppercase bg-amber-500/10 border border-amber-500/30 text-amber-400 px-2 py-1 rounded">{c}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : null}

                        <div className="flex flex-col gap-2 flex-1 relative">
                            <label className="text-[10px] font-bold text-gray-500 tracking-widest uppercase">Generated Content</label>
                            <textarea
                                value={viewingSnippet.content}
                                onChange={e => {
                                    const updated = { ...viewingSnippet, content: e.target.value };
                                    setViewingSnippet(updated);
                                    setSnippets(prev => prev.map(s => s.id === updated.id ? updated : s));
                                }}
                                className="bg-[#05080c] border border-white/5 rounded-xl p-6 text-[13px] focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 focus:outline-none text-gray-300 w-full flex-1 min-h-[200px] custom-scrollbar shadow-inner leading-[1.8] transition-all duration-300 resize-none"
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

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(255, 255, 255, 0.1); border-radius: 20px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(255, 255, 255, 0.2); }
            `}</style>
            <AiGenerateModal
                open={showGenModal}
                onClose={() => setShowGenModal(false)}
                entityType="lore"
                existingItems={snippets}
                additionalContext={
                    selectedWorld
                        ? `This world uses a custom calendar. The current date is ${formatAshtrailDate(draftDate, temporality || undefined)}. Eras are ${temporality?.eras.before} / ${temporality?.eras.after}. Factions: ${factions.map(f => f.name).join(", ")}. Areas: ${areas.map(a => a.name).join(", ")}. Characters: ${characters.map(c => c.name).join(", ")}. World Lore: ${selectedWorld.prompt || ""}`
                        : "Standard time reckoning."
                }
                onConfirm={(items) => {
                    handleSaveBatch(items);
                }}
            />
        </div>
    );
}
