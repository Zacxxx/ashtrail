import { Button } from "@ashtrail/ui";
import type { TerrainCell } from "../modules/geo/types";
import { BIOME_META } from "../modules/geo/biomes";

interface RegionInspectorProps {
    selectedCell: TerrainCell;
    onClose: () => void;
    regionLore: any | null;
    isFetchingLore: boolean;
    onScan: () => void;
}

export function RegionInspector({
    selectedCell,
    onClose,
    regionLore,
    isFetchingLore,
    onScan,
}: RegionInspectorProps) {
    return (
        <aside className="absolute top-24 right-8 bottom-32 w-[340px] z-30">
            <div className="h-full flex flex-col p-5 bg-[#1e1e1e]/80 backdrop-blur-xl border border-[#E6E6FA]/30 rounded-2xl shadow-2xl relative">

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 w-6 h-6 flex items-center justify-center rounded-full bg-white/5 text-gray-400 hover:text-white hover:bg-red-500/20 transition-all border border-transparent hover:border-red-500/30"
                >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                <div className="mb-6 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-[#E6E6FA] animate-pulse" />
                    <h2 className="text-[10px] font-black tracking-[0.25em] text-white">
                        INSPECTOR OVERRIDE
                    </h2>
                </div>

                <div className="flex items-center gap-4 bg-black/40 p-3 rounded-xl border border-white/5 mb-6">
                    <div className="w-10 h-10 rounded-lg shadow-inner border border-white/10" style={{ backgroundColor: selectedCell.color }} />
                    <div className="flex flex-col">
                        <span className="text-[11px] text-[#E6E6FA] font-black tracking-widest uppercase">{BIOME_META[selectedCell.biome]?.name ?? selectedCell.biome}</span>
                        <span className="text-[9px] text-gray-500 font-mono mt-1">LOC: {selectedCell.x}, {selectedCell.y}</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-6">
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                        <span className="block text-[8px] font-black tracking-widest text-gray-500 mb-1">ELEVATION</span>
                        <span className="text-[11px] text-gray-200 font-mono">{selectedCell.elevationMeters.toFixed(0)}m</span>
                    </div>
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                        <span className="block text-[8px] font-black tracking-widest text-gray-500 mb-1">CLIMATE</span>
                        <span className="text-[11px] text-gray-200 font-mono">{selectedCell.temperature.toFixed(0)}°C / {(selectedCell.moisture * 100).toFixed(0)}%</span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-thin flex flex-col min-h-0 relative">
                    {regionLore ? (
                        <div className="space-y-6 pb-4">
                            {regionLore.error ? (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex flex-col items-center text-center">
                                    <svg className="w-6 h-6 text-red-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    <span className="text-red-400 text-[10px] font-bold tracking-wider">{regionLore.error}</span>
                                </div>
                            ) : (
                                <>
                                    <div className="bg-[#E6E6FA]/5 p-4 rounded-xl border border-[#E6E6FA]/20">
                                        <h3 className="text-[8px] font-black tracking-[0.2em] text-[#E6E6FA] mb-2">DESIGNATION</h3>
                                        <p className="text-[13px] text-white font-medium tracking-wide">{regionLore.regionName}</p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                                            <h3 className="text-[8px] font-black tracking-[0.2em] text-gray-500 mb-1">POPULATION</h3>
                                            <p className="text-[11px] text-gray-200 font-mono">{(regionLore.population || 0).toLocaleString()}</p>
                                        </div>
                                        <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                                            <h3 className="text-[8px] font-black tracking-[0.2em] text-gray-500 mb-1">SECURITY</h3>
                                            <p className="text-[11px] text-green-400 font-mono">STABLE</p>
                                        </div>
                                    </div>

                                    <div>
                                        <h3 className="text-[8px] font-black tracking-[0.2em] text-[#E6E6FA] mb-2 flex items-center gap-2">
                                            <span className="w-1 h-1 bg-[#E6E6FA] rounded-full" /> STRUCTURAL ANALYSIS
                                        </h3>
                                        <p className="text-[11px] text-gray-400 leading-relaxed italic bg-black/20 p-3 rounded-xl border border-white/5">"{regionLore.resourcesSummary}"</p>
                                    </div>

                                    <div>
                                        <h3 className="text-[8px] font-black tracking-[0.2em] text-[#E6E6FA] mb-2 flex items-center gap-2">
                                            <span className="w-1 h-1 bg-[#E6E6FA] rounded-full" /> ARCHIVAL RECORD
                                        </h3>
                                        <p className="text-[11px] text-gray-300 leading-relaxed space-y-2">
                                            {regionLore.lore}
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-black/20 rounded-xl border border-white/5">
                            <svg className="w-10 h-10 text-gray-600 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                            <h3 className="text-[9px] font-black tracking-[0.2em] text-gray-400 mb-2">AWAITING DEEP SCAN</h3>
                            <p className="text-[10px] text-gray-600 leading-relaxed">
                                {isFetchingLore ? "Synchronizing satellite links and retrieving archival simulation data..." : "Initialize region scan to generate localized entities, economies, and historical context."}
                            </p>
                        </div>
                    )}
                </div>

                {!regionLore && (
                    <div className="pt-4 mt-2 border-t border-white/5 shrink-0">
                        <Button
                            variant="primary"
                            onClick={onScan}
                            disabled={isFetchingLore}
                            className="w-full text-[10px] tracking-[0.2em] font-black py-3.5 bg-[#E6E6FA]/80 hover:bg-[#E6E6FA] border border-[#E6E6FA]/50 rounded-xl transition-all shadow-[0_0_15px_rgba(168,85,247,0.2)] disabled:opacity-50 disabled:shadow-none"
                        >
                            {isFetchingLore ? "CALCULATING..." : "INITIATE SCAN"}
                        </Button>
                    </div>
                )}

            </div>
        </aside>
    );
}
