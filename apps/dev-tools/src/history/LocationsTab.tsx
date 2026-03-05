import { useState, useEffect, useMemo } from "react";
import { type GenerationHistoryItem } from "../hooks/useGenerationHistory";
import { Button } from "@ashtrail/ui";
import { AiGenerateModal } from "./AiGenerateModal";
import { type HistoryTab } from "./HistoryPage";
import { type Faction } from "./FactionsTab";

interface LocationsTabProps {
    selectedWorld: GenerationHistoryItem | null;
    setActiveTab: (tab: HistoryTab) => void;
}

export interface WorldLocation {
    id: string;
    name: string;
    type: "Urban" | "Rural" | "Wilderness" | "Ruins" | "Dungeon" | "Outpost" | "Fortress" | "Sacred";
    status: "Thriving" | "Stable" | "Struggling" | "Abandoned" | "Rebuilding";
    provinceId: string;       // ID into geography.json province
    provinceName: string;     // Display name
    /** Percentage share of the parent province's stats (0-100) */
    sharePercent: number;
    lore: string;
    rulingFaction: string;
}

// Keep backward compat export so other files that import Area still work
export type Area = WorldLocation;

interface ProvinceInfo {
    id: string;
    name: string;
    population: number;
    wealth: number;
    development: number;
}

