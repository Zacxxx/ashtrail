import { useState, useEffect } from "react";
import { type GenerationHistoryItem } from "../hooks/useGenerationHistory";
import { Button } from "@ashtrail/ui";

interface AreasTabProps {
    selectedWorld: GenerationHistoryItem | null;
}

export interface Area {
    id: string;
    name: string;
    type: "Continent" | "Kingdom" | "Duchy" | "Province" | "Town" | "Ruins";
    status: "Thriving" | "Stable" | "Struggling" | "Abandoned" | "Rebuilding";
    population: number;
    wealth: number;
    lore: string;
    rulingFaction: string;
}

export function AreasTab({ selectedWorld }: AreasTabProps) {
    const [areas, setAreas] = useState<Area[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingArea, setEditingArea] = useState<Area | null>(null);

    useEffect(() => {
        if (!selectedWorld) {
            setAreas([]);
            setEditingArea(null);
            return;
        }

        setIsLoading(true);
        fetch(`http://localhost:8787/api/planet/areas/${selectedWorld.id}`)
            .then(res => res.json())
            .then(data => {
                setAreas(Array.isArray(data) ? data : []);
            })
            .catch(err => console.error("Failed to load areas", err))
            .finally(() => setIsLoading(false));
    }, [selectedWorld]);

    const handleSave = async (updatedAreas: Area[]) => {
        if (!selectedWorld) return;
        setIsSaving(true);
        try {
            const res = await fetch(`http://localhost:8787/api/planet/areas/${selectedWorld.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedAreas)
            });
            if (res.ok) {
                setAreas(updatedAreas);
            }
        } catch (err) {
            console.error("Failed to save areas", err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddArea = () => {
        const newArea: Area = {
            id: crypto.randomUUID(),
            name: "New Region",
            type: "Province",
            status: "Stable",
            population: 1000,
            wealth: 50,
            lore: "",
            rulingFaction: "None",
        };
        setEditingArea(newArea);
    };

    const handleSaveArea = () => {
        if (!editingArea) return;
        let newAreas = [...areas];
        const existingIndex = newAreas.findIndex(a => a.id === editingArea.id);
        if (existingIndex >= 0) {
            newAreas[existingIndex] = editingArea;
        } else {
            newAreas.push(editingArea);
        }
        handleSave(newAreas);
        setEditingArea(null);
    };

    const handleDeleteArea = (id: string) => {
        const newAreas = areas.filter(a => a.id !== id);
        handleSave(newAreas);
        if (editingArea?.id === id) setEditingArea(null);
    };

    if (!selectedWorld) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#121820] border border-[#1f2937] rounded-xl opacity-80">
                <div className="text-5xl mb-4">🗺️</div>
                <h3 className="text-xl font-bold tracking-widest text-gray-400 mb-2 uppercase">No World Selected</h3>
                <p className="text-gray-500 max-w-sm text-center">
                    Please select a world from the World tab to begin documenting its geography and regions.
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
                        <h2 className="text-sm font-bold tracking-widest text-emerald-500 uppercase">Areas</h2>
                        <p className="text-[10px] tracking-widest text-gray-500 uppercase">{areas.length} documented</p>
                    </div>
                    <Button onClick={handleAddArea} className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 px-3 py-1 font-bold text-xs">
                        + ADD
                    </Button>
                </div>

                {isLoading ? (
                    <div className="text-center text-gray-500 text-sm py-8 animate-pulse">Loading areas...</div>
                ) : areas.length === 0 ? (
                    <div className="text-center text-gray-600 text-sm py-8 border border-dashed border-white/10 rounded-lg">No areas documented yet.</div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {areas.map(area => (
                            <div
                                key={area.id}
                                onClick={() => setEditingArea(area)}
                                className={`p-3 rounded-lg border cursor-pointer transition-all ${editingArea?.id === area.id ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-black/20 border-white/5 hover:border-white/20'}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <h3 className="text-sm font-bold text-gray-200">{area.name}</h3>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/50 text-emerald-400">{area.type}</span>
                                </div>
                                <div className="flex gap-2 text-[10px] tracking-widest text-gray-500 uppercase">
                                    <span>{area.status}</span>
                                    <span>•</span>
                                    <span>POP: {area.population.toLocaleString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Editor Panel */}
            <div className="flex-1 bg-[#121820] border border-white/5 rounded-xl flex flex-col relative overflow-hidden">
                {editingArea ? (
                    <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
                        <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
                            <h2 className="text-lg font-bold tracking-widest text-gray-100 uppercase">Edit Area</h2>
                            <div className="flex gap-3">
                                <Button onClick={() => handleDeleteArea(editingArea.id)} className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30 px-4 py-1.5 text-xs tracking-widest">
                                    DELETE
                                </Button>
                                <Button onClick={handleSaveArea} disabled={isSaving} className="bg-emerald-500 hover:bg-emerald-400 text-black border border-emerald-400 px-6 py-1.5 font-bold tracking-widest text-xs">
                                    {isSaving ? "SAVING..." : "SAVE CHANGES"}
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mb-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Name</label>
                                <input
                                    type="text"
                                    value={editingArea.name}
                                    onChange={e => setEditingArea({ ...editingArea, name: e.target.value })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-emerald-500/50 focus:outline-none text-gray-200 w-full"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Ruling Faction (ID / Name)</label>
                                <input
                                    type="text"
                                    value={editingArea.rulingFaction}
                                    onChange={e => setEditingArea({ ...editingArea, rulingFaction: e.target.value })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-emerald-500/50 focus:outline-none text-gray-200 w-full"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4 mb-6">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Type</label>
                                <select
                                    value={editingArea.type}
                                    onChange={e => setEditingArea({ ...editingArea, type: e.target.value as any })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-emerald-500/50 focus:outline-none text-gray-300 w-full appearance-none"
                                >
                                    {["Continent", "Kingdom", "Duchy", "Province", "Town", "Ruins"].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Status</label>
                                <select
                                    value={editingArea.status}
                                    onChange={e => setEditingArea({ ...editingArea, status: e.target.value as any })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-emerald-500/50 focus:outline-none text-gray-300 w-full appearance-none"
                                >
                                    {["Thriving", "Stable", "Struggling", "Abandoned", "Rebuilding"].map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Population</label>
                                <input
                                    type="number"
                                    value={editingArea.population}
                                    onChange={e => setEditingArea({ ...editingArea, population: Math.max(0, parseInt(e.target.value) || 0) })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-emerald-500/50 focus:outline-none text-gray-200 w-full"
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Wealth (1-100)</label>
                                <input
                                    type="number"
                                    min="1" max="100"
                                    value={editingArea.wealth}
                                    onChange={e => setEditingArea({ ...editingArea, wealth: parseInt(e.target.value) || 1 })}
                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-emerald-500/50 focus:outline-none text-gray-200 w-full"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 flex-1">
                            <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Lore & Geography</label>
                            <textarea
                                value={editingArea.lore}
                                onChange={e => setEditingArea({ ...editingArea, lore: e.target.value })}
                                className="bg-[#0a0f14] border border-white/10 rounded-lg p-4 text-sm focus:border-emerald-500/50 focus:outline-none text-gray-300 w-full flex-1 min-h-[200px] custom-scrollbar"
                                placeholder="Describe the physical traits, culture, and notable landmarks of this area..."
                            />
                        </div>
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center opacity-30 pointer-events-none">
                        <div className="text-5xl mb-4">📍</div>
                        <p className="font-bold tracking-widest uppercase text-gray-400">Select an Area to Edit</p>
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
