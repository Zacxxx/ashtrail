import React, { useState } from "react";
import { Character, Trait, Stats } from "@ashtrail/core";
import { Card, Button, Input } from "@ashtrail/ui";
import { User, Sparkles, Wand2, Shield, HeartPulse } from "lucide-react";

interface EventChoice {
    id: string;
    text: string;
    trait_affinity?: string;
    stat_affinity?: string;
}

interface EventData {
    title: string;
    description: string;
    choices: EventChoice[];
}

interface EventOutcome {
    resolution_text: string;
    stat_changes: { target: string; value: number }[];
    new_traits: string[];
    removed_traits: string[];
    starts_combat: boolean;
    starts_quest: boolean;
}

export function EventsView({ characters, onCharacterUpdated }: { characters: Character[], onCharacterUpdated?: () => void }) {
    const [selectedCharacterId, setSelectedCharacterId] = useState<string>(characters[0]?.id || "");
    const [eventType, setEventType] = useState<string>("Random Encounter");
    const [context, setContext] = useState<string>("Traveling through a dense, foggy forest.");

    const [isGenerating, setIsGenerating] = useState(false);
    const [eventData, setEventData] = useState<EventData | null>(null);

    const [customAction, setCustomAction] = useState("");
    const [isResolving, setIsResolving] = useState(false);
    const [outcomeData, setOutcomeData] = useState<EventOutcome | null>(null);

    const character = characters.find(c => c.id === selectedCharacterId);

    const generateEvent = async (isThink: boolean = false) => {
        if (!character) return;
        setIsGenerating(true);
        setOutcomeData(null);

        try {
            const body = {
                characterStats: character.stats,
                characterTraits: character.traits,
                characterAlignment: character.alignment || "Neutral",
                context: context + (isThink ? " (Player is 'Thinking' for a better option)" : ""),
                eventType,
            };

            const res = await fetch("http://127.0.0.1:8787/api/events/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                const data = await res.json();
                try {
                    const parsed = JSON.parse(data.rawJson);
                    setEventData(parsed);
                } catch (e) {
                    console.error("Failed to parse event JSON", e);
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsGenerating(false);
        }
    };

    const resolveEvent = async (action: string) => {
        if (!character || !eventData) return;
        setIsResolving(true);

        try {
            const body = {
                characterStats: character.stats,
                characterTraits: character.traits,
                characterAlignment: character.alignment || "Neutral",
                eventDescription: eventData.description,
                chosenAction: action,
            };

            const res = await fetch("http://127.0.0.1:8787/api/events/resolve", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                const data = await res.json();
                try {
                    const parsed = JSON.parse(data.rawJson);
                    setOutcomeData(parsed);

                    // Apply to GameState
                    if (parsed && character) {
                        const updated = { ...character };

                        // Mod Stats
                        if (parsed.stat_changes) {
                            parsed.stat_changes.forEach((sc: any) => {
                                if (sc.target === 'hp') {
                                    updated.hp = Math.max(0, Math.min(updated.maxHp, updated.hp + sc.value));
                                } else if (sc.target === 'maxHp') {
                                    updated.maxHp += sc.value;
                                } else if (['strength', 'agility', 'intelligence', 'wisdom', 'endurance', 'charisma'].includes(sc.target)) {
                                    (updated.stats as any)[sc.target] += sc.value;
                                }
                            });
                        }

                        // Remove traits
                        if (parsed.removed_traits) {
                            updated.traits = updated.traits.filter(t => !parsed.removed_traits.includes(t.name));
                        }

                        // We can't easily add full traits without the trait DB, so we'll just mock it or skip full trait object creation for now 
                        // In a real implementation we would fetch the trait from GameRegistry and append it.

                        await fetch("http://127.0.0.1:8787/api/data/characters", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(updated)
                        });

                        if (onCharacterUpdated) {
                            onCharacterUpdated();
                        }
                    }

                } catch (e) {
                    console.error("Failed to parse outcome JSON", e);
                }
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsResolving(false);
        }
    };

    if (!character) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-gray-500">
                <p>No characters available. Please create a character first.</p>
            </div>
        );
    }

    return (
        <div className="flex w-full gap-6">
            {/* Left Column: Context & Trigger */}
            <Card className="w-[300px] shrink-0 flex flex-col gap-4 p-4">
                <h2 className="text-sm font-bold text-white mb-2 flex items-center gap-2 uppercase tracking-wider">
                    <User size={16} /> Actor
                </h2>

                <div className="flex flex-col gap-1">
                    <label className="text-xs text-gray-400">Select Character:</label>
                    <select
                        className="bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50"
                        value={selectedCharacterId}
                        onChange={e => setSelectedCharacterId(e.target.value)}
                    >
                        {characters.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex flex-col gap-1 mt-2">
                    <label className="text-xs text-gray-400">Event Type:</label>
                    <select
                        className="bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500/50"
                        value={eventType}
                        onChange={e => setEventType(e.target.value)}
                    >
                        <option value="Random Encounter">Random Encounter</option>
                        <option value="Conversation">Conversation</option>
                        <option value="Location Event">Location Event</option>
                    </select>
                </div>

                <div className="flex flex-col gap-1 mt-2">
                    <label className="text-xs text-gray-400">Context Prompt:</label>
                    <textarea
                        className="bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-white h-24 focus:outline-none focus:border-orange-500/50 resize-none"
                        value={context}
                        onChange={e => setContext(e.target.value)}
                        placeholder="e.g. Navigating treacherous ruins..."
                    />
                </div>

                <Button
                    variant="primary"
                    className="w-full mt-4"
                    onClick={() => generateEvent(false)}
                    disabled={isGenerating}
                >
                    {isGenerating ? <span className="animate-pulse">Generating...</span> : "Trigger Event"}
                </Button>
            </Card>

            {/* Right Column: Event Playback Area */}
            <div className="flex-1 flex flex-col gap-4">
                {!eventData && !isGenerating && (
                    <div className="h-full flex items-center justify-center border border-dashed border-white/10 rounded-xl bg-white/[0.02]">
                        <p className="text-sm text-gray-500 flex items-center gap-2"><Sparkles size={16} className="text-orange-500/50" /> Prompt the AI to start an event</p>
                    </div>
                )}

                {isGenerating && (
                    <div className="h-full flex items-center justify-center border border-white/10 rounded-xl bg-white/5 backdrop-blur-md">
                        <div className="flex flex-col items-center gap-3 animate-pulse">
                            <Wand2 size={32} className="text-orange-400" />
                            <p className="text-sm font-semibold tracking-wide text-orange-200 uppercase">Weaving Narrative...</p>
                        </div>
                    </div>
                )}

                {eventData && !isGenerating && (
                    <Card className="flex flex-col">
                        <div className="p-6 border-b border-white/5 bg-gradient-to-r from-orange-500/10 to-transparent">
                            <h1 className="text-2xl font-black tracking-widest text-white uppercase">{eventData.title}</h1>
                        </div>

                        <div className="p-6 flex flex-col gap-6 text-sm text-gray-300 leading-relaxed">
                            <p>{eventData.description}</p>

                            {!outcomeData && (
                                <div className="flex flex-col gap-3 mt-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-orange-500/80">Available Actions</h3>
                                        <Button variant="secondary" className="text-xs h-7 py-0 px-3 hover:text-cyan-400 border border-transparent hover:border-cyan-500/30" onClick={() => generateEvent(true)} disabled={isResolving}>
                                            <Wand2 size={12} className="mr-1" />
                                            THINK
                                        </Button>
                                    </div>

                                    {eventData.choices.map((choice, i) => (
                                        <Button
                                            key={choice.id || i}
                                            variant="secondary"
                                            className="justify-start text-left h-auto py-3 px-4 relative overflow-hidden group border border-white/5 bg-white/5 hover:border-orange-500/50"
                                            onClick={() => resolveEvent(choice.text)}
                                            disabled={isResolving}
                                        >
                                            <p className="relative z-10 w-full whitespace-normal break-words">{choice.text}</p>
                                            {(choice.trait_affinity || choice.stat_affinity) && (
                                                <div className="mt-2 flex items-center gap-2 relative z-10">
                                                    {choice.trait_affinity && <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">{choice.trait_affinity}</span>}
                                                    {choice.stat_affinity && <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-1.5 py-0.5 rounded">{choice.stat_affinity}</span>}
                                                </div>
                                            )}
                                        </Button>
                                    ))}

                                    <div className="mt-4 flex flex-col gap-2">
                                        <label className="text-xs text-gray-500">Or do something else:</label>
                                        <div className="flex gap-2">
                                            <Input
                                                value={customAction}
                                                onChange={e => setCustomAction(e.target.value)}
                                                placeholder="e.g. Draw my sword and demand a blood toll..."
                                                className="flex-1"
                                                onKeyDown={e => {
                                                    if (e.key === "Enter" && customAction.trim()) {
                                                        resolveEvent(customAction.trim());
                                                    }
                                                }}
                                            />
                                            <Button
                                                variant="primary"
                                                onClick={() => resolveEvent(customAction.trim())}
                                                disabled={!customAction.trim() || isResolving}
                                            >
                                                Submit
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {isResolving && (
                                <div className="py-8 flex flex-col items-center justify-center gap-3 animate-pulse text-cyan-500">
                                    <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                                    <p className="text-xs font-black uppercase tracking-widest">Resolving Outcome...</p>
                                </div>
                            )}

                            {outcomeData && !isResolving && (
                                <div className="mt-4 p-5 bg-[#030508] border border-white/10 rounded-lg flex flex-col gap-4">
                                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-cyan-500">Outcome</h3>
                                    <p className="text-gray-300">{outcomeData.resolution_text}</p>

                                    {(outcomeData.stat_changes?.length > 0 || outcomeData.new_traits?.length > 0 || outcomeData.removed_traits?.length > 0 || outcomeData.starts_combat || outcomeData.starts_quest) && (
                                        <div className="flex flex-wrap text-xs gap-3 mt-2">
                                            {outcomeData.stat_changes?.map((sc, i) => (
                                                <div key={i} className={`flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 border ${sc.value > 0 ? 'border-green-500/30 text-green-400' : 'border-red-500/30 text-red-400'}`}>
                                                    {sc.target === 'hp' ? <HeartPulse size={12} /> : null}
                                                    <span className="font-bold">{sc.target.toUpperCase()}</span>
                                                    <span>{sc.value > 0 ? `+${sc.value}` : sc.value}</span>
                                                </div>
                                            ))}
                                            {outcomeData.new_traits?.map((t, i) => (
                                                <div key={`new-${i}`} className="flex items-center gap-1.5 px-2 py-1 rounded bg-orange-500/10 border border-orange-500/30 text-orange-400">
                                                    <span className="font-bold">Gained:</span> {t}
                                                </div>
                                            ))}
                                            {outcomeData.removed_traits?.map((t, i) => (
                                                <div key={`rem-${i}`} className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 border border-red-500/30 text-red-500">
                                                    <span className="font-bold">Lost:</span> {t}
                                                </div>
                                            ))}
                                            {outcomeData.starts_combat && (
                                                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-900/50 border border-red-500 text-red-200">
                                                    <Shield size={12} /> <span className="font-bold">COMBAT INITIATED</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </Card>
                )}
            </div>
        </div>
    );
}
