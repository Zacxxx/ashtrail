import { Slider, Button } from "@ashtrail/ui";
import { Link } from "react-router-dom";
import type {
    GenerationProgress,
    PlanetWorld,
    HumanityReadiness,
    HumanityScopeKind,
    HumanityScopeTarget,
    WorldgenRegionRecord,
} from "./types";
import type { LocationGenerationMetadata, WorldLocation } from "../../history/locationTypes";
import { titleCaseLocation } from "../../history/locationTypes";

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
    readiness: HumanityReadiness | null;
    scopeKind: HumanityScopeKind;
    setScopeKind: (value: HumanityScopeKind) => void;
    scopeTargets: HumanityScopeTarget[];
    visibleRegions: WorldgenRegionRecord[];
    scopeQuery: string;
    setScopeQuery: (value: string) => void;
    resolvedProvinceCount: number;
    onToggleScopeTarget: (target: HumanityScopeTarget) => void;
    onAdoptExistingOutput: () => void;
    isAdoptingExistingOutput: boolean;
    regions: WorldgenRegionRecord[];
    locations: WorldLocation[];
    metadata: LocationGenerationMetadata | null;
    selectedLocationId: string | null;
    onSelectLocation: (id: string | null) => void;
}

const PRIMARY_SCOPE_TABS: Array<{ id: HumanityScopeKind; label: string }> = [
    { id: "kingdom", label: "Kingdom" },
    { id: "duchy", label: "Duchy" },
    { id: "province", label: "Province" },
    { id: "world", label: "World" },
];

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
    readiness,
    scopeKind,
    setScopeKind,
    scopeTargets,
    visibleRegions,
    scopeQuery,
    setScopeQuery,
    resolvedProvinceCount,
    onToggleScopeTarget,
    onAdoptExistingOutput,
    isAdoptingExistingOutput,
    locations,
    metadata,
    selectedLocationId,
    onSelectLocation,
}: HumanityPanelProps) {
    const selectedLocation = locations.find((entry) => entry.id === selectedLocationId) || null;
    const topLocations = [...locations]
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 8);
    const canRunScoped = scopeKind === "world" || scopeTargets.length > 0;
    const isBlocked = !readiness?.ready;
    const isActionDisabled = genProgress.isActive || !globeWorld?.textureUrl || isBlocked || !canRunScoped;

    return (
        <div className="flex-1 flex flex-col bg-[#1e1e1e]/60 backdrop-blur-xl border border-white/5 rounded-2xl shadow-2xl overflow-hidden h-full">
            <div className="p-5 flex-1 overflow-y-auto scrollbar-thin">
                <h3 className="text-[11px] font-black tracking-[0.2em] text-orange-400 flex items-center gap-2 mb-6">
                    <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.8)]" />
                    HUMANITY ENGINE
                </h3>

                <div className="space-y-6">
                    <div className={`rounded-xl border p-4 ${isBlocked ? "border-red-500/30 bg-red-500/10" : "border-emerald-500/20 bg-emerald-500/10"}`}>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-gray-300">History Readiness</p>
                                <p className="mt-2 text-sm font-semibold text-white">
                                    Main lore {readiness?.mainLoreChars ?? 0}/{readiness?.minMainLoreChars ?? 250} chars
                                </p>
                                <p className="mt-1 text-xs text-gray-300">
                                    Humanity is blocked until the main `/history` lore contains enough canon to anchor settlements and location lore.
                                </p>
                            </div>
                            <div className="text-right text-[10px] tracking-[0.18em] uppercase">
                                <div className={isBlocked ? "text-red-200" : "text-emerald-200"}>
                                    {isBlocked ? "Blocked" : "Ready"}
                                </div>
                            </div>
                        </div>
                        {readiness?.blockers?.length ? (
                            <div className="mt-3 space-y-1">
                                {readiness.blockers.map((blocker) => (
                                    <p key={blocker} className="text-xs text-red-100">{blocker}</p>
                                ))}
                            </div>
                        ) : null}
                        <div className="mt-4 flex flex-wrap gap-2">
                            <Link to="/history?tab=lore" className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200 hover:bg-cyan-500/20">
                                Open History Lore
                            </Link>
                            <Link to="/history?tab=locations" className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-gray-200 hover:bg-white/10">
                                Open History Locations
                            </Link>
                        </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-black/20 p-4 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-gray-400">Generation Scope</p>
                                <p className="mt-1 text-xs text-gray-400">Default to kingdom-scale runs, then narrow to duchies or provinces when you need a surgical redo.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setScopeKind(scopeKind === "mixed" ? "kingdom" : "mixed")}
                                className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] ${
                                    scopeKind === "mixed"
                                        ? "bg-amber-500/20 text-amber-200 border border-amber-500/30"
                                        : "bg-white/5 text-gray-300 border border-white/10"
                                }`}
                            >
                                {scopeKind === "mixed" ? "Mixed Scope On" : "Advanced Mixed Scope"}
                            </button>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {PRIMARY_SCOPE_TABS.map((tab) => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setScopeKind(tab.id)}
                                    className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] ${
                                        scopeKind === tab.id
                                            ? "bg-orange-500/20 text-orange-100 border border-orange-500/30"
                                            : "bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10"
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {scopeKind !== "world" && (
                            <>
                                <input
                                    type="text"
                                    value={scopeQuery}
                                    onChange={(event) => setScopeQuery(event.target.value)}
                                    placeholder={scopeKind === "mixed" ? "Search kingdoms, duchies, provinces..." : `Search ${scopeKind}s...`}
                                    className="w-full rounded-xl border border-white/10 bg-[#05080c] px-4 py-3 text-sm text-gray-200 focus:outline-none focus:border-orange-500/40"
                                />
                                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                                    {visibleRegions.length === 0 ? (
                                        <p className="text-xs text-gray-500">No hierarchy entities match this filter.</p>
                                    ) : visibleRegions.map((region) => {
                                        const target = {
                                            kind: region.type.toLowerCase() as HumanityScopeTarget["kind"],
                                            id: region.rawId,
                                        };
                                        const selected = scopeTargets.some((entry) => entry.kind === target.kind && entry.id === target.id);
                                        return (
                                            <button
                                                key={`${region.type}-${region.rawId}`}
                                                type="button"
                                                onClick={() => onToggleScopeTarget(target)}
                                                className={`w-full rounded-xl border px-3 py-2 text-left transition-all ${
                                                    selected
                                                        ? "border-orange-500/40 bg-orange-500/10"
                                                        : "border-white/5 bg-white/5 hover:border-white/20"
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="truncate text-sm font-semibold text-gray-100">{region.name}</div>
                                                        <div className="truncate text-[10px] uppercase tracking-[0.18em] text-gray-500">
                                                            {region.type} • #{region.rawId}
                                                        </div>
                                                    </div>
                                                    <div className={`text-[10px] uppercase tracking-[0.18em] ${selected ? "text-orange-200" : "text-gray-500"}`}>
                                                        {selected ? "Selected" : "Idle"}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        <div className="rounded-xl border border-white/10 bg-[#0a0f14] p-4">
                            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-gray-400">Scoped Run Summary</p>
                            <p className="mt-2 text-sm text-white">
                                {scopeKind === "world"
                                    ? "Full world replacement"
                                    : `${scopeTargets.length} targets selected • ${resolvedProvinceCount} resolved provinces`}
                            </p>
                            <p className="mt-1 text-xs text-gray-400">
                                Scoped Humanity reruns replace Humanity-managed output only inside the selected provinces. Manual or customized canon is preserved.
                            </p>
                        </div>

                        <Button
                            onClick={onAdoptExistingOutput}
                            disabled={isAdoptingExistingOutput || scopeKind !== "world" && scopeTargets.length === 0}
                            className="w-full bg-white/5 text-gray-200 hover:bg-white/10 border border-white/10 text-[10px] tracking-[0.18em] uppercase"
                        >
                            {isAdoptingExistingOutput ? "ADOPTING..." : "ADOPT EXISTING OUTPUT AS HUMANITY-MANAGED"}
                        </Button>
                    </div>

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
                        disabled={isActionDisabled}
                        className="w-full text-[10px] tracking-[0.2em] font-black py-4 bg-orange-600/80 hover:bg-orange-500 border border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.3)] disabled:opacity-50 disabled:shadow-none transition-all rounded-xl"
                    >
                        {genProgress.isActive ? "SIMULATING..." : scopeKind === "world" ? "SIMULATE WHOLE WORLD" : "SIMULATE SCOPED HUMANITY"}
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
                            <SummaryCard label="Scoped Provinces" value={String(metadata.config?.resolvedProvinceIds?.length ?? 0)} tone="amber" />
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
                                <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.18em]">
                                    <span className={`rounded-full px-2 py-1 ${selectedLocation.source === "humanity_generated" ? "bg-orange-500/10 text-orange-200" : "bg-cyan-500/10 text-cyan-200"}`}>
                                        {selectedLocation.source === "humanity_generated" ? "Humanity Generated" : "Manual"}
                                    </span>
                                    {selectedLocation.isCustomized && (
                                        <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-200">Customized</span>
                                    )}
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
