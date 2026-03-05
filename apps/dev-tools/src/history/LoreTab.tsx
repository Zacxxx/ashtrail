import { useState } from "react";
import { type GenerationHistoryItem } from "../hooks/useGenerationHistory";
import { Button, Card } from "@ashtrail/ui";

interface LoreTabProps {
    selectedWorld: GenerationHistoryItem | null;
    onSelectWorld: (world: GenerationHistoryItem) => void;
}

interface LoreSnippet {
    id: string;
    targetMonth: number;
    location: string;
    content: string;
}

export function LoreTab({ selectedWorld, onSelectWorld }: LoreTabProps) {
    const [snippets, setSnippets] = useState<LoreSnippet[]>([]);

    // Snippet Draft State
    const [draftMonth, setDraftMonth] = useState<number>(1);
    const [draftLocation, setDraftLocation] = useState("");
    const [draftAction, setDraftAction] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);

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
                        factions: "Unknown Actors",
                        worldLore: selectedWorld.prompt || "An unknown world",
                        areas: draftLocation,
                        previousEvents: snippets.map(s => ({ month: s.targetMonth, description: s.content }))
                    },
                    action: draftAction,
                    month: draftMonth
                })
            });

            if (!res.ok) throw new Error("Generation failed");

            const data = await res.json();

            setSnippets(prev => [...prev, {
                id: crypto.randomUUID(),
                targetMonth: draftMonth,
                location: draftLocation,
                content: data.text
            }]);

            setDraftAction(""); // Reset only prompt actions

        } catch (e) {
            console.error("Failed to generate lore snippet", e);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="flex-1 flex gap-8 overflow-hidden min-h-0">
            {/* Lore Snippets */}
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar flex-grow p-4">
                {!selectedWorld ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-50 bg-[#121820] rounded-xl border border-white/5">
                        <div className="text-4xl mb-4">🌍</div>
                        <h3 className="text-lg font-bold tracking-widest text-gray-400 mb-2 uppercase">Select a World</h3>
                        <p className="text-sm text-gray-500 max-w-sm">
                            Pick a planet from the gallery on the left to begin generating time and space bound lore snippets for this world.
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Editor Card */}
                        <Card className="flex flex-col gap-4 bg-[#121820] border-cyan-500/20 shadow-lg shadow-cyan-500/5 shrink-0">
                            <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                <h2 className="text-sm font-bold tracking-widest text-cyan-500 uppercase">
                                    LORE SNIPPET EDITOR
                                </h2>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-gray-500 tracking-widest">TARGET MONTH (TIME)</label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={draftMonth}
                                        onChange={e => setDraftMonth(parseInt(e.target.value) || 1)}
                                        className="w-full bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-cyan-500/50 focus:outline-none text-gray-300"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-gray-500 tracking-widest">LOCATION (SPACE)</label>
                                    <input
                                        type="text"
                                        value={draftLocation}
                                        onChange={e => setDraftLocation(e.target.value)}
                                        placeholder="e.g. The Spire of Rust"
                                        className="w-full bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-cyan-500/50 focus:outline-none text-gray-300"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col gap-3">
                                <label className="text-xs font-bold text-gray-500 tracking-widest">PROPOSED ACTION / EVENT</label>
                                <textarea
                                    className="w-full bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-cyan-500/50 focus:outline-none min-h-[80px] text-gray-300 custom-scrollbar"
                                    value={draftAction}
                                    onChange={e => setDraftAction(e.target.value)}
                                    placeholder="Describe the isolated event to generate lore for..."
                                    disabled={isGenerating}
                                />
                                <Button
                                    onClick={handleGenerateSnippet}
                                    disabled={isGenerating || !draftAction.trim() || !draftLocation.trim()}
                                    className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold tracking-widest py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isGenerating ? "GENERATING..." : "COMMIT LORE SNIPPET"}
                                </Button>
                            </div>
                        </Card>

                        {/* Snippets Feed */}
                        <div className="flex flex-col gap-4 pb-12">
                            {snippets.map((snippet) => (
                                <Card key={snippet.id} className="bg-[#121820] border-white/5 p-5 hover:border-cyan-500/30 transition-all">
                                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/5">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-bold bg-cyan-500/10 text-cyan-400 px-2 py-1 rounded">M{snippet.targetMonth}</span>
                                            <span className="text-xs font-bold text-gray-300 tracking-widest uppercase">{snippet.location}</span>
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">
                                        {snippet.content}
                                    </p>
                                </Card>
                            ))}
                            {isGenerating && (
                                <Card className="bg-[#121820]/50 border-white/5 p-5 opacity-70 animate-pulse">
                                    <div className="flex items-center gap-3">
                                        <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                        <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                        <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce"></div>
                                        <span className="text-xs text-gray-500 tracking-widest ml-2">WEAVING LORE...</span>
                                    </div>
                                </Card>
                            )}
                        </div>
                    </>
                )}
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(255, 255, 255, 0.1); border-radius: 20px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(255, 255, 255, 0.2); }
            `}</style>
        </div>
    );
}
