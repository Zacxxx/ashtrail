import { Link } from "react-router-dom";
import { useMemo } from "react";
import { useEcologyData } from "../ecology/useEcologyData";

interface EcologyPanelProps {
    planetId: string | null;
}

function baselinePill(status: string) {
    switch (status) {
        case "approved":
            return "border-green-500/30 bg-green-500/10 text-green-300";
        case "draft":
            return "border-amber-500/30 bg-amber-500/10 text-amber-300";
        default:
            return "border-white/10 bg-white/5 text-gray-500";
    }
}

export function EcologyPanel({ planetId }: EcologyPanelProps) {
    const ecology = useEcologyData(planetId);
    const worldStatus = ecology.baselineLookup.get("world:world")?.status ?? "missing";
    const kingdomCount = useMemo(() => ecology.regionsByType.kingdoms.length, [ecology.regionsByType.kingdoms.length]);
    const duchyCount = useMemo(() => ecology.regionsByType.duchies.length, [ecology.regionsByType.duchies.length]);

    if (!planetId) {
        return (
            <div className="flex-1 flex flex-col bg-[#1e1e1e]/60 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl overflow-hidden h-full">
                <div className="p-5 flex-1 flex items-center justify-center text-center text-gray-500 text-sm">
                    Select a generated world to manage ecology.
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col bg-[#1e1e1e]/60 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl overflow-hidden h-full">
            <div className="p-5 flex-1 overflow-y-auto scrollbar-thin">
                <h3 className="text-[11px] font-black tracking-[0.2em] text-green-400 flex items-center gap-2 mb-5">
                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                    ECOLOGY ENGINE
                </h3>

                <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <p className="text-[10px] font-bold tracking-widest text-gray-400 uppercase">Baseline Status</p>
                            <p className="text-[10px] text-gray-500 mt-1">Ecology now runs from world, kingdom, duchy, biome, flora, and fauna canon only.</p>
                        </div>
                        <Link
                            to="/ecology"
                            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-bold tracking-widest text-emerald-300 transition-all hover:bg-emerald-500/20"
                        >
                            OPEN /ECOLOGY
                        </Link>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                        <StatusCard label="WORLD" status={worldStatus} />
                        <StatusCard label="KINGDOMS" status={String(kingdomCount)} />
                        <StatusCard label="DUCHIES" status={String(duchyCount)} />
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2">
                        <button
                            type="button"
                            onClick={() => void ecology.generateWorldBaseline()}
                            className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-[10px] font-bold tracking-widest text-green-300 transition-all hover:bg-green-500/20"
                        >
                            GENERATE WORLD BASELINE
                        </button>
                    </div>
                </div>

                <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-3 text-[10px] text-gray-400">
                    {ecology.jobState.jobId
                        ? `${ecology.jobState.status.toUpperCase()} • ${ecology.jobState.stage} • ${ecology.jobState.progress.toFixed(0)}%`
                        : "No active ecology job."}
                </div>

                {ecology.biomeReport && (
                    <div className="mb-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-bold tracking-widest text-cyan-300 uppercase">Biome Summary</p>
                                <p className="mt-1 text-[10px] text-gray-500">
                                    {ecology.biomeReport.activeBiomes.length} active archetypes • avg confidence {(ecology.biomeReport.averageConfidence * 100).toFixed(0)}%
                                </p>
                            </div>
                            <Link
                                to="/ecology?tab=biomes"
                                className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[10px] font-bold tracking-widest text-cyan-300"
                            >
                                TUNE BIOMES
                            </Link>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                            <StatusCard label="LOW CONF" status={`${ecology.biomeReport.lowConfidencePixelCount}`} />
                            <StatusCard label="VISION" status={ecology.bundle.biomeModelSettings.visionModelId} />
                            <StatusCard label="VERSION" status={ecology.bundle.biomeModelSettings.analysisVersion} />
                        </div>
                    </div>
                )}

                <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4 text-[11px] text-gray-400 leading-relaxed">
                    Province dossiers and climate profiles have been removed from ecology management. Use `/ecology` to work on baselines, biome coverage, flora, and fauna.
                </div>
            </div>
        </div>
    );
}

function StatusCard({ label, status }: { label: string; status: string }) {
    return (
        <div className="rounded-lg border border-white/10 bg-[#0a0f14] p-3">
            <p className="text-[9px] font-bold tracking-widest text-gray-500 uppercase mb-2">{label}</p>
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-widest uppercase ${baselinePill(status)}`}>
                {status}
            </span>
        </div>
    );
}
