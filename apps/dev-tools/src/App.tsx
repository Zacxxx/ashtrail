import { useState, useCallback } from "react";
import { Button } from "@ashtrail/ui";
import { MapCanvas } from "./components/MapCanvas";
import type {
  SimulationConfig,
  LODLevel,
  VisualizationMode,
  TerrainCell,
} from "./modules/geo/types";
import { LOD_LEVELS, BIOME_TYPES } from "./modules/geo/types";
import { DEFAULT_CONFIG } from "./modules/geo/engine";
import { BIOME_META, BIOME_COLORS } from "./modules/geo/biomes";

// ── Pipeline Steps ──

type WorkflowStep = "GEO" | "HUBS" | "ANTS" | "SHAPES" | "SUBDIV" | "TRAFFIC" | "NAMES" | "SAT";
const WORKFLOW_STEPS: WorkflowStep[] = ["GEO", "HUBS", "ANTS", "SHAPES", "SUBDIV", "TRAFFIC", "NAMES", "SAT"];
const WORKFLOW_LABELS: Record<WorkflowStep, string> = {
  GEO: "Geology",
  HUBS: "Ecology",
  ANTS: "Routes",
  SHAPES: "Factions",
  SUBDIV: "Zones",
  TRAFFIC: "Economy",
  NAMES: "Names",
  SAT: "Export",
};

// ── Visualization Mode Config ──

const VIZ_MODES: { key: VisualizationMode; label: string; icon: string }[] = [
  { key: "BIOME", label: "Biomes", icon: "🌍" },
  { key: "ELEVATION", label: "Elevation", icon: "⛰️" },
  { key: "TEMPERATURE", label: "Temperature", icon: "🌡️" },
  { key: "MOISTURE", label: "Moisture", icon: "💧" },
  { key: "WIND", label: "Wind", icon: "💨" },
  { key: "RADIATION", label: "Radiation", icon: "☢️" },
  { key: "TECTONIC", label: "Tectonic", icon: "🪨" },
  { key: "VOLCANIC", label: "Volcanic", icon: "🌋" },
  { key: "VEGETATION", label: "Vegetation", icon: "🌿" },
  { key: "RIVERS", label: "Rivers", icon: "🏞️" },
  { key: "MINERALS", label: "Minerals", icon: "💎" },
];

// ── Inspector Panel Types ──

type InspectorTab = "world" | "geology" | "climate" | "layers" | "cell";

