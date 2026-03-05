import { useState, useEffect } from "react";
import { type GenerationHistoryItem } from "../hooks/useGenerationHistory";
import { Button, Card } from "@ashtrail/ui";

interface FactionsTabProps {
    selectedWorld: GenerationHistoryItem | null;
}

export interface Faction {
    id: string;
    name: string;
    type: "Militaristic" | "Religious" | "Merchant" | "Political" | "Criminal" | "Scientific" | "Other";
    status: "Active" | "Secret" | "Destroyed" | "Emerging";
    structure: "Hierarchical" | "Democratic" | "Tribal" | "Corporate" | "Cult" | "Other";
    powerLevel: number;
    lore: string;
    location: string;
}

export function FactionsTab({ selectedWorld }: FactionsTabProps) {
    const [factions, setFactions] = useState<Faction[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Editor State
    const [editingFaction, setEditingFaction] = useState<Faction | null>(null);

    useEffect(() => {
        if (!selectedWorld) {
            setFactions([]);
            setEditingFaction(null);
            return;
        }

        setIsLoading(true);
        fetch(`http://localhost:8787/api/planet/factions/${selectedWorld.id}`)
            .then(res => res.json())
            .then(data => {
                setFactions(Array.isArray(data) ? data : []);
            })
            .catch(err => console.error("Failed to load factions", err))
            .finally(() => setIsLoading(false));
    }, [selectedWorld]);

    const handleSave = async (updatedFactions: Faction[]) => {
        if (!selectedWorld) return;
        setIsSaving(true);
        try {
            const res = await fetch(`http://localhost:8787/api/planet/factions/${selectedWorld.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedFactions)
            });
            if (res.ok) {
                setFactions(updatedFactions);
            }
        } catch (err) {
            console.error("Failed to save factions", err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddFaction = () => {
        const newFaction: Faction = {
            id: crypto.randomUUID(),
            name: "New Faction",
            type: "Militaristic",
            status: "Active",
            structure: "Hierarchical",
            powerLevel: 50,
            lore: "",
            location: "Unknown",
        };
        setEditingFaction(newFaction);
    };

    const handleSaveFaction = () => {
        if (!editingFaction) return;
        let newFactions = [...factions];
        const existingIndex = newFactions.findIndex(f => f.id === editingFaction.id);
        if (existingIndex >= 0) {
            newFactions[existingIndex] = editingFaction;
        } else {
            newFactions.push(editingFaction);
        }
        handleSave(newFactions);
        setEditingFaction(null);
    };

    const handleDeleteFaction = (id: string) => {
        const newFactions = factions.filter(f => f.id !== id);
        handleSave(newFactions);
        if (editingFaction?.id === id) setEditingFaction(null);
    };

    if (!selectedWorld) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#121820] border border-[#1f2937] rounded-xl opacity-80">
                <div className="text-5xl mb-4">🛡️</div>
                <h3 className="text-xl font-bold tracking-widest text-gray-400 mb-2 uppercase">No World Selected</h3>
                <p className="text-gray-500 max-w-sm text-center">
                    Please select a world from the World tab to begin creating and managing its factions.
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex gap-8 overflow-hidden min-h-0">
            {/* List Panel */}
            <div className="w-[350px] flex flex-col gap-4 bg-[#121820] border border-white/5 rounded-xl p-4 overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
                    <div>
                        <h2 className="text-sm font-bold tracking-widest text-amber-500 uppercase">Factions</h2>
                        <p className="text-[10px] tracking-widest text-gray-500 uppercase">{factions.length} established</p>
                    </div>
                    <Button onClick={handleAddFaction} className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 px-3 py-1 font-bold text-xs">
                        + ADD
                    </Button>
                </div>

                {isLoading ? (
                    <div className="text-center text-gray-500 text-sm py-8 animate-pulse">Loading factions...</div>
                ) : factions.length === 0 ? (
                    <div className="text-center text-gray-600 text-sm py-8 border border-dashed border-white/10 rounded-lg">No factions created yet.</div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {factions.map(faction => (
                            <div
                                key={faction.id}
                                onClick={() => setEditingFaction(faction)}
                                className={`p-3 rounded-lg border cursor-pointer transition-all ${editingFaction?.id === faction.id ? 'bg-amber-500/10 border-amber-500/30' : 'bg-black/20 border-white/5 hover:border-white/20'}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className="text-sm font-bold text-gray-200">{faction.name}</h3>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/50 text-amber-400">{faction.powerLevel} PWR</span>
                                </div>
                                <div className="flex gap-2 text-[10px] tracking-widest text-gray-500 uppercase">
                                    <span>{faction.type}</span>
                                    <span>•</span>
                                    <span>{faction.status}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Editor Panel */}
            <div className="flex-1 bg-[#121820] border border-white/5 rounded-xl flex flex-col relative overflow-hidden">
                {editingFaction ? (
                    <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
                        <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
                            <h2 className="text-lg font-bold tracking-widest text-gray-100 uppercase">Edit Faction</h2>
                            <div className="flex gap-3">
                                <Button onClick={() => handleDeleteFaction(editingFaction.id)} className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30 px-4 py-1.5 text-xs tracking-widest">
                                    DELETE
                                </Button>
                                <Button onClick={handleSaveFaction} disabled={isSaving} className="bg-amber-500 hover:bg-amber-400 text-black border border-amber-400 px-6 py-1.5 font-bold tracking-widest text-xs">
                                    {isSaving ? "SAVING..." : "SAVE CHANGES"}
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mb-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Name</label>
                                <input
                                    type="text"
                                    value={editingFaction.name}
                                    onChange={e => setEditingFaction({ ...editingFaction, name: e.target.value })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-amber-500/50 focus:outline-none text-gray-200 w-full"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">General Location</label>
                                <input
                                    type="text"
                                    value={editingFaction.location}
                                    onChange={e => setEditingFaction({ ...editingFaction, location: e.target.value })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-amber-500/50 focus:outline-none text-gray-200 w-full"
                                    placeholder="e.g. Northern Wastes"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4 mb-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Type</label>
                                <select
                                    value={editingFaction.type}
                                    onChange={e => setEditingFaction({ ...editingFaction, type: e.target.value as any })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-amber-500/50 focus:outline-none text-gray-300 w-full appearance-none"
                                >
                                    {["Militaristic", "Religious", "Merchant", "Political", "Criminal", "Scientific", "Other"].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Structure</label>
                                <select
                                    value={editingFaction.structure}
                                    onChange={e => setEditingFaction({ ...editingFaction, structure: e.target.value as any })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-amber-500/50 focus:outline-none text-gray-300 w-full appearance-none"
                                >
                                    {["Hierarchical", "Democratic", "Tribal", "Corporate", "Cult", "Other"].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Status</label>
                                <select
                                    value={editingFaction.status}
                                    onChange={e => setEditingFaction({ ...editingFaction, status: e.target.value as any })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-amber-500/50 focus:outline-none text-gray-300 w-full appearance-none"
                                >
                                    {["Active", "Secret", "Destroyed", "Emerging"].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Power Level (1-100)</label>
                                <input
                                    type="number"
                                    min="1" max="100"
                                    value={editingFaction.powerLevel}
                                    onChange={e => setEditingFaction({ ...editingFaction, powerLevel: parseInt(e.target.value) || 1 })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-amber-500/50 focus:outline-none text-gray-200 w-full"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 flex-1">
                            <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Lore & History</label>
                            <textarea
                                value={editingFaction.lore}
                                onChange={e => setEditingFaction({ ...editingFaction, lore: e.target.value })}
                                className="bg-[#0a0f14] border border-white/10 rounded-lg p-4 text-sm focus:border-amber-500/50 focus:outline-none text-gray-300 w-full flex-1 min-h-[200px] custom-scrollbar"
                                placeholder="Detail the history, goals, and notable actions of this faction..."
                            />
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-30 pointer-events-none">
                        <div className="text-5xl mb-4">⚙️</div>
                        <p className="font-bold tracking-widest uppercase text-gray-400">Select a Faction to Edit</p>
                    </div>
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
