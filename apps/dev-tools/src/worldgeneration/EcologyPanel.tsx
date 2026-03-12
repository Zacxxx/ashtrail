import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { EcologyHierarchyList } from "../ecology/EcologyHierarchyList";
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
    const [selectedProvinceId, setSelectedProvinceId] = useState<number | null>(null);

    const selectedProvince = useMemo(
        () => ecology.regionsByType.provinces.find((entry) => entry.rawId === selectedProvinceId) ?? null,
        [ecology.regionsByType.provinces, selectedProvinceId],
    );
    const selectedRecord = selectedProvince?.rawId
        ? ecology.bundle?.provinces.find((entry) => entry.provinceId === selectedProvince.rawId) ?? null
        : null;
    const kingdomStatus = selectedProvince?.kingdomId
        ? ecology.baselineLookup.get(`kingdom:${selectedProvince.kingdomId}`)?.status ?? "missing"
        : "missing";
    const duchyStatus = selectedProvince?.duchyId
        ? ecology.baselineLookup.get(`duchy:${selectedProvince.duchyId}`)?.status ?? "missing"
        : "missing";
    const worldStatus = ecology.baselineLookup.get("world:world")?.status ?? "missing";

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
                            <p className="text-[10px] text-gray-500 mt-1">World {"->"} Kingdom {"->"} Duchy gates province generation.</p>
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
                        <StatusCard label="KINGDOM" status={kingdomStatus} />
                        <StatusCard label="DUCHY" status={duchyStatus} />
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2">
                        <button
                            type="button"
                            onClick={() => void ecology.generateWorldBaseline()}
                            className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-[10px] font-bold tracking-widest text-green-300 transition-all hover:bg-green-500/20"
                        >
                            GENERATE WORLD BASELINE
                        </button>
                        {selectedProvince?.kingdomId !== undefined && (
                            <button
                                type="button"
                                onClick={() => void ecology.generateKingdomBaseline(selectedProvince.kingdomId!)}
                                disabled={worldStatus !== "approved"}
                                className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[10px] font-bold tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20 disabled:opacity-40"
                            >
                                GENERATE KINGDOM BASELINE
                            </button>
                        )}
                        {selectedProvince?.duchyId !== undefined && (
                            <button
                                type="button"
                                onClick={() => void ecology.generateDuchyBaseline(selectedProvince.duchyId!)}
                                disabled={kingdomStatus !== "approved"}
                                className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[10px] font-bold tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20 disabled:opacity-40"
                            >
                                GENERATE DUCHY BASELINE
                            </button>
                        )}
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

                <EcologyHierarchyList
                    regions={ecology.regions}
                    bundle={ecology.bundle!}
                    selectedProvinceId={selectedProvinceId}
                    onSelectProvince={setSelectedProvinceId}
                    onGenerateProvince={(provinceId) => void ecology.generateProvince(provinceId)}
                    disableActions={ecology.jobState.status === "running" || ecology.jobState.status === "queued"}
                    canGenerateProvince={(province) =>
                        worldStatus === "approved"
                        && (province.kingdomId ? ecology.baselineLookup.get(`kingdom:${province.kingdomId}`)?.status === "approved" : false)
                        && (province.duchyId ? ecology.baselineLookup.get(`duchy:${province.duchyId}`)?.status === "approved" : false)
                    }
                />

                {selectedProvince && (
                    <div className="mt-5 rounded-xl border border-white/10 bg-black/20 p-4">
                        <div className="mb-3 flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-bold text-gray-100">{selectedProvince.name}</h4>
                                <p className="text-[10px] tracking-widest text-gray-500 uppercase">
                                    Dossier {selectedRecord?.status ?? "missing"}
                                </p>
                            </div>
                            {selectedRecord && (
                                <button
                                    type="button"
                                    onClick={() => void ecology.approveProvince(selectedRecord.provinceId)}
                                    className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-[10px] font-bold tracking-widest text-green-300 transition-all hover:bg-green-500/20"
                                >
                                    APPROVE
                                </button>
                            )}
                        </div>

                        {selectedRecord?.sourceIsolatedImageUrl ? (
                            <img
                                src={`http://127.0.0.1:8787${selectedRecord.sourceIsolatedImageUrl}`}
                                alt={selectedProvince.name}
                                className="mb-3 h-44 w-full rounded-lg border border-white/10 object-contain bg-[#05080c]"
                            />
                        ) : (
                            <div className="mb-3 rounded-lg border border-dashed border-white/10 p-4 text-center text-[10px] text-gray-500">
                                Province isolate will be cached during the first generation.
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <div className="rounded-lg border border-white/10 bg-[#0a0f14] p-3">
                                <p className="text-[9px] tracking-widest text-gray-500 uppercase mb-1">Ecological Potential</p>
                                <p className="text-lg font-bold text-green-300">{selectedRecord?.ecologicalPotential ?? 0}</p>
                            </div>
                            <div className="rounded-lg border border-white/10 bg-[#0a0f14] p-3">
                                <p className="text-[9px] tracking-widest text-gray-500 uppercase mb-1">Agriculture Potential</p>
                                <p className="text-lg font-bold text-amber-300">{selectedRecord?.agriculturePotential ?? 0}</p>
                            </div>
                        </div>

                        {(selectedProvince.biomePrimaryId || selectedProvince.biomePrimary !== undefined) && (
                            <div className="mb-3 rounded-lg border border-white/10 bg-[#0a0f14] p-3 text-[10px] text-gray-300">
                                <p className="font-bold tracking-widest text-gray-500 uppercase">Biome Classification</p>
                                <p className="mt-1">{selectedProvince.biomePrimaryId || `#${selectedProvince.biomePrimary}`}</p>
                                {selectedProvince.biomeConfidence !== null && selectedProvince.biomeConfidence !== undefined && (
                                    <p className="mt-1 text-gray-500">Confidence {(selectedProvince.biomeConfidence * 100).toFixed(0)}%</p>
                                )}
                            </div>
                        )}

                        <p className="text-[11px] leading-relaxed text-gray-300 whitespace-pre-wrap">
                            {selectedRecord?.description || "No province ecology draft yet."}
                        </p>
                    </div>
                )}
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
