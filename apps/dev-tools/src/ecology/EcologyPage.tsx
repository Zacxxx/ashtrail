import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Modal, TabBar } from "@ashtrail/ui";
import { HistoryGallery } from "../worldgeneration/HistoryGallery";
import { useGenerationHistory } from "../hooks/useGenerationHistory";
import { useActiveWorld } from "../hooks/useActiveWorld";
import { EcologyHierarchyList } from "./EcologyHierarchyList";
import { useEcologyData } from "./useEcologyData";
import { EcologyBulkGeneratorModal, type EcologyBulkGeneratorRequest } from "./EcologyBulkGeneratorModal";
import type {
    ActivityCycle,
    AssetImageRef,
    ClimateProfile,
    EcologyBaseline,
    EcologyStatus,
    FaunaArmorClass,
    FaunaEntry,
    FaunaLocomotion,
    FaunaNaturalWeapon,
    FaunaSizeClass,
    FaunaTemperament,
    FloraEntry,
    FloraSizeClass,
    BiomeEntry,
    ProvinceEcologyRecord,
    BiomeArchetype,
} from "./types";
import { BiomeArchetypeEditor } from "./BiomeArchetypeEditor";

type EcologyTab = "provinces" | "flora" | "fauna" | "climates" | "biomes" | "baselines";
const API_BASE = "http://127.0.0.1:8787";

