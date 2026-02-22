import type { TerrainCell } from "../modules/geo/types";
import { BIOME_META } from "../modules/geo/biomes";

interface CellTooltipProps {
    hoveredCell: TerrainCell;
}

export function CellTooltip({ hoveredCell }: CellTooltipProps) {
    return (
        <aside className="absolute bottom-8 right-8 z-20 w-56 pointer-events-none">
            <div className="px-4 py-3 bg-[#1e1e1e]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
                <div className="flex items-center gap-3 mb-3 border-b border-white/5 pb-3">
                    <div className="w-4 h-4 rounded-md shadow-inner border border-white/10" style={{ backgroundColor: hoveredCell.color }} />
                    <span className="text-white text-[10px] font-black tracking-widest uppercase">{BIOME_META[hoveredCell.biome]?.name ?? hoveredCell.biome}</span>
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between items-center group">
                        <span className="text-[9px] font-bold tracking-widest text-gray-500">HEX ID</span>
                        <span className="text-[10px] text-gray-300 font-mono bg-white/5 px-2 py-0.5 rounded">{hoveredCell.x},{hoveredCell.y}</span>
                    </div>
                    <div className="flex justify-between items-center group">
                        <span className="text-[9px] font-bold tracking-widest text-gray-500">ELEVATION</span>
                        <span className="text-[10px] text-gray-300 font-mono bg-white/5 px-2 py-0.5 rounded text-right min-w-[3rem]">{hoveredCell.elevationMeters.toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between items-center group">
                        <span className="text-[9px] font-bold tracking-widest text-gray-500">TEMP</span>
                        <span className="text-[10px] text-gray-300 font-mono bg-white/5 px-2 py-0.5 rounded text-right min-w-[3rem]">{hoveredCell.temperature.toFixed(1)}°</span>
                    </div>
                    <div className="flex justify-between items-center group">
                        <span className="text-[9px] font-bold tracking-widest text-gray-500">HUMIDITY</span>
                        <span className="text-[10px] text-gray-300 font-mono bg-white/5 px-2 py-0.5 rounded text-right min-w-[3rem]">{(hoveredCell.moisture * 100).toFixed(0)}%</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
