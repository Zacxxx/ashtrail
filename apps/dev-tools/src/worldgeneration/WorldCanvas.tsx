import { useState } from "react";
import { PlanetGlobe } from "../components/PlanetGlobe";
import { PlanetMap2D, type MapTransform } from "../components/PlanetMap2D";
import type { TerrainCell } from "../modules/geo/types";
import type { PlanetWorld, ViewMode, WorkflowStep, GeographyTool, RegionType, GeoRegion } from "./types";
import { RegionOverlay } from "./RegionOverlay";

interface GeographyHook {
    regions: GeoRegion[];
    selectedRegionId: string | null;
    hoveredRegionId: string | null;
    setSelectedRegionId: (id: string | null) => void;
    setHoveredRegionId: (id: string | null) => void;
    addRegion: (name: string, type: RegionType, polygon: [number, number][]) => GeoRegion;
    findRegionAtPoint: (x: number, y: number) => GeoRegion | null;
}

interface WorldCanvasProps {
    viewMode: ViewMode;
    globeWorld: PlanetWorld | null;
    showHexGrid: boolean;
    onCellHover: (cell: TerrainCell | null) => void;
    onCellClick: (cell: TerrainCell | null) => void;
    activeStep?: WorkflowStep;
    geographyTool?: GeographyTool;
    activeRegionType?: RegionType;
    geography?: GeographyHook;
    geographyTab?: "regions" | "cells";
    isMaxView?: boolean;
    setIsMaxView?: (v: boolean) => void;
}

export function WorldCanvas({
    viewMode,
    globeWorld,
    showHexGrid,
    onCellHover,
    onCellClick,
    activeStep,
    geographyTool = "pan",
    activeRegionType = "continent",
    geography,
    geographyTab = "regions",
    isMaxView = false,
    setIsMaxView,
}: WorldCanvasProps) {
    const showGeographyOverlay = activeStep === "GEOGRAPHY" && viewMode === "2d" && globeWorld && geography && geographyTab === "regions";
    const [mapTransform, setMapTransform] = useState<MapTransform>({ x: 0, y: 0, scale: 1 });

    // Helper block to keep JSX clean
    const render2DMap = () => {
        if (!globeWorld) {
            return (
                <div className="w-full h-full rounded-2xl border border-white/5 bg-[#1e1e1e]/40 backdrop-blur-md flex flex-col items-center justify-center text-[10px] tracking-widest text-gray-500">
                    <div className="w-16 h-16 border border-white/10 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                    </div>
                    AWAITING MAP GENERATION
                </div>
            );
        }

        return (
            <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 p-1 bg-[#1e1e1e]/40 backdrop-blur-sm group">
                {/* Maximize Toggle Button */}
                {setIsMaxView && (
                    <button
                        onClick={() => setIsMaxView(!isMaxView)}
                        className="absolute top-4 right-4 z-20 w-10 h-10 bg-[#1e1e1e]/80 hover:bg-[#2a2a2a] backdrop-blur-md border border-white/10 rounded-xl flex items-center justify-center text-gray-400 hover:text-white transition-all shadow-lg opacity-0 group-hover:opacity-100"
                        title={isMaxView ? "Restore View" : "Maximize View"}
                    >
                        {isMaxView ? (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h6m-6 0v6m0-6l6 6m10-6h-6m6 0v6m0-6l-6 6M4 20h6m-6 0v-6m0 6l6-6m10 6h-6m6 0v-6m0 6l-6-6" /></svg>
                        )}
                    </button>
                )}
                <PlanetMap2D
                    world={globeWorld}
                    onTransformChange={setMapTransform}
                    showHexGrid={showHexGrid}
                    onCellHover={onCellHover}
                    onCellClick={onCellClick}
                />
                {/* Geography Region Overlay */}
                {showGeographyOverlay && (
                    <RegionOverlay
                        regions={geography.regions}
                        activeTool={geographyTool}
                        activeRegionType={activeRegionType}
                        selectedRegionId={geography.selectedRegionId}
                        hoveredRegionId={geography.hoveredRegionId}
                        onAddRegion={geography.addRegion}
                        onSelectRegion={geography.setSelectedRegionId}
                        onHoverRegion={geography.setHoveredRegionId}
                        findRegionAtPoint={geography.findRegionAtPoint}
                        transform={mapTransform}
                        originalWidth={globeWorld.cols}
                        originalHeight={globeWorld.rows}
                        textureUrl={globeWorld.textureUrl}
                    />
                )}
            </div>
        );
    };

    const render3DGlobe = () => {
        if (!globeWorld) {
            return (
                <div className="w-full h-full rounded-2xl border border-white/5 bg-[#1e1e1e]/40 backdrop-blur-md flex flex-col items-center justify-center text-[10px] tracking-widest text-gray-500 gap-4">
                    <div className="w-24 h-24 border border-white/5 rounded-full flex items-center justify-center">
                        <div className="w-16 h-16 border border-white/10 rounded-full animate-[spin_10s_linear_infinite]" />
                    </div>
                    INITIALIZE GENERATOR ENGINE
                </div>
            );
        }

        return (
            <div className="w-full h-full rounded-2xl border border-white/5 overflow-hidden relative bg-black/50 shadow-2xl">
                <PlanetGlobe world={globeWorld} onCellHover={onCellHover} onCellClick={onCellClick} showHexGrid={showHexGrid} />

                {/* Base Texture Mini-Map */}
                {globeWorld.textureUrl && (
                    <div className="absolute bottom-6 left-6 border border-white/10 rounded-xl overflow-hidden shadow-2xl opacity-50 hover:opacity-100 transition-all group max-w-[240px]">
                        <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/80 to-transparent p-2 z-10">
                            <p className="text-[8px] font-extrabold tracking-[0.2em] text-white">BASE TEXTURE</p>
                        </div>
                        <img src={globeWorld.textureUrl} alt="AI Map" className="w-full h-auto object-contain bg-black group-hover:scale-105 transition-transform duration-500" />
                    </div>
                )}
            </div>
        );
    };

    return (
        <main className="flex-1 flex flex-col relative bg-transparent rounded-3xl m-4 overflow-hidden shadow-2xl border border-white/5 z-0">
            <div className="absolute inset-0 bg-[#1e1e1e]" />

            <div className="flex-1 flex p-2 transition-all overflow-hidden z-10 w-full h-full">
                {viewMode === "2d" ? render2DMap() : render3DGlobe()}
            </div>
        </main>
    );
}