export function LocationsTab({ selectedWorld, setActiveTab }: LocationsTabProps) {
    const [locations, setLocations] = useState<WorldLocation[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingLocation, setEditingLocation] = useState<WorldLocation | null>(null);

    const [showGenModal, setShowGenModal] = useState(false);
    const [factions, setFactions] = useState<Faction[]>([]);
    const [provinces, setProvinces] = useState<ProvinceInfo[]>([]);

    useEffect(() => {
        if (!selectedWorld) {
            setLocations([]);
            setFactions([]);
            setProvinces([]);
            setEditingLocation(null);
            return;
        }

        setIsLoading(true);
        Promise.all([
            fetch(`http://localhost:8787/api/planet/locations/${selectedWorld.id}`).then(res => res.json()),
            fetch(`http://localhost:8787/api/planet/factions/${selectedWorld.id}`).then(res => res.json()),
            fetch(`http://localhost:8787/api/planet/geography/${selectedWorld.id}`).then(res => res.json()),
            fetch(`http://localhost:8787/api/planet/worldgen-regions/${selectedWorld.id}`).then(res => res.json()),
        ])
            .then(([locsData, factionsData, geoData, worldgenData]) => {
                setLocations(Array.isArray(locsData) ? locsData : []);
                setFactions(Array.isArray(factionsData) ? factionsData : []);

                // Get province stats: merge saved geography with worldgen data
                const savedGeo: any[] = Array.isArray(geoData) ? geoData : [];
                const wgenGeo: any[] = Array.isArray(worldgenData) ? worldgenData : [];
                const savedMap = new Map(savedGeo.map((r: any) => [r.id, r]));

                const allProvs: ProvinceInfo[] = wgenGeo
                    .filter((r: any) => r.type === "Province")
                    .map((prov: any) => {
                        const saved = savedMap.get(prov.id);
                        return {
                            id: prov.id,
                            name: saved?.name || prov.name || "Unknown Province",
                            population: saved?.population ?? prov.population ?? 0,
                            wealth: saved?.wealth ?? prov.wealth ?? 0,
                            development: saved?.development ?? prov.development ?? 0,
                        };
                    });
                setProvinces(allProvs);
            })
            .catch(err => console.error("Failed to load locations data", err))
            .finally(() => setIsLoading(false));
    }, [selectedWorld]);

    const handleSave = async (updated: WorldLocation[]) => {
        if (!selectedWorld) return;
        setIsSaving(true);
        try {
            const res = await fetch(`http://localhost:8787/api/planet/locations/${selectedWorld.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated)
            });
            if (res.ok) {
                setLocations(updated);
            }
        } catch (err) {
            console.error("Failed to save locations", err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAdd = () => {
        const newLoc: WorldLocation = {
            id: crypto.randomUUID(),
            name: "New Location",
            type: "Urban",
            status: "Stable",
            provinceId: provinces[0]?.id || "",
            provinceName: provinces[0]?.name || "Unknown",
            sharePercent: 10,
            lore: "",
            rulingFaction: "None",
        };
        setEditingLocation(newLoc);
    };

    const handleSaveLocation = () => {
        if (!editingLocation) return;
        let updated = [...locations];
        const idx = updated.findIndex(l => l.id === editingLocation.id);
        if (idx >= 0) {
            updated[idx] = editingLocation;
        } else {
            updated.push(editingLocation);
        }
        handleSave(updated);
        setEditingLocation(null);
    };

    const handleDelete = (id: string) => {
        const updated = locations.filter(l => l.id !== id);
        handleSave(updated);
        if (editingLocation?.id === id) setEditingLocation(null);
    };

    // Compute the parent province stats + remaining share for the editing location
    const parentProvince = useMemo(() => {
        if (!editingLocation) return null;
        return provinces.find(p => p.id === editingLocation.provinceId) || null;
    }, [editingLocation, provinces]);

    const siblingShareTotal = useMemo(() => {
        if (!editingLocation) return 0;
        return locations
            .filter(l => l.provinceId === editingLocation.provinceId && l.id !== editingLocation.id)
            .reduce((s, l) => s + (l.sharePercent || 0), 0);
    }, [editingLocation, locations]);

    const maxAllowedShare = 100 - siblingShareTotal;

    // Derived absolute stats for the current editing location
    const derivedStats = useMemo(() => {
        if (!editingLocation || !parentProvince) return null;
        const pct = (editingLocation.sharePercent || 0) / 100;
        return {
            population: Math.round(parentProvince.population * pct),
            wealth: Math.round(parentProvince.wealth * pct),
            development: Math.round(parentProvince.development * pct),
        };
    }, [editingLocation, parentProvince]);

    // Per-province share totals for list display
    const provinceShareTotals = useMemo(() => {
        const map = new Map<string, number>();
        for (const loc of locations) {
            map.set(loc.provinceId, (map.get(loc.provinceId) || 0) + (loc.sharePercent || 0));
        }
        return map;
    }, [locations]);

    if (!selectedWorld) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#121820] border border-[#1f2937] rounded-xl opacity-80">
                <div className="text-5xl mb-4">📍</div>
                <h3 className="text-xl font-bold tracking-widest text-gray-400 mb-2 uppercase">No World Selected</h3>
                <p className="text-gray-500 max-w-sm text-center">
                    Please select a world to begin documenting its locations and points of interest.
                </p>
            </div>
        );
    }

    return (
        <>
            <div className="flex-1 flex gap-8 overflow-hidden min-h-0">
                {/* List Panel */}
                <div className="w-[350px] flex flex-col gap-4 bg-[#121820] border border-white/5 rounded-xl p-4 overflow-y-auto custom-scrollbar">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
                        <div>
                            <h2 className="text-sm font-bold tracking-widest text-emerald-500 uppercase">Locations</h2>
                            <p className="text-[10px] tracking-widest text-gray-500 uppercase">{locations.length} documented</p>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={() => setShowGenModal(true)} className="bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 px-3 py-1 font-bold text-xs">
                                ✨ GEN
                            </Button>
                            <Button onClick={handleAdd} className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 px-3 py-1 font-bold text-xs">
                                + ADD
                            </Button>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="text-center text-gray-500 text-sm py-8 animate-pulse">Loading locations...</div>
                    ) : locations.length === 0 ? (
                        <div className="text-center text-gray-600 text-sm py-8 border border-dashed border-white/10 rounded-lg">No locations documented yet.</div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {locations.map(loc => {
                                const prov = provinces.find(p => p.id === loc.provinceId);
                                const derivedPop = prov ? Math.round(prov.population * (loc.sharePercent || 0) / 100) : 0;
                                return (
                                    <div
                                        key={loc.id}
                                        onClick={() => setEditingLocation(loc)}
                                        className={`p-3 rounded-lg border cursor-pointer transition-all ${editingLocation?.id === loc.id ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-black/20 border-white/5 hover:border-white/20'}`}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <h3 className="text-sm font-bold text-gray-200">{loc.name}</h3>
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/50 text-emerald-400">{loc.type}</span>
                                        </div>
                                        <div className="flex gap-2 text-[10px] tracking-widest text-gray-500 uppercase">
                                            <span>{loc.provinceName || "No Province"}</span>
                                            <span>•</span>
                                            <span className="text-cyan-400">{loc.sharePercent || 0}%</span>
                                            <span>•</span>
                                            <span>POP {derivedPop.toLocaleString()}</span>
                                            <span>•</span>
                                            <span>{loc.status}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Editor Panel */}
                <div className="flex-1 bg-[#121820] border border-white/5 rounded-xl flex flex-col relative overflow-hidden">
                    {editingLocation ? (
                        <div className="flex-1 flex flex-col p-6 overflow-y-auto custom-scrollbar">
                            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
                                <h2 className="text-lg font-bold tracking-widest text-gray-100 uppercase">Edit Location</h2>
                                <div className="flex gap-3">
                                    <Button onClick={() => handleDelete(editingLocation.id)} className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/30 px-4 py-1.5 text-xs tracking-widest">
                                        DELETE
                                    </Button>
                                    <Button onClick={handleSaveLocation} disabled={isSaving} className="bg-emerald-500 hover:bg-emerald-400 text-black border border-emerald-400 px-6 py-1.5 font-bold tracking-widest text-xs">
                                        {isSaving ? "SAVING..." : "SAVE CHANGES"}
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6 mb-6">
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Name</label>
                                    <input
                                        type="text"
                                        value={editingLocation.name}
                                        onChange={e => setEditingLocation({ ...editingLocation, name: e.target.value })}
                                        className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-emerald-500/50 focus:outline-none text-gray-200 w-full"
                                    />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Parent Province</label>
                                    <select
                                        value={editingLocation.provinceId}
                                        onChange={e => {
                                            const prov = provinces.find(p => p.id === e.target.value);
                                            setEditingLocation({
                                                ...editingLocation,
                                                provinceId: e.target.value,
                                                provinceName: prov?.name || "Unknown"
                                            });
                                        }}
                                        className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-emerald-500/50 focus:outline-none text-gray-300 w-full appearance-none"
                                    >
                                        <option value="">— Select Province —</option>
                                        {provinces.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-4 mb-6">
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Type</label>
                                    <select
                                        value={editingLocation.type}
                                        onChange={e => setEditingLocation({ ...editingLocation, type: e.target.value as any })}
                                        className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-emerald-500/50 focus:outline-none text-gray-300 w-full appearance-none"
                                    >
                                        {["Urban", "Rural", "Wilderness", "Ruins", "Dungeon", "Outpost", "Fortress", "Sacred"].map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Status</label>
                                    <select
                                        value={editingLocation.status}
                                        onChange={e => setEditingLocation({ ...editingLocation, status: e.target.value as any })}
                                        className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-emerald-500/50 focus:outline-none text-gray-300 w-full appearance-none"
                                    >
                                        {["Thriving", "Stable", "Struggling", "Abandoned", "Rebuilding"].map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Share %</label>
                                    <input
                                        type="number"
                                        min={0}
                                        max={maxAllowedShare}
                                        value={editingLocation.sharePercent || 0}
                                        onChange={e => setEditingLocation({
                                            ...editingLocation,
                                            sharePercent: Math.max(0, Math.min(maxAllowedShare, parseInt(e.target.value) || 0))
                                        })}
                                        className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-emerald-500/50 focus:outline-none text-gray-200 w-full"
                                    />
                                    <span className="text-[9px] text-gray-600">
                                        {siblingShareTotal}% used by siblings · max {maxAllowedShare}%
                                    </span>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Ruling Faction</label>
                                    <select
                                        value={editingLocation.rulingFaction}
                                        onChange={e => setEditingLocation({ ...editingLocation, rulingFaction: e.target.value })}
                                        className="bg-[#0a0f14] border border-white/10 rounded-lg p-3 text-sm focus:border-emerald-500/50 focus:outline-none text-gray-300 w-full appearance-none"
                                    >
                                        <option value="None">None</option>
                                        {factions.map(f => (
                                            <option key={f.id} value={f.name}>{f.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Derived Stats from Province */}
                            {parentProvince && derivedStats && (
                                <div className="mb-6 bg-[#0a0f14] border border-white/5 rounded-xl p-4">
                                    <p className="text-[10px] font-bold text-cyan-400 tracking-widest uppercase mb-3">
                                        Derived from {parentProvince.name} — {editingLocation.sharePercent}% share
                                    </p>
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="bg-black/40 border border-white/5 rounded-lg p-3 text-center">
                                            <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest mb-1">Population</p>
                                            <p className="text-lg font-black text-emerald-400">{derivedStats.population.toLocaleString()}</p>
                                            <p className="text-[9px] text-gray-600 mt-1">of {parentProvince.population.toLocaleString()}</p>
                                        </div>
                                        <div className="bg-black/40 border border-white/5 rounded-lg p-3 text-center">
                                            <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest mb-1">Wealth</p>
                                            <p className={`text-lg font-black ${derivedStats.wealth >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                                                {derivedStats.wealth >= 0 ? '+' : ''}{derivedStats.wealth}
                                            </p>
                                            <p className="text-[9px] text-gray-600 mt-1">of {parentProvince.wealth}</p>
                                        </div>
                                        <div className="bg-black/40 border border-white/5 rounded-lg p-3 text-center">
                                            <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest mb-1">Development</p>
                                            <p className={`text-lg font-black ${derivedStats.development >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                                                {derivedStats.development >= 0 ? '+' : ''}{derivedStats.development}
                                            </p>
                                            <p className="text-[9px] text-gray-600 mt-1">of {parentProvince.development}</p>
                                        </div>
                                    </div>
                                    {/* Province allocation bar */}
                                    <div className="mt-3">
                                        <div className="flex items-center justify-between text-[9px] text-gray-600 mb-1">
                                            <span>Province allocation</span>
                                            <span>{provinceShareTotals.get(editingLocation.provinceId) || 0}% allocated</span>
                                        </div>
                                        <div className="w-full h-2 bg-black/60 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full transition-all"
                                                style={{ width: `${Math.min(100, provinceShareTotals.get(editingLocation.provinceId) || 0)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-col gap-2 flex-1 relative">
                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Lore & Description</label>
                                <textarea
                                    value={editingLocation.lore}
                                    onChange={e => setEditingLocation({ ...editingLocation, lore: e.target.value })}
                                    className="bg-[#05080c] border border-white/5 rounded-xl p-5 text-sm focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 focus:outline-none text-gray-300 w-full flex-1 min-h-[200px] custom-scrollbar shadow-inner leading-relaxed transition-all duration-300"
                                    placeholder="Detail the history, notable landmarks, and environment of this location..."
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center opacity-30 pointer-events-none">
                            <div className="text-5xl mb-4">📍</div>
                            <p className="font-bold tracking-widest uppercase text-gray-400">Select a Location to Edit</p>
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

            <AiGenerateModal
                open={showGenModal}
                onClose={() => setShowGenModal(false)}
                entityType="area"
                existingItems={locations as any}
                onConfirm={(items) => {
                    const newLocs = [...locations, ...(items as WorldLocation[])];
                    handleSave(newLocs);
                }}
            />
        </>
    );
}
