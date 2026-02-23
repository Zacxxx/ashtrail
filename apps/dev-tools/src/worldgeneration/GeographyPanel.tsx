import { useState } from "react";
import { Button, TabBar } from "@ashtrail/ui";
import type { GeoRegion, GeographyTool, RegionType, PlanetWorld } from "./types";
import type { TerrainCell } from "../modules/geo/types";
import { REGION_CATEGORIES, REGION_TYPE_COLORS } from "./types";
import { GeographyCellsPanel } from "./GeographyCellsPanel";

interface GeographyPanelProps {
    activeTool: GeographyTool;
    setActiveTool: (tool: GeographyTool) => void;
    activeRegionType: RegionType;
    setActiveRegionType: (type: RegionType) => void;
    regions: GeoRegion[];
    selectedRegionId: string | null;
    setSelectedRegionId: (id: string | null) => void;
    onUpdateRegion: (id: string, patch: Partial<GeoRegion>) => void;
    onDeleteRegion: (id: string) => void;
    onClearRegions: () => void;
    globeWorld: PlanetWorld | null;
    generateUpscale: (historyId: string) => Promise<void>;
    activeHistoryId: string | null;
    selectedCell: TerrainCell | null;
    generatePlanetCells: (historyId: string, regions?: GeoRegion[]) => void;
    onGenerateSubTiles: (cell: TerrainCell) => void;
    isGeneratingText: boolean;
    geographyTab: "regions" | "cells";
    setGeographyTab: (tab: "regions" | "cells") => void;
}

