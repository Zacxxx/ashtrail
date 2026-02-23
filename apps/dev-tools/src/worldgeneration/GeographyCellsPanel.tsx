import { Button } from "@ashtrail/ui";
import type { PlanetWorld } from "./types";
import type { TerrainCell } from "../modules/geo/types";

interface GeographyCellsPanelProps {
    globeWorld: PlanetWorld | null;
    selectedCell: TerrainCell | null;
    onGenerateSubTiles: (cell: TerrainCell) => void;
    isGeneratingText: boolean;
}

export function GeographyCellsPanel({ globeWorld, selectedCell, onGenerateSubTiles, isGeneratingText }: GeographyCellsPanelProps) {
    if (!globeWorld?.textureUrl) {
        return (
            <div className="p-6 rounded-xl border border-white/5 bg-white/5 text-center mt-6">
                <svg className="w-8 h-8 text-gray-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                <p className="text-[10px] text-gray-500 leading-relaxed">Generate a planet texture in the <span className="text-[#E6E6FA] font-bold">Geology</span> step first.</p>
            </div>
        );
    }

    if (!selectedCell) {
        return (
            <div className="p-4 rounded-xl border border-white/5 bg-white/5 text-center mt-6">
                <p className="text-[10px] text-gray-500 leading-relaxed">
                    Select a <span className="text-cyan-400 font-bold">Cell</span> on the Globe 3D view to inspect it.
                </p>
            </div>
        );
    }

    // Temporary placeholder for sub-tiles (until we add state logic)
    const hasSubTiles = !!(selectedCell as any).subTiles;

    return (
        <div className="space-y-6 mt-6">
            <div className="p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-xl space-y-4">
                <div className="flex justify-between items-center mb-2">
                    <label className="block text-[8px] font-black tracking-[0.2em] text-cyan-400">SELECTED CELL</label>
                    <span className="text-[8px] font-bold tracking-widest text-gray-500">ID: {selectedCell.y * globeWorld.cols + selectedCell.x}</span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                        <label className="block text-[8px] font-bold tracking-widest text-gray-500 mb-1">BIOME</label>
                        <div className="bg-black/40 border border-white/10 rounded-lg p-2.5 text-[10px] text-gray-200 uppercase font-bold tracking-wider truncate">
                            {selectedCell.biome}
                        </div>
                    </div>
                    <div>
                        <label className="block text-[8px] font-bold tracking-widest text-gray-500 mb-1">ELEVATION</label>
                        <div className="bg-black/40 border border-white/10 rounded-lg p-2.5 text-[10px] text-gray-200 font-bold tracking-wider truncate">
                            {Math.round(selectedCell.elevationMeters)}m
                        </div>
                    </div>
                </div>

                {!hasSubTiles ? (
                    <Button
                        variant="primary"
                        onClick={() => onGenerateSubTiles(selectedCell)}
                        disabled={isGeneratingText}
                        className="w-full text-[8px] tracking-[0.1em] font-black py-3 flex items-center justify-center gap-2 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/30 text-white rounded-xl shadow-[0_0_15px_rgba(79,70,229,0.2)] transition-all"
                    >
                        {isGeneratingText ? "GENERATING SUB-TILES..." : "SCAN HEX STRUCTURE"}
                    </Button>
                ) : (
                    <div>
                        <label className="block text-[8px] font-extrabold tracking-[0.2em] text-cyan-300 mb-3 mt-6">SUB-TILES (7)</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(selectedCell as any).subTiles?.map((sub: any, i: number) => (
                                <div key={i} className="bg-black/40 border border-white/10 p-2 rounded-lg flex flex-col gap-1">
                                    <span className="text-[8px] font-black text-gray-400 tracking-widest uppercase truncate">{sub.id}</span>
                                    <span className="text-[9px] text-gray-200 font-bold truncate">{sub.biome}</span>
                                    <span className="text-[7px] text-gray-500 truncate">{sub.description}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
