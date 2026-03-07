import { useState, useEffect } from "react";
import { type GenerationHistoryItem } from "../hooks/useGenerationHistory";
import { Button } from "@ashtrail/ui";
import { ProvinceMapView, type ProvinceLayer } from "../worldgeneration/ProvinceMapView";
import { type Faction } from "./FactionsTab";
import { AiGenerateModal } from "./AiGenerateModal";

interface RegionsTabProps {
    selectedWorld: GenerationHistoryItem | null;
}

export interface GeographyRegion {
    id: string;
    rawId?: number;
    name: string;
    type: "Continent" | "Kingdom" | "Duchy" | "Province";
    status: string;
    population: number;
    wealth: number;
    development: number;
    lore: string;
    rulingFaction: string;
    parentId?: string;
    parentName?: string;
    // Hierarchy IDs from worldgen
    kingdomIds?: number[];
    duchyIds?: number[];
    provinceIds?: number[];
    kingdomId?: number;
    duchyId?: number;
    area?: number;
    biomePrimary?: number;
}

type RegionSubTab = "details" | "lore";

export function RegionsTab({ selectedWorld }: RegionsTabProps) {
    const [regions, setRegions] = useState<GeographyRegion[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedRegion, setSelectedRegion] = useState<GeographyRegion | null>(null);
    const [subTab, setSubTab] = useState<RegionSubTab>("details");

    // Map state
    const [mapLayer, setMapLayer] = useState<ProvinceLayer>("provinces");
    const [hoveredMapId, setHoveredMapId] = useState<number | null>(null);
    const [selectedMapId, setSelectedMapId] = useState<number | null>(null);
    const [showGenModal, setShowGenModal] = useState(false);

    // Filters
    const [filterType, setFilterType] = useState<string>("all");
    const [factions, setFactions] = useState<Faction[]>([]);

    useEffect(() => {
        if (!selectedWorld) {
            setRegions([]);
            setFactions([]);
            setSelectedRegion(null);
            return;
        }

        setIsLoading(true);
        Promise.all([
            fetch(`http://localhost:8787/api/planet/geography/${selectedWorld.id}`).then(res => res.json()),
            fetch(`http://localhost:8787/api/planet/worldgen-regions/${selectedWorld.id}`).then(res => res.json()),
            fetch(`http://localhost:8787/api/planet/factions/${selectedWorld.id}`).then(res => res.json()),
        ])
            .then(([savedData, worldgenData, factionsData]) => {
                const saved: GeographyRegion[] = Array.isArray(savedData) ? savedData : [];
                const worldgen: GeographyRegion[] = Array.isArray(worldgenData) ? worldgenData : [];
                setFactions(Array.isArray(factionsData) ? factionsData : []);

                // Merge: start with worldgen data as the base, overlay any saved edits
                const savedMap = new Map(saved.map(r => [r.id, r]));
                const merged: GeographyRegion[] = worldgen.map(wg => {
                    const existing = savedMap.get(wg.id);
                    if (existing) {
                        // Keep worldgen hierarchy metadata, overlay user edits
                        return {
                            ...wg,
                            name: existing.name || wg.name,
                            status: existing.status || "Stable",
                            population: existing.population ?? wg.population ?? 0,
                            wealth: existing.wealth ?? wg.wealth ?? 0,
                            development: existing.development ?? wg.development ?? 0,
                            lore: existing.lore || wg.lore || "",
                            rulingFaction: existing.rulingFaction || "None",
                        };
                    }
                    // Fresh worldgen region — set defaults
                    return {
                        ...wg,
                        status: wg.status || "Stable",
                        population: wg.population ?? 0,
                        wealth: wg.wealth ?? 0,
                        development: wg.development ?? 0,
                        lore: wg.lore || "",
                        rulingFaction: wg.rulingFaction || "None",
                    };
                });

                // Also keep any saved regions not in worldgen (manually added)
                for (const s of saved) {
                    if (!worldgen.find(w => w.id === s.id)) {
                        merged.push(s);
                    }
                }

                setRegions(merged);
            })
            .catch(err => console.error("Failed to load geography", err))
            .finally(() => setIsLoading(false));
    }, [selectedWorld]);

    const handleSave = async (updated: GeographyRegion[]) => {
        if (!selectedWorld) return;
        setIsSaving(true);
        try {
            const res = await fetch(`http://localhost:8787/api/planet/geography/${selectedWorld.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated)
            });
            if (res.ok) {
                setRegions(updated);
            }
        } catch (err) {
            console.error("Failed to save geography", err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveRegion = () => {
        if (!selectedRegion) return;
        let updated = [...regions];
        const idx = updated.findIndex(r => r.id === selectedRegion.id);
        if (idx >= 0) {
            updated[idx] = selectedRegion;
        } else {
            updated.push(selectedRegion);
        }
        handleSave(updated);
    };

    const handleAddRegionBatch = (items: any[]) => {
        const withIds = items.map((item: any) => ({
            ...item,
            id: item.id || crypto.randomUUID(),
        })) as GeographyRegion[];
        handleSave([...regions, ...withIds]);
    };

    // ─── Randomize Stats (bottom-up aggregation) ────────────────────────
    const handleRandomizeStats = () => {
        const regionMap = new Map(regions.map(r => [r.id, { ...r }]));

        // 1) Generate random stats for PROVINCES only
        for (const r of regionMap.values()) {
            if (r.type === "Province") {
                r.population = Math.floor(Math.random() * 5000) + 500;
                r.wealth = Math.floor(Math.random() * 201) - 100;
                r.development = Math.floor(Math.random() * 201) - 100;
            }
        }

        // Helper: find provinces belonging to a duchy (by rawId matching)
        const provincesOfDuchy = (duchyRawId: number) =>
            [...regionMap.values()].filter(r => r.type === "Province" && r.duchyId === duchyRawId);

        const duchiesOfKingdom = (kingdomRawId: number) =>
            [...regionMap.values()].filter(r => r.type === "Duchy" && r.kingdomId === kingdomRawId);

        const kingdomsOfContinent = (continentRawId: number, kingdomIds: number[]) =>
            [...regionMap.values()].filter(r => r.type === "Kingdom" && kingdomIds.includes(r.rawId!));

        // 2) Aggregate DUCHIES from their provinces
        for (const r of regionMap.values()) {
            if (r.type === "Duchy") {
                const children = provincesOfDuchy(r.rawId!);
                if (children.length > 0) {
                    r.population = children.reduce((s, c) => s + (c.population || 0), 0);
                    r.wealth = Math.round(children.reduce((s, c) => s + (c.wealth || 0), 0) / children.length);
                    r.development = Math.round(children.reduce((s, c) => s + (c.development || 0), 0) / children.length);
                }
            }
        }

        // 3) Aggregate KINGDOMS from their duchies
        for (const r of regionMap.values()) {
            if (r.type === "Kingdom") {
                const children = duchiesOfKingdom(r.rawId!);
                if (children.length > 0) {
                    r.population = children.reduce((s, c) => s + (c.population || 0), 0);
                    r.wealth = Math.round(children.reduce((s, c) => s + (c.wealth || 0), 0) / children.length);
                    r.development = Math.round(children.reduce((s, c) => s + (c.development || 0), 0) / children.length);
                }
            }
        }

        // 4) Aggregate CONTINENTS from their kingdoms
        for (const r of regionMap.values()) {
            if (r.type === "Continent") {
                const children = kingdomsOfContinent(r.rawId!, r.kingdomIds || []);
                if (children.length > 0) {
                    r.population = children.reduce((s, c) => s + (c.population || 0), 0);
                    r.wealth = Math.round(children.reduce((s, c) => s + (c.wealth || 0), 0) / children.length);
                    r.development = Math.round(children.reduce((s, c) => s + (c.development || 0), 0) / children.length);
                }
            }
        }

        handleSave([...regionMap.values()]);
    };

    const filteredRegions = filterType === "all"
        ? regions
        : regions.filter(r => r.type === filterType);

    const typeIcon = (type: string) => {
        switch (type) {
            case "Continent": return "🌍";
            case "Kingdom": return "👑";
            case "Duchy": return "🏰";
            case "Province": return "📍";
            default: return "🗺️";
        }
    };

    const typeColor = (type: string) => {
        switch (type) {
            case "Continent": return "text-blue-400 bg-blue-500/10 border-blue-500/30";
            case "Kingdom": return "text-amber-400 bg-amber-500/10 border-amber-500/30";
            case "Duchy": return "text-purple-400 bg-purple-500/10 border-purple-500/30";
            case "Province": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
            default: return "text-gray-400 bg-gray-500/10 border-gray-500/30";
        }
    };

    if (!selectedWorld) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#121820] border border-[#1f2937] rounded-xl opacity-80">
                <div className="text-5xl mb-4">🌍</div>
                <h3 className="text-xl font-bold tracking-widest text-gray-400 mb-2 uppercase">No World Selected</h3>
                <p className="text-gray-500 max-w-sm text-center">
                    Please select a world to view and manage its geographical regions.
                </p>
            </div>
        );
    }

    return (
        <>
            <div className="flex-1 min-h-0 relative" style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16 }}>
                {/* List Panel */}
                <div className="flex flex-col gap-4 bg-[#121820]/95 backdrop-blur-md border border-white/10 shadow-lg rounded-xl p-4 overflow-y-auto custom-scrollbar z-10 min-h-0">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10 shrink-0">
                        <div>
                            <h2 className="text-sm font-bold tracking-widest text-blue-400 uppercase">Regions</h2>
                            <p className="text-[10px] tracking-widest text-gray-500 uppercase">
                                {regions.length} total · {filteredRegions.length} shown
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={handleRandomizeStats} className="bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 px-3 py-1 font-bold text-xs" title="Randomly assign Population, Wealth and Development scores to all regions">
                                🎲 ROLL
                            </Button>
                            <Button onClick={() => setShowGenModal(true)} className="bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 px-3 py-1 font-bold text-xs">
                                ✨ GEN
                            </Button>
                        </div>
                    </div>

                    {/* Filter Chips */}
                    <div className="flex flex-wrap gap-1.5 shrink-0">
                        {["all", "Continent", "Kingdom", "Duchy", "Province"].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilterType(f)}
                                className={`px-2.5 py-1 rounded-lg text-[9px] font-bold tracking-wider uppercase border transition-all ${filterType === f
                                    ? "bg-blue-500/15 border-blue-500/40 text-blue-300"
                                    : "bg-black/20 border-white/5 text-gray-500 hover:border-white/20"
                                    }`}
                            >
                                {f === "all" ? `ALL (${regions.length})` : `${typeIcon(f)} ${f} (${regions.filter(r => r.type === f).length})`}
                            </button>
                        ))}
                    </div>

                    {isLoading ? (
                        <div className="text-center text-gray-500 text-sm py-8 animate-pulse">Loading regions...</div>
                    ) : filteredRegions.length === 0 ? (
                        <div className="text-center text-gray-600 text-sm py-8 border border-dashed border-white/10 rounded-lg">
                            {regions.length === 0
                                ? "No geography generated yet. Run worldgen first or use ✨ GEN."
                                : "No regions match your filter."
                            }
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            {filteredRegions.map(region => (
                                <div
                                    key={region.id}
                                    onClick={() => setSelectedRegion(region)}
                                    className={`p-3 rounded-lg border cursor-pointer transition-all ${selectedRegion?.id === region.id ? 'bg-blue-500/10 border-blue-500/30' : 'bg-black/20 border-white/5 hover:border-white/20'}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                                            <span className="text-base">{typeIcon(region.type)}</span>
                                            {region.name}
                                        </h3>
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${typeColor(region.type)}`}>
                                            {region.type}
                                        </span>
                                    </div>
                                    <div className="flex gap-2 text-[10px] tracking-widest text-gray-500 uppercase pl-6">
                                        <span>POP {region.population?.toLocaleString() ?? 0}</span>
                                        <span>•</span>
                                        <span>W {region.wealth ?? 0}</span>
                                        <span>•</span>
                                        <span>D {region.development ?? 0}</span>
                                        {region.lore && (
                                            <>
                                                <span>•</span>
                                                <span className="text-blue-400">📜</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Right column: map + editor overlay */}
                <div className="relative min-h-0 overflow-hidden rounded-xl">
                    {/* Map fills the entire right cell */}
                    <div className="absolute inset-0">
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
                                    const layerKey = mapLayer === "areas" ? "provinces" : mapLayer;
                                    const targetIdStr = `wgen_${layerKey}_${id}`;
                                    const existing = regions.find(r => r.id === targetIdStr);
                                    if (existing) {
                                        setSelectedRegion(existing);
                                    }
                                }
                            }}
                            activeLayer={mapLayer}
                            onLayerChange={(layer) => setMapLayer(layer as ProvinceLayer)}
                        />
                    </div>

                    {/* Editor overlay floats on top of the map */}
                    {selectedRegion && (
                        <div className="absolute inset-y-4 left-4 z-10 w-[420px] max-w-[calc(100%-32px)]">
                            <div className="h-full bg-[#121820]/95 backdrop-blur-md border border-white/10 shadow-2xl rounded-xl flex flex-col overflow-hidden p-6 overflow-y-auto custom-scrollbar">
                                <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10 shrink-0">
                                    <h2 className="text-lg font-bold tracking-widest text-gray-100 uppercase flex items-center gap-3">
                                        <span className="text-2xl">{typeIcon(selectedRegion.type)}</span>
                                        {selectedRegion.name}
                                    </h2>
                                    <div className="flex gap-3">
                                        <Button onClick={() => setSelectedRegion(null)} className="bg-gray-500/10 text-gray-400 hover:bg-white/10 border border-gray-500/30 px-4 py-1.5 text-xs tracking-widest">
                                            CLOSE
                                        </Button>
                                        <Button onClick={handleSaveRegion} disabled={isSaving} className="bg-blue-500 hover:bg-blue-400 text-black border border-blue-400 px-6 py-1.5 font-bold tracking-widest text-xs">
                                            {isSaving ? "SAVING..." : "SAVE"}
                                        </Button>
                                    </div>
                                </div>

                                {/* Sub-tabs */}
                                <div className="flex gap-2 mb-4 shrink-0">
                                    {(["details", "lore"] as RegionSubTab[]).map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setSubTab(t)}
                                            className={`px-4 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase border transition-all ${subTab === t
                                                ? "bg-blue-500/15 border-blue-500/30 text-blue-300"
                                                : "bg-black/20 border-white/5 text-gray-500 hover:border-white/20"
                                                }`}
                                        >
                                            {t === "details" ? "📋 Details" : "📜 Lore"}
                                        </button>
                                    ))}
                                </div>

                                {subTab === "details" && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4 mb-4 shrink-0">
                                            <div className="flex flex-col gap-2">
                                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Name</label>
                                                <input
                                                    type="text"
                                                    value={selectedRegion.name}
                                                    onChange={e => setSelectedRegion({ ...selectedRegion, name: e.target.value })}
                                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-2.5 text-sm focus:border-blue-500/50 focus:outline-none text-gray-200 w-full"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Ruling Faction</label>
                                                <select
                                                    value={selectedRegion.rulingFaction || "None"}
                                                    onChange={e => setSelectedRegion({ ...selectedRegion, rulingFaction: e.target.value })}
                                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-2.5 text-sm focus:border-blue-500/50 focus:outline-none text-gray-300 w-full appearance-none"
                                                >
                                                    <option value="None">None</option>
                                                    {factions.map(f => (
                                                        <option key={f.id} value={f.name}>{f.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-5 gap-3 mb-4 shrink-0">
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[9px] font-bold text-gray-500 tracking-widest uppercase">Type</label>
                                                <select
                                                    value={selectedRegion.type}
                                                    onChange={e => setSelectedRegion({ ...selectedRegion, type: e.target.value as any })}
                                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-xs focus:border-blue-500/50 focus:outline-none text-gray-300 w-full appearance-none"
                                                >
                                                    {["Continent", "Kingdom", "Duchy", "Province"].map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[9px] font-bold text-gray-500 tracking-widest uppercase">Status</label>
                                                <select
                                                    value={selectedRegion.status || "Stable"}
                                                    onChange={e => setSelectedRegion({ ...selectedRegion, status: e.target.value })}
                                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-xs focus:border-blue-500/50 focus:outline-none text-gray-300 w-full appearance-none"
                                                >
                                                    {["Thriving", "Stable", "Struggling", "Abandoned", "Rebuilding"].map(t => <option key={t} value={t}>{t}</option>)}
                                                </select>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[9px] font-bold text-gray-500 tracking-widest uppercase">Pop</label>
                                                <input
                                                    type="number"
                                                    value={selectedRegion.population || 0}
                                                    onChange={e => setSelectedRegion({ ...selectedRegion, population: Math.max(0, parseInt(e.target.value) || 0) })}
                                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-xs focus:border-blue-500/50 focus:outline-none text-gray-200 w-full"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[9px] font-bold text-gray-500 tracking-widest uppercase">Wealth</label>
                                                <input
                                                    type="number"
                                                    min="-100" max="100"
                                                    value={selectedRegion.wealth || 0}
                                                    onChange={e => setSelectedRegion({ ...selectedRegion, wealth: Math.max(-100, Math.min(100, parseInt(e.target.value) || 0)) })}
                                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-xs focus:border-blue-500/50 focus:outline-none text-gray-200 w-full"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className="text-[9px] font-bold text-gray-500 tracking-widest uppercase">Dev</label>
                                                <input
                                                    type="number"
                                                    min="-100" max="100"
                                                    value={selectedRegion.development || 0}
                                                    onChange={e => setSelectedRegion({ ...selectedRegion, development: Math.max(-100, Math.min(100, parseInt(e.target.value) || 0)) })}
                                                    className="bg-[#0a0f14] border border-white/10 rounded-lg p-2 text-xs focus:border-blue-500/50 focus:outline-none text-gray-200 w-full"
                                                />
                                            </div>
                                        </div>
                                        {selectedRegion.type !== "Province" && (
                                            <div className="mb-4 px-3 py-2 rounded-lg bg-cyan-500/5 border border-cyan-500/15 text-[10px] tracking-widest text-cyan-400 uppercase font-bold">
                                                ⚡ Stats set by 🎲 ROLL are aggregated from children (pop=sum, wealth/dev=avg). You can override manually.
                                            </div>
                                        )}
                                    </>
                                )}

                                {subTab === "lore" && (
                                    <div className="flex flex-col gap-2 flex-1 relative">
                                        <label className="text-xs font-bold text-gray-500 tracking-widest uppercase">Lore & History</label>
                                        <textarea
                                            value={selectedRegion.lore || ""}
                                            onChange={e => setSelectedRegion({ ...selectedRegion, lore: e.target.value })}
                                            className="bg-[#05080c] border border-white/5 rounded-xl p-4 text-sm focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 focus:outline-none text-gray-300 w-full flex-1 min-h-[200px] custom-scrollbar shadow-inner leading-[1.8] transition-all duration-300 resize-none"
                                            placeholder="Write the history, legends, and notable events of this region..."
                                        />
                                    </div>
                                )}
                            </div>
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
                existingItems={regions as any}
                onConfirm={(items) => handleAddRegionBatch(items)}
            />
        </>
    );
}
