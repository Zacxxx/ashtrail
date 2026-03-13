import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { TabBar, Modal } from "@ashtrail/ui";
import { Link, useSearchParams } from "react-router-dom";
import type { SimulationConfig, TerrainCell } from "../modules/geo/types";
import { DEFAULT_CONFIG } from "../modules/geo/engine";
import { useGenerationHistory } from "../hooks/useGenerationHistory";
import { useActiveWorld } from "../hooks/useActiveWorld";
import { useJobs } from "../jobs/useJobs";

import type {
    WorkflowStep,
    ViewMode,
    InspectorTab,
    ContinentConfig,
    PlanetWorld,
    HumanityReadiness,
    HumanityScopeKind,
    HumanityScopeTarget,
    WorldgenRegionRecord,
} from "./types";
import { useWorldGeneration } from "./useWorldGeneration";
import { GeologyPanel } from "./GeologyPanel";
import { GeographyPipelinePanel } from "./GeographyPipelinePanel";
import { GeographyInspectorPanel, type InspectorLayer } from "./GeographyInspectorPanel";
import { GeographyIsolatorPanel } from "./GeographyIsolatorPanel";
import { ProvinceRefinementPanel } from "./ProvinceRefinementPanel";
import { EcologyPanel } from "./EcologyPanel";
import { HumanityPanel } from "./HumanityPanel";
import { WorldCanvas } from "./WorldCanvas";
import { CellTooltip } from "./CellTooltip";
import { WorkflowBar } from "./WorkflowBar";
import { ProgressOverlay } from "./ProgressOverlay";
import { HistoryGallery } from "./HistoryGallery";
import type { LocationGenerationMetadata, WorldLocation } from "../history/locationTypes";

function inferHumanityScopeKind(targets: HumanityScopeTarget[]): HumanityScopeKind {
    if (targets.length === 0) return "world";
    const kinds = new Set(targets.map((target) => target.kind));
    if (kinds.size > 1) return "mixed";
    const [kind] = Array.from(kinds);
    return kind;
}

function resolveProvinceCount(regions: WorldgenRegionRecord[], scopeKind: HumanityScopeKind, targets: HumanityScopeTarget[]) {
    if (scopeKind === "world") {
        return regions.filter((region) => region.type === "Province").length;
    }
    const duchyMap = new Map(
        regions.filter((region) => region.type === "Duchy").map((region) => [region.rawId, region.provinceIds || []] as const),
    );
    const kingdomMap = new Map(
        regions.filter((region) => region.type === "Kingdom").map((region) => [region.rawId, region.duchyIds || []] as const),
    );
    const resolved = new Set<number>();
    targets.forEach((target) => {
        if (target.kind === "province") {
            resolved.add(target.id);
            return;
        }
        if (target.kind === "duchy") {
            (duchyMap.get(target.id) || []).forEach((provinceId) => resolved.add(provinceId));
            return;
        }
        (kingdomMap.get(target.id) || []).forEach((duchyId) => {
            (duchyMap.get(duchyId) || []).forEach((provinceId) => resolved.add(provinceId));
        });
    });
    return resolved.size;
}