export function GeographyPanel({
    activeTool,
    setActiveTool,
    activeRegionType,
    setActiveRegionType,
    regions,
    selectedRegionId,
    setSelectedRegionId,
    onUpdateRegion,
    onDeleteRegion,
    onClearRegions,
    globeWorld,
    generateUpscale,
    activeHistoryId,
    selectedCell,
    generatePlanetCells,
    onGenerateSubTiles,
    isGeneratingText,
    geographyTab,
    setGeographyTab,
}: GeographyPanelProps) {
    const selectedRegion = regions.find(r => r.id === selectedRegionId);
    const [showTypePicker, setShowTypePicker] = useState(false);

    // Build tree data structure for rendering the region list
    const getChildren = (parentId?: string) => regions.filter(r => (parentId ? r.parentId === parentId : !r.parentId));

    const renderRegionNode = (region: GeoRegion, depth: number = 0) => {
        const children = getChildren(region.id);
        const isSelected = region.id === selectedRegionId;

        return (
            <div key={region.id}>
                <div
                    onClick={() => setSelectedRegionId(isSelected ? null : region.id)}
                    className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all group my-1 ${isSelected
                        ? "bg-cyan-500/10 border-cyan-500/30"
                        : "bg-black/20 border-white/5 hover:border-white/10"
                        }`}
                    style={{ marginLeft: `${depth * 12}px` }}
                >
                    {depth > 0 && <div className="w-2 h-px bg-white/20 shrink-0" />}
                    <div className="w-3.5 h-3.5 rounded-sm shrink-0 border border-white/10" style={{ backgroundColor: region.color }} />
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-gray-200 font-bold tracking-wider truncate">{region.name}</p>
                        <p className="text-[8px] text-gray-500 font-bold tracking-widest uppercase">{region.type.replace('_', ' ')}</p>
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); onDeleteRegion(region.id); }}
                        className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                {children.map(child => renderRegionNode(child, depth + 1))}
            </div>
        );
    };

    const topLevelRegions = getChildren();

    return (
        <div className="flex-1 flex flex-col bg-[#1e1e1e]/60 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl overflow-hidden h-full">
            <div className="p-5 flex-1 overflow-y-auto scrollbar-thin">
                <h3 className="text-[11px] font-black tracking-[0.2em] text-cyan-400 flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                    GEOGRAPHY ENGINE
                </h3>

                <TabBar
                    tabs={["regions", "cells"]}
                    activeTab={geographyTab}
                    onTabChange={(tab) => setGeographyTab(tab as "regions" | "cells")}
                    className="mb-4"
                />

                {!globeWorld?.textureUrl ? (
                    <div className="p-6 rounded-xl border border-white/5 bg-white/5 text-center">
                        <svg className="w-8 h-8 text-gray-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                        <p className="text-[10px] text-gray-500 leading-relaxed">Generate a planet texture in the <span className="text-[#E6E6FA] font-bold">Geology</span> step first.</p>
                    </div>
                ) : geographyTab === "cells" ? (
                    <GeographyCellsPanel
                        globeWorld={globeWorld}
                        selectedCell={selectedCell}
                        onGenerateCells={() => {
                            if (activeHistoryId) generatePlanetCells(activeHistoryId, regions);
                        }}
                        onGenerateSubTiles={onGenerateSubTiles}
                        isGeneratingText={isGeneratingText}
                        activeHistoryId={activeHistoryId}
                    />
                ) : (
                    <div className="space-y-6">

                        {/* ── Tool Mode ── */}
                        <div>
                            <label className="block text-[10px] font-extrabold tracking-[0.15em] text-gray-400 mb-3">TOOL MODE</label>
                            <div className="flex gap-2">
                                {([
                                    { id: "lasso" as GeographyTool, label: "LASSO", icon: "✏️" },
                                    { id: "select" as GeographyTool, label: "SELECT", icon: "👆" },
                                    { id: "pan" as GeographyTool, label: "PAN", icon: "🤚" },
                                ]).map(tool => (
                                    <button
                                        key={tool.id}
                                        onClick={() => setActiveTool(tool.id)}
                                        className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border text-[9px] font-bold tracking-widest transition-all ${activeTool === tool.id
                                            ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                                            : "bg-transparent border-white/5 text-gray-500 hover:text-gray-300 hover:bg-white/5"
                                            }`}
                                    >
                                        <span className="text-sm">{tool.icon}</span>
                                        {tool.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ── Region Type ── */}
                        <div>
                            <label className="block text-[10px] font-extrabold tracking-[0.15em] text-gray-400 mb-2">TARGET FEATURE TYPE</label>
                            <button
                                onClick={() => setShowTypePicker(!showTypePicker)}
                                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-white/10 bg-black/40 hover:bg-white/5 transition-all text-left"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: REGION_TYPE_COLORS[activeRegionType] }} />
                                    <span className="text-[10px] font-bold tracking-widest text-cyan-300 uppercase">{activeRegionType.replace('_', ' ')}</span>
                                </div>
                                <svg className={`w-4 h-4 text-gray-400 transition-transform ${showTypePicker ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </button>

                            {showTypePicker && (
                                <div className="mt-2 p-3 rounded-xl border border-white/10 bg-black/60 backdrop-blur-md max-h-[300px] overflow-y-auto scrollbar-thin">
                                    {REGION_CATEGORIES.map(category => (
                                        <div key={category.label} className="mb-4 last:mb-0">
                                            <div className="text-[8px] font-black tracking-[0.2em] text-gray-500 mb-2">{category.label.toUpperCase()}</div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {category.types.map(rt => (
                                                    <button
                                                        key={rt}
                                                        onClick={() => { setActiveRegionType(rt); setShowTypePicker(false); }}
                                                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[8px] font-bold tracking-widest transition-all ${activeRegionType === rt
                                                            ? "bg-cyan-500/15 border-cyan-500/40 text-cyan-300"
                                                            : "bg-transparent border-white/5 text-gray-400 hover:text-gray-200 hover:border-white/20"
                                                            }`}
                                                    >
                                                        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: REGION_TYPE_COLORS[rt] }} />
                                                        {rt.replace('_', ' ').toUpperCase()}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ── Upscale Button ── */}
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                            <Button
                                variant="primary"
                                disabled
                                className="w-full text-[8px] tracking-[0.1em] font-black py-3 bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/30 rounded-xl opacity-50 flex flex-col items-center gap-1"
                                title="AI Vision: Pass 1"
                            >
                                <span>🌍 Pass 1</span>
                                <span className="text-cyan-200/70">Land & Oceans</span>
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => activeHistoryId && generateUpscale(activeHistoryId)}
                                disabled={!activeHistoryId}
                                className={`w-full text-[8px] tracking-[0.1em] font-black py-3 flex flex-col items-center gap-1 transition-all rounded-xl ${activeHistoryId
                                    ? "bg-fuchsia-600/30 hover:bg-fuchsia-600/50 border border-fuchsia-500/30 text-white shadow-[0_0_15px_rgba(192,38,211,0.2)]"
                                    : "bg-fuchsia-900/10 border-fuchsia-900/20 text-gray-500 opacity-50"
                                    }`}
                                title={activeHistoryId ? "Upscale to 4x Resolution" : "Generate or select a planet first"}
                            >
                                <span className="flex items-center gap-1">✨ Enhance Texture</span>
                                <span className={activeHistoryId ? "text-fuchsia-200/90" : "text-fuchsia-900/50"}>ESRGAN 4x Upscale</span>
                            </Button>
                        </div>

                        {/* ── Region List (Tree) ── */}
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <label className="text-[10px] font-extrabold tracking-[0.15em] text-gray-400">
                                    HIERARCHY ({regions.length})
                                </label>
                                {regions.length > 0 && (
                                    <button
                                        onClick={onClearRegions}
                                        className="text-[9px] font-bold tracking-widest text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-lg transition-all"
                                    >
                                        CLEAR
                                    </button>
                                )}
                            </div>

                            {regions.length === 0 ? (
                                <div className="p-4 rounded-xl border border-white/5 bg-white/5 text-center">
                                    <p className="text-[10px] text-gray-500 leading-relaxed">
                                        Select <span className="text-cyan-400 font-bold">Lasso</span> and draw on the map.
                                    </p>
                                </div>
                            ) : (
                                <div className="max-h-[240px] overflow-y-auto scrollbar-thin pr-1 pb-2">
                                    {topLevelRegions.map(region => renderRegionNode(region, 0))}
                                </div>
                            )}
                        </div>

                        {/* ── Selected Region Detail ── */}
                        {selectedRegion && (
                            <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl space-y-4">
                                <label className="block text-[8px] font-black tracking-[0.2em] text-cyan-400">INSPECT REGION</label>

                                <div>
                                    <label className="block text-[8px] font-bold tracking-widest text-gray-500 mb-1">NAME</label>
                                    <input
                                        type="text"
                                        value={selectedRegion.name}
                                        onChange={(e) => onUpdateRegion(selectedRegion.id, { name: e.target.value })}
                                        className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-gray-200 focus:outline-none focus:border-cyan-500/50"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[8px] font-bold tracking-widest text-gray-500 mb-1">TYPE</label>
                                        <select
                                            value={selectedRegion.type}
                                            onChange={(e) => onUpdateRegion(selectedRegion.id, {
                                                type: e.target.value as RegionType,
                                                color: REGION_TYPE_COLORS[e.target.value as RegionType],
                                            })}
                                            className="w-full bg-black/40 text-[10px] font-bold uppercase tracking-widest text-cyan-300 border border-white/10 p-2.5 rounded-lg focus:outline-none focus:border-cyan-500/50 appearance-none"
                                        >
                                            {REGION_CATEGORIES.flatMap(c => c.types).map(rt => (
                                                <option key={rt} value={rt}>{rt.replace('_', ' ')}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[8px] font-bold tracking-widest text-gray-500 mb-1">PARENT REGION</label>
                                        <select
                                            value={selectedRegion.parentId || ""}
                                            onChange={(e) => onUpdateRegion(selectedRegion.id, { parentId: e.target.value || undefined })}
                                            className="w-full bg-black/40 text-[10px] font-bold tracking-widest text-gray-300 border border-white/10 p-2.5 rounded-lg focus:outline-none focus:border-cyan-500/50 appearance-none truncate"
                                        >
                                            <option value="">[None — Root]</option>
                                            {regions.filter(r => r.id !== selectedRegion.id && !getChildren(selectedRegion.id).some(c => c.id === r.id)).map(r => (
                                                <option key={r.id} value={r.id}>{r.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[8px] font-bold tracking-widest text-gray-500 mb-1">DESCRIPTION</label>
                                    <textarea
                                        value={selectedRegion.metadata?.description || ""}
                                        onChange={(e) => onUpdateRegion(selectedRegion.id, {
                                            metadata: { ...selectedRegion.metadata, description: e.target.value }
                                        })}
                                        className="w-full h-16 bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-gray-300 focus:outline-none focus:border-cyan-500/50 resize-none"
                                        placeholder="Physical geography notes..."
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
