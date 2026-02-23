import { useState, useEffect } from "react";
import { Button } from "@ashtrail/ui";
import type { PlanetWorld } from "./types";
import type { TerrainCell } from "../modules/geo/types";

interface CellFeature {
    x: number;
    y: number;
    dominantColor: string;
    colorVariance: number;
    luminance: number;
    blueRatio: number;
    greenRatio: number;
    redRatio: number;
    saturation: number;
    terrainClass: string;
    regions: { regionId: string; regionName: string; regionType: string }[];
    primaryRegion: string | null;
    primaryRegionType: string | null;
    elevationEstimate: number;
    isWater: boolean;
    isCoastal: boolean;
    vegetationIndex: number;
    aridityIndex: number;
}

interface CellFeaturesData {
    cols: number;
    rows: number;
    totalCells: number;
    cells: CellFeature[];
}

interface GeographyCellsPanelProps {
    globeWorld: PlanetWorld | null;
    selectedCell: TerrainCell | null;
    onGenerateSubTiles: (cell: TerrainCell) => void;
    onGenerateCells: () => void;
    isGeneratingText: boolean;
    activeHistoryId: string | null;
}

const TERRAIN_ICONS: Record<string, string> = {
    deep_ocean: "🌊",
    ocean: "🌊",
    shallow_water: "💧",
    ice: "🧊",
    volcanic: "🌋",
    dense_forest: "🌳",
    forest: "🌲",
    grassland: "🌿",
    desert: "🏜️",
    highlands: "⛰️",
    lowland: "🏕️",
};

const TERRAIN_COLORS: Record<string, string> = {
    deep_ocean: "#0a1628",
    ocean: "#1a5276",
    shallow_water: "#2e86c1",
    ice: "#dce6f0",
    volcanic: "#b22222",
    dense_forest: "#0b6623",
    forest: "#2d7d46",
    grassland: "#7db46c",
    desert: "#e8c872",
    highlands: "#8b7d6b",
    lowland: "#c4a747",
};

