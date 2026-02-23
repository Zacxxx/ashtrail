import { Slider, Toggle, Button } from "@ashtrail/ui";
import type { SimulationConfig, TerrainCell } from "../modules/geo/types";
import type { ContinentConfig, InspectorTab, GenerationProgress } from "./types";

interface GeologyPanelProps {
    inspectorTab: InspectorTab;
    setInspectorTab: (tab: InspectorTab) => void;
    prompt: string;
    setPrompt: (value: string) => void;
    aiResolution: string;
    setAiResolution: (value: string) => void;
    aiTemperature: number;
    setAiTemperature: (value: number) => void;
    showHexGrid: boolean;
    setShowHexGrid: (value: boolean) => void;
    generateCells: boolean;
    setGenerateCells: (value: boolean) => void;
    config: SimulationConfig;
    updateWorld: (patch: Partial<SimulationConfig["world"]>) => void;
    updateGeo: (patch: Partial<SimulationConfig["geo"]>) => void;
    updateClimate: (patch: Partial<SimulationConfig["climate"]>) => void;
    continents: ContinentConfig[];
    setContinents: (fn: ContinentConfig[] | ((prev: ContinentConfig[]) => ContinentConfig[])) => void;
    isGeneratingText: boolean;
    handleAutoGenerateContinents: () => void;
    generatePlanet: () => void;
    genProgress: GenerationProgress;
}

