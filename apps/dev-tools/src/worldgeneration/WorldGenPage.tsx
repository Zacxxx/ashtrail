import { useState, useCallback } from "react";
import { TabBar, Modal } from "@ashtrail/ui";
import { Link } from "react-router-dom";
import type { SimulationConfig, TerrainCell } from "../modules/geo/types";
import { DEFAULT_CONFIG } from "../modules/geo/engine";
import { useGenerationHistory } from "../hooks/useGenerationHistory";

import type { WorkflowStep, ViewMode, InspectorTab, ContinentConfig, PlanetWorld } from "./types";
import { useWorldGeneration } from "./useWorldGeneration";
import { GeologyPanel } from "./GeologyPanel";
import { GeographyPipelinePanel } from "./GeographyPipelinePanel";
import { EcologyPanel } from "./EcologyPanel";
import { HumanityPanel } from "./HumanityPanel";
import { WorldCanvas } from "./WorldCanvas";
import { CellTooltip } from "./CellTooltip";
import { WorkflowBar } from "./WorkflowBar";
import { ProgressOverlay } from "./ProgressOverlay";
import { HistoryGallery } from "./HistoryGallery";

export function WorldGenPage() {
    // ── Core UI State ──
    const [viewMode, setViewMode] = useState<ViewMode>("3d");
    const [activeStep, setActiveStep] = useState<WorkflowStep>("GEO");
    const [inspectorTab, setInspectorTab] = useState<InspectorTab>("base");
    const [showHistory, setShowHistory] = useState(false);
    const [showConfigPanel, setShowConfigPanel] = useState(true);
    const [showHexGrid, setShowHexGrid] = useState(false);
    const [generateCells, setGenerateCells] = useState(false);
    const [isMaxView, setIsMaxView] = useState(false);

    // ── History ──
    const { history, saveToHistory, deleteFromHistory } = useGenerationHistory();
    const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);

    // ── Planet State ──
    const [prompt, setPrompt] = useState<string>("A desolate, dusty orange planet with deep canyon scars, dry ocean basins, and rocky gray mountain ranges.");
    const [aiResolution, setAiResolution] = useState<string>("2048x1024");
    const [aiTemperature, setAiTemperature] = useState<number>(0.7);
    const [config, setConfig] = useState<SimulationConfig>({ ...DEFAULT_CONFIG });
    const [continents, setContinents] = useState<ContinentConfig[]>([
        { id: "1", name: "Pangaea Prime", prompt: "A massive central supercontinent dominated by blasted badlands and volcanic ridges.", size: 80 }
    ]);
    const [globeWorld, setGlobeWorld] = useState<PlanetWorld | null>(null);

    // ── Ecology / Humanity State ──
    const [ecoPrompt, setEcoPrompt] = useState<string>("Overpaint this terrain with dense, bioluminescent alien jungles and vast fungal forests along the equator.");
    const [ecoVegetation, setEcoVegetation] = useState<number>(0.8);
    const [ecoFauna, setEcoFauna] = useState<number>(0.5);
    const [humPrompt, setHumPrompt] = useState<string>("Develop advanced medieval city-states connected by dusty trade routes and surrounded by sprawling farmlands.");
    const [humSettlements, setHumSettlements] = useState<number>(0.6);
    const [humTech, setHumTech] = useState<number>(0.4);

    // ── Interaction State ──
    const [hoveredCell, setHoveredCell] = useState<TerrainCell | null>(null);
    const [selectedCell, setSelectedCell] = useState<TerrainCell | null>(null);

    // ── Config Helpers ──
    const updateWorld = useCallback((patch: Partial<SimulationConfig["world"]>) => {
        setConfig(prev => ({ ...prev, world: { ...prev.world, ...patch } }));
    }, []);
    const updateGeo = useCallback((patch: Partial<SimulationConfig["geo"]>) => {
        setConfig(prev => ({ ...prev, geo: { ...prev.geo, ...patch } }));
    }, []);
    const updateClimate = useCallback((patch: Partial<SimulationConfig["climate"]>) => {
        setConfig(prev => ({ ...prev, climate: { ...prev.climate, ...patch } }));
    }, []);

    // ── Generation Hook ──
    // Note: saveCellSubTiles removed since old geography cells pipeline is deprecated
    const {
        genProgress,
        isGeneratingText,
        generatePlanet,
        generateEcology,
        generateHumanity,
        handleAutoGenerateContinents,
    } = useWorldGeneration({
        prompt, config, aiResolution, aiTemperature, continents,
        ecoPrompt, ecoVegetation, ecoFauna,
        humPrompt, humSettlements, humTech,
        globeWorld, saveToHistory, setGlobeWorld, setContinents, setActiveHistoryId,
        saveCellSubTiles: () => { } // Stub — old cell pipeline deprecated
    });

    // ── Cell Handlers ──
    const handleCellHover = useCallback((cell: TerrainCell | null) => setHoveredCell(cell), []);
    const handleCellClick = useCallback((cell: TerrainCell | null) => {
        if (cell) {
            setSelectedCell(cell);
            setActiveStep("GEOGRAPHY");
        } else {
            setSelectedCell(null);
        }
    }, []);

    // ── Step Change Handler ──
    const handleStepChange = useCallback((step: WorkflowStep) => {
        setActiveStep(step);
    }, []);

    return (
        <div className="flex flex-col h-screen bg-[#1e1e1e] text-gray-300 font-sans tracking-wide overflow-hidden relative">
            <div className="absolute inset-0 z-0 pointer-events-none opacity-40 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-[#030508] to-[#030508]" />

            {/* ══ Header ══ */}
            <header className="absolute top-0 left-0 right-0 z-30 bg-[#030508]/90 backdrop-blur-md border-b border-white/5 pointer-events-auto">
                <div className="h-16 flex items-center justify-between px-6 w-full">
                    {/* Left: Logo & Contextual Tabs */}
                    <div className="flex items-center gap-6">
                        <Link to="/" className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-all">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        </Link>
                        <h1 className="text-xs font-black tracking-[0.3em] text-white">ASHTRAIL</h1>

                        {/* Sub-Header Tabs attached to header when in GEO Step */}
                        {activeStep === "GEO" && (
                            <div className="flex items-center ml-4 pl-4 border-l border-white/10 h-8">
                                <TabBar
                                    tabs={["base", "world", "continents", "geology", "climate"]}
                                    activeTab={inspectorTab}
                                    onTabChange={(tab) => setInspectorTab(tab as InspectorTab)}
                                    className="flex-1 shrink-0"
                                />
                                <button
                                    onClick={() => setShowConfigPanel(prev => !prev)}
                                    className="flex items-center justify-center w-8 h-8 ml-2 rounded-full border border-white/5 text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                                    title={showConfigPanel ? "Collapse config" : "Expand config"}
                                >
                                    <svg className={`w-4 h-4 transition-transform ${showConfigPanel ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Center: Stage Navigation */}
                    <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
                        <WorkflowBar activeStep={activeStep} onStepChange={handleStepChange} />
                    </div>

                    {/* Right: Map Controls */}
                    <div className="flex items-center justify-end gap-4">
                        <div className="flex items-center bg-[#1e1e1e]/60 border border-white/5 rounded-full p-0.5 shadow-lg">
                            <button onClick={() => setViewMode("2d")} className={`px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest transition-all ${viewMode === "2d" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}>MAP 2D</button>
                            <button onClick={() => setViewMode("3d")} className={`px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest transition-all ${viewMode === "3d" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}>GLOBE 3D</button>
                        </div>
                        <button
                            onClick={() => setShowHistory(!showHistory)}
                            className={`flex items-center justify-center w-9 h-9 rounded-full border transition-all shadow-lg ${showHistory ? 'bg-[#E6E6FA]/20 border-[#E6E6FA]/50 text-[#E6E6FA]' : 'bg-[#1e1e1e]/60 border-white/5 text-gray-400 hover:text-white hover:bg-white/5'}`}
                            title="Generation Gallery"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        </button>
                    </div>
                </div>
            </header>

            {/* ══ Main Layout ══ */}
            <div className="flex-1 flex overflow-hidden relative z-10 pt-[80px] pb-12">

                {/* Left Sidebar Flow */}
                <aside
                    className={`absolute left-4 top-[80px] bottom-12 w-[340px] z-20 flex flex-col gap-4 overflow-y-auto scrollbar-none transition-transform duration-500 ease-in-out ${isMaxView ? '-translate-x-[400px]' : 'translate-x-0'}`}
                >
                    {activeStep === "GEO" && showConfigPanel && (
                        <GeologyPanel
                            inspectorTab={inspectorTab} setInspectorTab={setInspectorTab}
                            prompt={prompt} setPrompt={setPrompt}
                            aiResolution={aiResolution} setAiResolution={setAiResolution}
                            aiTemperature={aiTemperature} setAiTemperature={setAiTemperature}
                            showHexGrid={showHexGrid} setShowHexGrid={setShowHexGrid}
                            generateCells={generateCells} setGenerateCells={setGenerateCells}
                            config={config} updateWorld={updateWorld} updateGeo={updateGeo} updateClimate={updateClimate}
                            continents={continents} setContinents={setContinents}
                            isGeneratingText={isGeneratingText} handleAutoGenerateContinents={handleAutoGenerateContinents}
                            generatePlanet={() => generatePlanet(generateCells)} genProgress={genProgress}
                        />
                    )}
                    {activeStep === "GEOGRAPHY" && (
                        <GeographyPipelinePanel
                            activeHistoryId={activeHistoryId}
                            globeWorld={globeWorld}
                        />
                    )}
                    {activeStep === "ECO" && (
                        <EcologyPanel
                            ecoPrompt={ecoPrompt} setEcoPrompt={setEcoPrompt}
                            ecoVegetation={ecoVegetation} setEcoVegetation={setEcoVegetation}
                            ecoFauna={ecoFauna} setEcoFauna={setEcoFauna}
                            generateEcology={generateEcology} genProgress={genProgress} globeWorld={globeWorld}
                            regions={[]}
                        />
                    )}
                    {activeStep === "HUMANITY" && (
                        <HumanityPanel
                            humPrompt={humPrompt} setHumPrompt={setHumPrompt}
                            humSettlements={humSettlements} setHumSettlements={setHumSettlements}
                            humTech={humTech} setHumTech={setHumTech}
                            generateHumanity={generateHumanity} genProgress={genProgress} globeWorld={globeWorld}
                            regions={[]}
                        />
                    )}
                </aside>

                {/* Center Canvas Wrapper */}
                <div
                    className={`flex-1 flex flex-col transition-all duration-500 ease-in-out h-full overflow-hidden
                        ${isMaxView ? 'ml-0' : 'ml-[370px]'}
                    `}
                >
                    <WorldCanvas
                        viewMode={viewMode} globeWorld={globeWorld}
                        showHexGrid={showHexGrid}
                        onCellHover={handleCellHover} onCellClick={handleCellClick}
                        activeStep={activeStep}
                        geographyTool={"pan"}
                        activeRegionType={"continent"}
                        geography={{ regions: [], selectedRegionId: null, hoveredRegionId: null, setSelectedRegionId: () => { }, setHoveredRegionId: () => { }, addRegion: () => ({} as any), updateRegion: () => { }, deleteRegion: () => { }, clearRegions: () => { }, findRegionAtPoint: () => null }}
                        geographyTab={"regions"}
                        isMaxView={isMaxView}
                        setIsMaxView={setIsMaxView}
                    />
                </div>

                {/* History Modal */}
                <Modal open={showHistory} onClose={() => setShowHistory(false)} title="ARCHIVES">
                    <HistoryGallery
                        history={history}
                        activePlanetId={activeHistoryId}
                        deleteFromHistory={deleteFromHistory}
                        onSelectPlanet={(item) => {
                            setGlobeWorld({ cols: 512, rows: 256, cellData: [], textureUrl: item.textureUrl });
                            setConfig(item.config);
                            setPrompt(item.prompt.split("User Instructions:\n")[1]?.split("\n")[0] || item.prompt);
                            setActiveHistoryId(item.id);
                            setShowHistory(false);
                        }}
                        onSelectTexture={(_, textureUrl) => {
                            setGlobeWorld(prev => prev ? { ...prev, textureUrl } : { cols: 512, rows: 256, cellData: [], textureUrl });
                            setShowHistory(false);
                        }}
                    />
                </Modal>

                {/* Progress Overlay */}
                <ProgressOverlay genProgress={genProgress} />

                {/* Cell Tooltip */}
                {hoveredCell && !selectedCell && viewMode === "3d" && (
                    <CellTooltip hoveredCell={hoveredCell} />
                )}
            </div>
        </div>
    );
}
