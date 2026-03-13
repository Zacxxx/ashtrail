import { Slider, Button } from "@ashtrail/ui";
import type { GenerationProgress, PlanetWorld, GeoRegion } from "./types";
import type { LocationGenerationMetadata, WorldLocation } from "../history/locationTypes";
import { titleCaseLocation } from "../history/locationTypes";

interface HumanityPanelProps {
    humPrompt: string;
    setHumPrompt: (value: string) => void;
    humSettlements: number;
    setHumSettlements: (value: number) => void;
    humTech: number;
    setHumTech: (value: number) => void;
    generateHumanity: (targetRegionId?: string) => void;
    genProgress: GenerationProgress;
    globeWorld: PlanetWorld | null;
    regions: GeoRegion[];
    locations: WorldLocation[];
    metadata: LocationGenerationMetadata | null;
    selectedLocationId: string | null;
    onSelectLocation: (id: string | null) => void;
}

export function HumanityPanel({
    humPrompt,
    setHumPrompt,
    humSettlements,
    setHumSettlements,
    humTech,
    setHumTech,
    generateHumanity,
    genProgress,
    globeWorld,
    locations,
    metadata,
    selectedLocationId,
    onSelectLocation,
}: HumanityPanelProps) {
    const selectedLocation = locations.find((entry) => entry.id === selectedLocationId) || null;
    const topLocations = [...locations]
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 8);

    return (
        <div className="flex-1 flex flex-col bg-[#1e1e1e]/60 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl overflow-hidden h-full">
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
                            className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-orange-500/50 resize-none shadow-inner placeholder:text-gray-700 transition-colors"
                            placeholder="How this world's cultures settle, travel, worship, fortify, trade, or decay..."
                        />
                    </div>

                    <Slider
                        label="SETTLEMENT DENSITY"
                        value={humSettlements}
                        min={0}
                        max={1}
                        step={0.05}
                        format={v => `${(v * 100).toFixed(0)}%`}
                        onChange={setHumSettlements}
                    />
                    <Slider
                        label="TECHNOLOGICAL ERA"
                        value={humTech}
                        min={0}
                        max={1}
                        step={0.05}
                        format={v => v < 0.3 ? "PRIMITIVE" : v < 0.6 ? "MEDIEVAL" : v < 0.8 ? "INDUSTRIAL" : "SCI-FI"}
                        onChange={setHumTech}
                    />
                </div>

                <div className="pt-6 mt-4 border-t border-white/5">
                    <Button
                        variant="primary"
                        onClick={() => generateHumanity()}
                        disabled={genProgress.isActive || !globeWorld?.textureUrl}
                        className="w-full text-[10px] tracking-[0.2em] font-black py-4 bg-orange-600/80 hover:bg-orange-500 border border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.3)] disabled:opacity-50 disabled:shadow-none transition-all rounded-xl"
                    >
                        {genProgress.isActive ? "SIMULATING..." : "SIMULATE LOCATIONS"}
                    </Button>
                </div>

                {metadata && (
                    <div className="mt-6 space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <SummaryCard label="Total Nodes" value={String(metadata.coverage.totalLocations)} tone="orange" />
                            <SummaryCard
                                label="Province Coverage"
                                value={`${metadata.coverage.coveredViableProvinceCount}/${metadata.coverage.viableProvinceCount}`}
                                tone="cyan"
                            />
                            <SummaryCard label="Settlements" value={String(metadata.coverage.settlementCount)} tone="emerald" />
                            <SummaryCard label="Non-Settlement" value={String(metadata.coverage.nonSettlementCount)} tone="amber" />
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                            <div className="flex items-center justify-between mb-3">
                                <p className="text-[10px] font-bold tracking-[0.18em] text-gray-400 uppercase">Highest Importance Nodes</p>
                                <span className="text-[9px] tracking-widest text-gray-500">
                                    AI {titleCaseLocation(metadata.aiDetailPass.status)}
                                </span>
                            </div>
                            {topLocations.length === 0 ? (
                                <p className="text-xs text-gray-500">No generated locations yet.</p>
                            ) : (
                                <div className="space-y-2">
                                    {topLocations.map((location) => (
                                        <button
                                            key={location.id}
                                            onClick={() => onSelectLocation(location.id)}
                                            className={`w-full rounded-lg border px-3 py-2 text-left transition-all ${
                                                selectedLocationId === location.id
                                                    ? "border-orange-500/40 bg-orange-500/10"
                                                    : "border-white/5 bg-white/5 hover:border-white/20"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-bold text-gray-100">{location.name}</div>
                                                    <div className="truncate text-[10px] uppercase tracking-[0.18em] text-gray-500">
                                                        {location.type} • {location.provinceName}
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="text-sm font-black text-orange-300">{location.importance}</div>
                                                    <div className="text-[9px] tracking-widest text-gray-500 uppercase">{titleCaseLocation(location.scale)}</div>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {selectedLocation && (
                            <div className="rounded-xl border border-white/10 bg-[#0a0f14] p-4 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-black text-white">{selectedLocation.name}</p>
                                        <p className="text-[10px] uppercase tracking-[0.18em] text-orange-300">
                                            {selectedLocation.type} • {selectedLocation.provinceName}
                                        </p>
                                    </div>
                                    <div className="text-right text-[10px] tracking-widest uppercase text-gray-500">
                                        <div>{titleCaseLocation(selectedLocation.status)}</div>
                                        <div>{titleCaseLocation(selectedLocation.scale)}</div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-[10px] uppercase tracking-widest text-gray-400">
                                    <MetricBadge label="Habitability" value={selectedLocation.habitabilityScore} />
                                    <MetricBadge label="Economic" value={selectedLocation.economicScore} />
                                    <MetricBadge label="Strategic" value={selectedLocation.strategicScore} />
                                    <MetricBadge label="Hazard" value={selectedLocation.hazardScore} />
                                </div>
                                <p className="text-xs leading-relaxed text-gray-300">{selectedLocation.lore || "No lore generated yet."}</p>
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500 mb-1">Placement Drivers</p>
                                    <p className="text-xs text-gray-300">
                                        {selectedLocation.placementDrivers.length > 0
                                            ? selectedLocation.placementDrivers.join(" • ")
                                            : "No placement drivers recorded."}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500 mb-1">History Hooks</p>
                                    <p className="text-xs text-gray-300">{selectedLocation.historyHooks.foundingReason}</p>
                                    <p className="text-xs text-gray-400 mt-1">{selectedLocation.historyHooks.currentTension}</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: "orange" | "cyan" | "emerald" | "amber" }) {
    const toneClass = {
        orange: "text-orange-300 border-orange-500/20 bg-orange-500/10",
        cyan: "text-cyan-300 border-cyan-500/20 bg-cyan-500/10",
        emerald: "text-emerald-300 border-emerald-500/20 bg-emerald-500/10",
        amber: "text-amber-300 border-amber-500/20 bg-amber-500/10",
    }[tone];
    return (
        <div className={`rounded-xl border p-3 ${toneClass}`}>
            <div className="text-[9px] uppercase tracking-[0.18em] opacity-70">{label}</div>
            <div className="mt-1 text-xl font-black">{value}</div>
        </div>
    );
}

function MetricBadge({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-lg border border-white/5 bg-black/30 px-3 py-2">
            <div className="text-[9px] text-gray-500">{label}</div>
            <div className="mt-1 text-sm font-black text-white">{value}</div>
        </div>
    );
}
