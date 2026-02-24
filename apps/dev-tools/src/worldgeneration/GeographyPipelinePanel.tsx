import { Button } from "@ashtrail/ui";
import type { PlanetWorld } from "./types";
import { useWorldgenPipeline, PIPELINE_STAGES, DEFAULT_WORLDGEN_CONFIG } from "./useWorldgenPipeline";
import type { StageStatus, WorldgenConfig } from "./useWorldgenPipeline";
import { useState } from "react";

// ── Status Icons ──

const STATUS_ICONS: Record<StageStatus, { icon: string; color: string; label: string }> = {
    pending: { icon: "⬜", color: "text-gray-600", label: "Waiting" },
    ready: { icon: "🔵", color: "text-cyan-400", label: "Ready" },
    running: { icon: "⏳", color: "text-amber-400", label: "Running" },
    completed: { icon: "✅", color: "text-green-400", label: "Done" },
    failed: { icon: "❌", color: "text-red-400", label: "Failed" },
};

// ── Props ──

interface GeographyPipelinePanelProps {
    activeHistoryId: string | null;
    globeWorld: PlanetWorld | null;
}

export function GeographyPipelinePanel({ activeHistoryId, globeWorld }: GeographyPipelinePanelProps) {
    const { stages, config, setConfig, runStage, resetStage } = useWorldgenPipeline(activeHistoryId);
    const [expandedStage, setExpandedStage] = useState<string | null>(null);
    const [showConfig, setShowConfig] = useState(false);

    const completedCount = Object.values(stages).filter(s => s.status === "completed").length;
    const totalCount = PIPELINE_STAGES.length;

    if (!globeWorld?.textureUrl) {
        return (
            <div className="flex-1 flex flex-col bg-[#1e1e1e]/60 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl overflow-hidden h-full">
                <div className="p-5 flex-1 flex flex-col items-center justify-center">
                    <svg className="w-8 h-8 text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    <p className="text-[10px] text-gray-500 leading-relaxed text-center">
                        Generate a planet texture in the <span className="text-[#E6E6FA] font-bold">Geology</span> step first.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col bg-[#1e1e1e]/60 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl overflow-hidden h-full">
            <div className="p-5 flex-1 overflow-y-auto scrollbar-thin">

                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[11px] font-black tracking-[0.2em] text-cyan-400 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                        PROVINCE PIPELINE
                    </h3>
                    <span className="text-[9px] font-bold tracking-widest text-gray-500">
                        {completedCount}/{totalCount}
                    </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-black/40 rounded-full mb-5 overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-green-500 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${(completedCount / totalCount) * 100}%` }}
                    />
                </div>

                {/* Config Toggle */}
                <button
                    onClick={() => setShowConfig(!showConfig)}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl border border-white/10 bg-black/30 hover:bg-white/5 transition-all mb-4"
                >
                    <span className="text-[9px] font-black tracking-[0.15em] text-gray-400">⚙ PIPELINE CONFIG</span>
                    <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showConfig ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {showConfig && (
                    <div className="mb-5 p-4 rounded-xl border border-white/10 bg-black/40 space-y-3">
                        <ConfigSlider label="COUNTIES" value={config.counties} min={50} max={5000} step={50}
                            onChange={v => setConfig(c => ({ ...c, counties: v }))} />
                        <ConfigSlider label="MIN AREA (px)" value={config.minCountyArea} min={10} max={1000} step={10}
                            onChange={v => setConfig(c => ({ ...c, minCountyArea: v }))} />
                        <ConfigSlider label="COST: SLOPE" value={config.costSlope} min={0} max={10} step={0.5}
                            onChange={v => setConfig(c => ({ ...c, costSlope: v }))} />
                        <ConfigSlider label="COST: RIVER" value={config.costRiverCrossing} min={0} max={20} step={0.5}
                            onChange={v => setConfig(c => ({ ...c, costRiverCrossing: v }))} />
                        <ConfigSlider label="COST: RIDGE" value={config.costRidgeCrossing} min={0} max={10} step={0.5}
                            onChange={v => setConfig(c => ({ ...c, costRidgeCrossing: v }))} />
                        <ConfigSlider label="DUCHY SIZE" value={config.duchySizeMin} min={2} max={12} step={1}
                            onChange={v => setConfig(c => ({ ...c, duchySizeMin: v }))} suffix={`–${config.duchySizeMax}`} />
                        <ConfigSlider label="KINGDOM SIZE" value={config.kingdomSizeMin} min={3} max={20} step={1}
                            onChange={v => setConfig(c => ({ ...c, kingdomSizeMin: v }))} suffix={`–${config.kingdomSizeMax}`} />
                        <ConfigSlider label="SMOOTH ITER" value={config.smoothIterations} min={0} max={10} step={1}
                            onChange={v => setConfig(c => ({ ...c, smoothIterations: v }))} />
                    </div>
                )}

                {/* Stage Checklist */}
                <div className="space-y-2">
                    {PIPELINE_STAGES.map((stage, idx) => {
                        const state = stages[stage.id];
                        const statusInfo = STATUS_ICONS[state.status];
                        const isExpanded = expandedStage === stage.id;
                        const canRun = state.status === "ready" || state.status === "failed";
                        const isRunning = state.status === "running";

                        return (
                            <div key={stage.id} className="group">
                                <div
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${state.status === "completed"
                                            ? "bg-green-500/5 border-green-500/20"
                                            : state.status === "running"
                                                ? "bg-amber-500/5 border-amber-500/20 animate-pulse"
                                                : state.status === "failed"
                                                    ? "bg-red-500/5 border-red-500/20"
                                                    : state.status === "ready"
                                                        ? "bg-cyan-500/5 border-cyan-500/20"
                                                        : "bg-black/20 border-white/5"
                                        }`}
                                    onClick={() => setExpandedStage(isExpanded ? null : stage.id)}
                                >
                                    {/* Step number */}
                                    <span className="text-[8px] font-black text-gray-600 w-4 text-center shrink-0">
                                        {String(idx + 1).padStart(2, "0")}
                                    </span>

                                    {/* Status icon */}
                                    <span className="text-sm shrink-0">{statusInfo.icon}</span>

                                    {/* Name & Description */}
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-[10px] font-bold tracking-wider ${statusInfo.color}`}>
                                            {stage.name.toUpperCase()}
                                        </p>
                                        {isExpanded && (
                                            <p className="text-[9px] text-gray-500 mt-0.5">{stage.description}</p>
                                        )}
                                    </div>

                                    {/* Progress or Run button */}
                                    {isRunning ? (
                                        <div className="flex items-center gap-2 shrink-0">
                                            <div className="w-12 h-1 bg-black/40 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-amber-400 rounded-full transition-all duration-300"
                                                    style={{ width: `${state.progress}%` }}
                                                />
                                            </div>
                                            <span className="text-[8px] text-amber-400 font-mono">{state.progress.toFixed(0)}%</span>
                                        </div>
                                    ) : canRun ? (
                                        <Button
                                            variant="primary"
                                            onClick={(e: React.MouseEvent) => { e.stopPropagation(); runStage(stage.id); }}
                                            className="text-[8px] tracking-widest font-black px-3 py-1 rounded-lg bg-cyan-600/40 hover:bg-cyan-600/60 border border-cyan-500/40 shrink-0"
                                        >
                                            {state.status === "failed" ? "RETRY" : "RUN"}
                                        </Button>
                                    ) : state.status === "completed" ? (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); resetStage(stage.id); }}
                                            className="text-[8px] tracking-widest font-bold text-gray-600 hover:text-amber-400 px-2 py-1 rounded-lg border border-transparent hover:border-amber-500/30 transition-all shrink-0"
                                            title="Re-run this stage (and downstream)"
                                        >
                                            ↻
                                        </button>
                                    ) : null}
                                </div>

                                {/* Expanded Details */}
                                {isExpanded && (
                                    <div className="mt-1.5 ml-7 p-3 rounded-lg bg-black/30 border border-white/5">
                                        {state.error && (
                                            <div className="text-[9px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2 mb-2">
                                                {state.error}
                                            </div>
                                        )}
                                        <div className="text-[8px] text-gray-500 space-y-1">
                                            <p><span className="text-gray-400 font-bold">Outputs:</span> {stage.outputs.join(", ")}</p>
                                            {stage.requires.length > 0 && (
                                                <p><span className="text-gray-400 font-bold">Depends on:</span> {stage.requires.join(", ")}</p>
                                            )}
                                            {state.completedAt && (
                                                <p><span className="text-gray-400 font-bold">Completed:</span> {new Date(state.completedAt).toLocaleTimeString()}</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ── Config Slider Component ──

function ConfigSlider({ label, value, min, max, step, onChange, suffix }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
    suffix?: string;
}) {
    return (
        <div className="flex items-center gap-3">
            <label className="text-[8px] font-bold tracking-widest text-gray-500 w-24 shrink-0">{label}</label>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="flex-1 h-1 appearance-none bg-white/10 rounded-full cursor-pointer accent-cyan-500"
            />
            <span className="text-[9px] font-mono text-gray-400 w-12 text-right shrink-0">
                {value}{suffix || ""}
            </span>
        </div>
    );
}
