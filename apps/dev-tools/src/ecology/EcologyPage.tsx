import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Modal, TabBar } from "@ashtrail/ui";
import { HistoryGallery } from "../worldgeneration/HistoryGallery";
import { useGenerationHistory } from "../hooks/useGenerationHistory";
import { useActiveWorld } from "../hooks/useActiveWorld";
import { EcologyHierarchyList } from "./EcologyHierarchyList";
import { useEcologyData } from "./useEcologyData";
import type {
    ClimateProfile,
    EcologyBaseline,
    FaunaEntry,
    FloraEntry,
    ProvinceEcologyRecord,
} from "./types";

type EcologyTab = "provinces" | "flora" | "fauna" | "climates" | "baselines";

function linesToArray(text: string) {
    return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

function arrayToLines(values: string[]) {
    return values.join("\n");
}

export function EcologyPage() {
    const [activeTab, setActiveTab] = useState<EcologyTab>("provinces");
    const [showGalleryModal, setShowGalleryModal] = useState(false);
    const [selectedProvinceId, setSelectedProvinceId] = useState<number | null>(null);
    const [selectedFloraId, setSelectedFloraId] = useState<string | null>(null);
    const [selectedFaunaId, setSelectedFaunaId] = useState<string | null>(null);
    const [selectedClimateId, setSelectedClimateId] = useState<string | null>(null);
    const [floraSearch, setFloraSearch] = useState("");
    const [faunaSearch, setFaunaSearch] = useState("");
    const [climateSearch, setClimateSearch] = useState("");
    const { history, deleteFromHistory, renameInHistory } = useGenerationHistory();
    const { activeWorldId, setActiveWorldId } = useActiveWorld();
    const selectedWorld = history.find((item) => item.id === activeWorldId) ?? null;
    const ecology = useEcologyData(activeWorldId);

    useEffect(() => {
        if (!selectedProvinceId) {
            const firstProvince = ecology.regionsByType.provinces[0];
            if (firstProvince?.rawId !== undefined) {
                setSelectedProvinceId(firstProvince.rawId);
            }
        }
    }, [ecology.regionsByType.provinces, selectedProvinceId]);

    useEffect(() => {
        if (!selectedFloraId && ecology.bundle?.flora[0]) setSelectedFloraId(ecology.bundle.flora[0].id);
        if (!selectedFaunaId && ecology.bundle?.fauna[0]) setSelectedFaunaId(ecology.bundle.fauna[0].id);
        if (!selectedClimateId && ecology.bundle?.climates[0]) setSelectedClimateId(ecology.bundle.climates[0].id);
    }, [ecology.bundle, selectedClimateId, selectedFaunaId, selectedFloraId]);

    const selectedProvinceRegion = useMemo(
        () => ecology.regionsByType.provinces.find((entry) => entry.rawId === selectedProvinceId) ?? null,
        [ecology.regionsByType.provinces, selectedProvinceId],
    );
    const selectedProvinceRecord = useMemo(() => {
        if (!selectedProvinceRegion?.rawId) return null;
        return (
            ecology.bundle?.provinces.find((entry) => entry.provinceId === selectedProvinceRegion.rawId) ?? {
                provinceId: selectedProvinceRegion.rawId,
                duchyId: selectedProvinceRegion.duchyId ?? 0,
                kingdomId: selectedProvinceRegion.kingdomId ?? 0,
                status: "missing",
                sourceIsolatedImageUrl: "",
                description: "",
                climateProfileIds: [],
                floraIds: [],
                faunaIds: [],
                ecologicalPotential: 0,
                agriculturePotential: 0,
                consistencyNotes: [],
            }
        );
    }, [ecology.bundle?.provinces, selectedProvinceRegion]);

    const selectedFlora = ecology.bundle?.flora.find((entry) => entry.id === selectedFloraId) ?? null;
    const selectedFauna = ecology.bundle?.fauna.find((entry) => entry.id === selectedFaunaId) ?? null;
    const selectedClimate = ecology.bundle?.climates.find((entry) => entry.id === selectedClimateId) ?? null;

    const filteredFlora = (ecology.bundle?.flora ?? []).filter((entry) =>
        entry.name.toLowerCase().includes(floraSearch.toLowerCase()),
    );
    const filteredFauna = (ecology.bundle?.fauna ?? []).filter((entry) =>
        entry.name.toLowerCase().includes(faunaSearch.toLowerCase()),
    );
    const filteredClimates = (ecology.bundle?.climates ?? []).filter((entry) =>
        entry.name.toLowerCase().includes(climateSearch.toLowerCase()),
    );
    const baselineCards = useMemo(() => {
        const worldBaseline =
            ecology.bundle?.baselines.find((entry) => entry.scope === "world" && entry.entityId === "world") ?? {
                scope: "world" as const,
                entityId: "world" as const,
                status: "missing" as const,
                summary: "",
                climateDirectives: [],
                floraDirectives: [],
                faunaDirectives: [],
                agricultureDirectives: [],
                consistencyRules: [],
            };

        const kingdomCards = ecology.regionsByType.kingdoms.map((region) => {
            return (
                ecology.bundle?.baselines.find((entry) => entry.scope === "kingdom" && entry.entityId === region.rawId) ?? {
                    scope: "kingdom" as const,
                    entityId: region.rawId ?? 0,
                    parentEntityId: "world" as const,
                    status: "missing" as const,
                    summary: "",
                    climateDirectives: [],
                    floraDirectives: [],
                    faunaDirectives: [],
                    agricultureDirectives: [],
                    consistencyRules: [],
                }
            );
        });

        const duchyCards = ecology.regionsByType.duchies.map((region) => {
            return (
                ecology.bundle?.baselines.find((entry) => entry.scope === "duchy" && entry.entityId === region.rawId) ?? {
                    scope: "duchy" as const,
                    entityId: region.rawId ?? 0,
                    parentEntityId: region.kingdomId ?? 0,
                    status: "missing" as const,
                    summary: "",
                    climateDirectives: [],
                    floraDirectives: [],
                    faunaDirectives: [],
                    agricultureDirectives: [],
                    consistencyRules: [],
                }
            );
        });

        return [worldBaseline, ...kingdomCards, ...duchyCards];
    }, [ecology.bundle?.baselines, ecology.regionsByType.duchies, ecology.regionsByType.kingdoms]);

    const updateProvinceField = async <K extends keyof ProvinceEcologyRecord>(key: K, value: ProvinceEcologyRecord[K]) => {
        if (!selectedProvinceRecord) return;
        await ecology.updateProvince({ ...selectedProvinceRecord, [key]: value });
    };

    if (!activeWorldId || !selectedWorld) {
        return (
            <div className="h-screen overflow-hidden bg-[#070b12] text-gray-300 font-sans p-8 flex flex-col">
                <header className="mb-6 flex items-center gap-6 shrink-0 border-b border-white/5 pb-6">
                    <Link to="/" className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-all">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </Link>
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-[#0a0f14] font-bold text-sm">🌿</div>
                    <h1 className="text-xl font-bold tracking-[0.2em] text-gray-100 uppercase">ECOLOGY ARCHIVE</h1>
                </header>
                <div className="flex-1 flex items-center justify-center rounded-2xl border border-white/10 bg-[#121820]">
                    <div className="max-w-md text-center">
                        <h2 className="mb-3 text-lg font-bold tracking-widest text-gray-100 uppercase">No World Selected</h2>
                        <p className="mb-5 text-sm text-gray-500">Pick a generated world to inspect and store its ecological canon.</p>
                        <button
                            type="button"
                            onClick={() => setShowGalleryModal(true)}
                            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-xs font-bold tracking-[0.2em] text-emerald-300 transition-all hover:bg-emerald-500/20"
                        >
                            PICK WORLD
                        </button>
                    </div>
                </div>
                <Modal open={showGalleryModal} onClose={() => setShowGalleryModal(false)} title="ECOLOGY - PICK A WORLD">
                    <div className="w-[80vw] h-[75vh] max-w-[1200px] flex flex-col relative overflow-hidden ring-1 ring-white/10 shadow-2xl bg-black rounded-b-xl">
                        <HistoryGallery
                            history={history}
                            activePlanetId={activeWorldId}
                            deleteFromHistory={deleteFromHistory}
                            onRenameWorld={renameInHistory}
                            onSelectPlanet={(item) => {
                                setActiveWorldId(item.id);
                                setShowGalleryModal(false);
                            }}
                            onSelectTexture={() => { }}
                            showExtendedTabs={false}
                        />
                    </div>
                </Modal>
            </div>
        );
    }

    return (
        <div className="h-screen overflow-hidden bg-[#070b12] text-gray-300 font-sans p-8 flex flex-col">
            {/* ══ Tool-Specific Sub-Header ══ */}
            <header className="fixed top-16 left-0 right-0 z-50 bg-[#070b12]/80 backdrop-blur-md border-b border-white/5 h-12 flex items-center justify-between px-6 shadow-xl">
                <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-[#0a0f14] font-bold text-[10px]">🌿</div>
                    <h1 className="text-xs font-bold tracking-[0.2em] text-gray-100 uppercase">ECOLOGY ARCHIVE</h1>
                </div>

                <div className="h-8 flex-1 max-w-xl scale-90">
                    <TabBar
                        tabs={["provinces", "flora", "fauna", "climates", "baselines"]}
                        activeTab={activeTab}
                        onTabChange={(tab) => setActiveTab(tab as EcologyTab)}
                    />
                </div>
            </header>

            <div className="mb-4 rounded-xl border border-white/10 bg-[#121820]/95 p-3 text-[11px] text-gray-400 flex items-center justify-between gap-4">
                <div>
                    <span className="font-bold tracking-widest text-emerald-300 uppercase mr-3">Ecology Job</span>
                    {ecology.jobState.jobId ? `${ecology.jobState.status.toUpperCase()} • ${ecology.jobState.stage}` : "Idle"}
                </div>
                {ecology.jobState.jobId && <span className="text-cyan-300 font-mono">{ecology.jobState.progress.toFixed(0)}%</span>}
            </div>

            {activeTab === "provinces" && selectedProvinceRecord && (
                <div className="flex-1 min-h-0 grid grid-cols-[420px_1fr] gap-4">
                    <div className="overflow-y-auto rounded-2xl border border-white/10 bg-[#121820]/95 p-4">
                        <EcologyHierarchyList
                            regions={ecology.regions}
                            bundle={ecology.bundle!}
                            selectedProvinceId={selectedProvinceId}
                            onSelectProvince={setSelectedProvinceId}
                            onGenerateProvince={ecology.generateProvince}
                            disableActions={ecology.jobState.status === "running" || ecology.jobState.status === "queued"}
                            canGenerateProvince={(province) =>
                                ecology.baselineLookup.get("world:world")?.status === "approved"
                                && (province.kingdomId ? ecology.baselineLookup.get(`kingdom:${province.kingdomId}`)?.status === "approved" : false)
                                && (province.duchyId ? ecology.baselineLookup.get(`duchy:${province.duchyId}`)?.status === "approved" : false)
                            }
                        />
                    </div>

                    <div className="overflow-y-auto rounded-2xl border border-white/10 bg-[#121820]/95 p-6">
                        <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-4">
                            <div>
                                <h2 className="text-lg font-bold tracking-widest text-gray-100 uppercase">{selectedProvinceRegion?.name}</h2>
                                <p className="text-[10px] tracking-widest text-gray-500 uppercase">Province dossier and canon review</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => ecology.generateProvince(selectedProvinceRecord.provinceId)}
                                    disabled={ecology.jobState.status === "running" || ecology.jobState.status === "queued"}
                                    className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-[10px] font-bold tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20 disabled:opacity-40"
                                >
                                    GENERATE DRAFT
                                </button>
                                <button
                                    type="button"
                                    onClick={() => ecology.approveProvince(selectedProvinceRecord.provinceId)}
                                    className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-[10px] font-bold tracking-widest text-green-300 transition-all hover:bg-green-500/20"
                                >
                                    APPROVE
                                </button>
                            </div>
                        </div>

                        {selectedProvinceRecord.sourceIsolatedImageUrl ? (
                            <div className="mb-5 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                                <img
                                    src={`http://127.0.0.1:8787${selectedProvinceRecord.sourceIsolatedImageUrl}`}
                                    alt={selectedProvinceRegion?.name}
                                    className="h-56 w-full object-contain bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.08),_transparent_60%)]"
                                />
                            </div>
                        ) : (
                            <div className="mb-5 rounded-xl border border-dashed border-white/10 p-6 text-center text-[11px] text-gray-500">
                                Isolated province preview appears after the first draft generation.
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 mb-5">
                            <label className="flex flex-col gap-2">
                                <span className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Ecological Potential</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={selectedProvinceRecord.ecologicalPotential}
                                    onChange={(e) => void updateProvinceField("ecologicalPotential", Number(e.target.value))}
                                    className="rounded-lg border border-white/10 bg-[#0a0f14] px-3 py-2 text-sm text-gray-200"
                                />
                            </label>
                            <label className="flex flex-col gap-2">
                                <span className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Agriculture Potential</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={selectedProvinceRecord.agriculturePotential}
                                    onChange={(e) => void updateProvinceField("agriculturePotential", Number(e.target.value))}
                                    className="rounded-lg border border-white/10 bg-[#0a0f14] px-3 py-2 text-sm text-gray-200"
                                />
                            </label>
                        </div>

                        <label className="mb-5 flex flex-col gap-2">
                            <span className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Ecological Description</span>
                            <textarea
                                value={selectedProvinceRecord.description}
                                onChange={(e) => void updateProvinceField("description", e.target.value)}
                                className="min-h-[180px] rounded-xl border border-white/10 bg-[#0a0f14] p-4 text-sm text-gray-200"
                            />
                        </label>

                        <label className="flex flex-col gap-2">
                            <span className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">Consistency Notes</span>
                            <textarea
                                value={arrayToLines(selectedProvinceRecord.consistencyNotes)}
                                onChange={(e) => void updateProvinceField("consistencyNotes", linesToArray(e.target.value))}
                                className="min-h-[120px] rounded-xl border border-white/10 bg-[#0a0f14] p-4 text-sm text-gray-200"
                            />
                        </label>
                    </div>
                </div>
            )}

            {activeTab === "flora" && (
                <LibraryTab
                    title="Flora Library"
                    search={floraSearch}
                    setSearch={setFloraSearch}
                    items={filteredFlora}
                    selectedId={selectedFloraId}
                    setSelectedId={setSelectedFloraId}
                    renderLabel={(item) => `${item.name} • ${item.category}`}
                    editor={selectedFlora && (
                        <FloraEditor
                            item={selectedFlora}
                            onSave={(entry) => void ecology.updateFlora(entry)}
                            onApprove={() => void ecology.approveEntryById("flora", selectedFlora.id)}
                        />
                    )}
                />
            )}

            {activeTab === "fauna" && (
                <LibraryTab
                    title="Fauna Library"
                    search={faunaSearch}
                    setSearch={setFaunaSearch}
                    items={filteredFauna}
                    selectedId={selectedFaunaId}
                    setSelectedId={setSelectedFaunaId}
                    renderLabel={(item) => `${item.name} • ${item.category}`}
                    editor={selectedFauna && (
                        <FaunaEditor
                            item={selectedFauna}
                            onSave={(entry) => void ecology.updateFauna(entry)}
                            onApprove={() => void ecology.approveEntryById("fauna", selectedFauna.id)}
                        />
                    )}
                />
            )}

            {activeTab === "climates" && (
                <LibraryTab
                    title="Climate Library"
                    search={climateSearch}
                    setSearch={setClimateSearch}
                    items={filteredClimates}
                    selectedId={selectedClimateId}
                    setSelectedId={setSelectedClimateId}
                    renderLabel={(item) => `${item.name} • ${item.classification}`}
                    editor={selectedClimate && (
                        <ClimateEditor
                            item={selectedClimate}
                            onSave={(entry) => void ecology.updateClimate(entry)}
                            onApprove={() => void ecology.approveEntryById("climates", selectedClimate.id)}
                        />
                    )}
                />
            )}

            {activeTab === "baselines" && (
                <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-white/10 bg-[#121820]/95 p-6">
                    <div className="mb-5 flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => void ecology.generateWorldBaseline()}
                            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[10px] font-bold tracking-widest text-emerald-300 transition-all hover:bg-emerald-500/20"
                        >
                            GENERATE WORLD BASELINE
                        </button>
                        <button
                            type="button"
                            onClick={() => void ecology.approveBaseline("world", "world")}
                            className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-[10px] font-bold tracking-widest text-green-300 transition-all hover:bg-green-500/20"
                        >
                            APPROVE WORLD
                        </button>
                    </div>

                    <div className="space-y-4">
                        {baselineCards.map((baseline) => (
                            <div key={`${baseline.scope}-${baseline.entityId}`} className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm font-bold tracking-widest text-gray-100 uppercase">
                                            {baseline.scope} • {String(baseline.entityId)}
                                        </h3>
                                        <p className="text-[10px] tracking-widest text-gray-500 uppercase">{baseline.status}</p>
                                    </div>
                                    {baseline.scope === "kingdom" && baseline.status !== "missing" && typeof baseline.entityId === "number" && (
                                        <button
                                            type="button"
                                            onClick={() => void ecology.generateKingdomBaseline(baseline.entityId as number)}
                                            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-bold tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20"
                                        >
                                            REGENERATE
                                        </button>
                                    )}
                                    {baseline.scope === "duchy" && baseline.status !== "missing" && typeof baseline.entityId === "number" && (
                                        <button
                                            type="button"
                                            onClick={() => void ecology.generateDuchyBaseline(baseline.entityId as number)}
                                            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-bold tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20"
                                        >
                                            REGENERATE
                                        </button>
                                    )}
                                </div>
                                <div className="mb-3 flex gap-2">
                                    {baseline.scope === "kingdom" && typeof baseline.entityId === "number" && (
                                        <button
                                            type="button"
                                            onClick={() => void ecology.generateKingdomBaseline(baseline.entityId)}
                                            disabled={ecology.baselineLookup.get("world:world")?.status !== "approved"}
                                            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-bold tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20 disabled:opacity-40"
                                        >
                                            GENERATE
                                        </button>
                                    )}
                                    {baseline.scope === "duchy" && typeof baseline.entityId === "number" && (
                                        <button
                                            type="button"
                                            onClick={() => void ecology.generateDuchyBaseline(baseline.entityId)}
                                            disabled={
                                                typeof baseline.parentEntityId !== "number"
                                                || ecology.baselineLookup.get(`kingdom:${baseline.parentEntityId}`)?.status !== "approved"
                                            }
                                            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-bold tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20 disabled:opacity-40"
                                        >
                                            GENERATE
                                        </button>
                                    )}
                                    {baseline.status !== "missing" && (
                                        <button
                                            type="button"
                                            onClick={() => void ecology.approveBaseline(baseline.scope, baseline.entityId)}
                                            className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-[10px] font-bold tracking-widest text-green-300 transition-all hover:bg-green-500/20"
                                        >
                                            APPROVE
                                        </button>
                                    )}
                                </div>
                                <textarea
                                    value={baseline.summary}
                                    onChange={(e) => void ecology.updateBaseline({ ...baseline, summary: e.target.value })}
                                    className="min-h-[120px] w-full rounded-xl border border-white/10 bg-[#0a0f14] p-4 text-sm text-gray-200"
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <Modal open={showGalleryModal} onClose={() => setShowGalleryModal(false)} title="ECOLOGY - PICK A WORLD">
                <div className="w-[80vw] h-[75vh] max-w-[1200px] flex flex-col relative overflow-hidden ring-1 ring-white/10 shadow-2xl bg-black rounded-b-xl">
                    <HistoryGallery
                        history={history}
                        activePlanetId={activeWorldId}
                        deleteFromHistory={deleteFromHistory}
                        onRenameWorld={renameInHistory}
                        onSelectPlanet={(item) => {
                            setActiveWorldId(item.id);
                            setShowGalleryModal(false);
                        }}
                        onSelectTexture={() => { }}
                        showExtendedTabs={false}
                    />
                </div>
            </Modal>
        </div>
    );
}

function LibraryTab<T extends { id: string }>({
    title,
    search,
    setSearch,
    items,
    selectedId,
    setSelectedId,
    renderLabel,
    editor,
}: {
    title: string;
    search: string;
    setSearch: (value: string) => void;
    items: T[];
    selectedId: string | null;
    setSelectedId: (value: string) => void;
    renderLabel: (item: T) => string;
    editor: ReactNode;
}) {
    return (
        <div className="flex-1 min-h-0 grid grid-cols-[360px_1fr] gap-4">
            <div className="overflow-y-auto rounded-2xl border border-white/10 bg-[#121820]/95 p-4">
                <h2 className="mb-3 text-sm font-bold tracking-widest text-gray-100 uppercase">{title}</h2>
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search..."
                    className="mb-3 w-full rounded-lg border border-white/10 bg-[#0a0f14] px-3 py-2 text-sm text-gray-200"
                />
                <div className="space-y-2">
                    {items.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedId(item.id)}
                            className={`w-full rounded-lg border p-3 text-left transition-all ${selectedId === item.id
                                    ? "border-cyan-500/40 bg-cyan-500/10"
                                    : "border-white/10 bg-black/20 hover:border-white/20"
                                }`}
                        >
                            <p className="text-sm font-bold text-gray-100">{renderLabel(item)}</p>
                        </button>
                    ))}
                </div>
            </div>
            <div className="overflow-y-auto rounded-2xl border border-white/10 bg-[#121820]/95 p-6">{editor}</div>
        </div>
    );
}

function ClimateEditor({
    item,
    onSave,
    onApprove,
}: {
    item: ClimateProfile;
    onSave: (entry: ClimateProfile) => void;
    onApprove: () => void;
}) {
    return (
        <div className="space-y-4">
            <EditorHeader title={item.name} status={item.status} onApprove={onApprove} />
            <TextInput label="Name" value={item.name} onChange={(value) => onSave({ ...item, name: value })} />
            <TextInput label="Classification" value={item.classification} onChange={(value) => onSave({ ...item, classification: value })} />
            <TextArea label="Temperature" value={item.temperatureSummary} onChange={(value) => onSave({ ...item, temperatureSummary: value })} />
            <TextArea label="Precipitation" value={item.precipitationSummary} onChange={(value) => onSave({ ...item, precipitationSummary: value })} />
            <TextArea label="Seasonality" value={item.seasonality} onChange={(value) => onSave({ ...item, seasonality: value })} />
            <TextArea label="Agriculture Notes" value={item.agricultureNotes} onChange={(value) => onSave({ ...item, agricultureNotes: value })} />
        </div>
    );
}

function FloraEditor({
    item,
    onSave,
    onApprove,
}: {
    item: FloraEntry;
    onSave: (entry: FloraEntry) => void;
    onApprove: () => void;
}) {
    return (
        <div className="space-y-4">
            <EditorHeader title={item.name} status={item.status} onApprove={onApprove} />
            <TextInput label="Name" value={item.name} onChange={(value) => onSave({ ...item, name: value })} />
            <TextInput label="Category" value={item.category} onChange={(value) => onSave({ ...item, category: value as FloraEntry["category"] })} />
            <TextArea label="Description" value={item.description} onChange={(value) => onSave({ ...item, description: value })} />
            <TextArea label="Ecological Roles" value={arrayToLines(item.ecologicalRoles)} onChange={(value) => onSave({ ...item, ecologicalRoles: linesToArray(value) })} />
            <TextArea label="Adaptations" value={arrayToLines(item.adaptations)} onChange={(value) => onSave({ ...item, adaptations: linesToArray(value) })} />
            <TextInput label="Edibility" value={item.edibility} onChange={(value) => onSave({ ...item, edibility: value as FloraEntry["edibility"] })} />
        </div>
    );
}

function FaunaEditor({
    item,
    onSave,
    onApprove,
}: {
    item: FaunaEntry;
    onSave: (entry: FaunaEntry) => void;
    onApprove: () => void;
}) {
    return (
        <div className="space-y-4">
            <EditorHeader title={item.name} status={item.status} onApprove={onApprove} />
            <TextInput label="Name" value={item.name} onChange={(value) => onSave({ ...item, name: value })} />
            <TextInput label="Category" value={item.category} onChange={(value) => onSave({ ...item, category: value as FaunaEntry["category"] })} />
            <TextArea label="Description" value={item.description} onChange={(value) => onSave({ ...item, description: value })} />
            <TextArea label="Ecological Roles" value={arrayToLines(item.ecologicalRoles)} onChange={(value) => onSave({ ...item, ecologicalRoles: linesToArray(value) })} />
            <TextArea label="Adaptations" value={arrayToLines(item.adaptations)} onChange={(value) => onSave({ ...item, adaptations: linesToArray(value) })} />
            <TextInput label="Earth Analog" value={item.earthAnalog} onChange={(value) => onSave({ ...item, earthAnalog: value })} />
            <TextInput label="Ancestral Stock" value={item.ancestralStock} onChange={(value) => onSave({ ...item, ancestralStock: value })} />
            <TextArea label="Evolutionary Pressures" value={arrayToLines(item.evolutionaryPressures)} onChange={(value) => onSave({ ...item, evolutionaryPressures: linesToArray(value) })} />
            <TextArea label="Mutation Summary" value={item.mutationSummary} onChange={(value) => onSave({ ...item, mutationSummary: value })} />
            <TextArea label="Divergence Summary" value={item.divergenceSummary} onChange={(value) => onSave({ ...item, divergenceSummary: value })} />
        </div>
    );
}

function EditorHeader({ title, status, onApprove }: { title: string; status: string; onApprove: () => void }) {
    return (
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
                <h2 className="text-lg font-bold tracking-widest text-gray-100 uppercase">{title}</h2>
                <p className="text-[10px] tracking-widest text-gray-500 uppercase">{status}</p>
            </div>
            <button
                type="button"
                onClick={onApprove}
                className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-[10px] font-bold tracking-widest text-green-300 transition-all hover:bg-green-500/20"
            >
                APPROVE
            </button>
        </div>
    );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    return (
        <label className="flex flex-col gap-2">
            <span className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">{label}</span>
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#0a0f14] px-3 py-2 text-sm text-gray-200"
            />
        </label>
    );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    return (
        <label className="flex flex-col gap-2">
            <span className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">{label}</span>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="min-h-[120px] rounded-xl border border-white/10 bg-[#0a0f14] p-4 text-sm text-gray-200"
            />
        </label>
    );
}
