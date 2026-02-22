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

export function WorldGenPage() {
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
    // System prompt enforces strict photorealism for Step 1 (base geology)
    const systemPrompt = `Generate a seamless equirectangular projection planetary map texture.
STYLE: NASA satellite photography, photorealistic, top-down orthographic view as seen from orbit.
FORMAT: Must be a valid equirectangular (cylindrical) projection that wraps seamlessly around a sphere — poles at top/bottom, equator centered.
ABSOLUTELY FORBIDDEN: No text, labels, annotations, legends, icons, UI elements, borders, or any overlay graphics. No fantasy elements like floating islands, crystals, spires, glowing objects, or impossible geology. This must look like a real photograph of a planet taken from space.
RENDER ONLY: Realistic terrain — oceans, continents, deserts, forests, ice caps, mountain ranges, rivers, coastlines — as they would appear in actual satellite imagery.`;

    const configPrompt = `Planet parameters to match visually:
- Ocean/water coverage: ~${(config.world.oceanCoverage * 100).toFixed(0)}% of surface
- Mean temperature: ${config.climate.globalMeanTemp}°C (affects ice cap size, desert extent, vegetation coverage)
- Precipitation: ${config.climate.precipitationMultiplier}x Earth baseline
- Tectonic activity: ${config.geo.tectonicIntensity.toFixed(1)} (higher = more mountain ranges, rifts, volcanic islands)
- Volcanic density: ${(config.geo.volcanicDensity * 100).toFixed(0)}% (visible as dark volcanic fields, island chains)`;

    // Strip fantasy descriptions down to pure geographic hints
    const continentsPrompt = continents.length > 0
      ? `\nLandmass layout guide (geographic distribution only — render as realistic terrain, NOT as literal fantasy descriptions):
${continents.map((c, i) => `- Continent ${i + 1}: roughly ${c.size}% of total land area`).join('\n')}
Distribute the ${continents.length} landmasses across the map with realistic continental shapes, coastlines, and terrain variety.`
      : "";

    const fullPrompt = `${systemPrompt}

${prompt ? `Theme/setting: ${prompt}\n(Interpret thematically — the map must still look like realistic satellite photography)\n` : ""}[PLANET PARAMETERS]:
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
    <div className="flex flex-col h-screen bg-[#030508] text-gray-300 font-sans tracking-wide overflow-hidden relative">
      <div className="absolute inset-0 z-0 pointer-events-none opacity-40 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-[#030508] to-[#030508]" />

      {/* ══ Top Header (Floating) ══ */}
      <header className="absolute top-0 left-0 right-0 h-16 flex items-center justify-between px-8 z-30 bg-gradient-to-b from-[#030508]/90 to-transparent pointer-events-none">
        <div className="flex items-center gap-6 pointer-events-auto">
          <Link to="/" className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-all backdrop-blur-md">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </Link>
          <div className="flex flex-col">
            <h1 className="text-xs font-black tracking-[0.3em] text-white">ASHTRAIL</h1>
            <span className="text-[9px] font-medium tracking-[0.2em] text-purple-400">PLANETARY ENGINE V4</span>
          </div>
        </div>
        <div className="flex items-center gap-4 pointer-events-auto">
          <div className="flex items-center bg-[#0a0f14]/60 backdrop-blur-md border border-white/5 rounded-full p-1 shadow-lg">
            <button
              onClick={() => setViewMode("2d")}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest transition-all ${viewMode === "2d" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
            >
              MAP 2D
            </button>
            <button
              onClick={() => setViewMode("3d")}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest transition-all ${viewMode === "3d" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"}`}
            >
              GLOBE 3D
            </button>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center justify-center w-10 h-10 rounded-full border transition-all backdrop-blur-md shadow-lg ${showHistory ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'bg-[#0a0f14]/60 border-white/5 text-gray-400 hover:text-white hover:bg-white/5'}`}
            title="Generation Gallery"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
          </button>
        </div>
      </header>

      {/* ══ Main Layout ══ */}
      <div className="flex-1 flex overflow-hidden relative z-10 pt-16">

        {/* ── Left Sidebar (Prompt & Config) ── */}
        <aside className="absolute left-6 top-20 bottom-24 w-[340px] z-20 flex flex-col gap-4 overflow-y-auto scrollbar-none pb-4">

          {activeStep === "GEO" && (
            <div className="flex flex-col gap-4 h-full">
              {/* Tab Bar */}
              <div className="flex bg-[#0a0f14]/60 backdrop-blur-xl border border-white/5 rounded-2xl p-1.5 shadow-2xl shrink-0">
                {(["base", "world", "continents", "geology", "climate"] as InspectorTab[]).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setInspectorTab(tab)}
                    className={`flex-1 py-2.5 text-[9px] font-bold tracking-widest rounded-xl transition-all ${inspectorTab === tab
                      ? "bg-purple-500/15 text-purple-300 shadow-sm border border-purple-500/20"
                      : "text-gray-500 hover:text-gray-300 border border-transparent"
                      }`}
                  >
                    {tab.substring(0, 3).toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Panel Content */}
              <div className="flex-1 flex flex-col bg-[#0a0f14]/60 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-5 flex-1 overflow-y-auto scrollbar-thin">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-[11px] font-black tracking-[0.2em] text-purple-400 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
                      GEOSIMULATION
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
                          className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-purple-500/50 resize-none shadow-inner placeholder:text-gray-700 transition-colors"
                          placeholder="Describe the overall aesthetic and mood of the planet..."
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[9px] font-extrabold tracking-[0.15em] text-gray-400 mb-2">RESOLUTION</label>
                          <select
                            value={aiResolution}
                            onChange={e => setAiResolution(e.target.value)}
                            className="w-full bg-black/40 text-xs text-gray-300 border border-white/10 p-2.5 rounded-xl focus:outline-none focus:border-purple-500/50 appearance-none shadow-inner"
                          >
                            <option value="1024x512">1K FAST</option>
                            <option value="2048x1024">2K STANDARD</option>
                            <option value="4096x2048">4K ULTRA</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] font-extrabold tracking-[0.15em] text-gray-400 mb-2 flex justify-between">
                            <span>TEMP</span>
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

                      <div className="pt-4 mt-2 border-t border-white/5">
                        <label className="flex items-center gap-3 cursor-pointer group">
                          <div className={`w-10 h-5 rounded-full transition-colors relative ${showHexGrid ? 'bg-purple-500' : 'bg-white/10'}`}>
                            <div className={`absolute top-1 left-1 bg-white w-3 h-3 rounded-full transition-transform ${showHexGrid ? 'translate-x-5' : ''}`} />
                          </div>
                          <span className="text-[10px] font-bold tracking-widest text-gray-400 group-hover:text-gray-200 transition-colors">HEX OVERLAY</span>
                        </label>
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
                            className="text-[9px] font-bold tracking-widest text-purple-300 hover:text-purple-200 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 px-3 py-1.5 rounded-lg transition-all"
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
                              className="bg-transparent text-purple-300 text-xs font-bold tracking-widest mb-3 focus:outline-none w-4/5 pb-1 border-b border-transparent focus:border-purple-500/30 transition-colors"
                              placeholder="Continent Name"
                            />

                            <textarea
                              value={c.prompt}
                              onChange={e => setContinents(prev => prev.map(x => x.id === c.id ? { ...x, prompt: e.target.value } : x))}
                              className="w-full h-20 bg-white/5 border border-white/5 rounded-lg p-3 text-xs text-gray-300 focus:outline-none focus:border-purple-500/30 resize-none mb-4 shadow-inner"
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
              </div>
            </div>
          )}

          {activeStep === "ECO" && (
            <div className="flex-1 flex flex-col bg-[#0a0f14]/60 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl overflow-hidden h-full">
              <div className="p-5 flex-1 overflow-y-auto scrollbar-thin">
                <h3 className="text-[11px] font-black tracking-[0.2em] text-green-400 flex items-center gap-2 mb-6">
                  <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                  ECOLOGY ENGINE
                </h3>
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-extrabold tracking-[0.15em] text-gray-400 mb-3">
                      BIOME & EVOLUTION SEED
                    </label>
                    <textarea
                      value={ecoPrompt}
                      onChange={e => setEcoPrompt(e.target.value)}
                      className="w-full h-40 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-green-500/50 resize-none shadow-inner placeholder:text-gray-700 transition-colors"
                      placeholder="Describe specific vegetation types, alien flora, etc..."
                    />
                  </div>
                  <Slider label="VEGETATION DENSITY" value={ecoVegetation} min={0} max={1} step={0.05} format={v => `${(v * 100).toFixed(0)}%`} onChange={setEcoVegetation} />
                  <Slider label="FAUNA HOTSPOTS" value={ecoFauna} min={0} max={1} step={0.05} format={v => `${(v * 100).toFixed(0)}%`} onChange={setEcoFauna} />
                </div>
                <div className="pt-6 mt-4 border-t border-white/5">
                  <Button
                    variant="primary"
                    onClick={generateEcology}
                    disabled={genProgress.isActive || !globeWorld?.textureUrl}
                    className="w-full text-[10px] tracking-[0.2em] font-black py-4 bg-green-600/80 hover:bg-green-500 border border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.3)] disabled:opacity-50 disabled:shadow-none transition-all rounded-xl"
                  >
                    {genProgress.isActive ? "GENERATING..." : "GENERATE ECOLOGY LAYER"}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {activeStep === "HUMANITY" && (
            <div className="flex-1 flex flex-col bg-[#0a0f14]/60 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl overflow-hidden h-full">
              <div className="p-5 flex-1 overflow-y-auto scrollbar-thin">
                <h3 className="text-[11px] font-black tracking-[0.2em] text-orange-400 flex items-center gap-2 mb-6">
                  <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
                  HUMANITY ENGINE
                </h3>
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-extrabold tracking-[0.15em] text-gray-400 mb-3">
                      CIVILIZATION SEED
                    </label>
                    <textarea
                      value={humPrompt}
                      onChange={e => setHumPrompt(e.target.value)}
                      className="w-full h-40 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-orange-500/50 resize-none shadow-inner placeholder:text-gray-700 transition-colors"
                      placeholder="Describe empires, technological ruins, global borders..."
                    />
                  </div>
                  <Slider label="SETTLEMENT DENSITY" value={humSettlements} min={0} max={1} step={0.05} format={v => `${(v * 100).toFixed(0)}%`} onChange={setHumSettlements} />
                  <Slider label="TECH LEVEL (0=Stone, 1=SciFi)" value={humTech} min={0} max={1} step={0.05} format={v => v.toFixed(2)} onChange={setHumTech} />
                </div>
                <div className="pt-6 mt-4 border-t border-white/5">
                  <Button
                    variant="primary"
                    onClick={generateHumanity}
                    disabled={genProgress.isActive || !globeWorld?.textureUrl}
                    className="w-full text-[10px] tracking-[0.2em] font-black py-4 bg-orange-600/80 hover:bg-orange-500 border border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.3)] disabled:opacity-50 disabled:shadow-none transition-all rounded-xl"
                  >
                    {genProgress.isActive ? "GENERATING..." : "GENERATE CIVILIZATION LAYER"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* ── Center Canvas ── */}
        <main className="flex-1 relative bg-transparent rounded-3xl m-4 overflow-hidden shadow-2xl border border-white/5 z-0">
          <div className="absolute inset-0 bg-[#030508]" />

          <div className="w-full h-full p-2 lg:-ml-24 xl:ml-0 transition-all">
            {viewMode === "2d" ? (
              globeWorld ? (
                <div className="relative w-full h-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 p-1 bg-[#0a0f14]/40 backdrop-blur-sm">
                  <PlanetMap2D world={globeWorld} onCellHover={handleCellHover} />
                </div>
              ) : (
                <div className="w-full h-full rounded-2xl border border-white/5 bg-[#0a0f14]/40 backdrop-blur-md flex flex-col items-center justify-center text-[10px] tracking-widest text-gray-500">
                  <div className="w-16 h-16 border border-white/10 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                  </div>
                  AWAITING MAP GENERATION
                </div>
              )
            ) : globeWorld ? (
              <div className="w-full h-full rounded-2xl border border-white/5 overflow-hidden relative bg-black/50 shadow-2xl">
                <PlanetGlobe world={globeWorld} onCellHover={handleCellHover} onCellClick={handleCellClick} showHexGrid={showHexGrid} />

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
            ) : (
              <div className="w-full h-full rounded-2xl border border-white/5 bg-[#0a0f14]/40 backdrop-blur-md flex flex-col items-center justify-center text-[10px] tracking-widest text-gray-500 gap-4">
                <div className="w-24 h-24 border border-white/5 rounded-full flex items-center justify-center">
                  <div className="w-16 h-16 border border-white/10 rounded-full animate-[spin_10s_linear_infinite]" />
                </div>
                INITIALIZE GENERATOR ENGINE
              </div>
            )}
          </div>
        </main >

        {/* ── History Drawer ── */}
        < div className={`absolute top-0 right-0 bottom-0 w-80 bg-[#0a0f14]/80 backdrop-blur-xl border-l border-white/5 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] z-40 flex flex-col shadow-2xl ${showHistory ? "translate-x-0" : "translate-x-full"}`}>
          <div className="h-16 border-b border-white/5 flex justify-between items-center px-6 shrink-0 bg-white/5">
            <h3 className="text-[10px] font-black tracking-[0.2em] text-purple-400">ARCHIVES</h3>
            <button onClick={() => setShowHistory(false)} className="text-gray-500 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center space-y-3 opacity-50">
                <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
                <p className="text-[9px] font-bold tracking-widest text-gray-500">NO ARCHIVES FOUND</p>
              </div>
            ) : (
              history.map(item => (
                <div key={item.id} className="relative group border border-white/10 bg-black/40 rounded-xl overflow-hidden cursor-pointer hover:border-purple-500/40 transition-all shadow-lg"
                  onClick={() => {
                    setGlobeWorld({ cols: 512, rows: 256, cellData: [], textureUrl: item.textureUrl });
                    setConfig(item.config);
                    setPrompt(item.prompt.split("User Instructions:\n")[1]?.split("\n")[0] || item.prompt);
                  }}
                >
                  <img src={item.textureUrl} alt="History thumbnail" className="w-full h-32 object-cover object-center opacity-60 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" />
                  <div className="absolute top-0 inset-x-0 p-3 bg-gradient-to-b from-black/90 via-black/40 to-transparent">
                    <p className="text-[10px] text-gray-200 line-clamp-2 font-medium leading-relaxed drop-shadow-md">{item.prompt}</p>
                    <p className="text-[8px] font-bold tracking-widest text-purple-400 mt-2">{new Date(item.timestamp).toLocaleDateString()}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteFromHistory(item.id); }}
                    className="absolute bottom-3 right-3 text-[9px] font-bold tracking-widest bg-red-500/20 hover:bg-red-500 text-red-200 hover:text-white px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all border border-red-500/30"
                  >
                    DELETE
                  </button>
                </div>
              ))
            )}
          </div>
        </div >

        {/* ── Progress Overlay HUD ── */}
        {
          genProgress.isActive && (
            <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none bg-black/40 backdrop-blur-sm">
              <div className="bg-[#0a0f14]/80 backdrop-blur-2xl border border-purple-500/40 rounded-3xl p-8 flex flex-col items-center gap-6 shadow-[0_0_50px_rgba(168,85,247,0.15)] min-w-[320px]">

                <div className="relative flex items-center justify-center">
                  <div className="absolute w-24 h-24 border border-purple-500/20 rounded-full animate-[ping_3s_ease-in-out_infinite]" />
                  <svg className="w-20 h-20 -rotate-90 transform" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                    <circle
                      cx="32" cy="32" r="28" fill="none"
                      stroke="#a855f7" strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${genProgress.progress * 1.76} 176`}
                      className="transition-all duration-500 ease-out drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]"
                    />
                  </svg>
                  <span className="absolute text-sm font-black text-white tracking-wider">
                    {genProgress.progress.toFixed(0)}<span className="text-[10px] text-purple-400 opacity-80">%</span>
                  </span>
                </div>

                <div className="flex flex-col items-center gap-2 w-full">
                  <span className="text-[11px] font-black tracking-[0.2em] text-purple-300 uppercase animate-pulse">{genProgress.stage}</span>
                  <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-2">
                    <div
                      className="h-full bg-gradient-to-r from-purple-600 via-purple-400 to-indigo-400 rounded-full transition-all duration-300"
                      style={{ width: `${genProgress.progress}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )
        }

        {/* ── Bottom Workflow Bar ── */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center bg-[#0a0f14]/70 backdrop-blur-xl p-2 rounded-2xl border border-white/5 z-20 shadow-2xl">
          <div className="flex items-center gap-8 px-6 py-2 border-r border-white/5 mr-4">
            <span className="text-[9px] font-black tracking-[0.3em] text-gray-500 -rotate-90 origin-center translate-y-2">STAGE</span>
          </div>

          <div className="flex items-center gap-3 pr-4">
            {WORKFLOW_STEPS.map((step, idx) => {
              const isActive = activeStep === step;
              const color = step === "GEO" ? "purple" : step === "ECO" ? "green" : "orange";
              const bgClass = isActive ? `bg-${color}-500/15 border-${color}-500/40` : `bg-transparent border-transparent hover:bg-white/5`;
              const textClass = isActive ? `text-${color}-300` : `text-gray-500`;
              const numberClass = isActive ? `text-${color}-400` : `text-gray-600`;

              return (
                <button
                  key={step}
                  onClick={() => setActiveStep(step)}
                  className={`flex items-center gap-4 px-5 py-3 rounded-xl transition-all duration-300 border ${bgClass} ${textClass}`}
                >
                  <span className={`text-base font-black ${numberClass}`}>0{idx + 1}</span>
                  <div className="flex flex-col items-start pt-1">
                    <span className="text-[10px] font-black tracking-[0.2em]">{step === "GEO" ? "GEOSIM" : WORKFLOW_LABELS[step].toUpperCase()}</span>
                    {isActive && <div className={`h-0.5 w-4 mt-1 bg-${color}-500 rounded-full`} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Right: Mini Cell Info ── */}
        {
          hoveredCell && !selectedCell && viewMode === "3d" && (
            <aside className="absolute bottom-8 right-8 z-20 w-56 pointer-events-none">
              <div className="px-4 py-3 bg-[#0a0f14]/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl">
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
          )
        }

        {/* ── Center Right: Selected Region Inspector ── */}
        {
          selectedCell && (
            <aside className="absolute top-24 right-8 bottom-32 w-[340px] z-30">
              <div className="h-full flex flex-col p-5 bg-[#0a0f14]/80 backdrop-blur-xl border border-purple-500/30 rounded-2xl shadow-2xl relative">

                <button
                  onClick={() => setSelectedCell(null)}
                  className="absolute top-4 right-4 w-6 h-6 flex items-center justify-center rounded-full bg-white/5 text-gray-400 hover:text-white hover:bg-red-500/20 transition-all border border-transparent hover:border-red-500/30"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                <div className="mb-6 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                  <h2 className="text-[10px] font-black tracking-[0.25em] text-white">
                    INSPECTOR OVERRIDE
                  </h2>
                </div>

                <div className="flex items-center gap-4 bg-black/40 p-3 rounded-xl border border-white/5 mb-6">
                  <div className="w-10 h-10 rounded-lg shadow-inner border border-white/10" style={{ backgroundColor: selectedCell.color }} />
                  <div className="flex flex-col">
                    <span className="text-[11px] text-purple-300 font-black tracking-widest uppercase">{BIOME_META[selectedCell.biome]?.name ?? selectedCell.biome}</span>
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
                          <div className="bg-purple-500/5 p-4 rounded-xl border border-purple-500/20">
                            <h3 className="text-[8px] font-black tracking-[0.2em] text-purple-400 mb-2">DESIGNATION</h3>
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
                            <h3 className="text-[8px] font-black tracking-[0.2em] text-purple-400 mb-2 flex items-center gap-2">
                              <span className="w-1 h-1 bg-purple-500 rounded-full" /> STRUCTURAL ANALYSIS
                            </h3>
                            <p className="text-[11px] text-gray-400 leading-relaxed italic bg-black/20 p-3 rounded-xl border border-white/5">"{regionLore.resourcesSummary}"</p>
                          </div>

                          <div>
                            <h3 className="text-[8px] font-black tracking-[0.2em] text-purple-400 mb-2 flex items-center gap-2">
                              <span className="w-1 h-1 bg-purple-500 rounded-full" /> ARCHIVAL RECORD
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
                      onClick={fetchRegionLore}
                      disabled={isFetchingLore}
                      className="w-full text-[10px] tracking-[0.2em] font-black py-3.5 bg-purple-600/80 hover:bg-purple-500 border border-purple-500/50 rounded-xl transition-all shadow-[0_0_15px_rgba(168,85,247,0.2)] disabled:opacity-50 disabled:shadow-none"
                    >
                      {isFetchingLore ? "CALCULATING..." : "INITIATE SCAN"}
                    </Button>
                  </div>
                )}

              </div>
            </aside>
          )
        }

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