export function WorldGenPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const { getJobDetail } = useJobs();
    const restoredJobIdRef = useRef<string | null>(null);
    // ── Core UI State ──
    const [viewMode, setViewMode] = useState<ViewMode>("3d");
    const [activeStep, setActiveStep] = useState<WorkflowStep>("GEO");
    const [inspectorTab, setInspectorTab] = useState<InspectorTab>("base");
    const [geographyTab, setGeographyTab] = useState<"pipeline" | "inspector" | "isolator" | "refinement">("pipeline");
    const [geoSelectedId, setGeoSelectedId] = useState<number | null>(null);
    const [geoHoveredId, setGeoHoveredId] = useState<number | null>(null);
    const [geoBulkSelectedIds, setGeoBulkSelectedIds] = useState<number[]>([]);
    const [geoBulkMode, setGeoBulkMode] = useState(false);
    const [inspectorLayer, setInspectorLayer] = useState<InspectorLayer>("provinces");
    const [provinceTextureVersion, setProvinceTextureVersion] = useState(0);
    const [showHistory, setShowHistory] = useState(false);
    const [showConfigPanel, setShowConfigPanel] = useState(true);
    const [showHexGrid, setShowHexGrid] = useState(false);
    const [generateCells, setGenerateCells] = useState(false);
    const [isMaxView, setIsMaxView] = useState(false);

    // ── History ──
    const { history, saveToHistory, deleteFromHistory, renameInHistory } = useGenerationHistory();
    const { activeWorldId, setActiveWorldId } = useActiveWorld();

    // Sync local state with activeWorldId on mount and when it changes
    useEffect(() => {
        if (activeWorldId) {
            const item = history.find(h => h.id === activeWorldId);
            if (item) {
                setGlobeWorld({
                    cols: 512,
                    rows: 256,
                    cellData: [],
                    textureUrl: item.textureUrl,
                    provinceOverlays: item.provinceOverlays || [],
                });
                setConfig(item.config);
                // Extract prompt title if present
                const displayPrompt = item.prompt.split("User Instructions:\n")[1]?.split("\n")[0] || item.prompt;
                setPrompt(displayPrompt);
            }
        }
    }, [activeWorldId, history]);

    const handleSelectWorldFromHistory = (item: any) => {
        setActiveWorldId(item.id);
        setGlobeWorld({
            cols: 512,
            rows: 256,
            cellData: [],
            textureUrl: item.textureUrl,
            provinceOverlays: item.provinceOverlays || [],
        });
        setConfig(item.config);
        setPrompt(item.prompt.split("User Instructions:\n")[1]?.split("\n")[0] || item.prompt);
    };

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
    const [humanityLocations, setHumanityLocations] = useState<WorldLocation[]>([]);
    const [locationGenerationMeta, setLocationGenerationMeta] = useState<LocationGenerationMetadata | null>(null);
    const [selectedHumanityLocationId, setSelectedHumanityLocationId] = useState<string | null>(null);
    const [humanityReadiness, setHumanityReadiness] = useState<HumanityReadiness | null>(null);
    const [humanityRegions, setHumanityRegions] = useState<WorldgenRegionRecord[]>([]);
    const [humanityScopeKind, setHumanityScopeKind] = useState<HumanityScopeKind>("kingdom");
    const [humanityScopeTargets, setHumanityScopeTargets] = useState<HumanityScopeTarget[]>([]);
    const [humanityScopeQuery, setHumanityScopeQuery] = useState("");
    const [isAdoptingHumanityOutput, setIsAdoptingHumanityOutput] = useState(false);

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

    const refreshHumanityData = useCallback(async (worldId: string) => {
        const [locationsRes, metaRes, readinessRes, regionsRes] = await Promise.all([
            fetch(`http://127.0.0.1:8787/api/planet/locations/${worldId}`),
            fetch(`http://127.0.0.1:8787/api/planet/location-generation/${worldId}`),
            fetch(`http://127.0.0.1:8787/api/planet/humanity-readiness/${worldId}`),
            fetch(`http://127.0.0.1:8787/api/planet/worldgen-regions/${worldId}`),
        ]);
        const [locationsData, metaData, readinessData, regionsData] = await Promise.all([
            locationsRes.ok ? locationsRes.json() : [],
            metaRes.ok ? metaRes.json() : null,
            readinessRes.ok ? readinessRes.json() : null,
            regionsRes.ok ? regionsRes.json() : [],
        ]);
        const nextLocations = Array.isArray(locationsData) ? locationsData : [];
        setHumanityLocations(nextLocations);
        setLocationGenerationMeta(metaData && typeof metaData === "object" ? metaData : null);
        setHumanityReadiness(readinessData && typeof readinessData === "object" ? readinessData : null);
        setHumanityRegions(Array.isArray(regionsData) ? regionsData : []);
        setSelectedHumanityLocationId((prev) => prev && nextLocations.some((entry) => entry.id === prev) ? prev : nextLocations[0]?.id || null);
    }, []);

    const humanityScopeMode = humanityScopeKind === "world" ? "world" : "scoped";

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
        humanityScopeMode,
        humanityScopeTargets,
        activeWorldId,
        globeWorld, saveToHistory, setGlobeWorld, setContinents, setActiveWorldId,
        saveCellSubTiles: () => { }, // Stub — old cell pipeline deprecated
        onHumanityGenerated: async () => {
            if (!activeWorldId) return;
            await refreshHumanityData(activeWorldId);
        },
    });

    useEffect(() => {
        if (!activeWorldId) {
            setHumanityLocations([]);
            setLocationGenerationMeta(null);
            setSelectedHumanityLocationId(null);
            setHumanityReadiness(null);
            setHumanityRegions([]);
            return;
        }
        let cancelled = false;
        async function loadHumanityData() {
            try {
                await refreshHumanityData(activeWorldId);
                if (cancelled) return;
            } catch (error) {
                console.error("Failed to load generated locations", error);
                if (!cancelled) {
                    setHumanityLocations([]);
                    setLocationGenerationMeta(null);
                    setSelectedHumanityLocationId(null);
                    setHumanityReadiness(null);
                    setHumanityRegions([]);
                }
            }
        }
        loadHumanityData();
        return () => {
            cancelled = true;
        };
    }, [activeWorldId, refreshHumanityData]);

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

    const handleGeoBulkToggleId = useCallback((id: number | null) => {
        if (id === null) return;
        setGeoBulkSelectedIds((prev) => (
            prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
        ));
    }, []);

    const handleGeoBulkClear = useCallback(() => {
        setGeoBulkSelectedIds([]);
    }, []);

    const selectedWorld = history.find(h => h.id === activeWorldId);
    const humanityVisibleRegions = useMemo(() => {
        const query = humanityScopeQuery.trim().toLowerCase();
        const typeFilter = humanityScopeKind === "mixed"
            ? new Set(["Kingdom", "Duchy", "Province"])
            : humanityScopeKind === "kingdom"
                ? new Set(["Kingdom"])
                : humanityScopeKind === "duchy"
                    ? new Set(["Duchy"])
                    : humanityScopeKind === "province"
                        ? new Set(["Province"])
                        : new Set<string>();
        return humanityRegions.filter((region) => {
            if (humanityScopeKind === "world") return false;
            if (!typeFilter.has(region.type)) return false;
            if (!query) return true;
            return `${region.name} ${region.type} ${region.rawId}`.toLowerCase().includes(query);
        });
    }, [humanityRegions, humanityScopeKind, humanityScopeQuery]);
    const humanityResolvedProvinceCount = useMemo(
        () => resolveProvinceCount(humanityRegions, humanityScopeKind, humanityScopeTargets),
        [humanityRegions, humanityScopeKind, humanityScopeTargets],
    );

    useEffect(() => {
        const restoreJobId = searchParams.get("restoreJob");
        if (!restoreJobId || restoredJobIdRef.current === restoreJobId) {
            return;
        }
        restoredJobIdRef.current = restoreJobId;
        const redoScope = searchParams.get("redoScope");
        const restore = async () => {
            const detail = await getJobDetail(restoreJobId);
            const restoreSpec = detail?.metadata && typeof detail.metadata.restore === "object"
                ? (detail.metadata.restore as { payload?: Record<string, unknown> })
                : null;
            const payload = restoreSpec?.payload || {};
            if (typeof payload.worldId === "string") {
                setActiveWorldId(payload.worldId);
            }
            if (typeof payload.humPrompt === "string") setHumPrompt(payload.humPrompt);
            if (typeof payload.humSettlements === "number") setHumSettlements(payload.humSettlements);
            if (typeof payload.humTech === "number") setHumTech(payload.humTech);
            const restoredTargets = Array.isArray(payload.humanityScopeTargets)
                ? payload.humanityScopeTargets.filter((entry): entry is HumanityScopeTarget => {
                    return !!entry && typeof entry === "object"
                        && typeof (entry as HumanityScopeTarget).id === "number"
                        && ["kingdom", "duchy", "province"].includes((entry as HumanityScopeTarget).kind);
                })
                : [];
            if (redoScope === "world") {
                setHumanityScopeKind("world");
                setHumanityScopeTargets([]);
            } else {
                setHumanityScopeTargets(restoredTargets);
                setHumanityScopeKind(inferHumanityScopeKind(restoredTargets));
            }
            setActiveStep("HUMANITY");
        };
        void restore();
    }, [getJobDetail, searchParams, setActiveWorldId]);

    useEffect(() => {
        if (humanityScopeKind === "world") {
            setHumanityScopeTargets([]);
            return;
        }
        if (humanityScopeKind === "mixed") return;
        setHumanityScopeTargets((previous) => previous.filter((entry) => entry.kind === humanityScopeKind));
    }, [humanityScopeKind]);

    const handleToggleHumanityScopeTarget = useCallback((target: HumanityScopeTarget) => {
        setHumanityScopeTargets((previous) => {
            const exists = previous.some((entry) => entry.kind === target.kind && entry.id === target.id);
            return exists
                ? previous.filter((entry) => !(entry.kind === target.kind && entry.id === target.id))
                : [...previous, target];
        });
    }, []);

    const handleAdoptHumanityOutput = useCallback(async () => {
        if (!activeWorldId || isAdoptingHumanityOutput) return;
        setIsAdoptingHumanityOutput(true);
        try {
            const response = await fetch(`http://127.0.0.1:8787/api/planet/locations/${activeWorldId}/adopt-humanity-managed`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    scopeMode: humanityScopeMode,
                    scopeTargets: humanityScopeMode === "world" ? [] : humanityScopeTargets,
                }),
            });
            if (!response.ok) {
                throw new Error(await response.text());
            }
            await refreshHumanityData(activeWorldId);
        } catch (error) {
            console.error("Failed to adopt humanity output", error);
        } finally {
            setIsAdoptingHumanityOutput(false);
        }
    }, [activeWorldId, humanityScopeMode, humanityScopeTargets, isAdoptingHumanityOutput, refreshHumanityData]);

    const sidebarWidth = 340;
    const sidebarOffset = 370;
    const sidebarHiddenOffset = 400;

    return (
        <div className="flex flex-col h-screen bg-[#1e1e1e] text-gray-300 font-sans tracking-wide overflow-hidden relative">
            <div className="absolute inset-0 z-0 pointer-events-none opacity-40 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-[#030508] to-[#030508]" />

            {/* ══ Tool-Specific Sub-Header ══ */}
            <div className="fixed top-16 left-0 right-0 z-30 bg-[#030508]/60 backdrop-blur-md border-b border-white/5 pointer-events-auto flex items-center justify-between px-6 h-12 shadow-2xl">
                {/* Left: Contextual Tabs */}
                <div className="flex items-center gap-4">
                    {activeStep === "GEO" && (
                        <div className="flex items-center">
                            <TabBar
                                tabs={["base", "world", "continents", "geology", "climate"]}
                                activeTab={inspectorTab}
                                onTabChange={(tab) => setInspectorTab(tab as InspectorTab)}
                                className="h-8"
                            />
                        </div>
                    )}
                    {activeStep === "GEOGRAPHY" && (
                        <div className="flex items-center">
                            <TabBar
                                tabs={["pipeline", "inspector", "isolator", "refinement"]}
                                activeTab={geographyTab}
                                onTabChange={(tab) => setGeographyTab(tab as any)}
                                className="h-8"
                            />
                        </div>
                    )}
                </div>

                {/* Center: Stage Navigation */}
                <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center scale-90">
                    <WorkflowBar activeStep={activeStep} onStepChange={handleStepChange} />
                </div>

                {/* Right: Map Controls */}
                <div className="flex items-center justify-end gap-3 scale-90">
                    <button
                        onClick={() => setShowHistory(true)}
                        className="flex items-center justify-center w-8 h-8 rounded-full border transition-all shadow-lg bg-[#E6E6FA]/10 border-[#E6E6FA]/40 text-[#E6E6FA] hover:bg-[#E6E6FA]/20"
                        title="Pick World"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                    </button>
                    <div className="flex items-center bg-[#1e1e1e]/60 border border-white/5 rounded-full p-0.5 shadow-lg">
                        <button onClick={() => setViewMode("2d")} className={`px-3 py-1.5 rounded-full text-[10px] font-bold tracking-widest transition-all ${viewMode === "2d" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}>MAP 2D</button>
                        <button onClick={() => setViewMode("map3d")} className={`px-3 py-1.5 rounded-full text-[10px] font-bold tracking-widest transition-all ${viewMode === "map3d" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}>MAP 3D</button>
                        <button onClick={() => setViewMode("3d")} className={`px-3 py-1.5 rounded-full text-[10px] font-bold tracking-widest transition-all ${viewMode === "3d" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}>GLOBE 3D</button>
                        <button onClick={() => setViewMode("provinces")} className={`px-3 py-1.5 rounded-full text-[10px] font-bold tracking-widest transition-all ${viewMode === "provinces" ? "bg-cyan-500/20 text-cyan-300 shadow-sm border border-cyan-500/30" : "text-gray-500 hover:text-gray-300"}`}>PROVINCES</button>
                    </div>
                </div>
            </div>

            {/* ══ Main Layout ══ */}
            <div className="flex-1 flex overflow-hidden relative z-10 pt-28 pb-12">

                {/* Left Sidebar Flow */}
                <aside
                    className="absolute left-4 top-28 bottom-12 z-20 flex flex-col gap-4 overflow-y-auto scrollbar-none transition-transform duration-500 ease-in-out"
                    style={{
                        width: `${sidebarWidth}px`,
                        transform: isMaxView ? `translateX(-${sidebarHiddenOffset}px)` : "translateX(0)",
                    }}
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
                        <div className="flex flex-col h-full">
                            <div className="flex-1 overflow-y-auto scrollbar-none pb-12">
                                {geographyTab === "pipeline" ? (
                                    <GeographyPipelinePanel
                                        activeHistoryId={activeWorldId}
                                        globeWorld={globeWorld}
                                    />
                                ) : geographyTab === "inspector" ? (
                                    <GeographyInspectorPanel
                                        planetId={activeWorldId}
                                        selectedId={geoSelectedId}
                                        hoveredId={geoHoveredId}
                                        bulkSelectedIds={geoBulkSelectedIds}
                                        bulkMode={geoBulkMode}
                                        onBulkModeChange={setGeoBulkMode}
                                        onBulkToggleId={handleGeoBulkToggleId}
                                        onClearBulkSelection={handleGeoBulkClear}
                                        activeLayer={inspectorLayer}
                                        onHierarchyChanged={() => setProvinceTextureVersion(v => v + 1)}
                                    />
                                ) : geographyTab === "isolator" ? (
                                    <GeographyIsolatorPanel
                                        planetId={activeWorldId}
                                        selectedId={geoSelectedId}
                                        activeLayer={inspectorLayer as any}
                                    />
                                ) : (
                                    <ProvinceRefinementPanel
                                        planetId={activeWorldId}
                                        selectedId={geoSelectedId}
                                        activeLayer={inspectorLayer as any}
                                        onAppliedVariant={({ historyItem, variantId, textureUrl }) => {
                                            const normalizedItem = {
                                                ...(historyItem || {}),
                                                id: historyItem?.id || variantId,
                                                timestamp: historyItem?.timestamp || Date.now(),
                                                prompt: historyItem?.prompt || prompt,
                                                config: historyItem?.config || config,
                                                textureUrl: historyItem?.textureUrl || textureUrl,
                                                provinceOverlays: historyItem?.provinceOverlays || [],
                                                worldgenSourceId: historyItem?.worldgenSourceId || historyItem?.id || variantId,
                                            };
                                            saveToHistory(normalizedItem as any).catch(console.error);
                                            setActiveWorldId(normalizedItem.id);
                                            setGlobeWorld(prev => prev
                                                ? {
                                                    ...prev,
                                                    textureUrl: normalizedItem.textureUrl,
                                                    provinceOverlays: normalizedItem.provinceOverlays,
                                                }
                                                : {
                                                    cols: 512,
                                                    rows: 256,
                                                    cellData: [],
                                                    textureUrl: normalizedItem.textureUrl,
                                                    provinceOverlays: normalizedItem.provinceOverlays,
                                                });
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    )}
                    {activeStep === "ECO" && (
                        <EcologyPanel
                            planetId={activeWorldId}
                        />
                    )}
                    {activeStep === "HUMANITY" && (
                        <HumanityPanel
                            humPrompt={humPrompt} setHumPrompt={setHumPrompt}
                            humSettlements={humSettlements} setHumSettlements={setHumSettlements}
                            humTech={humTech} setHumTech={setHumTech}
                            generateHumanity={generateHumanity} genProgress={genProgress} globeWorld={globeWorld}
                            readiness={humanityReadiness}
                            scopeKind={humanityScopeKind}
                            setScopeKind={setHumanityScopeKind}
                            scopeTargets={humanityScopeTargets}
                            visibleRegions={humanityVisibleRegions}
                            scopeQuery={humanityScopeQuery}
                            setScopeQuery={setHumanityScopeQuery}
                            resolvedProvinceCount={humanityResolvedProvinceCount}
                            onToggleScopeTarget={handleToggleHumanityScopeTarget}
                            onAdoptExistingOutput={handleAdoptHumanityOutput}
                            isAdoptingExistingOutput={isAdoptingHumanityOutput}
                            regions={humanityRegions}
                            locations={humanityLocations}
                            metadata={locationGenerationMeta}
                            selectedLocationId={selectedHumanityLocationId}
                            onSelectLocation={setSelectedHumanityLocationId}
                        />
                    )}
                </aside>

                {/* Center Canvas Wrapper */}
                <div
                    className="flex-1 flex flex-col transition-all duration-500 ease-in-out h-full overflow-hidden"
                    style={{ marginLeft: isMaxView ? 0 : `${sidebarOffset}px` }}
                >
                    <WorldCanvas
                        viewMode={viewMode} globeWorld={globeWorld}
                        showHexGrid={showHexGrid}
                        onCellHover={handleCellHover} onCellClick={handleCellClick}
                        activeStep={activeStep}
                        geographyTool={"pan"}
                        activeRegionType={"continent"}
                        geography={{ regions: [], selectedRegionId: null, hoveredRegionId: null, setSelectedRegionId: () => { }, setHoveredRegionId: () => { }, addRegion: () => ({} as any), findRegionAtPoint: () => null }}
                        geographyTab={geographyTab}
                        geoHoveredId={geoHoveredId}
                        setGeoHoveredId={setGeoHoveredId}
                        geoSelectedId={geoSelectedId}
                        setGeoSelectedId={setGeoSelectedId}
                        geoBulkSelectedIds={geoBulkSelectedIds}
                        geoBulkMode={geoBulkMode}
                        onGeoBulkToggleId={handleGeoBulkToggleId}
                        inspectorLayer={inspectorLayer}
                        setInspectorLayer={setInspectorLayer}
                        provinceTextureVersion={provinceTextureVersion}
                        isMaxView={isMaxView}
                        setIsMaxView={setIsMaxView}
                        activeHistoryId={activeWorldId}
                        humanityLocations={humanityLocations}
                        selectedHumanityLocationId={selectedHumanityLocationId}
                        onSelectHumanityLocation={setSelectedHumanityLocationId}
                    />
                </div>

                {/* History Modal */}
                <Modal open={showHistory} onClose={() => setShowHistory(false)} title="ARCHIVES">
                    <HistoryGallery
                        history={history}
                        activePlanetId={activeWorldId}
                        deleteFromHistory={deleteFromHistory}
                        onRenameWorld={renameInHistory}
                        onSelectPlanet={(item) => {
                            handleSelectWorldFromHistory(item);
                            setShowHistory(false);
                        }}
                        onSelectTexture={(targetId, textureUrl) => {
                            const historyItem = history.find((item) => item.id === targetId);
                            if (historyItem) {
                                handleSelectWorldFromHistory(historyItem);
                                setShowHistory(false);
                                return;
                            }
                            setGlobeWorld(prev => prev
                                ? { ...prev, textureUrl }
                                : { cols: 512, rows: 256, cellData: [], textureUrl, provinceOverlays: [] });
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