function linesToArray(text: string) {
    return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

function arrayToLines(values: string[] | undefined) {
    return (values ?? []).join("\n");
}

const FLORA_CATEGORY_OPTIONS: FloraEntry["category"][] = ["tree", "shrub", "grass", "crop", "fungus", "aquatic", "alien_other"];
const FLORA_EDIBILITY_OPTIONS: FloraEntry["edibility"][] = ["none", "limited", "common"];
const FAUNA_CATEGORY_OPTIONS: FaunaEntry["category"][] = [
    "herbivore",
    "predator",
    "omnivore",
    "scavenger",
    "avian",
    "aquatic",
    "beast_of_burden",
    "companion",
    "alien_other",
];
const FLORA_SIZE_CLASS_OPTIONS: FloraSizeClass[] = ["tiny", "small", "medium", "large", "massive"];
const FAUNA_SIZE_CLASS_OPTIONS: FaunaSizeClass[] = ["tiny", "small", "medium", "large", "huge"];
const FAUNA_LOCOMOTION_OPTIONS: FaunaLocomotion[] = ["walker", "runner", "climber", "burrower", "swimmer", "flier", "slitherer", "amphibious"];
const FAUNA_WEAPON_OPTIONS: FaunaNaturalWeapon[] = ["none", "bite", "claw", "horn", "hoof", "tail", "beak", "venom", "constrict", "spines"];
const FAUNA_ARMOR_OPTIONS: FaunaArmorClass[] = ["soft", "furred", "scaled", "shelled", "plated", "rocky"];
const FAUNA_TEMPERAMENT_OPTIONS: FaunaTemperament[] = ["docile", "skittish", "territorial", "aggressive", "apex"];
const ACTIVITY_CYCLE_OPTIONS: ActivityCycle[] = ["diurnal", "nocturnal", "crepuscular", "any"];
const EARTH_ANALOG_SUGGESTIONS = [
    "bear",
    "boar",
    "camel",
    "catfish",
    "crocodile",
    "deer",
    "eagle",
    "goat",
    "horse",
    "horseshoe crab",
    "ibis",
    "monitor lizard",
    "ox",
    "salmon",
    "wolf",
];

export function EcologyPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get("tab");
    const initialTab: EcologyTab =
        requestedTab === "flora" || requestedTab === "fauna" || requestedTab === "climates" || requestedTab === "biomes" || requestedTab === "baselines"
            ? requestedTab
            : "provinces";
    const [activeTab, setActiveTab] = useState<EcologyTab>(initialTab);
    const [showGalleryModal, setShowGalleryModal] = useState(false);
    const [selectedProvinceId, setSelectedProvinceId] = useState<number | null>(null);
    const [selectedFloraId, setSelectedFloraId] = useState<string | null>(null);
    const [selectedFaunaId, setSelectedFaunaId] = useState<string | null>(null);
    const [selectedClimateId, setSelectedClimateId] = useState<string | null>(null);
    const [selectedBiomeId, setSelectedBiomeId] = useState<string | null>(null);
    const [selectedArchetypeId, setSelectedArchetypeId] = useState<string | null>(null);
    const [biomeSubTab, setBiomeSubTab] = useState<"instances" | "archetypes">("instances");
    const [floraGeneratorOpen, setFloraGeneratorOpen] = useState(false);
    const [faunaGeneratorOpen, setFaunaGeneratorOpen] = useState(false);
    const [bulkGenerationStage, setBulkGenerationStage] = useState("");
    const [bulkGenerationError, setBulkGenerationError] = useState<string | null>(null);
    const [bulkGenerationRunning, setBulkGenerationRunning] = useState(false);
    const [floraSearch, setFloraSearch] = useState("");
    const [faunaSearch, setFaunaSearch] = useState("");
    const [climateSearch, setClimateSearch] = useState("");
    const [biomeSearch, setBiomeSearch] = useState("");
    const [archetypeSearch, setArchetypeSearch] = useState("");
    const { history, deleteFromHistory, renameInHistory } = useGenerationHistory();
    const { activeWorldId, setActiveWorldId } = useActiveWorld();
    const selectedWorld = history.find((item) => item.id === activeWorldId) ?? null;
    const ecology = useEcologyData(activeWorldId);

    useEffect(() => {
        const tab = searchParams.get("tab");
        const requestedId = searchParams.get("id");
        if (tab === "flora") {
            setActiveTab("flora");
            if (requestedId) setSelectedFloraId(requestedId);
        } else if (tab === "fauna") {
            setActiveTab("fauna");
            if (requestedId) setSelectedFaunaId(requestedId);
        } else if (tab === "biomes") {
            setActiveTab("biomes");
            if (requestedId) setSelectedBiomeId(requestedId);
        } else if (tab === "climates") {
            setActiveTab("climates");
            if (requestedId) setSelectedClimateId(requestedId);
        }
    }, [searchParams]);

    useEffect(() => {
        if (!selectedProvinceId) {
            const firstProvince = ecology.regionsByType.provinces?.[0];
            if (firstProvince?.rawId !== undefined) {
                setSelectedProvinceId(firstProvince.rawId);
            }
        }
    }, [ecology.regionsByType.provinces, selectedProvinceId]);

    useEffect(() => {
        if (!selectedFloraId && ecology.bundle?.flora?.[0]) setSelectedFloraId(ecology.bundle.flora[0].id);
        if (!selectedFaunaId && ecology.bundle?.fauna?.[0]) setSelectedFaunaId(ecology.bundle.fauna[0].id);
        if (!selectedClimateId && ecology.bundle?.climates?.[0]) setSelectedClimateId(ecology.bundle.climates[0].id);
        if (!selectedBiomeId && ecology.bundle?.biomes?.[0]) setSelectedBiomeId(ecology.bundle.biomes[0].id);
        if (!selectedArchetypeId && ecology.bundle?.archetypes?.archetypes?.[0]) setSelectedArchetypeId(ecology.bundle.archetypes.archetypes[0].id);
    }, [ecology.bundle, selectedClimateId, selectedFaunaId, selectedFloraId, selectedBiomeId, selectedArchetypeId]);

    useEffect(() => {
        const next = new URLSearchParams(searchParams);
        next.set("tab", activeTab);
        if (activeTab === "flora" && selectedFloraId) next.set("id", selectedFloraId);
        else if (activeTab === "fauna" && selectedFaunaId) next.set("id", selectedFaunaId);
        else if (activeTab === "biomes" && selectedBiomeId) next.set("id", selectedBiomeId);
        else if (activeTab === "climates" && selectedClimateId) next.set("id", selectedClimateId);
        else next.delete("id");
        const current = searchParams.toString();
        const updated = next.toString();
        if (current !== updated) {
            setSearchParams(next, { replace: true });
        }
    }, [activeTab, searchParams, selectedBiomeId, selectedClimateId, selectedFaunaId, selectedFloraId, setSearchParams]);

    const selectedProvinceRegion = useMemo(
        () => ecology.regionsByType.provinces.find((entry) => entry.rawId === selectedProvinceId) ?? null,
        [ecology.regionsByType.provinces, selectedProvinceId],
    );
    const selectedProvinceRecord = useMemo(() => {
        if (!selectedProvinceRegion?.rawId) return null;
        return (
            ecology.bundle?.provinces?.find((entry) => entry.provinceId === selectedProvinceRegion.rawId) ?? {
                provinceId: selectedProvinceRegion.rawId,
                duchyId: selectedProvinceRegion.duchyId ?? 0,
                kingdomId: selectedProvinceRegion.kingdomId ?? 0,
                status: "missing" as EcologyStatus,
                sourceIsolatedImageUrl: "",
                description: "",
                climateProfileIds: [],
                floraIds: [],
                faunaIds: [],
                biomeArchetypeId: selectedProvinceRegion.biomePrimaryId ?? undefined,
                ecologicalPotential: 0,
                agriculturePotential: 0,
                consistencyNotes: [],
            }
        );
    }, [ecology.bundle?.provinces, selectedProvinceRegion]);

    const selectedFlora = ecology.bundle?.flora?.find((entry) => entry.id === selectedFloraId) ?? null;
    const selectedFauna = ecology.bundle?.fauna?.find((entry) => entry.id === selectedFaunaId) ?? null;
    const selectedClimate = ecology.bundle?.climates?.find((entry) => entry.id === selectedClimateId) ?? null;
    const selectedBiome = ecology.bundle?.biomes?.find((entry) => entry.id === selectedBiomeId) ?? null;
    const selectedArchetype = ecology.bundle?.archetypes?.archetypes?.find((a) => a.id === selectedArchetypeId) ?? null;

    const filteredFlora = (ecology.bundle?.flora ?? []).filter((entry) =>
        entry.name.toLowerCase().includes(floraSearch.toLowerCase()),
    );
    const filteredFauna = (ecology.bundle?.fauna ?? []).filter((entry) =>
        entry.name.toLowerCase().includes(faunaSearch.toLowerCase()),
    );
    const filteredClimates = (ecology.bundle?.climates ?? []).filter((entry) =>
        entry.name.toLowerCase().includes(climateSearch.toLowerCase()),
    );
    const filteredBiomes = (ecology.bundle?.biomes ?? []).filter((entry) =>
        entry.name.toLowerCase().includes(biomeSearch.toLowerCase()),
    );
    const filteredArchetypes = (ecology.bundle?.archetypes?.archetypes ?? []).filter((a) =>
        a.name.toLowerCase().includes(archetypeSearch.toLowerCase()) || a.id.toLowerCase().includes(archetypeSearch.toLowerCase()),
    );
    const baselineCards = useMemo(() => {
        const worldBaseline = {
            baseline:
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
                },
            displayName: "World",
        };

        const kingdomCards = ecology.regionsByType.kingdoms.map((region) => {
            return {
                baseline:
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
                    },
                displayName: region.name,
            };
        });

        const duchyCards = ecology.regionsByType.duchies.map((region) => {
            return {
                baseline:
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
                    },
                displayName: region.name,
            };
        });

        return [worldBaseline, ...kingdomCards, ...duchyCards];
    }, [ecology.bundle?.baselines, ecology.regionsByType.duchies, ecology.regionsByType.kingdoms]);

    const renderBaselineTitle = (scope: "world" | "kingdom" | "duchy", entityId: string | number, displayName: string) => {
        if (scope === "world") {
            return "world";
        }
        return `${scope} • ${String(entityId)} • ${displayName}`;
    };

    const updateProvinceField = async <K extends keyof ProvinceEcologyRecord>(key: K, value: ProvinceEcologyRecord[K]) => {
        if (!selectedProvinceRecord) return;
        await ecology.updateProvince({ ...selectedProvinceRecord, [key]: value });
    };

    const resetBulkGenerationFeedback = () => {
        setBulkGenerationStage("");
        setBulkGenerationError(null);
    };

    const generateFloraIllustrations = async (entries: FloraEntry[], stylePrompt: string) => {
        const biomeNames = new Map((ecology.bundle?.biomes ?? []).map((entry) => [entry.id, entry.name]));
        const prompts = entries.map((entry) => {
            const biomeLabel = entry.biomeIds.map((id) => biomeNames.get(id) ?? id).join(", ");
            return [
                entry.name,
                entry.category,
                entry.description,
                biomeLabel ? `biomes: ${biomeLabel}` : "",
            ]
                .filter(Boolean)
                .join(", ");
        });
        const response = await fetch(`${API_BASE}/api/textures/generate-batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompts,
                stylePrompt,
                temperature: 0.5,
                category: "ecology_illustrations",
                subCategory: "flora",
                batchName: `${selectedWorld?.name || activeWorldId}-flora-illustrations-${Date.now()}`,
            }),
        });
        if (!response.ok) {
            throw new Error((await response.text()) || "Failed to generate flora illustrations.");
        }
        const manifest = await response.json();
        const filenamesById = Object.fromEntries(
            entries.map((entry, index) => [entry.id, manifest.textures?.[index]?.filename]).filter((pair): pair is [string, string] => Boolean(pair[1])),
        );
        await ecology.attachFloraIllustrationBatch(entries.map((entry) => entry.id), manifest.batchId, filenamesById);
    };

    const generateFaunaIllustrations = async (entries: FaunaEntry[], stylePrompt: string) => {
        const biomeNames = new Map((ecology.bundle?.biomes ?? []).map((entry) => [entry.id, entry.name]));
        const prompts = entries.map((entry) => {
            const biomeLabel = entry.biomeIds.map((id) => biomeNames.get(id) ?? id).join(", ");
            return [
                entry.name,
                entry.category,
                entry.description,
                entry.earthAnalog ? `earth analog: ${entry.earthAnalog}` : "",
                biomeLabel ? `biomes: ${biomeLabel}` : "",
            ]
                .filter(Boolean)
                .join(", ");
        });
        const response = await fetch(`${API_BASE}/api/textures/generate-batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompts,
                stylePrompt,
                temperature: 0.5,
                category: "ecology_illustrations",
                subCategory: "fauna",
                batchName: `${selectedWorld?.name || activeWorldId}-fauna-illustrations-${Date.now()}`,
            }),
        });
        if (!response.ok) {
            throw new Error((await response.text()) || "Failed to generate fauna illustrations.");
        }
        const manifest = await response.json();
        const filenamesById = Object.fromEntries(
            entries.map((entry, index) => [entry.id, manifest.textures?.[index]?.filename]).filter((pair): pair is [string, string] => Boolean(pair[1])),
        );
        await ecology.attachFaunaIllustrationBatch(entries.map((entry) => entry.id), manifest.batchId, filenamesById);
    };

    const handleGenerateBulkFlora = async (request: EcologyBulkGeneratorRequest) => {
        if (!activeWorldId) return;
        setBulkGenerationRunning(true);
        setBulkGenerationError(null);
        try {
            setBulkGenerationStage("Generating flora entries");
            const entries = await ecology.generateFloraBatch(request);
            if (request.includeIllustrations && entries.length > 0) {
                setBulkGenerationStage("Generating flora illustrations");
                await generateFloraIllustrations(entries, request.illustrationStylePrompt);
            }
            setSelectedFloraId(entries[0]?.id ?? null);
            setFloraGeneratorOpen(false);
            setBulkGenerationStage(entries.length > 0 ? `Created ${entries.length} flora entries` : "");
        } catch (err) {
            setBulkGenerationError(err instanceof Error ? err.message : "Failed to generate flora batch.");
        } finally {
            setBulkGenerationRunning(false);
        }
    };

    const handleGenerateBulkFauna = async (request: EcologyBulkGeneratorRequest) => {
        if (!activeWorldId) return;
        setBulkGenerationRunning(true);
        setBulkGenerationError(null);
        try {
            setBulkGenerationStage("Generating fauna entries");
            const entries = await ecology.generateFaunaBatch(request);
            if (request.includeIllustrations && entries.length > 0) {
                setBulkGenerationStage("Generating fauna illustrations");
                await generateFaunaIllustrations(entries, request.illustrationStylePrompt);
            }
            setSelectedFaunaId(entries[0]?.id ?? null);
            setFaunaGeneratorOpen(false);
            setBulkGenerationStage(entries.length > 0 ? `Created ${entries.length} fauna entries` : "");
        } catch (err) {
            setBulkGenerationError(err instanceof Error ? err.message : "Failed to generate fauna batch.");
        } finally {
            setBulkGenerationRunning(false);
        }
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
        <div className="h-screen overflow-hidden bg-[#070b12] text-gray-300 font-sans pt-28 flex flex-col">
            {/* ══ Tool-Specific Sub-Header ══ */}
            <header className="fixed top-16 left-0 right-0 z-50 bg-[#070b12]/80 backdrop-blur-md border-b border-white/5 h-12 flex items-center justify-between px-6 shadow-xl">
                <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-[#0a0f14] font-bold text-[10px]">🌿</div>
                    <h1 className="text-xs font-bold tracking-[0.2em] text-gray-100 uppercase">ECOLOGY ARCHIVE</h1>
                </div>

                <div className="h-8 flex-1 max-w-xl scale-90">
                    <TabBar
                        tabs={["provinces", "flora", "fauna", "climates", "biomes", "baselines"]}
                        activeTab={activeTab}
                        onTabChange={(tab) => setActiveTab(tab as EcologyTab)}
                    />
                </div>
            </header>

            <div className="mb-4 rounded-xl border border-white/10 bg-[#121820]/95 p-3 text-[11px] text-gray-400 flex items-center justify-between gap-4">
                <div>
                    <span className="font-bold tracking-widest text-emerald-300 uppercase mr-3">Ecology Job</span>
                    {ecology.jobState.jobId ? `${ecology.jobState.status.toUpperCase()} • ${ecology.jobState.stage}` : "Idle"}
                    {ecology.jobState.error && (
                        <p className="mt-1 text-[10px] text-red-400 font-mono">{ecology.jobState.error}</p>
                    )}
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
                    actions={
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void ecology.refreshDerivedStats()}
                                className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[10px] font-bold tracking-widest text-sky-300 transition-all hover:bg-sky-500/20"
                            >
                                REFRESH STATS
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    resetBulkGenerationFeedback();
                                    setFloraGeneratorOpen(true);
                                }}
                                className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[10px] font-bold tracking-widest text-indigo-300 transition-all hover:bg-indigo-500/20"
                            >
                                GENERATE BATCH
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    const id = await ecology.createFlora();
                                    if (id) setSelectedFloraId(id);
                                }}
                                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-bold tracking-widest text-emerald-300 transition-all hover:bg-emerald-500/20"
                            >
                                NEW FLORA
                            </button>
                        </div>
                    }
                    search={floraSearch}
                    setSearch={setFloraSearch}
                    items={filteredFlora}
                    selectedId={selectedFloraId}
                    setSelectedId={setSelectedFloraId}
                    renderLabel={(item) => `${item.name} • ${item.category}`}
                    editor={selectedFlora && (
                        <FloraEditor
                            item={selectedFlora}
                            biomes={ecology.bundle?.biomes ?? []}
                            climates={ecology.bundle?.climates ?? []}
                            worldId={activeWorldId}
                            onSave={(entry) => void ecology.updateFlora(entry)}
                            onApprove={() => void ecology.approveEntryById("flora", selectedFlora.id)}
                        />
                    )}
                    onDeleteItem={async (item) => {
                        await ecology.deleteFlora(item.id);
                        const remaining = filteredFlora.filter((entry) => entry.id !== item.id);
                        setSelectedFloraId(remaining[0]?.id ?? null);
                    }}
                />
            )}

            {activeTab === "fauna" && (
                <LibraryTab
                    title="Fauna Library"
                    actions={
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void ecology.refreshDerivedStats()}
                                className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[10px] font-bold tracking-widest text-sky-300 transition-all hover:bg-sky-500/20"
                            >
                                REFRESH STATS
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    resetBulkGenerationFeedback();
                                    setFaunaGeneratorOpen(true);
                                }}
                                className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[10px] font-bold tracking-widest text-indigo-300 transition-all hover:bg-indigo-500/20"
                            >
                                GENERATE BATCH
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    const id = await ecology.createFauna();
                                    if (id) setSelectedFaunaId(id);
                                }}
                                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] font-bold tracking-widest text-amber-300 transition-all hover:bg-amber-500/20"
                            >
                                NEW FAUNA
                            </button>
                        </div>
                    }
                    search={faunaSearch}
                    setSearch={setFaunaSearch}
                    items={filteredFauna}
                    selectedId={selectedFaunaId}
                    setSelectedId={setSelectedFaunaId}
                    renderLabel={(item) => `${item.name} • ${item.category}`}
                    editor={selectedFauna && (
                        <FaunaEditor
                            item={selectedFauna}
                            biomes={ecology.bundle?.biomes ?? []}
                            climates={ecology.bundle?.climates ?? []}
                            faunaEntries={ecology.bundle?.fauna ?? []}
                            worldId={activeWorldId}
                            onSave={(entry) => void ecology.updateFauna(entry)}
                            onApprove={() => void ecology.approveEntryById("fauna", selectedFauna.id)}
                        />
                    )}
                    onDeleteItem={async (item) => {
                        await ecology.deleteFauna(item.id);
                        const remaining = filteredFauna.filter((entry) => entry.id !== item.id);
                        setSelectedFaunaId(remaining[0]?.id ?? null);
                    }}
                />
            )}

            {activeTab === "climates" && (
                <LibraryTab
                    title="Climate Library"
                    actions={
                        <button
                            type="button"
                            onClick={async () => {
                                const id = await ecology.createClimate();
                                if (id) setSelectedClimateId(id);
                            }}
                            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[10px] font-bold tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20"
                        >
                            NEW CLIMATE
                        </button>
                    }
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

            {activeTab === "biomes" && (
                <div className="flex-1 min-h-0 flex flex-col gap-4">
                    <div className="flex gap-2 border-b border-white/5 pb-2 items-center justify-between">
                        <div className="flex gap-2">
                            <button
                                onClick={() => setBiomeSubTab("instances")}
                                className={`px-4 py-1 text-[10px] font-bold tracking-widest uppercase transition-all rounded-full ${biomeSubTab === "instances" ? "bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/30" : "text-gray-500 hover:text-gray-300"}`}
                            >
                                Planet Biome Coverage
                            </button>
                            <button
                                onClick={() => setBiomeSubTab("archetypes")}
                                className={`px-4 py-1 text-[10px] font-bold tracking-widest uppercase transition-all rounded-full ${biomeSubTab === "archetypes" ? "bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/30" : "text-gray-500 hover:text-gray-300"}`}
                            >
                                Archetype Registry
                            </button>
                        </div>
                        {biomeSubTab === "instances" && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        if (window.confirm("Are you sure you want to SYNC biomes from the world map? This will re-add biomes defined in worldgen and associate them with provinces.")) {
                                            void ecology.syncBiomesWithMap();
                                        }
                                    }}
                                    className="px-4 py-1 text-[10px] font-bold tracking-widest uppercase transition-all rounded-full text-cyan-500/70 hover:text-cyan-400 hover:bg-cyan-500/10 border border-cyan-500/20"
                                >
                                    Sync From World Map
                                </button>
                                <button
                                    onClick={() => {
                                        if (window.confirm("Are you sure you want to clear ALL biome coverage entries? This will also remove biome assignments from all flora and fauna.")) {
                                            void ecology.clearBiomes();
                                        }
                                    }}
                                    className="px-4 py-1 text-[10px] font-bold tracking-widest uppercase transition-all rounded-full text-red-500/70 hover:text-red-400 hover:bg-red-500/10 border border-red-500/20"
                                >
                                    Clear All Biomes
                                </button>
                            </div>
                        )}
                    </div>

                    {biomeSubTab === "instances" ? (
                        <LibraryTab
                            title="Planet Biome Coverage"
                            search={biomeSearch}
                            setSearch={setBiomeSearch}
                            items={filteredBiomes}
                            selectedId={selectedBiomeId}
                            setSelectedId={setSelectedBiomeId}
                            renderLabel={(item) =>
                                `${item.name} • ${(item.pixelShare * 100).toFixed(1)}% • conf ${(item.avgConfidence * 100).toFixed(0)}%`
                            }
                            editor={selectedBiome && (
                                <BiomeEditor
                                    item={selectedBiome}
                                    flora={ecology.bundle?.flora ?? []}
                                    fauna={ecology.bundle?.fauna ?? []}
                                    worldId={activeWorldId}
                                    onSave={(entry) => void ecology.updateBiome(entry)}
                                    onOpenFlora={(id) => {
                                        setActiveTab("flora");
                                        setSelectedFloraId(id);
                                    }}
                                    onOpenFauna={(id) => {
                                        setActiveTab("fauna");
                                        setSelectedFaunaId(id);
                                    }}
                                    onApprove={() => void ecology.approveEntryById("biomes", selectedBiome.id)}
                                    onGenerate={() => void ecology.generateBiomeDescription(selectedBiome.id)}
                                    isGenerating={ecology.jobState.status === "running" || ecology.jobState.status === "queued"}
                                />
                            )}
                        />
                    ) : (
                        <LibraryTab
                            title="Biome Archetypes"
                            search={archetypeSearch}
                            setSearch={setArchetypeSearch}
                            items={filteredArchetypes}
                            selectedId={selectedArchetypeId}
                            setSelectedId={setSelectedArchetypeId}
                            renderLabel={(item) => item.name}
                            editor={selectedArchetype && (
                                <BiomeArchetypeEditor
                                    archetype={selectedArchetype}
                                    usage={ecology.bundle?.biomes?.find((entry) => entry.archetypeId === selectedArchetype.id) ?? null}
                                    onSave={(a) => void ecology.updateArchetype(a)}
                                    onDelete={(id) => void ecology.deleteArchetype(id)}
                                />
                            )}
                        />
                    )}
                </div>
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
                        {baselineCards.map(({ baseline, displayName }) => (
                            <div key={`${baseline.scope}-${baseline.entityId}`} className="rounded-xl border border-white/10 bg-black/20 p-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm font-bold tracking-widest text-gray-100 uppercase">
                                            {renderBaselineTitle(baseline.scope, baseline.entityId, displayName)}
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
                                            onClick={() => void ecology.generateKingdomBaseline(baseline.entityId as number)}
                                            disabled={ecology.baselineLookup.get("world:world")?.status !== "approved"}
                                            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-bold tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20 disabled:opacity-40"
                                        >
                                            GENERATE
                                        </button>
                                    )}
                                    {baseline.scope === "duchy" && typeof baseline.entityId === "number" && (
                                        <button
                                            type="button"
                                            onClick={() => void ecology.generateDuchyBaseline(baseline.entityId as number)}
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

            <EcologyBulkGeneratorModal
                open={floraGeneratorOpen}
                kind="flora"
                biomes={ecology.bundle?.biomes ?? []}
                climates={ecology.bundle?.climates ?? []}
                isGenerating={bulkGenerationRunning}
                stage={floraGeneratorOpen ? bulkGenerationStage : ""}
                error={floraGeneratorOpen ? bulkGenerationError : null}
                onClose={() => {
                    setFloraGeneratorOpen(false);
                    resetBulkGenerationFeedback();
                }}
                onGenerate={handleGenerateBulkFlora}
            />

            <EcologyBulkGeneratorModal
                open={faunaGeneratorOpen}
                kind="fauna"
                biomes={ecology.bundle?.biomes ?? []}
                climates={ecology.bundle?.climates ?? []}
                isGenerating={bulkGenerationRunning}
                stage={faunaGeneratorOpen ? bulkGenerationStage : ""}
                error={faunaGeneratorOpen ? bulkGenerationError : null}
                onClose={() => {
                    setFaunaGeneratorOpen(false);
                    resetBulkGenerationFeedback();
                }}
                onGenerate={handleGenerateBulkFauna}
            />

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
    actions,
    search,
    setSearch,
    items,
    selectedId,
    setSelectedId,
    renderLabel,
    onDeleteItem,
    editor,
}: {
    title: string;
    actions?: ReactNode;
    search: string;
    setSearch: (value: string) => void;
    items: T[];
    selectedId: string | null;
    setSelectedId: (value: string) => void;
    renderLabel: (item: T) => string;
    onDeleteItem?: (item: T) => void;
    editor: ReactNode;
}) {
    return (
        <div className="flex-1 min-h-0 grid grid-cols-[380px_minmax(0,1fr)] gap-4">
            <div className="overflow-y-auto rounded-2xl border border-white/10 bg-[#121820]/95 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-sm font-bold tracking-widest text-gray-100 uppercase">{title}</h2>
                    {actions}
                </div>
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search..."
                    className="mb-3 w-full rounded-lg border border-white/10 bg-[#0a0f14] px-3 py-2 text-sm text-gray-200"
                />
                <div className="space-y-2">
                    {items.map((item) => (
                        <div
                            key={item.id}
                            className={`w-full rounded-lg border p-3 transition-all ${selectedId === item.id
                                ? "border-cyan-500/40 bg-cyan-500/10"
                                : "border-white/10 bg-black/20 hover:border-white/20"
                                }`}
                        >
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSelectedId(item.id)}
                                    className="min-w-0 flex-1 text-left"
                                >
                                    <p className="truncate text-sm font-bold text-gray-100">{renderLabel(item)}</p>
                                </button>
                                {onDeleteItem && (
                                    <button
                                        type="button"
                                        onClick={() => onDeleteItem(item)}
                                        className="shrink-0 rounded-md border border-red-500/20 bg-red-500/10 px-2 py-1 text-[9px] font-bold tracking-widest text-red-300 transition-all hover:bg-red-500/20"
                                    >
                                        DELETE
                                    </button>
                                )}
                            </div>
                        </div>
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
    biomes,
    climates,
    worldId,
    onSave,
    onApprove,
}: {
    item: FloraEntry;
    biomes: BiomeEntry[];
    climates: ClimateProfile[];
    worldId: string | null;
    onSave: (entry: FloraEntry) => void;
    onApprove: () => void;
}) {
    const previewBatchIds = item.illustrationAssetBatchIds.length > 0
        ? item.illustrationAssetBatchIds
        : item.vegetationAssetBatchIds;
    const saveManual = (next: FloraEntry) => onSave({ ...next, statsSource: "manual", statsVersion: next.statsVersion || "v1" });

    return (
        <div className="space-y-6">
            <EditorHeader title={item.name} status={item.status} onApprove={onApprove} />
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-4 min-w-0">
                    <EditorSection title="Identity">
                        <div className="grid gap-4 md:grid-cols-2">
                            <TextInput label="Name" value={item.name} onChange={(value) => onSave({ ...item, name: value })} />
                            <SelectInput
                                label="Category"
                                value={item.category}
                                options={FLORA_CATEGORY_OPTIONS}
                                onChange={(value) => onSave({ ...item, category: value as FloraEntry["category"] })}
                            />
                        </div>
                        <TextArea label="Description" value={item.description} onChange={(value) => onSave({ ...item, description: value })} />
                    </EditorSection>

                    <EditorSection title="Ecology Profile">
                        <div className="grid gap-4 md:grid-cols-2">
                            <TextArea label="Ecological Roles" value={arrayToLines(item.ecologicalRoles)} onChange={(value) => onSave({ ...item, ecologicalRoles: linesToArray(value) })} />
                            <TextArea label="Adaptations" value={arrayToLines(item.adaptations)} onChange={(value) => onSave({ ...item, adaptations: linesToArray(value) })} />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <SelectInput
                                label="Edibility"
                                value={item.edibility}
                                options={FLORA_EDIBILITY_OPTIONS}
                                onChange={(value) => onSave({ ...item, edibility: value as FloraEntry["edibility"] })}
                            />
                            <RangeInput
                                label="Agriculture Value"
                                value={item.agricultureValue}
                                min={0}
                                max={100}
                                onChange={(value) => onSave({ ...item, agricultureValue: value })}
                            />
                        </div>
                        <ClimateSelector
                            title="Climate Profiles"
                            climates={climates}
                            selectedIds={item.climateProfileIds}
                            onToggle={(climateId) => onSave({ ...item, climateProfileIds: toggleString(item.climateProfileIds, climateId) })}
                        />
                        <BiomeSelector
                            title="Biome Attribution"
                            biomes={biomes}
                            selectedIds={item.biomeIds}
                            onToggle={(biomeId) => onSave({ ...item, biomeIds: toggleString(item.biomeIds, biomeId) })}
                        />
                    </EditorSection>

                    <EditorSection title="Body Profile">
                        <div className="grid gap-4 md:grid-cols-2">
                            <SelectInput
                                label="Size Class"
                                value={item.bodyProfile.sizeClass}
                                options={FLORA_SIZE_CLASS_OPTIONS}
                                onChange={(value) => saveManual({ ...item, bodyProfile: { ...item.bodyProfile, sizeClass: value as FloraEntry["bodyProfile"]["sizeClass"] } })}
                            />
                            <RangeInput
                                label="Growth Rate"
                                value={item.bodyProfile.growthRate}
                                min={0}
                                max={100}
                                onChange={(value) => saveManual({ ...item, bodyProfile: { ...item.bodyProfile, growthRate: value } })}
                            />
                        </div>
                        <div className="grid gap-4 md:grid-cols-3">
                            <NumberInput label="Height (m)" value={item.bodyProfile.heightMeters} step={0.1} min={0} onChange={(value) => saveManual({ ...item, bodyProfile: { ...item.bodyProfile, heightMeters: value } })} />
                            <NumberInput label="Spread (m)" value={item.bodyProfile.spreadMeters} step={0.1} min={0} onChange={(value) => saveManual({ ...item, bodyProfile: { ...item.bodyProfile, spreadMeters: value } })} />
                            <NumberInput label="Root Depth (m)" value={item.bodyProfile.rootDepthMeters} step={0.1} min={0} onChange={(value) => saveManual({ ...item, bodyProfile: { ...item.bodyProfile, rootDepthMeters: value } })} />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <NumberInput label="Biomass (kg)" value={item.bodyProfile.biomassKg} step={1} min={0} onChange={(value) => saveManual({ ...item, bodyProfile: { ...item.bodyProfile, biomassKg: value } })} />
                            <NumberInput label="Lifespan (years)" value={item.bodyProfile.lifespanYears} step={1} min={0} onChange={(value) => saveManual({ ...item, bodyProfile: { ...item.bodyProfile, lifespanYears: value } })} />
                        </div>
                    </EditorSection>

                    <EditorSection title="Resource Profile">
                        <div className="grid gap-4 md:grid-cols-2">
                            <RangeInput label="Rarity" value={item.resourceProfile.rarity} min={0} max={100} onChange={(value) => saveManual({ ...item, resourceProfile: { ...item.resourceProfile, rarity: value } })} />
                            <RangeInput label="Harvest Difficulty" value={item.resourceProfile.harvestDifficulty} min={0} max={100} onChange={(value) => saveManual({ ...item, resourceProfile: { ...item.resourceProfile, harvestDifficulty: value } })} />
                            <RangeInput label="Yield / Harvest" value={item.resourceProfile.yieldPerHarvest} min={0} max={100} onChange={(value) => saveManual({ ...item, resourceProfile: { ...item.resourceProfile, yieldPerHarvest: value } })} />
                            <NumberInput label="Regrowth (days)" value={item.resourceProfile.regrowthDays} step={1} min={1} onChange={(value) => saveManual({ ...item, resourceProfile: { ...item.resourceProfile, regrowthDays: value } })} />
                            <RangeInput label="Nutrition" value={item.resourceProfile.nutritionValue} min={0} max={100} onChange={(value) => saveManual({ ...item, resourceProfile: { ...item.resourceProfile, nutritionValue: value } })} />
                            <RangeInput label="Medicinal" value={item.resourceProfile.medicinalValue} min={0} max={100} onChange={(value) => saveManual({ ...item, resourceProfile: { ...item.resourceProfile, medicinalValue: value } })} />
                            <RangeInput label="Fuel" value={item.resourceProfile.fuelValue} min={0} max={100} onChange={(value) => saveManual({ ...item, resourceProfile: { ...item.resourceProfile, fuelValue: value } })} />
                            <RangeInput label="Structural" value={item.resourceProfile.structuralValue} min={0} max={100} onChange={(value) => saveManual({ ...item, resourceProfile: { ...item.resourceProfile, structuralValue: value } })} />
                            <RangeInput label="Concealment" value={item.resourceProfile.concealmentValue} min={0} max={100} onChange={(value) => saveManual({ ...item, resourceProfile: { ...item.resourceProfile, concealmentValue: value } })} />
                        </div>
                    </EditorSection>

                    <EditorSection title="Hazard Profile">
                        <div className="grid gap-4 md:grid-cols-2">
                            <RangeInput label="Toxicity" value={item.hazardProfile.toxicity} min={0} max={100} onChange={(value) => saveManual({ ...item, hazardProfile: { ...item.hazardProfile, toxicity: value } })} />
                            <RangeInput label="Irritation" value={item.hazardProfile.irritation} min={0} max={100} onChange={(value) => saveManual({ ...item, hazardProfile: { ...item.hazardProfile, irritation: value } })} />
                            <RangeInput label="Thorniness" value={item.hazardProfile.thorniness} min={0} max={100} onChange={(value) => saveManual({ ...item, hazardProfile: { ...item.hazardProfile, thorniness: value } })} />
                            <RangeInput label="Flammability" value={item.hazardProfile.flammability} min={0} max={100} onChange={(value) => saveManual({ ...item, hazardProfile: { ...item.hazardProfile, flammability: value } })} />
                            <RangeInput label="Resilience" value={item.hazardProfile.resilience} min={0} max={100} onChange={(value) => saveManual({ ...item, hazardProfile: { ...item.hazardProfile, resilience: value } })} />
                        </div>
                    </EditorSection>
                </div>

                <div className="space-y-4 xl:sticky xl:top-6 self-start">
                    <IllustrationPreviewCard
                        title="Associated Image"
                        batchIds={previewBatchIds}
                        assetRefs={item.illustrationAssets}
                        matchHint={item.name}
                        emptyLabel="Generate an ecology illustration or vegetation asset to see this flora in the archive."
                    />
                    <EditorSection title="Stat Provenance" accentClassName="text-sky-300">
                        <div className="grid gap-3 md:grid-cols-2">
                            <MetricCard label="Source" value={item.statsSource} />
                            <MetricCard label="Version" value={item.statsVersion || "v1"} />
                        </div>
                    </EditorSection>
                    <EditorSection title="Asset Links" accentClassName="text-emerald-300">
                        <div className="flex flex-wrap gap-2">
                            <Link
                                to={`/asset-generator?tab=game-assets&assetType=vegetation&targetKind=flora&targetId=${encodeURIComponent(item.id)}${worldId ? `&worldId=${encodeURIComponent(worldId)}` : ""}${item.biomeIds[0] ? `&biomeId=${encodeURIComponent(item.biomeIds[0])}` : ""}`}
                                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-bold tracking-widest text-emerald-300 transition-all hover:bg-emerald-500/20"
                            >
                                GENERATE VEGETATION ASSET
                            </Link>
                            <Link
                                to={`/asset-generator?tab=ecology-illustrations&subCategory=flora&targetKind=flora&targetId=${encodeURIComponent(item.id)}${worldId ? `&worldId=${encodeURIComponent(worldId)}` : ""}`}
                                className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[10px] font-bold tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20"
                            >
                                GENERATE ILLUSTRATION
                            </Link>
                        </div>
                        <AssetBatchChips label="Vegetation Batches" batchIds={item.vegetationAssetBatchIds} tab="game-assets" />
                        <AssetBatchChips label="Illustrations" batchIds={item.illustrationAssetBatchIds} tab="ecology-illustrations" />
                    </EditorSection>
                </div>
            </div>
        </div>
    );
}

function FaunaEditor({
    item,
    biomes,
    climates,
    faunaEntries,
    worldId,
    onSave,
    onApprove,
}: {
    item: FaunaEntry;
    biomes: BiomeEntry[];
    climates: ClimateProfile[];
    faunaEntries: FaunaEntry[];
    worldId: string | null;
    onSave: (entry: FaunaEntry) => void;
    onApprove: () => void;
}) {
    const earthAnalogSuggestions = Array.from(
        new Set([...EARTH_ANALOG_SUGGESTIONS, ...faunaEntries.map((entry) => entry.earthAnalog).filter(Boolean)]),
    ).sort((a, b) => a.localeCompare(b));
    const ancestralStockSuggestions = Array.from(
        new Set(
            faunaEntries
                .flatMap((entry) => [entry.name, entry.familyName, entry.ancestralStock])
                .filter((value): value is string => Boolean(value && value.trim())),
        ),
    ).sort((a, b) => a.localeCompare(b));
    const saveManual = (next: FaunaEntry) => onSave({ ...next, statsSource: "manual", statsVersion: next.statsVersion || "v1" });

    return (
        <div className="space-y-6">
            <EditorHeader title={item.name} status={item.status} onApprove={onApprove} />
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="space-y-4 min-w-0">
                    <EditorSection title="Identity">
                        <div className="grid gap-4 md:grid-cols-2">
                            <TextInput label="Name" value={item.name} onChange={(value) => onSave({ ...item, name: value })} />
                            <SelectInput
                                label="Category"
                                value={item.category}
                                options={FAUNA_CATEGORY_OPTIONS}
                                onChange={(value) => onSave({ ...item, category: value as FaunaEntry["category"] })}
                            />
                        </div>
                        <TextArea label="Description" value={item.description} onChange={(value) => onSave({ ...item, description: value })} />
                    </EditorSection>

                    <EditorSection title="Behavior And Ecology">
                        <div className="grid gap-4 md:grid-cols-2">
                            <TextArea label="Ecological Roles" value={arrayToLines(item.ecologicalRoles)} onChange={(value) => onSave({ ...item, ecologicalRoles: linesToArray(value) })} />
                            <TextArea label="Adaptations" value={arrayToLines(item.adaptations)} onChange={(value) => onSave({ ...item, adaptations: linesToArray(value) })} />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <RangeInput
                                label="Domestication Potential"
                                value={item.domesticationPotential}
                                min={0}
                                max={100}
                                onChange={(value) => onSave({ ...item, domesticationPotential: value })}
                            />
                            <RangeInput
                                label="Danger Level"
                                value={item.dangerLevel}
                                min={0}
                                max={100}
                                onChange={(value) => onSave({ ...item, dangerLevel: value })}
                            />
                        </div>
                        <ClimateSelector
                            title="Climate Profiles"
                            climates={climates}
                            selectedIds={item.climateProfileIds}
                            onToggle={(climateId) => onSave({ ...item, climateProfileIds: toggleString(item.climateProfileIds, climateId) })}
                        />
                        <BiomeSelector
                            title="Biome Attribution"
                            biomes={biomes}
                            selectedIds={item.biomeIds}
                            onToggle={(biomeId) => onSave({ ...item, biomeIds: toggleString(item.biomeIds, biomeId) })}
                        />
                    </EditorSection>

                    <EditorSection title="Lineage And Divergence">
                        <div className="grid gap-4 md:grid-cols-2">
                            <SuggestInput
                                label="Earth Analog"
                                value={item.earthAnalog}
                                suggestions={earthAnalogSuggestions}
                                listId={`earth-analog-${item.id}`}
                                onChange={(value) => onSave({ ...item, earthAnalog: value })}
                            />
                            <SuggestInput
                                label="Ancestral Stock"
                                value={item.ancestralStock}
                                suggestions={ancestralStockSuggestions}
                                listId={`ancestral-stock-${item.id}`}
                                onChange={(value) => onSave({ ...item, ancestralStock: value })}
                            />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <TextInput label="Family ID" value={item.familyId ?? ""} onChange={(value) => onSave({ ...item, familyId: value || undefined })} />
                            <TextInput label="Family Name" value={item.familyName ?? ""} onChange={(value) => onSave({ ...item, familyName: value || undefined })} />
                        </div>
                        <TextArea label="Evolutionary Pressures" value={arrayToLines(item.evolutionaryPressures)} onChange={(value) => onSave({ ...item, evolutionaryPressures: linesToArray(value) })} />
                        <div className="grid gap-4 md:grid-cols-2">
                            <TextArea label="Mutation Summary" value={item.mutationSummary} onChange={(value) => onSave({ ...item, mutationSummary: value })} />
                            <TextArea label="Divergence Summary" value={item.divergenceSummary} onChange={(value) => onSave({ ...item, divergenceSummary: value })} />
                        </div>
                    </EditorSection>

                    <EditorSection title="Combat Stats">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            <NumberInput label="Level" value={item.combatProfile.level} step={1} min={1} onChange={(value) => saveManual({ ...item, combatProfile: { ...item.combatProfile, level: value } })} />
                            <NumberInput label="Strength" value={item.combatProfile.strength} step={1} min={1} max={20} onChange={(value) => saveManual({ ...item, combatProfile: { ...item.combatProfile, strength: value } })} />
                            <NumberInput label="Agility" value={item.combatProfile.agility} step={1} min={1} max={20} onChange={(value) => saveManual({ ...item, combatProfile: { ...item.combatProfile, agility: value } })} />
                            <NumberInput label="Intelligence" value={item.combatProfile.intelligence} step={1} min={1} max={20} onChange={(value) => saveManual({ ...item, combatProfile: { ...item.combatProfile, intelligence: value } })} />
                            <NumberInput label="Wisdom" value={item.combatProfile.wisdom} step={1} min={1} max={20} onChange={(value) => saveManual({ ...item, combatProfile: { ...item.combatProfile, wisdom: value } })} />
                            <NumberInput label="Endurance" value={item.combatProfile.endurance} step={1} min={1} max={20} onChange={(value) => saveManual({ ...item, combatProfile: { ...item.combatProfile, endurance: value } })} />
                            <NumberInput label="Charisma" value={item.combatProfile.charisma} step={1} min={1} max={20} onChange={(value) => saveManual({ ...item, combatProfile: { ...item.combatProfile, charisma: value } })} />
                            <NumberInput label="Base Evasion" value={item.combatProfile.baseEvasion} step={1} min={0} max={40} onChange={(value) => saveManual({ ...item, combatProfile: { ...item.combatProfile, baseEvasion: value } })} />
                            <NumberInput label="Base Defense" value={item.combatProfile.baseDefense} step={1} min={0} max={20} onChange={(value) => saveManual({ ...item, combatProfile: { ...item.combatProfile, baseDefense: value } })} />
                            <NumberInput label="HP Bonus" value={item.combatProfile.baseHpBonus} step={1} min={0} max={32} onChange={(value) => saveManual({ ...item, combatProfile: { ...item.combatProfile, baseHpBonus: value } })} />
                            <NumberInput label="AP Bonus" value={item.combatProfile.baseApBonus} step={1} min={0} max={4} onChange={(value) => saveManual({ ...item, combatProfile: { ...item.combatProfile, baseApBonus: value } })} />
                            <NumberInput label="MP Bonus" value={item.combatProfile.baseMpBonus} step={1} min={0} max={4} onChange={(value) => saveManual({ ...item, combatProfile: { ...item.combatProfile, baseMpBonus: value } })} />
                        </div>
                        <div className="grid gap-4 md:grid-cols-3">
                            <NumberInput label="Crit Chance" value={item.combatProfile.critChance} step={0.01} min={0} max={0.35} onChange={(value) => saveManual({ ...item, combatProfile: { ...item.combatProfile, critChance: value } })} />
                            <NumberInput label="Resistance" value={item.combatProfile.resistance} step={0.01} min={0} max={0.5} onChange={(value) => saveManual({ ...item, combatProfile: { ...item.combatProfile, resistance: value } })} />
                            <NumberInput label="Social Bonus" value={item.combatProfile.socialBonus} step={0.01} min={-0.25} max={0.35} onChange={(value) => saveManual({ ...item, combatProfile: { ...item.combatProfile, socialBonus: value } })} />
                        </div>
                    </EditorSection>

                    <EditorSection title="Body Profile">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            <SelectInput label="Size Class" value={item.bodyProfile.sizeClass} options={FAUNA_SIZE_CLASS_OPTIONS} onChange={(value) => saveManual({ ...item, bodyProfile: { ...item.bodyProfile, sizeClass: value as FaunaEntry["bodyProfile"]["sizeClass"] } })} />
                            <SelectInput label="Locomotion" value={item.bodyProfile.locomotion} options={FAUNA_LOCOMOTION_OPTIONS} onChange={(value) => saveManual({ ...item, bodyProfile: { ...item.bodyProfile, locomotion: value as FaunaEntry["bodyProfile"]["locomotion"] } })} />
                            <SelectInput label="Natural Weapon" value={item.bodyProfile.naturalWeapon} options={FAUNA_WEAPON_OPTIONS} onChange={(value) => saveManual({ ...item, bodyProfile: { ...item.bodyProfile, naturalWeapon: value as FaunaEntry["bodyProfile"]["naturalWeapon"] } })} />
                            <SelectInput label="Armor Class" value={item.bodyProfile.armorClass} options={FAUNA_ARMOR_OPTIONS} onChange={(value) => saveManual({ ...item, bodyProfile: { ...item.bodyProfile, armorClass: value as FaunaEntry["bodyProfile"]["armorClass"] } })} />
                            <NumberInput label="Height (m)" value={item.bodyProfile.heightMeters} step={0.1} min={0} onChange={(value) => saveManual({ ...item, bodyProfile: { ...item.bodyProfile, heightMeters: value } })} />
                            <NumberInput label="Length (m)" value={item.bodyProfile.lengthMeters} step={0.1} min={0} onChange={(value) => saveManual({ ...item, bodyProfile: { ...item.bodyProfile, lengthMeters: value } })} />
                            <NumberInput label="Weight (kg)" value={item.bodyProfile.weightKg} step={1} min={0} onChange={(value) => saveManual({ ...item, bodyProfile: { ...item.bodyProfile, weightKg: value } })} />
                        </div>
                    </EditorSection>

                    <EditorSection title="Behavior Profile">
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            <SelectInput label="Temperament" value={item.behaviorProfile.temperament} options={FAUNA_TEMPERAMENT_OPTIONS} onChange={(value) => saveManual({ ...item, behaviorProfile: { ...item.behaviorProfile, temperament: value as FaunaEntry["behaviorProfile"]["temperament"] } })} />
                            <SelectInput label="Activity Cycle" value={item.behaviorProfile.activityCycle} options={ACTIVITY_CYCLE_OPTIONS} onChange={(value) => saveManual({ ...item, behaviorProfile: { ...item.behaviorProfile, activityCycle: value as FaunaEntry["behaviorProfile"]["activityCycle"] } })} />
                            <NumberInput label="Pack Min" value={item.behaviorProfile.packSizeMin} step={1} min={1} onChange={(value) => saveManual({ ...item, behaviorProfile: { ...item.behaviorProfile, packSizeMin: value } })} />
                            <NumberInput label="Pack Max" value={item.behaviorProfile.packSizeMax} step={1} min={1} onChange={(value) => saveManual({ ...item, behaviorProfile: { ...item.behaviorProfile, packSizeMax: value } })} />
                            <RangeInput label="Perception" value={item.behaviorProfile.perception} min={0} max={100} onChange={(value) => saveManual({ ...item, behaviorProfile: { ...item.behaviorProfile, perception: value } })} />
                            <RangeInput label="Stealth" value={item.behaviorProfile.stealth} min={0} max={100} onChange={(value) => saveManual({ ...item, behaviorProfile: { ...item.behaviorProfile, stealth: value } })} />
                            <RangeInput label="Trainability" value={item.behaviorProfile.trainability} min={0} max={100} onChange={(value) => saveManual({ ...item, behaviorProfile: { ...item.behaviorProfile, trainability: value } })} />
                        </div>
                    </EditorSection>
                </div>

                <div className="space-y-4 xl:sticky xl:top-6 self-start">
                    <IllustrationPreviewCard
                        title="Associated Image"
                        batchIds={item.illustrationAssetBatchIds}
                        assetRefs={item.illustrationAssets}
                        matchHint={item.name}
                        emptyLabel="Generate an ecology illustration to anchor this fauna visually in the archive."
                    />
                    <EditorSection title="Assigned Skills" accentClassName="text-sky-300">
                        <div className="flex flex-wrap gap-2">
                            {item.skillIds.length > 0 ? item.skillIds.map((skillId) => (
                                <Link
                                    key={skillId}
                                    to={`/gameplay-engine?step=SKILLS`}
                                    className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-[10px] font-mono text-sky-200 transition-all hover:bg-sky-500/20"
                                >
                                    {skillId}
                                </Link>
                            )) : <p className="text-[11px] text-gray-500">No skills assigned yet.</p>}
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                            <MetricCard label="Source" value={item.statsSource} />
                            <MetricCard label="Version" value={item.statsVersion || "v1"} />
                        </div>
                    </EditorSection>
                    <EditorSection title="Asset Links" accentClassName="text-amber-300">
                        <div className="mb-3 flex flex-wrap gap-2">
                            <Link
                                to={`/asset-generator?tab=sprites&mode=directional-set&spriteType=animal&targetKind=fauna&targetId=${encodeURIComponent(item.id)}${worldId ? `&worldId=${encodeURIComponent(worldId)}` : ""}${item.biomeIds.length ? `&biomeIds=${encodeURIComponent(item.biomeIds.join(","))}` : ""}`}
                                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[10px] font-bold tracking-widest text-amber-300 transition-all hover:bg-amber-500/20"
                            >
                                GENERATE EXPLORATION SPRITE
                            </Link>
                            <Link
                                to={`/asset-generator?tab=ecology-illustrations&subCategory=fauna&targetKind=fauna&targetId=${encodeURIComponent(item.id)}${worldId ? `&worldId=${encodeURIComponent(worldId)}` : ""}`}
                                className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[10px] font-bold tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20"
                            >
                                GENERATE ILLUSTRATION
                            </Link>
                        </div>
                        {item.explorationSprite && (
                            <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/10 bg-[#0a0f14] p-3">
                                <img src={item.explorationSprite.previewUrl} alt="" className="h-16 w-16 rounded-lg border border-white/10 object-contain bg-black/30" />
                                <div className="min-w-0">
                                    <p className="text-[10px] font-bold tracking-widest text-gray-100 uppercase">Current Sprite</p>
                                    <p className="truncate text-[10px] text-gray-500">{item.explorationSprite.batchId}</p>
                                </div>
                            </div>
                        )}
                        <AssetBatchChips label="Illustrations" batchIds={item.illustrationAssetBatchIds} tab="ecology-illustrations" />
                    </EditorSection>
                </div>
            </div>
        </div>
    );
}

function BiomeEditor({
    item,
    flora,
    fauna,
    worldId,
    onSave,
    onOpenFlora,
    onOpenFauna,
    onApprove,
    onGenerate,
    isGenerating,
}: {
    item: BiomeEntry;
    flora: FloraEntry[];
    fauna: FaunaEntry[];
    worldId: string | null;
    onSave: (entry: BiomeEntry) => void;
    onOpenFlora: (id: string) => void;
    onOpenFauna: (id: string) => void;
    onApprove: () => void;
    onGenerate: () => void;
    isGenerating: boolean;
}) {
    const linkedFlora = flora.filter((entry) => entry.biomeIds.includes(item.id));
    const linkedFauna = fauna.filter((entry) => entry.biomeIds.includes(item.id));
    return (
            <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                    <h2 className="text-lg font-bold tracking-widest text-gray-100 uppercase">{item.name}</h2>
                    <p className="text-[10px] tracking-widest text-gray-500 uppercase">{item.status} • {item.id}</p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onGenerate}
                        disabled={isGenerating}
                        className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-[10px] font-bold tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20 disabled:opacity-40"
                    >
                        GENERATE DESCRIPTION
                    </button>
                    <button
                        type="button"
                        onClick={onApprove}
                        className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-[10px] font-bold tracking-widest text-green-300 transition-all hover:bg-green-500/20"
                    >
                        APPROVE
                    </button>
                </div>
            </div>
            <TextInput label="Name" value={item.name} onChange={(value) => onSave({ ...item, name: value })} />
            <TextArea label="Description" value={item.description} onChange={(value) => onSave({ ...item, description: value })} />
            <div className="grid grid-cols-3 gap-3">
                <MetricCard label="Pixel Share" value={`${(item.pixelShare * 100).toFixed(1)}%`} />
                <MetricCard label="Avg Confidence" value={`${(item.avgConfidence * 100).toFixed(0)}%`} />
                <MetricCard label="Province Count" value={String(item.provinceCount)} />
            </div>
            {item.topCandidateIds.length > 0 && (
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <h3 className="mb-3 text-[10px] font-bold tracking-widest text-cyan-300 uppercase">Top Candidate Neighbors</h3>
                    <div className="flex flex-wrap gap-2">
                        {item.topCandidateIds.map((candidateId) => (
                            <span key={candidateId} className="rounded-full border border-white/10 bg-[#0a0f14] px-3 py-1 text-[10px] text-gray-300">
                                {candidateId}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-[10px] font-bold tracking-widest text-emerald-300 uppercase">Linked Flora</h3>
                    <span className="text-[10px] text-gray-500">{linkedFlora.length}</span>
                </div>
                <div className="space-y-2">
                    {linkedFlora.map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0a0f14] p-3">
                            <div>
                                <p className="text-sm font-bold text-gray-100">{entry.name}</p>
                                <p className="text-[10px] uppercase tracking-widest text-gray-500">{entry.category}</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => onOpenFlora(entry.id)}
                                    className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-bold tracking-widest text-cyan-300"
                                >
                                    OPEN
                                </button>
                                <Link
                                    to={`/asset-generator?tab=game-assets&assetType=vegetation&targetKind=flora&targetId=${encodeURIComponent(entry.id)}${worldId ? `&worldId=${encodeURIComponent(worldId)}` : ""}&biomeId=${encodeURIComponent(item.id)}`}
                                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-bold tracking-widest text-emerald-300"
                                >
                                    VEGETATION
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-[10px] font-bold tracking-widest text-amber-300 uppercase">Linked Fauna</h3>
                    <span className="text-[10px] text-gray-500">{linkedFauna.length}</span>
                </div>
                <div className="space-y-2">
                    {linkedFauna.map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0a0f14] p-3">
                            <div>
                                <p className="text-sm font-bold text-gray-100">{entry.name}</p>
                                <p className="text-[10px] uppercase tracking-widest text-gray-500">{entry.familyName || entry.familyId || entry.category}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => onOpenFauna(entry.id)}
                                className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-bold tracking-widest text-cyan-300"
                            >
                                OPEN
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-8 border-t border-white/10 pt-6">
                <h3 className="mb-4 text-xs font-bold tracking-widest text-gray-400 uppercase">Provinces with this Biome</h3>
                <div className="grid grid-cols-2 gap-2">
                    {item.provinceIds?.map(pid => (
                        <div key={pid} className="rounded-lg bg-black/30 border border-white/5 p-2 text-[10px] text-gray-300">
                            ID: #{pid}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function toggleString(values: string[], value: string) {
    return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

function BiomeSelector({
    title,
    biomes,
    selectedIds,
    onToggle,
}: {
    title: string;
    biomes: BiomeEntry[];
    selectedIds: string[];
    onToggle: (id: string) => void;
}) {
    return (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <h3 className="mb-3 text-[10px] font-bold tracking-widest text-gray-400 uppercase">{title}</h3>
            <div className="flex flex-wrap gap-2">
                {biomes.map((biome) => {
                    const selected = selectedIds.includes(biome.id);
                    return (
                        <button
                            key={biome.id}
                            type="button"
                            onClick={() => onToggle(biome.id)}
                            className={`rounded-full border px-3 py-1.5 text-[10px] font-bold tracking-widest transition-all ${selected
                                ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                                : "border-white/10 bg-[#0a0f14] text-gray-400 hover:border-white/20"
                                }`}
                        >
                            {biome.name}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function ClimateSelector({
    title,
    climates,
    selectedIds,
    onToggle,
}: {
    title: string;
    climates: ClimateProfile[];
    selectedIds: string[];
    onToggle: (id: string) => void;
}) {
    return (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <h3 className="mb-3 text-[10px] font-bold tracking-widest text-gray-400 uppercase">{title}</h3>
            <div className="flex flex-wrap gap-2">
                {climates.map((climate) => {
                    const selected = selectedIds.includes(climate.id);
                    return (
                        <button
                            key={climate.id}
                            type="button"
                            onClick={() => onToggle(climate.id)}
                            className={`rounded-full border px-3 py-1.5 text-[10px] font-bold tracking-widest transition-all ${
                                selected
                                    ? "border-sky-500/50 bg-sky-500/15 text-sky-300"
                                    : "border-white/10 bg-[#0a0f14] text-gray-400 hover:border-white/20"
                            }`}
                        >
                            {climate.name}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function AssetBatchChips({ label, batchIds, tab }: { label: string; batchIds: string[]; tab: string }) {
    if (batchIds.length === 0) return null;
    return (
        <div className="mt-4">
            <p className="mb-2 text-[10px] font-bold tracking-widest text-gray-500 uppercase">{label}</p>
            <div className="flex flex-wrap gap-2">
                {batchIds.map((batchId) => (
                    <Link
                        key={batchId}
                        to={`/asset-generator?tab=${encodeURIComponent(tab)}&batchId=${encodeURIComponent(batchId)}`}
                        className="rounded-full border border-white/10 bg-[#0a0f14] px-3 py-1 text-[10px] font-mono text-gray-300 hover:border-cyan-500/30 hover:text-cyan-300"
                    >
                        {batchId}
                    </Link>
                ))}
            </div>
        </div>
    );
}

function EditorSection({
    title,
    accentClassName = "text-gray-300",
    children,
}: {
    title: string;
    accentClassName?: string;
    children: ReactNode;
}) {
    return (
        <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <h3 className={`mb-4 text-[10px] font-bold tracking-widest uppercase ${accentClassName}`}>{title}</h3>
            <div className="space-y-4">{children}</div>
        </section>
    );
}

function IllustrationPreviewCard({
    title,
    batchIds,
    assetRefs,
    matchHint,
    emptyLabel,
}: {
    title: string;
    batchIds: string[];
    assetRefs?: AssetImageRef[];
    matchHint?: string;
    emptyLabel: string;
}) {
    const previewKey = batchIds.join("|");
    const assetRefKey = (assetRefs ?? []).map((asset) => `${asset.batchId}:${asset.filename}`).join("|");
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewBatchId, setPreviewBatchId] = useState<string | null>(null);
    const [previewTab, setPreviewTab] = useState<string>("ecology-illustrations");
    const [isLoading, setIsLoading] = useState(false);

    const primaryRefs = (assetRefs ?? []).slice().reverse();

    useEffect(() => {
        let cancelled = false;

        const loadPreview = async () => {
            if (batchIds.length === 0 && primaryRefs.length === 0) {
                setPreviewUrl(null);
                setPreviewBatchId(null);
                setPreviewTab("ecology-illustrations");
                return;
            }

            setIsLoading(true);
            for (const assetRef of primaryRefs) {
                try {
                    const textureRes = await fetch(`${API_BASE}/api/textures/batches/${assetRef.batchId}`);
                    if (textureRes.ok) {
                        const manifest = await textureRes.json() as {
                            category?: string;
                            textures?: Array<{ filename?: string; url?: string }>;
                        };
                        const matchedTexture = manifest.textures?.find((texture) => texture.filename === assetRef.filename);
                        if (matchedTexture?.url) {
                            if (!cancelled) {
                                setPreviewUrl(matchedTexture.url.startsWith("http") ? matchedTexture.url : `${API_BASE}${matchedTexture.url}`);
                                setPreviewBatchId(assetRef.batchId);
                                setPreviewTab(
                                    manifest.category === "game_assets"
                                        ? "game-assets"
                                        : manifest.category === "world_assets"
                                            ? "world-assets"
                                            : "ecology-illustrations",
                                );
                            }
                            setIsLoading(false);
                            return;
                        }
                    }
                } catch {
                    // Fallback to batch-level lookup below.
                }
            }

            for (const batchId of batchIds) {
                try {
                    const textureRes = await fetch(`${API_BASE}/api/textures/batches/${batchId}`);
                    if (textureRes.ok) {
                        const manifest = await textureRes.json() as {
                            category?: string;
                            textures?: Array<{ filename?: string; prompt?: string; itemPrompt?: string; url?: string }>;
                        };
                        const matchedTexture = matchHint
                            ? manifest.textures?.find((texture) => {
                                const haystack = `${texture.itemPrompt ?? ""} ${texture.prompt ?? ""}`.toLowerCase();
                                return haystack.includes(matchHint.toLowerCase());
                            }) ?? manifest.textures?.[0]
                            : manifest.textures?.[0];
                        if (matchedTexture?.url) {
                            if (!cancelled) {
                                setPreviewUrl(matchedTexture.url.startsWith("http") ? matchedTexture.url : `${API_BASE}${matchedTexture.url}`);
                                setPreviewBatchId(batchId);
                                setPreviewTab(
                                    manifest.category === "game_assets"
                                        ? "game-assets"
                                        : manifest.category === "world_assets"
                                            ? "world-assets"
                                            : "ecology-illustrations",
                                );
                            }
                            setIsLoading(false);
                            return;
                        }
                    }

                    const spriteRes = await fetch(`${API_BASE}/api/sprites/batches/${batchId}`);
                    if (spriteRes.ok) {
                        const manifest = await spriteRes.json() as {
                            sprites?: Array<{ illustrationUrl?: string | null; previewUrl?: string }>;
                        };
                        const spriteUrl = manifest.sprites?.find((entry) => entry.illustrationUrl || entry.previewUrl);
                        const resolvedUrl = spriteUrl?.illustrationUrl || spriteUrl?.previewUrl;
                        if (resolvedUrl) {
                            if (!cancelled) {
                                setPreviewUrl(resolvedUrl.startsWith("http") ? resolvedUrl : `${API_BASE}${resolvedUrl}`);
                                setPreviewBatchId(batchId);
                                setPreviewTab("sprites");
                            }
                            setIsLoading(false);
                            return;
                        }
                    }
                } catch {
                    // Skip missing preview batches.
                }
            }

            if (!cancelled) {
                setPreviewUrl(null);
                setPreviewBatchId(null);
                setPreviewTab("ecology-illustrations");
            }
            setIsLoading(false);
        };

        void loadPreview();
        return () => {
            cancelled = true;
        };
    }, [assetRefKey, batchIds, matchHint, previewKey]);

    return (
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b1118]">
            <div className="border-b border-white/10 px-4 py-3">
                <p className="text-[10px] font-bold tracking-widest text-cyan-300 uppercase">{title}</p>
                <p className="mt-1 text-[10px] text-gray-500">
                    {previewBatchId ? `Linked batch ${previewBatchId}` : "No linked image yet"}
                </p>
            </div>
            {previewUrl ? (
                <div className="relative">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_60%)]" />
                    <img src={previewUrl} alt={title} className="relative z-10 aspect-[4/5] w-full object-cover" />
                </div>
            ) : (
                <div className="flex aspect-[4/5] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.08),_transparent_70%)] p-6 text-center">
                    <div>
                        <p className="text-sm font-bold tracking-widest text-gray-300 uppercase">{isLoading ? "Loading Preview" : "No Preview"}</p>
                        <p className="mt-2 text-[11px] leading-relaxed text-gray-500">{emptyLabel}</p>
                    </div>
                </div>
            )}
            {previewBatchId && (
                <div className="flex flex-wrap items-center gap-3 border-t border-white/10 px-4 py-3 text-[10px]">
                    <span className="min-w-0 flex-1 truncate font-mono text-gray-400" title={previewBatchId}>
                        {previewBatchId}
                    </span>
                    <Link
                        to={`/asset-generator?tab=${encodeURIComponent(previewTab)}&batchId=${encodeURIComponent(previewBatchId)}`}
                        className="shrink-0 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-bold tracking-widest text-cyan-300 transition-all hover:bg-cyan-500/20"
                    >
                        OPEN BATCH
                    </Link>
                </div>
            )}
        </section>
    );
}

function MetricCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-white/10 bg-[#0a0f14] p-3">
            <p className="text-[9px] font-bold tracking-widest text-gray-500 uppercase">{label}</p>
            <p className="mt-1 text-sm font-bold text-gray-100">{value}</p>
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

export function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
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

export function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
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

export function RangeInput({
    label,
    value,
    min,
    max,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
}) {
    return (
        <label className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
                <span className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">{label}</span>
                <span className="text-[11px] font-bold text-gray-300">{value}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full accent-cyan-400"
            />
        </label>
    );
}

export function NumberInput({
    label,
    value,
    onChange,
    step = 1,
    min,
    max,
}: {
    label: string;
    value: number;
    onChange: (value: number) => void;
    step?: number;
    min?: number;
    max?: number;
}) {
    return (
        <label className="flex flex-col gap-2">
            <span className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">{label}</span>
            <input
                type="number"
                value={Number.isFinite(value) ? value : 0}
                step={step}
                min={min}
                max={max}
                onChange={(e) => onChange(Number(e.target.value))}
                className="rounded-lg border border-white/10 bg-[#0a0f14] px-3 py-2 text-sm text-gray-200"
            />
        </label>
    );
}

export function SelectInput({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string;
    options: readonly string[];
    onChange: (value: string) => void;
}) {
    return (
        <label className="flex flex-col gap-2">
            <span className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">{label}</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#0a0f14] px-3 py-2 text-sm text-gray-200"
            >
                {options.map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
        </label>
    );
}

export function SuggestInput({
    label,
    value,
    suggestions,
    listId,
    onChange,
}: {
    label: string;
    value: string;
    suggestions: readonly string[];
    listId: string;
    onChange: (value: string) => void;
}) {
    return (
        <label className="flex flex-col gap-2">
            <span className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">{label}</span>
            <input
                list={listId}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#0a0f14] px-3 py-2 text-sm text-gray-200"
            />
            <datalist id={listId}>
                {suggestions.map((suggestion) => (
                    <option key={suggestion} value={suggestion} />
                ))}
            </datalist>
        </label>
    );
}