export function GeographyCellsPanel({ globeWorld, selectedCell, onGenerateSubTiles, onGenerateCells, isGeneratingText, activeHistoryId }: GeographyCellsPanelProps) {
    const [cellFeatures, setCellFeatures] = useState<CellFeaturesData | null>(null);
    const [selectedFeatureIdx, setSelectedFeatureIdx] = useState<number | null>(null);

    // Load cell features when history ID changes
    useEffect(() => {
        if (!activeHistoryId) {
            setCellFeatures(null);
            return;
        }
        fetch(`http://127.0.0.1:8787/api/planet/cell-features/${activeHistoryId}`)
            .then(res => res.json())
            .then(data => {
                if (data && data.cells) {
                    setCellFeatures(data);
                }
            })
            .catch(() => setCellFeatures(null));
    }, [activeHistoryId]);

    if (!globeWorld?.textureUrl) {
        return (
            <div className="p-6 rounded-xl border border-white/5 bg-white/5 text-center mt-6">
                <svg className="w-8 h-8 text-gray-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                <p className="text-[10px] text-gray-500 leading-relaxed">Generate a planet texture in the <span className="text-[#E6E6FA] font-bold">Geology</span> step first.</p>
            </div>
        );
    }

    // Show cell features summary if available
    if (cellFeatures) {
        const selectedFeature = selectedFeatureIdx !== null ? cellFeatures.cells[selectedFeatureIdx] : null;

        // Calculate terrain distribution
        const terrainCounts: Record<string, number> = {};
        for (const cell of cellFeatures.cells) {
            terrainCounts[cell.terrainClass] = (terrainCounts[cell.terrainClass] || 0) + 1;
        }
        const sortedTerrains = Object.entries(terrainCounts).sort((a, b) => b[1] - a[1]);
        const waterCount = cellFeatures.cells.filter(c => c.isWater).length;
        const coastalCount = cellFeatures.cells.filter(c => c.isCoastal).length;

        return (
            <div className="space-y-4 mt-6">
                {/* Summary Stats */}
                <div className="p-4 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
                    <div className="flex justify-between items-center mb-3">
                        <label className="block text-[8px] font-black tracking-[0.2em] text-indigo-400">CELL ANALYSIS</label>
                        <span className="text-[8px] font-bold tracking-widest text-gray-500">
                            {cellFeatures.cols}×{cellFeatures.rows} ({cellFeatures.totalCells.toLocaleString()} cells)
                        </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-black/40 border border-white/10 rounded-lg p-2 text-center">
                            <div className="text-[10px] font-black text-blue-400">{((waterCount / cellFeatures.totalCells) * 100).toFixed(0)}%</div>
                            <div className="text-[7px] font-bold text-gray-500 tracking-widest">WATER</div>
                        </div>
                        <div className="bg-black/40 border border-white/10 rounded-lg p-2 text-center">
                            <div className="text-[10px] font-black text-cyan-400">{coastalCount}</div>
                            <div className="text-[7px] font-bold text-gray-500 tracking-widest">COASTAL</div>
                        </div>
                        <div className="bg-black/40 border border-white/10 rounded-lg p-2 text-center">
                            <div className="text-[10px] font-black text-green-400">{sortedTerrains.length}</div>
                            <div className="text-[7px] font-bold text-gray-500 tracking-widest">BIOMES</div>
                        </div>
                    </div>

                    {/* Terrain Distribution */}
                    <div className="space-y-1.5">
                        {sortedTerrains.slice(0, 6).map(([terrain, count]) => {
                            const pct = ((count / cellFeatures.totalCells) * 100);
                            return (
                                <div key={terrain} className="flex items-center gap-2">
                                    <span className="text-[10px] w-4">{TERRAIN_ICONS[terrain] || "🗺️"}</span>
                                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all"
                                            style={{
                                                width: `${pct}%`,
                                                backgroundColor: TERRAIN_COLORS[terrain] || "#666"
                                            }}
                                        />
                                    </div>
                                    <span className="text-[8px] font-bold text-gray-400 w-16 text-right tracking-wider uppercase">
                                        {terrain.replace("_", " ")}
                                    </span>
                                    <span className="text-[8px] font-bold text-gray-500 w-8 text-right">
                                        {pct.toFixed(0)}%
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Re-generate button */}
                <Button
                    variant="primary"
                    onClick={onGenerateCells}
                    className="w-full text-[8px] tracking-[0.1em] font-black py-2.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 rounded-xl border border-indigo-500/20"
                >
                    RE-ANALYZE CELLS
                </Button>

                {/* Cell inspector (click to select from the grid) */}
                {selectedFeature && (
                    <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl space-y-3">
                        <div className="flex justify-between items-center">
                            <label className="block text-[8px] font-black tracking-[0.2em] text-cyan-400">CELL DETAIL</label>
                            <button onClick={() => setSelectedFeatureIdx(null)} className="text-gray-500 hover:text-white text-[10px]">✕</button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="block text-[7px] font-bold tracking-widest text-gray-500 mb-1">TERRAIN</label>
                                <div className="bg-black/40 border border-white/10 rounded-lg p-2 text-[10px] text-white font-bold uppercase tracking-wider flex items-center gap-2">
                                    <span>{TERRAIN_ICONS[selectedFeature.terrainClass] || "🗺️"}</span>
                                    {selectedFeature.terrainClass.replace("_", " ")}
                                </div>
                            </div>
                            <div>
                                <label className="block text-[7px] font-bold tracking-widest text-gray-500 mb-1">COLOR</label>
                                <div className="bg-black/40 border border-white/10 rounded-lg p-2 text-[10px] text-gray-200 font-mono flex items-center gap-2">
                                    <div className="w-4 h-4 rounded-sm border border-white/20" style={{ backgroundColor: selectedFeature.dominantColor }} />
                                    {selectedFeature.dominantColor}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div>
                                <label className="block text-[7px] font-bold tracking-widest text-gray-500 mb-1">VEGETATION</label>
                                <div className="bg-black/40 border border-white/10 rounded-lg p-2 text-[10px] text-green-400 font-bold">
                                    {(selectedFeature.vegetationIndex * 100).toFixed(0)}%
                                </div>
                            </div>
                            <div>
                                <label className="block text-[7px] font-bold tracking-widest text-gray-500 mb-1">ARIDITY</label>
                                <div className="bg-black/40 border border-white/10 rounded-lg p-2 text-[10px] text-amber-400 font-bold">
                                    {(selectedFeature.aridityIndex * 100).toFixed(0)}%
                                </div>
                            </div>
                            <div>
                                <label className="block text-[7px] font-bold tracking-widest text-gray-500 mb-1">ELEVATION</label>
                                <div className="bg-black/40 border border-white/10 rounded-lg p-2 text-[10px] text-gray-200 font-bold">
                                    {(selectedFeature.elevationEstimate * 100).toFixed(0)}
                                </div>
                            </div>
                        </div>

                        {/* Flags */}
                        <div className="flex gap-2">
                            {selectedFeature.isWater && (
                                <span className="text-[8px] font-bold tracking-widest bg-blue-500/15 text-blue-300 px-2.5 py-1 rounded-lg border border-blue-500/20">💧 WATER</span>
                            )}
                            {selectedFeature.isCoastal && (
                                <span className="text-[8px] font-bold tracking-widest bg-cyan-500/15 text-cyan-300 px-2.5 py-1 rounded-lg border border-cyan-500/20">🏖️ COASTAL</span>
                            )}
                        </div>

                        {/* Region tags */}
                        {selectedFeature.regions.length > 0 && (
                            <div>
                                <label className="block text-[7px] font-bold tracking-widest text-gray-500 mb-1.5">REGIONS</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {selectedFeature.regions.map(r => (
                                        <span key={r.regionId} className="text-[8px] font-bold tracking-wider bg-purple-500/10 text-purple-300 px-2 py-1 rounded-lg border border-purple-500/20">
                                            {r.regionName}
                                            <span className="text-purple-500 ml-1">({r.regionType.replace("_", " ")})</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Clickable mini-grid for cell selection */}
                {!selectedFeature && (
                    <div className="p-3 bg-black/20 border border-white/5 rounded-xl">
                        <label className="block text-[7px] font-bold tracking-widest text-gray-500 mb-2">
                            CLICK TO INSPECT ({cellFeatures.cols}×{cellFeatures.rows} grid)
                        </label>
                        <div
                            className="w-full rounded-lg overflow-hidden border border-white/10"
                            style={{ aspectRatio: `${cellFeatures.cols}/${cellFeatures.rows}` }}
                        >
                            <canvas
                                ref={(canvas) => {
                                    if (!canvas || !cellFeatures) return;
                                    canvas.width = cellFeatures.cols;
                                    canvas.height = cellFeatures.rows;
                                    const ctx = canvas.getContext("2d");
                                    if (!ctx) return;
                                    for (const cell of cellFeatures.cells) {
                                        ctx.fillStyle = cell.dominantColor;
                                        ctx.fillRect(cell.x, cell.y, 1, 1);
                                    }
                                }}
                                className="w-full h-full cursor-crosshair"
                                style={{ imageRendering: "pixelated" }}
                                onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const rx = (e.clientX - rect.left) / rect.width;
                                    const ry = (e.clientY - rect.top) / rect.height;
                                    const cx = Math.floor(rx * cellFeatures.cols);
                                    const cy = Math.floor(ry * cellFeatures.rows);
                                    const idx = cy * cellFeatures.cols + cx;
                                    if (idx >= 0 && idx < cellFeatures.cells.length) {
                                        setSelectedFeatureIdx(idx);
                                    }
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // No cell features yet — show generate button
    if (!cellFeatures) {
        return (
            <div className="p-4 rounded-xl border border-white/5 bg-white/5 text-center mt-6">
                <p className="text-[10px] text-gray-500 leading-relaxed mb-4">
                    Analyze texture pixels to extract cell-level terrain features and match geography regions.
                </p>
                <Button
                    variant="primary"
                    onClick={onGenerateCells}
                    className="w-full text-[8px] tracking-[0.1em] font-black py-3 bg-indigo-600/30 hover:bg-indigo-600/50 text-white rounded-xl shadow-[0_0_15px_rgba(79,70,229,0.2)]"
                >
                    ANALYZE CELL GRID
                </Button>
            </div>
        );
    }

    return null;
}
