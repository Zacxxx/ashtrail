import { useEffect, useState } from "react";

const API_BASE = "http://127.0.0.1:8787";

export type InspectorLayer = "provinces" | "duchies" | "kingdoms";

interface GeographyInspectorPanelProps {
    planetId: string | null;
    selectedId: number | null;
    hoveredId: number | null;
    activeLayer: InspectorLayer;
}

interface RegionRecord {
    id: number;
    name: string;
    area?: number;
    seed_x?: number;
    seed_y?: number;
    biome_primary?: number;
    duchy_id?: number;
    kingdom_id?: number;
    province_ids?: number[];
    duchy_ids?: number[];
}

export function GeographyInspectorPanel({ planetId, selectedId, hoveredId, activeLayer }: GeographyInspectorPanelProps) {
    const [provinces, setProvinces] = useState<Record<number, RegionRecord>>({});
    const [duchies, setDuchies] = useState<Record<number, RegionRecord>>({});
    const [kingdoms, setKingdoms] = useState<Record<number, RegionRecord>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!planetId) return;

        setLoading(true);
        setError(null);

        Promise.all([
            fetch(`${API_BASE}/api/planets/${planetId}/worldgen/provinces.json`).then(r => r.json()),
            fetch(`${API_BASE}/api/planets/${planetId}/worldgen/duchies.json`).then(r => r.json()),
            fetch(`${API_BASE}/api/planets/${planetId}/worldgen/kingdoms.json`).then(r => r.json())
        ])
            .then(([pList, dList, kList]) => {
                const pMap: Record<number, RegionRecord> = {};
                const dMap: Record<number, RegionRecord> = {};
                const kMap: Record<number, RegionRecord> = {};

                (pList as RegionRecord[]).forEach(x => pMap[x.id] = x);
                (dList as RegionRecord[]).forEach(x => dMap[x.id] = x);
                (kList as RegionRecord[]).forEach(x => kMap[x.id] = x);

                setProvinces(pMap);
                setDuchies(dMap);
                setKingdoms(kMap);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to load geography data", err);
                setError("Failed to load geography data. Make sure pipeline has run successfully.");
                setLoading(false);
            });
    }, [planetId]);

    if (!planetId) {
        return <div className="p-4 text-xs text-center text-gray-500 font-mono">NO PLANET ACTIVE</div>;
    }

    if (loading) {
        return <div className="p-4 text-xs text-center text-gray-500 font-mono animate-pulse">LOADING ARCHIVES...</div>;
    }

    if (error) {
        return <div className="p-4 text-xs text-center text-red-500/70 font-mono bg-red-500/10 rounded-xl mx-4">{error}</div>;
    }

    const targetId = selectedId !== null ? selectedId : hoveredId;

    let activeData = null;
    if (targetId !== null) {
        if (activeLayer === "provinces") activeData = provinces[targetId];
        else if (activeLayer === "duchies") activeData = duchies[targetId];
        else if (activeLayer === "kingdoms") activeData = kingdoms[targetId];
    }

    return (
        <div className="flex flex-col gap-4 p-4 h-full">
            <div className="bg-[#1e1e1e]/60 border border-white/5 rounded-2xl p-4 shadow-lg backdrop-blur-md">
                <h2 className="text-[10px] font-black tracking-[0.2em] text-cyan-400 mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                    PROVINCE INSPECTOR
                </h2>

                <p className="text-[11px] text-gray-400 leading-relaxed font-mono">
                    Hover over regions on the map to inspect properties. Click on a region to lock selection.
                </p>
            </div>

            {activeData ? (
                <div className="bg-[#1e1e1e]/60 border border-white/5 rounded-2xl p-4 shadow-lg backdrop-blur-md space-y-4">
                    <div className="border-b border-white/10 pb-3">
                        <h3 className="text-sm font-bold text-white tracking-widest">{activeData.name.toUpperCase()}</h3>
                        <p className="text-[10px] text-gray-500 font-mono tracking-wider mt-1">ID: {activeData.id}</p>
                    </div>

                    <div className="space-y-2">
                        {activeData.area !== undefined && (
                            <div className="flex justify-between text-[11px] font-mono">
                                <span className="text-gray-500">AREA</span>
                                <span className="text-cyan-300">{activeData.area} px²</span>
                            </div>
                        )}
                        {activeData.biome_primary !== undefined && (
                            <div className="flex justify-between text-[11px] font-mono">
                                <span className="text-gray-500">PRIMARY BIOME</span>
                                <span className="text-green-400 text-right">#{activeData.biome_primary}</span>
                            </div>
                        )}
                        {activeData.duchy_id !== undefined && duchies[activeData.duchy_id] && activeLayer === "provinces" && (
                            <div className="flex justify-between text-[11px] font-mono">
                                <span className="text-gray-500">DE JURE DUCHY</span>
                                <span className="text-yellow-500 text-right">{duchies[activeData.duchy_id].name}</span>
                            </div>
                        )}
                        {activeData.kingdom_id !== undefined && kingdoms[activeData.kingdom_id] && (activeLayer === "provinces" || activeLayer === "duchies") && (
                            <div className="flex justify-between text-[11px] font-mono">
                                <span className="text-gray-500">DE JURE KINGDOM</span>
                                <span className="text-purple-400 text-right">{kingdoms[activeData.kingdom_id].name}</span>
                            </div>
                        )}
                        {activeData.province_ids && (
                            <div className="flex justify-between text-[11px] font-mono">
                                <span className="text-gray-500">COUNTIES</span>
                                <span className="text-white text-right">{activeData.province_ids.length}</span>
                            </div>
                        )}
                        {activeData.duchy_ids && (
                            <div className="flex justify-between text-[11px] font-mono">
                                <span className="text-gray-500">DUCHIES</span>
                                <span className="text-white text-right">{activeData.duchy_ids.length}</span>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex-1 border border-dashed border-white/10 rounded-2xl flex items-center justify-center p-6 text-center text-gray-600 text-[10px] tracking-widest leading-relaxed">
                    AWAITING REGION SELECTION
                </div>
            )}
        </div>
    );
}
