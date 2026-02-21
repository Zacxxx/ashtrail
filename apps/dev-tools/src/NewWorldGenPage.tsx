import { useState, useCallback, useRef, useEffect, memo } from "react";
import { Button } from "@ashtrail/ui";
import { Link } from "react-router-dom";
import { PlanetGlobe } from "./components/PlanetGlobe";
import { PlanetMap2D } from "./components/PlanetMap2D";
import type { SimulationConfig, TerrainCell } from "./modules/geo/types";
import { DEFAULT_CONFIG } from "./modules/geo/engine";
import { BIOME_META, BIOME_COLORS } from "./modules/geo/biomes";
import { useGenerationHistory, type GenerationHistoryItem } from "./hooks/useGenerationHistory";

// ── Pipeline Steps ──
type WorkflowStep = "GEO" | "ECO" | "HUMANITY";
const WORKFLOW_STEPS: WorkflowStep[] = ["GEO", "ECO", "HUMANITY"];
const WORKFLOW_LABELS: Record<WorkflowStep, string> = {
  GEO: "Geology",
  ECO: "Ecology",
  HUMANITY: "Humanity",
};

type ViewMode = "3d" | "2d";
type InspectorTab = "base" | "world" | "continents" | "geology" | "climate";

interface ContinentConfig {
  id: string;
  name: string;
  prompt: string;
  size: number;
}

interface PlanetWorld {
  cols: number;
  rows: number;
  cellData: TerrainCell[];
  textureUrl?: string; // Additional field for the hybrid image map
}

interface GenerationProgress {
  isActive: boolean;
  progress: number;
  stage: string;
  jobId: string | null;
}