export function App() {
  const [activeStep, setActiveStep] = useState<WorkflowStep>("GEO");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("world");

  const [config, setConfig] = useState<SimulationConfig>({ ...DEFAULT_CONFIG });
  const [lodLevel, setLodLevel] = useState<LODLevel>(2);
  const [vizMode, setVizMode] = useState<VisualizationMode>("BIOME");
  const [hoveredCell, setHoveredCell] = useState<TerrainCell | null>(null);

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

  const handleCellHover = useCallback((cell: TerrainCell | null) => {
    setHoveredCell(cell);
  }, []);

  const regenerateSeed = useCallback(() => {
    updateWorld({ seed: Math.floor(Math.random() * 1_000_000) });
  }, [updateWorld]);

  return (
    <div className="flex flex-col h-screen bg-[#0a0f14] text-gray-300 font-sans tracking-wide overflow-hidden">

      {/* ══ Top Header ══ */}
      <header className="h-12 flex items-center justify-between px-6 bg-[#0a0f14] border-b border-[#1f2937] shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-500 text-[#0a0f14] font-bold text-xs">
            S
          </div>
          <h1 className="text-sm font-bold tracking-[0.2em] text-gray-100">
            SPRAWL <span className="text-gray-600 font-normal">| OLAAS — WORLD ENGINE</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {/* LOD Selector */}
          <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-gray-500">
            <span>LOD</span>
            {([0, 1, 2, 3, 4] as LODLevel[]).map((l) => (
              <button
                key={l}
                onClick={() => setLodLevel(l)}
                className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${lodLevel === l
                    ? "bg-teal-500/20 text-teal-400 border border-teal-500/50"
                    : "text-gray-600 hover:text-gray-400 hover:bg-[#1f2937] border border-transparent"
                  }`}
              >
                {l}
              </button>
            ))}
            <span className="text-gray-600 ml-1">{LOD_LEVELS[lodLevel].name}</span>
          </div>

          <div className="w-px h-6 bg-[#1f2937]" />

          <div className="flex gap-4 text-xs font-semibold tracking-widest">
            <button className="text-teal-500 hover:text-teal-400 transition-colors">GENERATION</button>
            <button className="text-gray-500 hover:text-gray-400 transition-colors">CONCEPTS</button>
          </div>
        </div>
      </header>

      {/* ══ Main Layout ══ */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* ── Left Inspector Sidebar ── */}
        <aside className="absolute left-4 top-4 w-72 flex flex-col gap-2 z-10 max-h-[calc(100vh-8rem)] overflow-y-auto scrollbar-thin">

          {/* Tab Bar */}
          <div className="flex gap-1 bg-[#121820]/90 backdrop-blur border border-[#1f2937] rounded-md p-1">
            {(["world", "geology", "climate", "layers", "cell"] as InspectorTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setInspectorTab(tab)}
                className={`flex-1 py-2 text-[9px] font-bold tracking-widest rounded transition-colors ${inspectorTab === tab
                    ? "bg-teal-500/20 text-teal-400"
                    : "text-gray-600 hover:text-gray-400"
                  }`}
              >
                {tab.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Panel Content */}
          <div className="p-4 bg-[#121820]/90 backdrop-blur border border-[#1f2937] rounded-md text-xs space-y-4">

            {/* ── World Config ── */}
            {inspectorTab === "world" && (
              <>
                <PanelHeader title="PLANETARY BASELINE" />

                <Slider
                  label="SEED" value={config.world.seed} min={0} max={999999} step={1}
                  onChange={v => updateWorld({ seed: v })}
                />
                <Button
                  variant="secondary"
                  onClick={regenerateSeed}
                  className="w-full text-[10px] tracking-widest py-2 bg-[#1f2937] hover:bg-[#374151] border border-gray-700"
                >
                  🎲 REGENERATE SEED
                </Button>

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
              </>
            )}

            {/* ── Geology Config ── */}
            {inspectorTab === "geology" && (
              <>
                <PanelHeader title="TECTONIC & TERRAIN" />

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
                <Slider
                  label="OCTAVES (DETAIL)" value={config.geo.octaves}
                  min={1} max={10} step={1}
                  onChange={v => updateGeo({ octaves: v })}
                />
                <Slider
                  label="PERSISTENCE" value={config.geo.persistence}
                  min={0.1} max={0.9} step={0.05} format={v => v.toFixed(2)}
                  onChange={v => updateGeo({ persistence: v })}
                />
                <Slider
                  label="LACUNARITY" value={config.geo.lacunarity}
                  min={1.0} max={4.0} step={0.1} format={v => v.toFixed(1)}
                  onChange={v => updateGeo({ lacunarity: v })}
                />
              </>
            )}

            {/* ── Climate Config ── */}
            {inspectorTab === "climate" && (
              <>
                <PanelHeader title="CLIMATE MODEL" />

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
                  label="WIND DIRECTION" value={config.climate.prevailingWindDir}
                  min={0} max={360} step={15} format={v => `${v}°`}
                  onChange={v => updateClimate({ prevailingWindDir: v })}
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
                <Slider
                  label="OCEAN WARMTH" value={config.climate.oceanWarmthFactor}
                  min={0} max={2.0} step={0.1} format={v => v.toFixed(1)}
                  onChange={v => updateClimate({ oceanWarmthFactor: v })}
                />
              </>
            )}

            {/* ── Visualization Layers ── */}
            {inspectorTab === "layers" && (
              <>
                <PanelHeader title="VISUALIZATION LAYERS" />
                <div className="grid grid-cols-2 gap-1">
                  {VIZ_MODES.map(({ key, label, icon }) => (
                    <button
                      key={key}
                      onClick={() => setVizMode(key)}
                      className={`flex items-center gap-2 px-3 py-2 rounded text-left transition-all ${vizMode === key
                          ? "bg-teal-500/20 text-teal-400 border border-teal-500/40"
                          : "text-gray-500 hover:text-gray-300 hover:bg-[#1f2937] border border-transparent"
                        }`}
                    >
                      <span className="text-sm">{icon}</span>
                      <span className="text-[10px] font-bold tracking-wider">{label.toUpperCase()}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* ── Cell Inspector ── */}
            {inspectorTab === "cell" && (
              <>
                <PanelHeader title="CELL DATA" subtitle="Hover a cell on the map" />
                {hoveredCell ? (
                  <CellInspector cell={hoveredCell} />
                ) : (
                  <p className="text-gray-600 text-[10px] italic">Move cursor over the map to inspect terrain cells.</p>
                )}
              </>
            )}
          </div>
        </aside>

        {/* ── Center Map ── */}
        <main className="flex-1 relative bg-[#0d1218]">
          <div className="absolute inset-0 opacity-80 mix-blend-screen pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, transparent 0%, #0a0f14 100%)' }} />

          <div className="w-full h-full p-4">
            <MapCanvas
              config={config}
              lodLevel={lodLevel}
              visualizationMode={vizMode}
              onCellHover={handleCellHover}
            />
          </div>

          {/* ── Bottom Workflow Bar ── */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#121820]/80 backdrop-blur px-6 py-3 rounded-full border border-[#1f2937] z-20 shadow-2xl">
            <span className="text-[10px] font-bold tracking-widest text-gray-500 mr-4">PIPELINE</span>
            {WORKFLOW_STEPS.map((step, idx) => (
              <button
                key={step}
                onClick={() => setActiveStep(step)}
                className={`flex flex-col items-center justify-center w-14 h-14 rounded-full transition-all ${activeStep === step
                    ? "border-2 border-teal-500 bg-teal-500/10 text-teal-400"
                    : idx === 0
                      ? "border border-teal-500/30 text-gray-500 hover:text-gray-400 hover:bg-[#1f2937]"
                      : "border border-transparent text-gray-600 hover:text-gray-400 hover:bg-[#1f2937] opacity-40"
                  }`}
              >
                <span className="text-sm font-bold">{idx + 1}</span>
                <span className="text-[7px] font-bold tracking-wider">{WORKFLOW_LABELS[step]}</span>
              </button>
            ))}
          </div>
        </main>

        {/* ── Right: Mini Status ── */}
        <aside className="absolute bottom-4 right-4 z-10 w-52 space-y-2">
          {hoveredCell && (
            <div className="px-3 py-2 text-[10px] bg-[#121820]/90 backdrop-blur border border-[#1f2937] rounded-md shadow-lg">
              <div className="flex justify-between">
                <span className="text-gray-500">BIOME</span>
                <span className="text-teal-400 font-bold">{BIOME_META[hoveredCell.biome]?.name ?? hoveredCell.biome}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-500">ELEV</span>
                <span className="text-gray-300">{hoveredCell.elevationMeters.toFixed(0)}m</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-500">TEMP</span>
                <span className="text-gray-300">{hoveredCell.temperature.toFixed(1)}°C</span>
              </div>
            </div>
          )}
          <button className="flex items-center justify-between w-full px-4 py-3 text-[10px] font-bold tracking-widest bg-[#121820] border border-[#1f2937] rounded-md hover:border-teal-500/50 transition-colors text-gray-400 shadow-lg">
            PERFORMANCE PROFILE
            <span className="text-green-500">OPTIMAL</span>
          </button>
        </aside>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Reusable Sub-Components
// ══════════════════════════════════════════════════════════════

function PanelHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-[#1f2937] pb-2 mb-2">
      <h3 className="text-[10px] font-bold tracking-[0.15em] text-teal-500">{title}</h3>
      {subtitle && <p className="text-[9px] text-gray-600 mt-0.5">{subtitle}</p>}
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  const display = format ? format(value) : String(value);
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-gray-500 text-[10px] tracking-wider">{label}</span>
        <span className="text-teal-500 text-[10px] font-mono">{display}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-teal-500 h-1"
      />
    </div>
  );
}

function CellInspector({ cell }: { cell: TerrainCell }) {
  const meta = BIOME_META[cell.biome];
  return (
    <div className="space-y-3 text-[10px]">
      {/* Biome Header */}
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded" style={{ backgroundColor: BIOME_COLORS[cell.biome] }} />
        <span className="font-bold text-gray-100 tracking-wider">{meta?.name ?? cell.biome}</span>
      </div>
      {meta && (
        <p className="text-gray-500 italic">{meta.description}</p>
      )}

      {/* Data Grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px]">
        <DataRow label="Position" value={`${cell.x}, ${cell.y}`} />
        <DataRow label="Elevation" value={`${cell.elevationMeters.toFixed(0)}m`} />
        <DataRow label="Temperature" value={`${cell.temperature.toFixed(1)}°C`} />
        <DataRow label="Moisture" value={`${(cell.moisture * 100).toFixed(0)}%`} />
        <DataRow label="Precipitation" value={`${(cell.precipitation * 100).toFixed(0)}%`} />
        <DataRow label="Wind" value={`${(cell.windExposure * 100).toFixed(0)}%`} />
        <DataRow label="Slope" value={`${(cell.slope * 100).toFixed(0)}%`} />
        <DataRow label="Tectonic" value={`${(cell.tectonicStress * 100).toFixed(0)}%`} />
        <DataRow label="Volcanic" value={`${(cell.volcanicActivity * 100).toFixed(0)}%`} />
        <DataRow label="Radiation" value={`${(cell.radiationLevel * 100).toFixed(0)}%`} />
        <DataRow label="Vegetation" value={`${(cell.vegetationDensity * 100).toFixed(0)}%`} />
        <DataRow label="Water Table" value={`${(cell.waterTableDepth * 100).toFixed(0)}%`} />
        <DataRow label="River Flow" value={`${(cell.riverFlow * 100).toFixed(0)}%`} />
        <DataRow label="Soil" value={cell.soilType} />
      </div>

      {/* Minerals */}
      {cell.mineralDeposits.length > 0 && (
        <div>
          <span className="text-gray-500 tracking-wider">MINERALS</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {cell.mineralDeposits.map((m, i) => (
              <span key={i} className="px-2 py-0.5 bg-amber-500/15 text-amber-400 rounded text-[8px] font-bold tracking-wider">
                {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Habitability */}
      {meta && (
        <div className="grid grid-cols-3 gap-1 mt-2">
          <MiniBar label="Resources" value={meta.resourcePotential} color="text-amber-400" />
          <MiniBar label="Habitable" value={meta.habitability} color="text-green-400" />
          <MiniBar label="Threat" value={meta.threatLevel} color="text-red-400" />
        </div>
      )}
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-gray-600">{label}</span>
      <span className="text-gray-300 font-mono text-right">{value}</span>
    </>
  );
}

function MiniBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className="h-1 bg-[#1f2937] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-current ${color}`}
          style={{ width: `${value * 100}%` }}
        />
      </div>
      <span className="text-[8px] text-gray-600 mt-0.5 block">{label}</span>
    </div>
  );
}
