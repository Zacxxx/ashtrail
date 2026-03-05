import { useState, useEffect } from "react";
import { type GenerationHistoryItem } from "../hooks/useGenerationHistory";
import { Button } from "@ashtrail/ui";
import { ProvinceMapView, type ProvinceLayer } from "../worldgeneration/ProvinceMapView";
import { ProvinceGridEditor, emptyProvinceGrid, type ProvinceGridData } from "./ProvinceGridEditor";
import { AiGenerateModal } from "./AiGenerateModal";
import { type HistoryTab } from "./HistoryPage";
import { type Faction } from "./FactionsTab";

interface AreasTabProps {
    selectedWorld: GenerationHistoryItem | null;
    setActiveTab: (tab: HistoryTab) => void;
}

export interface Area {
    id: string;
    name: string;
    type: "Continent" | "Kingdom" | "Duchy" | "Province" | "Urban" | "Rural" | "Wilderness" | "Ruins";
    status: "Thriving" | "Stable" | "Struggling" | "Abandoned" | "Rebuilding";
    population: number;
    wealth: number;
    development: number;
    lore: string;
    rulingFaction: string;
    gridData?: ProvinceGridData;
}

export function AreasTab({ selectedWorld, setActiveTab }: AreasTabProps) {
    const [areas, setAreas] = useState<Area[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingArea, setEditingArea] = useState<Area | null>(null);

    // Map Interaction State
    const [mapLayer, setMapLayer] = useState<ProvinceLayer>("provinces");
    const [hoveredMapId, setHoveredMapId] = useState<number | null>(null);
    const [selectedMapId, setSelectedMapId] = useState<number | null>(null);
    const [showGenModal, setShowGenModal] = useState(false);
    const [factions, setFactions] = useState<Faction[]>([]);

    useEffect(() => {
        if (!selectedWorld) {
            setAreas([]);
            setFactions([]);
            setEditingArea(null);
            return;
        }

        setIsLoading(true);
        Promise.all([
            fetch(`http://localhost:8787/api/planet/areas/${selectedWorld.id}`).then(res => res.json()),
            fetch(`http://localhost:8787/api/planet/factions/${selectedWorld.id}`).then(res => res.json())
        ])
            .then(([areasData, factionsData]) => {
                setAreas(Array.isArray(areasData) ? areasData : []);
                setFactions(Array.isArray(factionsData) ? factionsData : []);
            })
            .catch(err => console.error("Failed to load areas and factions", err))
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
            development: 0,
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
        <>
            <div className="flex-1 flex gap-8 overflow-hidden min-h-0 relative">
                {/* List Panel */}
                <div className="w-[350px] flex flex-col gap-4 bg-[#121820]/95 backdrop-blur-md border border-white/10 shadow-lg rounded-xl p-4 overflow-y-auto custom-scrollbar z-10 shrink-0">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
                        <div>
                            <h2 className="text-sm font-bold tracking-widest text-emerald-500 uppercase">Areas</h2>
                            <p className="text-[10px] tracking-widest text-gray-500 uppercase">{areas.length} documented</p>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={() => setShowGenModal(true)} className="bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 px-3 py-1 font-bold text-xs">
                                ✨ GEN
                            </Button>
                            <Button onClick={handleAddArea} className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 px-3 py-1 font-bold text-xs">
                                + ADD
                            </Button>
                        </div>
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

                {/* Editor Panel Overlay */}
                <div className={`flex-1 transition-all duration-300 z-10 ${editingArea ? 'translate-x-0 opacity-100 max-w-2xl' : 'translate-x-8 opacity-0 pointer-events-none max-w-0'}`}>
                    {editingArea && (
                        <div className="h-full bg-[#121820]/95 backdrop-blur-md border border-white/10 shadow-2xl rounded-xl flex flex-col relative overflow-hidden p-6 overflow-y-auto custom-scrollbar">
                            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10 shrink-0">
                                <h2 className="text-lg font-bold tracking-widest text-gray-100 uppercase">Edit Area</h2>
                                <div className="flex gap-3">
                                    <Button onClick={() => { setEditingArea(null); setSelectedMapId(null); }} className="bg-gray-500/10 text-gray-400 hover:bg-white/10 border border-gray-500/30 px-4 py-1.5 text-xs tracking-widest">
                                        CLOSE
                                    </Button>
                                    <Button onClick={() => handleDeleteArea(editingArea.id)} className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30 px-4 py-1.5 text-xs tracking-widest">
                                        DELETE
                                    </Button>
                                    <Button onClick={handleSaveArea} disabled={isSaving} className="bg-emerald-500 hover:bg-emerald-400 text-black border border-emerald-400 px-6 py-1.5 font-bold tracking-widest text-xs">
                                        {isSaving ? "SAVING..." : "SAVE CHANGES"}
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6 mb-6 shrink-0">
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
                                    <div className="flex gap-2">
                                        <select
                                            value={editingArea.rulingFaction}
                                            onChange={e => setEditingArea({ ...editingArea, rulingFaction: e.target.value })}
                                            className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-emerald-500/50 focus:outline-none text-gray-300 flex-1 w-full appearance-none"
                                        >
                                            <option value="None">None</option>
                                            {factions.map(f => (
                                                <option key={f.id} value={f.name}>{f.name}</option>
                                            ))}
                                        </select>{editingArea.rulingFaction && editingArea.rulingFaction !== "None" && (
                                            <Button
                                                onClick={() => setActiveTab("factions")}
                                                className="px-4 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded-lg shrink-0"
                                                title="View Faction"
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-5 gap-4 mb-6 shrink-0">
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Type</label>
                                    <select
                                        value={editingArea.type}
                                        onChange={e => setEditingArea({ ...editingArea, type: e.target.value as any })}
                                        className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-emerald-500/50 focus:outline-none text-gray-300 w-full appearance-none"
                                    >
                                        {["Continent", "Kingdom", "Duchy", "Province", "Urban", "Rural", "Wilderness", "Ruins"].map(t => <option key={t} value={t}>{t}</option>)}
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
                                    <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Wealth</label>
                                    <input
                                        type="number"
                                        min="-100" max="100"
                                        value={editingArea.wealth}
                                        onChange={e => setEditingArea({ ...editingArea, wealth: Math.max(-100, Math.min(100, parseInt(e.target.value) || 0)) })}
                                        className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-emerald-500/50 focus:outline-none text-gray-200 w-full"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Dev</label>
                                    <input
                                        type="number"
                                        min="-100" max="100"
                                        value={editingArea.development}
                                        onChange={e => setEditingArea({ ...editingArea, development: Math.max(-100, Math.min(100, parseInt(e.target.value) || 0)) })}
                                        className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-emerald-500/50 focus:outline-none text-gray-200 w-full"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-2 flex-1 relative">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Lore & Geography</label>
                                <textarea
                                    value={editingArea.lore}
                                    onChange={e => setEditingArea({ ...editingArea, lore: e.target.value })}
                                    className="bg-[#05080c] border border-white/5 rounded-xl p-5 text-sm focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 focus:outline-none text-gray-300 w-full flex-1 md:min-h-[120px] custom-scrollbar shadow-inner leading-relaxed transition-all duration-300"
                                    placeholder="Detail the history, notable landmarks, and environment of this area..."
                                />
                            </div>

                            {/* Province Grid Editor for sub-areas */}
                            {editingArea.type === "Province" && (
                                <div className="border-t border-white/10 pt-4 mt-2">
                                    <h3 className="text-xs font-bold text-gray-500 tracking-widest uppercase mb-3">Sub-Area Grid</h3>
                                    <ProvinceGridEditor
                                        data={editingArea.gridData ?? emptyProvinceGrid()}
                                        onChange={(gridData) => setEditingArea({ ...editingArea, gridData })}
                                    />
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Map Background Layer */}
                <div className={`absolute right-0 top-0 bottom-0 z-0 transition-all duration-300 p-2 ${editingArea ? 'left-[380px]' : 'left-[380px]'} w-[calc(100%-380px)]`}>
                    <ProvinceMapView
                        planetId={selectedWorld.id}
                        baseTextureUrl={selectedWorld.textureUrl}
                        geographyTab="inspector"
                        hoveredId={hoveredMapId}
                        selectedId={selectedMapId}
                        onHover={setHoveredMapId}
                        onClick={(id) => {
                            setSelectedMapId(id);
                            if (id !== null) {
                                // When "areas" tab is active, treat clicks as province selection for sub-area editing
                                const effectiveLayer = mapLayer === "areas" ? "provinces" : mapLayer;
                                const targetIdStr = `wgen_${effectiveLayer}_${id}`;
                                const existing = areas.find(a => a.id === targetIdStr);
                                if (existing) {
                                    // If areas tab — ensure gridData exists for the grid editor
                                    if (mapLayer === "areas" && !existing.gridData) {
                                        setEditingArea({ ...existing, gridData: emptyProvinceGrid() });
                                    } else {
                                        setEditingArea(existing);
                                    }
                                } else {
                                    const newArea: Area = {
                                        id: targetIdStr,
                                        name: `${effectiveLayer.toUpperCase()} ${id}`,
                                        type: effectiveLayer === "provinces" ? "Province" : effectiveLayer === "duchies" ? "Duchy" : effectiveLayer === "kingdoms" ? "Kingdom" : "Continent",
                                        status: "Stable",
                                        population: 1000,
                                        wealth: 50,
                                        development: 0,
                                        lore: "",
                                        rulingFaction: "None",
                                        ...(mapLayer === "areas" ? { gridData: emptyProvinceGrid() } : {}),
                                    };
                                    setEditingArea(newArea);
                                }
                            }
                        }}
                        activeLayer={mapLayer}
                        onLayerChange={(layer) => setMapLayer(layer as ProvinceLayer)}
                    />
                </div>

                <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background-color: rgba(255, 255, 255, 0.1); border-radius: 20px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background-color: rgba(255, 255, 255, 0.2); }
            `}</style>
            </div >

            <AiGenerateModal
                open={showGenModal}
                onClose={() => setShowGenModal(false)}
                entityType="area"
                existingItems={areas}
                onConfirm={(items) => {
                    const newAreas = [...areas, ...(items as Area[])];
                    handleSave(newAreas);
                }}
            />
        </>
    );
}