export function NewWorldGenPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("3d");
  const [activeStep, setActiveStep] = useState<WorkflowStep>("GEO");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("base");
  const [prompt, setPrompt] = useState<string>("A desolate, dusty orange planet with deep canyon scars, dry ocean basins, and rocky gray mountain ranges.");
  const [aiResolution, setAiResolution] = useState<string>("2048x1024");
  const [aiTemperature, setAiTemperature] = useState<number>(0.7);

  const [continents, setContinents] = useState<ContinentConfig[]>([
    { id: "1", name: "Pangaea Prime", prompt: "A massive central supercontinent dominated by blasted badlands and volcanic ridges.", size: 80 }
  ]);

  const [ecoPrompt, setEcoPrompt] = useState<string>("Overpaint this terrain with dense, bioluminescent alien jungles and vast fungal forests along the equator.");
  const [ecoVegetation, setEcoVegetation] = useState<number>(0.8);
  const [ecoFauna, setEcoFauna] = useState<number>(0.5);

  const [humPrompt, setHumPrompt] = useState<string>("Develop advanced medieval city-states connected by dusty trade routes and surrounded by sprawling farmlands.");
  const [humSettlements, setHumSettlements] = useState<number>(0.6);
  const [humTech, setHumTech] = useState<number>(0.4);

  const [config, setConfig] = useState<SimulationConfig>({ ...DEFAULT_CONFIG });
  const [hoveredCell, setHoveredCell] = useState<TerrainCell | null>(null);
  const [selectedCell, setSelectedCell] = useState<TerrainCell | null>(null);
  const [globeWorld, setGlobeWorld] = useState<PlanetWorld | null>(null);

  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>({});
  const togglePanel = useCallback((key: string) => {
    setCollapsedPanels(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const [genProgress, setGenProgress] = useState<GenerationProgress>({
    isActive: false,
    progress: 0,
    stage: "",
    jobId: null,
  });

  const [isGeneratingText, setIsGeneratingText] = useState(false);
  const [showHexGrid, setShowHexGrid] = useState(false);

  const [regionLore, setRegionLore] = useState<any | null>(null);
  const [isFetchingLore, setIsFetchingLore] = useState(false);

  const { history, saveToHistory, deleteFromHistory } = useGenerationHistory();
  const [showHistory, setShowHistory] = useState(false);

  // Config update helpers
  const updateWorld = useCallback((patch: Partial<SimulationConfig["world"]>) => {
    setConfig(prev => ({ ...prev, world: { ...prev.world, ...patch } }));
  }, []);
  const updateGeo = useCallback((patch: Partial<SimulationConfig["geo"]>) => {
    setConfig(prev => ({ ...prev, geo: { ...prev.geo, ...patch } }));
  }, []);
  const updateClimate = useCallback((patch: Partial<SimulationConfig["climate"]>) => {
    setConfig(prev => ({ ...prev, climate: { ...prev.climate, ...patch } }));
  }, []);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Poll job status
  const pollJobProgress = useCallback((jobId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/planet/hybrid/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();

        setGenProgress({
          isActive: data.status === "queued" || data.status === "running",
          progress: data.progress,
          stage: data.currentStage,
          jobId,
        });

        if (data.status === "completed" && data.result) {
          setGenProgress(prev => ({ ...prev, stage: "Decoding final geometry..." }));

          setTimeout(() => {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;

            const newItem: GenerationHistoryItem = {
              id: jobId,
              timestamp: Date.now(),
              prompt: fullPromptRef.current || prompt,
              config: config,
              textureUrl: data.result.textureUrl,
            };
            saveToHistory(newItem).catch(console.error);

            setGlobeWorld({
              ...data.result,
              textureUrl: data.result.textureUrl
            });

            setGenProgress({
              isActive: false,
              progress: 100,
              stage: "Completed",
              jobId: null,
            });
          }, 100);
        } else if (data.status === "failed" || data.status === "cancelled") {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setGenProgress({
            isActive: false,
            progress: 0,
            stage: data.error || "Generation failed",
            jobId: null,
          });
        }
      } catch {
        // retry on next tick
      }
    }, 500);
  }, [prompt, config, saveToHistory]);

  const fullPromptRef = useRef<string>("");

  const generatePlanet = useCallback(async () => {
    setGenProgress({ isActive: true, progress: 0, stage: "Starting Hybrid Generation…", jobId: null });
    setGlobeWorld(null);

    // Assemble secret system prompt, user prompt, and config
    const systemPrompt = "Equirectangular projection map texture, satellite view, highly detailed, realistic. CRITICAL: Do NOT render any text, labels, names, annotations, legends, or letters on the image. The output must be a pure photographic satellite-style map with zero text of any kind.";
    const configPrompt = `Ensure the map visually matches these parameters:
- Ocean Coverage: ${(config.world.oceanCoverage * 100).toFixed(0)}%
- Mean Temperature: ${config.climate.globalMeanTemp}°C
- Precipitation/Moisture Multiplier: ${config.climate.precipitationMultiplier}x
- Continental Scale: ${config.geo.continentalScale}
- Tectonic Intensity: ${config.geo.tectonicIntensity.toFixed(1)}
- Volcanic Density: ${(config.geo.volcanicDensity * 100).toFixed(0)}%`;

    const continentsPrompt = continents.length > 0
      ? `\n[LANDMASS LAYOUT - visualize these as geographic regions, do NOT write their names on the map]:\n${continents.map(c => `- A landmass (~${c.size}% of total land area): ${c.prompt}`).join('\n')}`
      : "";

    const fullPrompt = `${systemPrompt}

User Instructions:
${prompt}

[ENVIRONMENTAL REQUIREMENTS]:
${configPrompt}${continentsPrompt}`;

    fullPromptRef.current = fullPrompt;

    try {
      const resParts = aiResolution.split("x");
      const cols = parseInt(resParts[0], 10);
      const rows = parseInt(resParts[1], 10);

      const response = await fetch("http://127.0.0.1:8787/api/planet/hybrid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config,
          prompt: fullPrompt,
          temperature: aiTemperature,
          cols,
          rows
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Hybrid generation failed (${response.status})`);
      }

      const { jobId } = await response.json();
      setGenProgress(prev => ({ ...prev, jobId }));
      pollJobProgress(jobId);
    } catch (error) {
      console.error(error);
      setGenProgress({
        isActive: false,
        progress: 0,
        stage: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        jobId: null,
      });
    }
  }, [prompt, config, pollJobProgress, aiResolution, aiTemperature, continents]);

  const handleAutoGenerateContinents = useCallback(async () => {
    setIsGeneratingText(true);
    try {
      const response = await fetch("/api/text/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: "Generate 3 unique geographic descriptions for major continents on a fantasy or alien planet. Format the response ONLY as a strict JSON array of objects, with each object containing a 'name' string and a detailed 'prompt' string describing the landscape. Do not include markdown formatting or backticks around the JSON."
        }),
      });
      if (!response.ok) throw new Error("Failed to generate text");

      const data = await response.json();
      const parsed = JSON.parse(data.text);
      if (Array.isArray(parsed)) {
        setContinents(parsed.map((c: any) => ({
          id: crypto.randomUUID(),
          name: c.name || "Unknown Landmass",
          prompt: c.prompt || "",
          size: Math.floor(Math.random() * 40) + 40 // random size 40-80
        })));
      }
    } catch (err) {
      console.error("AI Continent Generation Failed:", err);
    } finally {
      setIsGeneratingText(false);
    }
  }, []);

  const generateEcology = useCallback(async () => {
    if (!globeWorld?.textureUrl) {
      alert("You must generate a Geology map first!");
      return;
    }

    setGenProgress({ isActive: true, progress: 0, stage: "Preparing Base Map...", jobId: null });

    try {
      // Fetch the actual image data from the served URL to encode it
      const imgRes = await fetch(globeWorld.textureUrl);
      const blob = await imgRes.blob();
      const base64_image = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const fullPrompt = `You are an Ecology engine. Overpaint the provided base planetary map with lush biomes. Do not alter the underlying tectonic plates or continent shapes, only color the surface map.
User Instructions: ${ecoPrompt}
Parameters: Vegetation Density: ${ecoVegetation}, Fauna Hotspots: ${ecoFauna}`;

      const response = await fetch("http://127.0.0.1:8787/api/planet/ecology", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: fullPrompt,
          base64_image,
          temperature: aiTemperature,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const { jobId } = await response.json();
      setGenProgress(prev => ({ ...prev, jobId }));
      pollJobProgress(jobId);
    } catch (error) {
      console.error(error);
      setGenProgress({
        isActive: false, progress: 0, stage: `Error: ${error instanceof Error ? error.message : "Unknown error"}`, jobId: null,
      });
    }
  }, [globeWorld, ecoPrompt, ecoVegetation, ecoFauna, aiTemperature, pollJobProgress]);

  const generateHumanity = useCallback(async () => {
    if (!globeWorld?.textureUrl) {
      alert("You must generate a base map first!");
      return;
    }

    setGenProgress({ isActive: true, progress: 0, stage: "Preparing Ecology Map...", jobId: null });

    try {
      const imgRes = await fetch(globeWorld.textureUrl);
      const blob = await imgRes.blob();
      const base64_image = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const fullPrompt = `You are a Humanity civilization simulator. Overpaint the provided planetary map with signs of intelligent life, cities, roads, and borders. Do not alter the underlying tectonic plates or continent shapes.
User Instructions: ${humPrompt}
Parameters: Settlement Density: ${humSettlements}, Tech Level: ${humTech}`;

      const response = await fetch("http://127.0.0.1:8787/api/planet/humanity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: fullPrompt,
          base64_image,
          temperature: aiTemperature,
        }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const { jobId } = await response.json();
      setGenProgress(prev => ({ ...prev, jobId }));
      pollJobProgress(jobId);
    } catch (error) {
      console.error(error);
      setGenProgress({
        isActive: false, progress: 0, stage: `Error: ${error instanceof Error ? error.message : "Unknown error"}`, jobId: null,
      });
    }
  }, [globeWorld, humPrompt, humSettlements, humTech, aiTemperature, pollJobProgress]);

  const handleCellHover = useCallback((cell: TerrainCell | null) => {
    setHoveredCell(cell);
  }, []);

  const handleCellClick = useCallback((cell: TerrainCell | null) => {
    if (cell) {
      setSelectedCell(cell);
      setRegionLore(null);
    } else {
      setSelectedCell(null);
    }
  }, []);

  const fetchRegionLore = useCallback(async () => {
    if (!selectedCell) return;
    setIsFetchingLore(true);
    setRegionLore(null);

    try {
      const response = await fetch("http://127.0.0.1:8787/api/planet/lore/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lon: selectedCell.x,
          lat: selectedCell.y,
          biome: BIOME_META[selectedCell.biome]?.name ?? selectedCell.biome,
          temperature: selectedCell.temperature,
          elevation: selectedCell.elevationMeters,
          resources: selectedCell.mineralDeposits,
          worldContext: prompt
        })
      });

      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      setRegionLore(JSON.parse(data.text));
    } catch (err) {
      console.error(err);
      setRegionLore({ error: "Failed to load region simulation data." });
    } finally {
      setIsFetchingLore(false);
    }
  }, [selectedCell, prompt]);

  return (
    <div className="flex flex-col h-screen bg-[#0a0f14] text-gray-300 font-sans tracking-wide overflow-hidden">
      {/* ══ Top Header ══ */}
      <header className="h-12 flex items-center justify-between px-6 bg-[#0a0f14] border-b border-[#1f2937] shrink-0">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-500 text-[#0a0f14] font-bold text-xs hover:scale-110 transition-transform">
            ←
          </Link>
          <h1 className="text-sm font-bold tracking-[0.2em] text-gray-100">
            ASHTRAIL <span className="text-gray-600 font-normal">| AI PLANET GEN</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="secondary" className="text-[10px] font-bold tracking-widest py-1 h-7 border border-[#1f2937] text-gray-400 hover:text-white bg-transparent" onClick={() => setShowHistory(!showHistory)}>
            <span className="mr-2">📚</span> {showHistory ? "CLOSE HISTORY" : "GALLERY"}
          </Button>
          <div className="flex items-center gap-1 text-[10px] font-bold tracking-widest text-gray-500">
            <button
              onClick={() => setViewMode("2d")}
              className={`px-2 py-1 rounded border transition-colors ${viewMode === "2d"
                ? "border-purple-500/50 text-purple-400 bg-purple-500/10"
                : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-[#1f2937]"
                }`}
            >
              2D FLAT
            </button>
            <button
              onClick={() => setViewMode("3d")}
              className={`px-2 py-1 rounded border transition-colors ${viewMode === "3d"
                ? "border-purple-500/50 text-purple-400 bg-purple-500/10"
                : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-[#1f2937]"
                }`}
            >
              3D GLOBE
            </button>
          </div>
        </div>
      </header>

      {/* ══ Main Layout ══ */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* ── Left Sidebar (Prompt & Config) ── */}
        <aside className="absolute left-4 top-4 w-80 z-20 flex flex-col gap-2 max-h-[calc(100vh-8rem)] overflow-y-auto scrollbar-thin">

          {activeStep === "GEO" && (
            <>
              {/* Tab Bar */}
              <div className="flex gap-1 bg-[#121820]/90 backdrop-blur border border-[#1f2937] rounded-md p-1">
                {(["base", "world", "continents", "geology", "climate"] as InspectorTab[]).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setInspectorTab(tab)}
                    className={`flex-1 py-2 text-[8px] font-bold tracking-widest rounded transition-colors ${inspectorTab === tab
                      ? "bg-purple-500/20 text-purple-400"
                      : "text-gray-600 hover:text-gray-400"
                      }`}
                  >
                    {tab.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Panel Content */}
              <div className="p-4 bg-[#121820]/90 backdrop-blur border border-[#1f2937] rounded-md shadow-2xl space-y-4">
                <h3 className="text-[10px] font-bold tracking-[0.15em] text-purple-500 flex items-center gap-2">
                  <span>✨</span> GEOLOGY ENGINE (V4)
                </h3>

                {inspectorTab === "base" && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-bold tracking-wider text-gray-500 mb-2">
                        PLANETARY DESCRIPTION
                      </label>
                      <textarea
                        value={prompt}
                        onChange={e => setPrompt(e.target.value)}
                        className="w-full h-32 bg-[#0a0f14] border border-[#1f2937] rounded p-3 text-sm text-gray-300 focus:outline-none focus:border-purple-500/50 resize-none"
                        placeholder="e.g. A desolate red planet with deep canyons..."
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[9px] font-bold tracking-wider text-gray-500 mb-2">RESOLUTION</label>
                        <select
                          value={aiResolution}
                          onChange={e => setAiResolution(e.target.value)}
                          className="w-full bg-[#0a0f14] text-xs text-gray-300 border border-[#1f2937] p-2 rounded focus:outline-none focus:border-purple-500/50"
                        >
                          <option value="1024x512">1024 x 512 (Fast)</option>
                          <option value="2048x1024">2048 x 1024 (Standard)</option>
                          <option value="4096x2048">4096 x 2048 (Ultra)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] font-bold tracking-wider text-gray-500 mb-2 flex justify-between">
                          <span>TEMPERATURE</span>
                          <span className="text-purple-400">{aiTemperature.toFixed(2)}</span>
                        </label>
                        <input
                          type="range" min="0" max="2" step="0.1"
                          value={aiTemperature}
                          onChange={e => setAiTemperature(parseFloat(e.target.value))}
                          className="w-full accent-purple-500 mt-2"
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#1f2937]">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showHexGrid}
                          onChange={(e) => setShowHexGrid(e.target.checked)}
                          className="accent-purple-500 w-4 h-4 cursor-pointer"
                        />
                        <span className="text-[10px] font-bold tracking-wider text-gray-400">SHOW 3D HEX GRID</span>
                      </label>
                    </div>
                  </div>
                )}

                {inspectorTab === "continents" && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-bold tracking-wider text-gray-400">LANDMASSES</span>
                      <div className="flex gap-2">
                        <button
                          onClick={handleAutoGenerateContinents}
                          disabled={isGeneratingText}
                          className="text-[10px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 px-2 py-1 rounded disabled:opacity-50"
                        >
                          {isGeneratingText ? "..." : "✨ AI GENERATE"}
                        </button>
                        <button
                          onClick={() => setContinents(prev => [...prev, { id: crypto.randomUUID(), name: `Continent ${prev.length + 1}`, prompt: "", size: 50 }])}
                          className="text-[10px] font-bold text-purple-400 hover:text-purple-300 bg-purple-500/10 px-2 py-1 rounded"
                        >
                          + ADD
                        </button>
                      </div>
                    </div>

                    {continents.length === 0 && (
                      <p className="text-[10px] text-gray-600 italic">No specific continents defined. AI will generate random landmasses based on ocean coverage.</p>
                    )}

                    <div className="space-y-3">
                      {continents.map((c, idx) => (
                        <div key={c.id} className="p-3 bg-[#0a0f14] border border-[#1f2937] rounded relative group">
                          <button
                            onClick={() => setContinents(prev => prev.filter(x => x.id !== c.id))}
                            className="absolute top-2 right-2 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ✕
                          </button>

                          <input
                            type="text"
                            value={c.name}
                            onChange={e => setContinents(prev => prev.map(x => x.id === c.id ? { ...x, name: e.target.value } : x))}
                            className="bg-transparent border-b border-gray-700 text-purple-300 text-xs font-bold tracking-wider mb-2 focus:outline-none focus:border-purple-500 w-3/4 pb-1"
                            placeholder="Continent Name"
                          />

                          <textarea
                            value={c.prompt}
                            onChange={e => setContinents(prev => prev.map(x => x.id === c.id ? { ...x, prompt: e.target.value } : x))}
                            className="w-full h-16 bg-[#121820] border border-[#1f2937] rounded p-2 text-xs text-gray-300 focus:outline-none focus:border-purple-500/50 resize-none mb-2"
                            placeholder="Describe the shape, terrain, and features..."
                          />

                          <Slider
                            label="APPROX SIZE" value={c.size}
                            min={10} max={100} step={5} format={v => `${v}%`}
                            onChange={v => setContinents(prev => prev.map(x => x.id === c.id ? { ...x, size: v } : x))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {inspectorTab === "world" && (
                  <div className="space-y-4">
                    <Slider
                      label="OCEAN COVERAGE" value={config.world.oceanCoverage}
                      min={0.1} max={0.8} step={0.02} format={v => `${(v * 100).toFixed(0)}%`}
                      onChange={v => updateWorld({ oceanCoverage: v })}
                    />
                    <Slider
                      label="SOLAR LUMINOSITY" value={config.world.solarLuminosity}
                      min={0.5} max={2.0} step={0.05} format={v => `${v.toFixed(2)}×`}
                      onChange={v => updateWorld({ solarLuminosity: v })}
                    />
                    <Slider
                      label="AXIAL TILT" value={config.world.axialTilt}
                      min={0} max={45} step={0.5} format={v => `${v.toFixed(1)}°`}
                      onChange={v => updateWorld({ axialTilt: v })}
                    />
                    <Slider
                      label="ATMOSPHERE DENSITY" value={config.world.atmosphericDensity}
                      min={0.1} max={3.0} step={0.1} format={v => `${v.toFixed(1)}×`}
                      onChange={v => updateWorld({ atmosphericDensity: v })}
                    />
                  </div>
                )}

                {inspectorTab === "geology" && (
                  <div className="space-y-4">
                    <Slider
                      label="CONTINENTAL SCALE" value={config.geo.continentalScale}
                      min={100} max={1000} step={25}
                      onChange={v => updateGeo({ continentalScale: v })}
                    />
                    <Slider
                      label="PLATE COUNT" value={config.geo.plateCount}
                      min={2} max={12} step={1}
                      onChange={v => updateGeo({ plateCount: v })}
                    />
                    <Slider
                      label="TECTONIC INTENSITY" value={config.geo.tectonicIntensity}
                      min={0} max={3.0} step={0.1} format={v => v.toFixed(1)}
                      onChange={v => updateGeo({ tectonicIntensity: v })}
                    />
                    <Slider
                      label="VOLCANIC DENSITY" value={config.geo.volcanicDensity}
                      min={0} max={1} step={0.05} format={v => `${(v * 100).toFixed(0)}%`}
                      onChange={v => updateGeo({ volcanicDensity: v })}
                    />
                  </div>
                )}

                {inspectorTab === "climate" && (
                  <div className="space-y-4">
                    <Slider
                      label="GLOBAL MEAN TEMP" value={config.climate.globalMeanTemp}
                      min={-20} max={50} step={1} format={v => `${v}°C`}
                      onChange={v => updateClimate({ globalMeanTemp: v })}
                    />
                    <Slider
                      label="LATITUDE GRADIENT" value={config.climate.latitudeGradient}
                      min={10} max={100} step={5} format={v => `${v}°C`}
                      onChange={v => updateClimate({ latitudeGradient: v })}
                    />
                    <Slider
                      label="WIND STRENGTH" value={config.climate.windStrength}
                      min={0} max={3.0} step={0.1} format={v => v.toFixed(1)}
                      onChange={v => updateClimate({ windStrength: v })}
                    />
                    <Slider
                      label="PRECIPITATION" value={config.climate.precipitationMultiplier}
                      min={0} max={3.0} step={0.1} format={v => `${v.toFixed(1)}×`}
                      onChange={v => updateClimate({ precipitationMultiplier: v })}
                    />
                  </div>
                )}

                <div className="pt-4 border-t border-[#1f2937]">
                  <Button
                    variant="primary"
                    onClick={generatePlanet}
                    disabled={genProgress.isActive}
                    className="w-full text-[10px] tracking-widest py-3 bg-purple-600 hover:bg-purple-500 border-none"
                  >
                    {genProgress.isActive ? "GENERATING..." : "START HYBRID GENERATION"}
                  </Button>

                  {genProgress.stage && !genProgress.isActive && (
                    <p className="text-[10px] text-gray-500 text-center mt-2">{genProgress.stage}</p>
                  )}
                </div>
              </div>
            </>
          )}

          {activeStep === "ECO" && (
            <div className="p-4 bg-[#121820]/90 backdrop-blur border border-[#1f2937] rounded-md shadow-2xl space-y-4">
              <h3 className="text-[10px] font-bold tracking-[0.15em] text-green-500 flex items-center gap-2">
                <span>🌿</span> ECOLOGY ENGINE
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold tracking-wider text-gray-500 mb-2">
                    BIOME & EVOLUTION SEED
                  </label>
                  <textarea
                    value={ecoPrompt}
                    onChange={e => setEcoPrompt(e.target.value)}
                    className="w-full h-32 bg-[#0a0f14] border border-[#1f2937] rounded p-3 text-sm text-gray-300 focus:outline-none focus:border-green-500/50 resize-none"
                    placeholder="Describe specific vegetation types, alien flora, etc..."
                  />
                </div>
                <Slider label="VEGETATION DENSITY" value={ecoVegetation} min={0} max={1} step={0.05} format={v => `${(v * 100).toFixed(0)}%`} onChange={setEcoVegetation} />
                <Slider label="FAUNA HOTSPOTS" value={ecoFauna} min={0} max={1} step={0.05} format={v => `${(v * 100).toFixed(0)}%`} onChange={setEcoFauna} />
              </div>
              <div className="pt-4 border-t border-[#1f2937]">
                <Button
                  variant="primary"
                  onClick={generateEcology}
                  disabled={genProgress.isActive || !globeWorld?.textureUrl}
                  className="w-full text-[10px] tracking-widest py-3 bg-green-600 hover:bg-green-500 border-none disabled:opacity-50"
                >
                  {genProgress.isActive ? "GENERATING..." : "GENERATE ECOLOGY LAYER"}
                </Button>
              </div>
            </div>
          )}

          {activeStep === "HUMANITY" && (
            <div className="p-4 bg-[#121820]/90 backdrop-blur border border-[#1f2937] rounded-md shadow-2xl space-y-4">
              <h3 className="text-[10px] font-bold tracking-[0.15em] text-orange-500 flex items-center gap-2">
                <span>🏙️</span> HUMANITY ENGINE
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold tracking-wider text-gray-500 mb-2">
                    CIVILIZATION SEED
                  </label>
                  <textarea
                    value={humPrompt}
                    onChange={e => setHumPrompt(e.target.value)}
                    className="w-full h-32 bg-[#0a0f14] border border-[#1f2937] rounded p-3 text-sm text-gray-300 focus:outline-none focus:border-orange-500/50 resize-none"
                    placeholder="Describe empires, technological ruins, global borders..."
                  />
                </div>
                <Slider label="SETTLEMENT DENSITY" value={humSettlements} min={0} max={1} step={0.05} format={v => `${(v * 100).toFixed(0)}%`} onChange={setHumSettlements} />
                <Slider label="TECH LEVEL (0=Stone, 1=SciFi)" value={humTech} min={0} max={1} step={0.05} format={v => v.toFixed(2)} onChange={setHumTech} />
              </div>
              <div className="pt-4 border-t border-[#1f2937]">
                <Button
                  variant="primary"
                  onClick={generateHumanity}
                  disabled={genProgress.isActive || !globeWorld?.textureUrl}
                  className="w-full text-[10px] tracking-widest py-3 bg-orange-600 hover:bg-orange-500 border-none disabled:opacity-50"
                >
                  {genProgress.isActive ? "GENERATING..." : "GENERATE CIVILIZATION LAYER"}
                </Button>
              </div>
            </div>
          )}
        </aside>

        {/* ── Center Canvas ── */}
        <main className="flex-1 relative bg-[#070b12]">
          <div className="absolute inset-0 opacity-80 mix-blend-screen pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, transparent 0%, #05080c 100%)' }} />

          <div className="w-full h-full p-4 pl-96 pr-64">
            {viewMode === "2d" ? (
              globeWorld ? (
                <PlanetMap2D world={globeWorld} onCellHover={handleCellHover} />
              ) : (
                <div className="w-full h-full rounded-lg border border-[#1f2937] bg-[#0a0f14] flex flex-col items-center justify-center text-[10px] tracking-widest text-gray-500">
                  Enter a prompt and generate a 2D heightmap via AI.
                </div>
              )
            ) : globeWorld ? (
              <div className="w-full h-full rounded-lg border border-[#1f2937] overflow-hidden relative bg-black">
                {/* The legacy PlanetGlobe takes world data. We've added `textureUrl` to the interface. We'll need to modify PlanetGlobe to use it implicitly or overlay it.
                                    For now, passing it as is. */}
                <PlanetGlobe world={globeWorld} onCellHover={handleCellHover} onCellClick={handleCellClick} />

                {/* Overlay Original AI texture preview in corner */}
                {globeWorld.textureUrl && (
                  <div className="absolute bottom-4 left-4 border border-[#1f2937] rounded overflow-hidden shadow-2xl opacity-70 hover:opacity-100 transition-opacity">
                    <p className="absolute top-1 left-2 text-[8px] font-bold tracking-widest text-white shadow-xl bg-black/50 px-1 rounded">BASE AI MAP</p>
                    <img src={globeWorld.textureUrl} alt="AI Map" className="w-48 h-auto object-contain bg-black" />
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full h-full rounded-lg border border-[#1f2937] bg-[#0a0f14] flex flex-col items-center justify-center text-[10px] tracking-widest text-gray-500">
                Generate a hybrid AI planet to view the 3D globe.
              </div>
            )}
          </div>
        </main>

        {/* ── History Drawer ── */}
        <div className={`absolute top-0 right-0 bottom-0 w-80 bg-[#0a0f14]/95 backdrop-blur border-l border-[#1f2937] transition-transform duration-300 z-40 flex flex-col ${showHistory ? "translate-x-0" : "translate-x-full"}`}>
          <div className="p-4 border-b border-[#1f2937] flex justify-between items-center bg-[#121820]">
            <h3 className="text-xs font-bold tracking-[0.15em] text-purple-500">GENERATION HISTORY</h3>
            <button onClick={() => setShowHistory(false)} className="text-gray-500 hover:text-white">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {history.length === 0 ? (
              <p className="text-[10px] text-gray-500 italic text-center mt-10">No past generations saved in browser.</p>
            ) : (
              history.map(item => (
                <div key={item.id} className="relative group border border-[#1f2937] bg-[#121820] rounded-md overflow-hidden cursor-pointer hover:border-purple-500/50 transition-colors"
                  onClick={() => {
                    setGlobeWorld({ cols: 512, rows: 256, cellData: [], textureUrl: item.textureUrl });
                    setConfig(item.config);
                    setPrompt(item.prompt.split("User Instructions:\n")[1]?.split("\n")[0] || item.prompt);
                  }}
                >
                  <img src={item.textureUrl} alt="History thumbnail" className="w-full h-32 object-cover object-center opacity-70 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute top-0 inset-x-0 p-2 bg-gradient-to-b from-black/80 to-transparent">
                    <p className="text-[9px] text-gray-300 line-clamp-2">{item.prompt}</p>
                    <p className="text-[8px] text-purple-400 mt-1">{new Date(item.timestamp).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteFromHistory(item.id); }}
                    className="absolute bottom-2 right-2 text-[10px] bg-red-500/20 text-red-400 hover:bg-red-500/40 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    DELETE
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Progress Overlay ── */}
        {genProgress.isActive && (
          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
            <div className="bg-[#0d1218]/95 backdrop-blur-md border border-purple-500/30 rounded-xl px-8 py-6 flex flex-col items-center gap-4 shadow-2xl min-w-[280px]">
              {/* Spinner */}
              <div className="relative w-16 h-16">
                <svg className="animate-spin w-16 h-16" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="#1f2937" strokeWidth="4" />
                  <circle
                    cx="32" cy="32" r="28" fill="none"
                    stroke="#a855f7" strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${genProgress.progress * 1.76} 176`}
                    className="transition-all duration-300"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-purple-400">
                  {genProgress.progress.toFixed(0)}%
                </span>
              </div>
              {/* Stage */}
              <span className="text-[11px] font-bold tracking-wider text-gray-400">{genProgress.stage}</span>
              {/* Progress bar */}
              <div className="w-full h-1.5 bg-[#1f2937] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${genProgress.progress}%` }}
                />
              </div>
            </div>
          </div>
        )}


        {/* ── Bottom Workflow Bar ── */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#121820]/80 backdrop-blur px-6 py-3 rounded-full border border-[#1f2937] z-20 shadow-2xl">
          <span className="text-[10px] font-bold tracking-widest text-gray-500 mr-4">PIPELINE</span>
          {WORKFLOW_STEPS.map((step, idx) => (
            <button
              key={step}
              onClick={() => setActiveStep(step)}
              className={`flex flex-col items-center justify-center w-16 h-16 rounded-full transition-all ${activeStep === step
                ? step === "GEO" ? "border-2 border-purple-500 bg-purple-500/10 text-purple-400"
                  : step === "ECO" ? "border-2 border-green-500 bg-green-500/10 text-green-400"
                    : "border-2 border-orange-500 bg-orange-500/10 text-orange-400"
                : "border border-transparent text-gray-600 hover:text-gray-400 hover:bg-[#1f2937] opacity-60"
                }`}
            >
              <span className="text-sm font-bold">{idx + 1}</span>
              <span className="text-[7px] font-bold tracking-wider">{WORKFLOW_LABELS[step].toUpperCase()}</span>
            </button>
          ))}
        </div>


        {/* ── Right: Mini Cell Info ── */}
        {hoveredCell && (
          <aside className="absolute bottom-4 right-4 z-20 w-52">
            <div className="px-3 py-2 text-[10px] bg-[#121820]/90 backdrop-blur border border-[#1f2937] rounded-md shadow-lg">
              <div className="flex items-center gap-2 mb-2 border-b border-[#1f2937] pb-2">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: hoveredCell.color }} />
                <span className="text-purple-400 font-bold tracking-widest">{BIOME_META[hoveredCell.biome]?.name ?? hoveredCell.biome}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">HEX POS</span>
                <span className="text-gray-300 font-mono">{hoveredCell.x},{hoveredCell.y}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-500">ELEVATION</span>
                <span className="text-gray-300 font-mono">{hoveredCell.elevationMeters.toFixed(0)}m</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-500">TEMPERATURE</span>
                <span className="text-gray-300 font-mono">{hoveredCell.temperature.toFixed(1)}°C</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-500">MOISTURE</span>
                <span className="text-gray-300 font-mono">{(hoveredCell.moisture * 100).toFixed(0)}%</span>
              </div>

              {/* Minerals */}
              {hoveredCell.mineralDeposits.length > 0 && (
                <div className="mt-2 pt-2 border-t border-[#1f2937]">
                  <span className="text-gray-500 tracking-wider text-[8px]">RESOURCES MINED</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {hoveredCell.mineralDeposits.map((m, i) => (
                      <span key={i} className="px-1 py-0.5 bg-purple-500/15 text-purple-400 rounded text-[7px] font-bold tracking-wider">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* ── Center Right: Selected Region Inspector ── */}
        {selectedCell && (
          <aside className="absolute top-20 right-4 z-30 w-80">
            <div className="p-4 bg-[#121820]/95 backdrop-blur border border-purple-500/50 rounded-lg shadow-2xl relative">
              <button
                onClick={() => setSelectedCell(null)}
                className="absolute top-3 right-3 text-gray-400 hover:text-white"
              >
                ✕
              </button>

              <h2 className="text-xs font-bold tracking-[0.2em] text-purple-400 mb-1">
                REGION INSPECTOR
              </h2>
              <p className="text-[10px] text-gray-500 mb-4 font-mono tracking-widest border-b border-[#1f2937] pb-2">
                COORDS: {selectedCell.x}, {selectedCell.y}
              </p>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between items-center bg-[#0a0f14] p-2 rounded border border-[#1f2937]">
                  <span className="text-[9px] font-bold tracking-widest text-gray-500">BIOME</span>
                  <span className="text-[10px] text-purple-300 font-bold">{BIOME_META[selectedCell.biome]?.name ?? selectedCell.biome}</span>
                </div>
                <div className="flex justify-between items-center bg-[#0a0f14] p-2 rounded border border-[#1f2937]">
                  <span className="text-[9px] font-bold tracking-widest text-gray-500">BASE TEMP</span>
                  <span className="text-[10px] text-gray-300">{selectedCell.temperature.toFixed(1)}°C</span>
                </div>
                <div className="flex justify-between items-center bg-[#0a0f14] p-2 rounded border border-[#1f2937]">
                  <span className="text-[9px] font-bold tracking-widest text-gray-500">ELEVATION</span>
                  <span className="text-[10px] text-gray-300">{selectedCell.elevationMeters.toFixed(0)}m</span>
                </div>
              </div>

              {regionLore ? (
                <div className="mt-4 pt-4 border-t border-[#1f2937]">
                  {regionLore.error ? (
                    <div className="bg-red-500/10 border border-red-500/50 rounded p-3 text-red-400 text-[10px]">
                      {regionLore.error}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-[10px] font-bold tracking-widest text-purple-400 mb-1">REGION NAME</h3>
                        <p className="text-[11px] text-white tracking-wide">{regionLore.regionName}</p>
                      </div>
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="font-bold tracking-widest text-gray-500">POPULATION</span>
                        <span className="text-gray-300">{regionLore.population}</span>
                      </div>
                      <div>
                        <h3 className="text-[10px] font-bold tracking-widest text-purple-400 mb-1">ECONOMY</h3>
                        <p className="text-[10px] text-gray-400 leading-relaxed italic">{regionLore.resourcesSummary}</p>
                      </div>
                      <div>
                        <h3 className="text-[10px] font-bold tracking-widest text-purple-400 mb-1">LOCAL LORE</h3>
                        <p className="text-[10px] text-gray-300 leading-relaxed max-h-40 overflow-y-auto scrollbar-thin pr-1">
                          {regionLore.lore}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="mt-4 pt-4 border-t border-[#1f2937]">
                    <h3 className="text-[9px] font-bold tracking-[0.15em] text-gray-500 mb-2">SIMULATION DATA</h3>
                    <div className="bg-[#0a0f14] p-3 rounded border border-[#1f2937] min-h-[80px] flex items-center justify-center text-center">
                      <p className="text-[10px] text-gray-500 italic">
                        {isFetchingLore ? "Querying planetary historical records..." : "Region data uninitialized. Run a deep scan to simulate."}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="primary"
                    onClick={fetchRegionLore}
                    disabled={isFetchingLore}
                    className="w-full mt-4 text-[10px] tracking-widest py-3 bg-purple-600 hover:bg-purple-500 border-none disabled:opacity-50"
                  >
                    {isFetchingLore ? "SCANNING..." : "REQUEST DEEP SCAN"}
                  </Button>
                </>
              )}

            </div>
          </aside>
        )}

      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Reusable Sub-Components
// ══════════════════════════════════════════════════════════════

export const CollapsibleSection = memo(function CollapsibleSection({
  title,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full border-b border-[#1f2937] pb-2 mb-2 group"
      >
        <h3 className="text-[10px] font-bold tracking-[0.15em] text-purple-500">{title}</h3>
        <span className={`text-gray-600 text-[10px] transition-transform ${collapsed ? "" : "rotate-180"}`}>
          ▾
        </span>
      </button>
      {!collapsed && <div className="space-y-3">{children}</div>}
    </div>
  );
});

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}

export const Slider = memo(function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  const display = format ? format(value) : String(value);
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-gray-500 text-[10px] tracking-wider">{label}</span>
        <span className="text-purple-500 text-[10px] font-mono">{display}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-purple-500 h-1"
      />
    </div>
  );
});