export function GeologyPanel({
    inspectorTab,
    prompt,
    setPrompt,
    aiResolution,
    setAiResolution,
    aiTemperature,
    setAiTemperature,
    showHexGrid,
    setShowHexGrid,
    generateCells,
    setGenerateCells,
    config,
    updateWorld,
    updateGeo,
    updateClimate,
    continents,
    setContinents,
    isGeneratingText,
    handleAutoGenerateContinents,
    generatePlanet,
    genProgress,
}: GeologyPanelProps) {
    return (
        <div className="flex flex-col gap-4 h-full">
            {/* Panel Content */}
            <div className="flex-1 flex flex-col bg-[#1e1e1e]/60 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-5 flex-1 overflow-y-auto scrollbar-thin">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-[11px] font-black tracking-[0.2em] text-[#E6E6FA] flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-[#E6E6FA] shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
                            GEOLOGY
                        </h3>
                    </div>

                    {inspectorTab === "base" && (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-extrabold tracking-[0.15em] text-gray-400 mb-3">
                                    THEMATIC SEED
                                </label>
                                <textarea
                                    value={prompt}
                                    onChange={e => setPrompt(e.target.value)}
                                    className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-[#E6E6FA]/50 resize-none shadow-inner placeholder:text-gray-700 transition-colors"
                                    placeholder="Describe the overall aesthetic and mood of the planet..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[9px] font-extrabold tracking-[0.15em] text-gray-400 mb-2">RESOLUTION</label>
                                    <select
                                        value={aiResolution}
                                        onChange={e => setAiResolution(e.target.value)}
                                        className="w-full bg-black/40 text-xs text-gray-300 border border-white/10 p-2.5 rounded-xl focus:outline-none focus:border-[#E6E6FA]/50 appearance-none shadow-inner"
                                    >
                                        <option value="1024x512">1K FAST</option>
                                        <option value="2048x1024">2K STANDARD</option>
                                        <option value="4096x2048">4K ULTRA</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[9px] font-extrabold tracking-[0.15em] text-gray-400 mb-2 flex justify-between">
                                        <span>TEMP</span>
                                        <span className="text-[#E6E6FA]">{aiTemperature.toFixed(2)}</span>
                                    </label>
                                    <input
                                        type="range" min="0" max="2" step="0.1"
                                        value={aiTemperature}
                                        onChange={e => setAiTemperature(parseFloat(e.target.value))}
                                        className="w-full accent-[#E6E6FA] mt-2"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 mt-2 border-t border-white/5 space-y-3">
                                <Toggle label="HEX OVERLAY" checked={showHexGrid} onChange={setShowHexGrid} />
                                <Toggle label="GENERATE TILE GRID (SLOW)" checked={generateCells} onChange={setGenerateCells} />
                            </div>
                        </div>
                    )}

                    {inspectorTab === "continents" && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center mb-4">
                                <span className="text-[10px] font-extrabold tracking-[0.15em] text-gray-400">LANDMASSES</span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleAutoGenerateContinents}
                                        disabled={isGeneratingText}
                                        className="text-[9px] font-bold tracking-widest text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 px-3 py-1.5 rounded-lg disabled:opacity-50 transition-all"
                                    >
                                        {isGeneratingText ? "..." : "AUTO-GEN"}
                                    </button>
                                    <button
                                        onClick={() => setContinents(prev => [...prev, { id: crypto.randomUUID(), name: `Continent ${prev.length + 1}`, prompt: "", size: 50 }])}
                                        className="text-[9px] font-bold tracking-widest text-[#E6E6FA] hover:text-purple-200 bg-[#E6E6FA]/10 hover:bg-[#E6E6FA]/20 border border-[#E6E6FA]/20 px-3 py-1.5 rounded-lg transition-all"
                                    >
                                        + ADD
                                    </button>
                                </div>
                            </div>

                            {continents.length === 0 && (
                                <div className="p-4 rounded-xl border border-white/5 bg-white/5 text-center">
                                    <p className="text-[10px] text-gray-500 leading-relaxed">No specific continents defined. AI will distribute random landmasses based on ocean settings.</p>
                                </div>
                            )}

                            <div className="space-y-4">
                                {continents.map((c, idx) => (
                                    <div key={c.id} className="p-4 bg-black/40 border border-white/5 rounded-xl relative group shadow-inner">
                                        <button
                                            onClick={() => setContinents(prev => prev.filter(x => x.id !== c.id))}
                                            className="absolute top-4 right-4 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>

                                        <input
                                            type="text"
                                            value={c.name}
                                            onChange={e => setContinents(prev => prev.map(x => x.id === c.id ? { ...x, name: e.target.value } : x))}
                                            className="bg-transparent text-[#E6E6FA] text-xs font-bold tracking-widest mb-3 focus:outline-none w-4/5 pb-1 border-b border-transparent focus:border-[#E6E6FA]/30 transition-colors"
                                            placeholder="Continent Name"
                                        />

                                        <textarea
                                            value={c.prompt}
                                            onChange={e => setContinents(prev => prev.map(x => x.id === c.id ? { ...x, prompt: e.target.value } : x))}
                                            className="w-full h-20 bg-white/5 border border-white/5 rounded-lg p-3 text-xs text-gray-300 focus:outline-none focus:border-[#E6E6FA]/30 resize-none mb-4 shadow-inner"
                                            placeholder="Describe geographic features..."
                                        />

                                        <Slider
                                            label="AREA PERCENTAGE" value={c.size}
                                            min={10} max={100} step={5} format={v => `${v}%`}
                                            onChange={v => setContinents(prev => prev.map(x => x.id === c.id ? { ...x, size: v } : x))}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {inspectorTab === "world" && (
                        <div className="space-y-6">
                            <Slider label="OCEAN COVERAGE" value={config.world.oceanCoverage} min={0.1} max={0.8} step={0.02} format={v => `${(v * 100).toFixed(0)}%`} onChange={v => updateWorld({ oceanCoverage: v })} />
                            <Slider label="SOLAR LUMINOSITY" value={config.world.solarLuminosity} min={0.5} max={2.0} step={0.05} format={v => `${v.toFixed(2)}×`} onChange={v => updateWorld({ solarLuminosity: v })} />
                            <Slider label="AXIAL TILT" value={config.world.axialTilt} min={0} max={45} step={0.5} format={v => `${v.toFixed(1)}°`} onChange={v => updateWorld({ axialTilt: v })} />
                            <Slider label="ATMOSPHERE DENSITY" value={config.world.atmosphericDensity} min={0.1} max={3.0} step={0.1} format={v => `${v.toFixed(1)}×`} onChange={v => updateWorld({ atmosphericDensity: v })} />
                        </div>
                    )}

                    {inspectorTab === "geology" && (
                        <div className="space-y-4">
                            <Slider label="CONTINENTAL SCALE" value={config.geo.continentalScale} min={100} max={1000} step={25} onChange={v => updateGeo({ continentalScale: v })} />
                            <Slider label="PLATE COUNT" value={config.geo.plateCount} min={2} max={12} step={1} onChange={v => updateGeo({ plateCount: v })} />
                            <Slider label="TECTONIC INTENSITY" value={config.geo.tectonicIntensity} min={0} max={3.0} step={0.1} format={v => v.toFixed(1)} onChange={v => updateGeo({ tectonicIntensity: v })} />
                            <Slider label="VOLCANIC DENSITY" value={config.geo.volcanicDensity} min={0} max={1} step={0.05} format={v => `${(v * 100).toFixed(0)}%`} onChange={v => updateGeo({ volcanicDensity: v })} />
                        </div>
                    )}

                    {inspectorTab === "climate" && (
                        <div className="space-y-4">
                            <Slider label="GLOBAL MEAN TEMP" value={config.climate.globalMeanTemp} min={-20} max={50} step={1} format={v => `${v}°C`} onChange={v => updateClimate({ globalMeanTemp: v })} />
                            <Slider label="LATITUDE GRADIENT" value={config.climate.latitudeGradient} min={10} max={100} step={5} format={v => `${v}°C`} onChange={v => updateClimate({ latitudeGradient: v })} />
                            <Slider label="WIND STRENGTH" value={config.climate.windStrength} min={0} max={3.0} step={0.1} format={v => v.toFixed(1)} onChange={v => updateClimate({ windStrength: v })} />
                            <Slider label="PRECIPITATION" value={config.climate.precipitationMultiplier} min={0} max={3.0} step={0.1} format={v => `${v.toFixed(1)}×`} onChange={v => updateClimate({ precipitationMultiplier: v })} />
                        </div>
                    )}

                    <div className="pt-4 border-t border-[#1f2937]">
                        <Button
                            variant="primary"
                            onClick={generatePlanet}
                            disabled={genProgress.isActive}
                            className="w-full text-[10px] tracking-widest py-3 bg-[#E6E6FA] hover:bg-[#E6E6FA] border-none"
                        >
                            {genProgress.isActive ? "GENERATING..." : "GENERATE PLANET"}
                        </Button>

                        {genProgress.stage && !genProgress.isActive && (
                            <p className="text-[10px] text-gray-500 text-center mt-2">{genProgress.stage}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
