import { useEffect, useState } from "react";
import { Button, Card, CollapsibleSection } from "@ashtrail/ui";
import { type GenerationHistoryItem, type TemporalityConfig } from "../hooks/useGenerationHistory";
import { DateSelector } from "../components/DateSelector";
import { AshtrailDate, formatAshtrailDate } from "../lib/calendar";

export interface HistoryEvent {
    date: AshtrailDate;
    description: string;
}

interface TimelineTabProps {
    selectedWorld: GenerationHistoryItem | null;
}

export function TimelineTab({ selectedWorld }: TimelineTabProps) {
    const [factions, setFactions] = useState("The Crimson Guard, Nomads of the Ash, The Synthetic Collective");
    const [worldLore, setWorldLore] = useState("The world is a harsh desert wasteland, recovering from a catastrophic AI war centuries ago. Resources are scarce, and water is power.");
    const [areas, setAreas] = useState("The Obsidian Spire (capital), The Rusting Wastes (scavenger territory), Oasis Prime (neutral zone).");
    const [action, setAction] = useState("");
    const [events, setEvents] = useState<HistoryEvent[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isContextCollapsed, setIsContextCollapsed] = useState(false);

    const [temporality, setTemporality] = useState<TemporalityConfig | null>(null);
    const [targetDate, setTargetDate] = useState<AshtrailDate>({ year: 31, era: 'AC', month: 1, day: 1 });

    useEffect(() => {
        if (!selectedWorld) {
            setTemporality(null);
            return;
        }

        fetch(`http://localhost:8787/api/planet/temporality/${selectedWorld.id}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.eras) {
                    setTemporality(data);
                    setTargetDate(data.currentDate);
                } else {
                    setTemporality(null);
                }
            })
            .catch(() => setTemporality(null));
    }, [selectedWorld]);

    const handleGenerate = async () => {
        if (!action.trim()) return;

        setIsGenerating(true);
        try {
            const res = await fetch('http://localhost:8788/api/gm/generate-history-event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context: {
                        factions,
                        worldLore,
                        areas,
                        previousEvents: events.map(e => ({ date: formatAshtrailDate(e.date, temporality || undefined), description: e.description })),
                        temporalityRules: temporality
                            ? `This world uses a custom calendar. Eras are ${temporality.eras.before} and ${temporality.eras.after}. The current date is ${formatAshtrailDate(targetDate, temporality)}.`
                            : "Standard time reckoning."
                    },
                    action
                })
            });

            if (!res.ok) throw new Error("Generation failed");
            const data = await res.json();

            setEvents(prev => [...prev, { date: targetDate, description: data.text }]);
            setAction("");
        } catch (e) {
            console.error("Failed to generate history", e);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="flex-1 flex gap-8 overflow-hidden min-h-0">
            {/* Left Panel: Context & Inputs */}
            <div className="w-[400px] flex flex-col gap-4 overflow-y-auto pr-2 custom-scrollbar">
                <CollapsibleSection
                    title="WORLD CONTEXT"
                    collapsed={isContextCollapsed}
                    onToggle={() => setIsContextCollapsed(!isContextCollapsed)}
                >
                    <div className="flex flex-col gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 tracking-widest">WORLD LORE</label>
                            <textarea
                                className="w-full bg-[#121820] border border-white/10 rounded-lg p-3 text-sm focus:border-red-500/50 focus:outline-none min-h-[100px] text-gray-300 custom-scrollbar"
                                value={worldLore}
                                onChange={e => setWorldLore(e.target.value)}
                                placeholder="Describe the overarching state of the world..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 tracking-widest">FACTIONS IN PLAY</label>
                            <textarea
                                className="w-full bg-[#121820] border border-white/10 rounded-lg p-3 text-sm focus:border-red-500/50 focus:outline-none min-h-[80px] text-gray-300 custom-scrollbar"
                                value={factions}
                                onChange={e => setFactions(e.target.value)}
                                placeholder="List the active factions..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 tracking-widest">AREAS OF INTEREST</label>
                            <textarea
                                className="w-full bg-[#121820] border border-white/10 rounded-lg p-3 text-sm focus:border-red-500/50 focus:outline-none min-h-[80px] text-gray-300 custom-scrollbar"
                                value={areas}
                                onChange={e => setAreas(e.target.value)}
                                placeholder="Key locations or regions..."
                            />
                        </div>
                    </div>
                </CollapsibleSection>

                <Card className="flex flex-col gap-4 bg-[#121820] border-red-500/20 shadow-lg shadow-red-500/5 mt-auto shrink-0">
                    <div className="flex flex-col gap-2 border-b border-white/5 pb-3">
                        <h2 className="text-[10px] font-bold tracking-widest text-red-500 uppercase">
                            NEXT EVENT TARGET DATE
                        </h2>
                        <DateSelector
                            config={temporality || undefined}
                            date={targetDate}
                            onChange={setTargetDate}
                        />
                    </div>
                    <div className="flex flex-col gap-3">
                        <label className="text-xs font-bold text-gray-500 tracking-widest">PROPOSED ACTION</label>
                        <textarea
                            className="w-full bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-red-500/50 focus:outline-none min-h-[100px] text-gray-300 custom-scrollbar"
                            value={action}
                            onChange={e => setAction(e.target.value)}
                            placeholder="Describe what happens or what faction makes a move this month..."
                            disabled={isGenerating}
                        />
                        <Button
                            onClick={handleGenerate}
                            disabled={isGenerating || !action.trim()}
                            className="w-full bg-red-500 hover:bg-red-400 text-black font-bold tracking-widest py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isGenerating ? "GENERATING..." : "SIMULATE MONTH"}
                        </Button>
                    </div>
                </Card>
            </div>

            {/* Right Panel: Interactive Timeline */}
            <div className="flex-1 bg-[#121820] border border-[#1f2937] rounded-xl flex flex-col overflow-hidden relative shadow-2xl">
                <div className="absolute inset-0 z-0 pointer-events-none opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900/40 via-transparent to-transparent" />

                <div className="p-6 border-b border-white/5 bg-[#0a0f14]/50 backdrop-blur-sm z-10 shrink-0">
                    <h2 className="text-lg font-bold tracking-[0.2em] text-gray-200">HISTORICAL TIMELINE</h2>
                    <p className="text-xs text-gray-500 mt-1">THE CHRONICLES OF ASHTRAIL</p>
                </div>

                <div className="flex-1 overflow-y-auto p-8 custom-scrollbar z-10 relative">
                    {events.length > 0 && <div className="absolute left-10 top-8 bottom-8 w-px bg-white/10" />}

                    {events.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                            <div className="text-4xl mb-4">⌛</div>
                            <h3 className="text-lg font-bold tracking-widest text-gray-400 mb-2 uppercase">The Timeline is Empty</h3>
                            <p className="text-sm text-gray-500 max-w-sm">
                                Set up the World Context on the left and input a proposed action to begin generating the history of this world.
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-8 relative">
                            {events.map((event, i) => (
                                <div key={i} className="flex gap-6 relative group animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="shrink-0 w-4 h-4 rounded-full bg-red-500 border-[3px] border-[#121820] shadow-[0_0_10px_rgba(239,68,68,0.5)] z-10 -ml-[7px] mt-1.5 transition-transform group-hover:scale-125" />
                                    <div className="flex-1">
                                        <div className="text-xs font-bold text-red-500 tracking-widest mb-2 flex items-center gap-2">
                                            <span>{formatAshtrailDate(event.date, temporality || undefined)}</span>
                                            <div className="flex-1 h-px bg-white/5" />
                                        </div>
                                        <div className="bg-[#0a0f14] border border-white/5 rounded-xl p-5 shadow-lg group-hover:border-red-500/30 transition-colors">
                                            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                                                {event.description}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {isGenerating && (
                                <div className="flex gap-6 relative opacity-70">
                                    <div className="shrink-0 w-4 h-4 rounded-full bg-gray-500 border-[3px] border-[#121820] z-10 -ml-[7px] mt-1.5 animate-pulse" />
                                    <div className="flex-1">
                                        <div className="text-xs font-bold text-gray-500 tracking-widest mb-2 flex items-center gap-2">
                                            <span>{formatAshtrailDate(targetDate, temporality || undefined)}</span>
                                            <div className="flex-1 h-px bg-white/5" />
                                        </div>
                                        <div className="bg-[#0a0f14] border border-white/5 rounded-xl p-5 flex items-center gap-3">
                                            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                            <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-bounce"></div>
                                            <span className="text-xs text-gray-500 tracking-widest ml-2">SIMULATING...</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
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
