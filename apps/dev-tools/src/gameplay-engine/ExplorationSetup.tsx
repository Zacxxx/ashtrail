import React, { useEffect, useMemo, useRef, useState } from "react";
import { Character, ExplorationMap, GameRegistry } from "@ashtrail/core";
import { useSearchParams } from "react-router-dom";
import { useActiveWorld } from "../hooks/useActiveWorld";
import { useJobs } from "../jobs/useJobs";
import type { JobListItem } from "../jobs/types";
import { useTrackedJobLauncher } from "../jobs/useTrackedJobLauncher";
import {
    attachSelectedPawns,
    type ExplorationJobAcceptedResponse,
    fetchExplorationManifestIndex,
    type ExplorationManifestListItem,
    fetchExplorationManifest,
    type GenerateExplorationLocationRequest,
    TEST_EXPLORATION_LOCATION_ID,
} from "./explorationSupport";

interface ExplorationSetupProps {
    onStart: (map: ExplorationMap, selectedPawnId: string) => void;
}

type CrewFilter = "all" | "selected" | "humans" | "others";
type LocationOption = {
    id: string;
    name: string;
    lore?: string;
    type?: string;
    builtIn?: boolean;
};

const LOCATION_JOB_KIND = "exploration.generate-location.v1";

function getCharacterKind(character: Character | undefined): "human" | "animal" | "construct" {
    if (!character) return "human";
    if (character.explorationSprite?.actorType === "animal" || character.type === "Animal") return "animal";
    if (character.explorationSprite?.actorType === "construct" || character.type === "Construct") return "construct";
    return "human";
}

function getCharacterLabel(character: Character): string {
    return character.occupation?.name || character.traits[0]?.name || character.title || character.faction || "Colonist";
}

function getCharacterInitials(character: Character): string {
    const tokens = character.name.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return "??";
    return tokens.slice(0, 2).map((token) => token[0]?.toUpperCase() || "").join("");
}

function matchesLocationJob(job: JobListItem, worldId: string, locationId: string): boolean {
    return job.kind === LOCATION_JOB_KIND
        && job.worldId === worldId
        && typeof job.metadata?.locationId === "string"
        && job.metadata.locationId === locationId;
}

export function ExplorationSetup({ onStart }: ExplorationSetupProps) {
    const [searchParams] = useSearchParams();
    const { activeWorldId, setActiveWorldId } = useActiveWorld();
    const {
        jobs,
        getJobDetail,
        openOutput,
        redoJob,
        cancelJob,
    } = useJobs();
    const launchTrackedJob = useTrackedJobLauncher();

    const [rows, setRows] = useState(64);
    const [cols, setCols] = useState(64);
    const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
    const [crewSearch, setCrewSearch] = useState("");
    const [crewFilter, setCrewFilter] = useState<CrewFilter>("all");
    const [mapPrompt, setMapPrompt] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedMap, setGeneratedMap] = useState<ExplorationMap | null>(null);
    const [manifestError, setManifestError] = useState<string | null>(null);

    const [availableBiomes, setAvailableBiomes] = useState<any[]>([]);
    const [availableStructures, setAvailableStructures] = useState<any[]>([]);
    const [selectedBiomeName, setSelectedBiomeName] = useState<string | null>(null);
    const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
    const [isPackMode, setIsPackMode] = useState(false);
    const [selectedStructureIds, setSelectedStructureIds] = useState<string[]>([]);
    const [structureSourceMap, setStructureSourceMap] = useState<Record<string, "batch" | "pack">>({});
    const [availableLocations, setAvailableLocations] = useState<LocationOption[]>([]);
    const [savedManifestLocations, setSavedManifestLocations] = useState<ExplorationManifestListItem[]>([]);
    const [selectedLocationId, setSelectedLocationId] = useState<string>("");
    const [isLoadingLocations, setIsLoadingLocations] = useState(false);
    const [isLibraryOpen, setIsLibraryOpen] = useState(false);
    const [librarySearch, setLibrarySearch] = useState("");
    const restoredJobIdRef = useRef<string | null>(null);
    const initializedPartyRef = useRef(false);

    const allCharacters = GameRegistry.getAllCharacters();

    const selectedLocation = useMemo(
        () => availableLocations.find((entry) => entry.id === selectedLocationId) || null,
        [availableLocations, selectedLocationId],
    );

    const savedLocationIds = useMemo(
        () => new Set(savedManifestLocations.map((entry) => entry.locationId)),
        [savedManifestLocations],
    );

    const savedLocations = useMemo(
        () => savedManifestLocations.map((entry) => availableLocations.find((location) => location.id === entry.locationId) || {
            id: entry.locationId,
            name: entry.name || entry.manifestName || entry.locationId,
            builtIn: entry.builtIn,
        }),
        [availableLocations, savedManifestLocations],
    );

    const filteredSavedLocations = useMemo(() => {
        const search = librarySearch.trim().toLowerCase();
        return savedLocations.filter((location) => {
            if (!search) return true;
            return [
                location.name,
                location.type,
                location.lore,
                location.id,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase()
                .includes(search);
        });
    }, [librarySearch, savedLocations]);

    const selectedCharacters = useMemo(
        () => selectedCharIds
            .map((id) => GameRegistry.getCharacter(id))
            .filter((character): character is Character => Boolean(character)),
        [selectedCharIds],
    );

    const selectedStructures = useMemo(
        () => availableStructures.filter((entry) => selectedStructureIds.includes(entry.batchId)),
        [availableStructures, selectedStructureIds],
    );

    const selectedStructureNames = useMemo(
        () => selectedStructures.map((entry) => entry.source === "pack"
            ? (entry.grouping?.name || entry.name || "Unknown")
            : (entry.gameAsset?.grouping?.name || entry.batchName || "Unknown")),
        [selectedStructures],
    );

    const selectedBiomeOptions = useMemo(
        () => availableBiomes.filter((entry) => (entry.source === "pack" ? entry.grouping?.name : entry.gameAsset?.grouping?.name) === selectedBiomeName),
        [availableBiomes, selectedBiomeName],
    );

    const filteredCharacters = useMemo(() => {
        const search = crewSearch.trim().toLowerCase();
        return allCharacters.filter((character) => {
            const kind = getCharacterKind(character);
            const matchesFilter = crewFilter === "all"
                || (crewFilter === "selected" && selectedCharIds.includes(character.id))
                || (crewFilter === "humans" && kind === "human")
                || (crewFilter === "others" && kind !== "human");
            if (!matchesFilter) return false;
            if (!search) return true;
            const haystack = [
                character.name,
                getCharacterLabel(character),
                character.occupation?.name,
                character.traits[0]?.name,
                character.faction,
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return haystack.includes(search);
        });
    }, [allCharacters, crewFilter, crewSearch, selectedCharIds]);

    const matchingLocationJobs = useMemo(
        () => activeWorldId && selectedLocationId
            ? jobs.filter((job) => matchesLocationJob(job, activeWorldId, selectedLocationId))
            : [],
        [activeWorldId, jobs, selectedLocationId],
    );

    const latestLocationJob = matchingLocationJobs[0] || null;
    const activeLocationJob = matchingLocationJobs.find((job) => job.status === "queued" || job.status === "running") || null;

    const canQueueGeneration = Boolean(activeWorldId && selectedLocationId) && !activeLocationJob && !isGenerating;
    const canLaunch = Boolean(generatedMap) && selectedCharIds.length > 0;

    useEffect(() => {
        if (!initializedPartyRef.current && allCharacters.length > 0 && selectedCharIds.length === 0) {
            initializedPartyRef.current = true;
            setSelectedCharIds([allCharacters[0].id]);
        }
    }, [allCharacters, selectedCharIds.length]);

    useEffect(() => {
        const requestedWorldId = searchParams.get("worldId");
        if (requestedWorldId && requestedWorldId !== activeWorldId) {
            setActiveWorldId(requestedWorldId);
        }
    }, [activeWorldId, searchParams, setActiveWorldId]);

    useEffect(() => {
        async function fetchAssets() {
            try {
                const [batchRes, packRes] = await Promise.all([
                    fetch("/api/textures/batches"),
                    fetch("/api/packs"),
                ]);

                let batches: any[] = [];
                let packs: any[] = [];

                if (batchRes.ok) batches = await batchRes.json();
                if (packRes.ok) packs = await packRes.json();

                const biomeOptions = [
                    ...batches.filter((entry) => entry.gameAsset?.grouping?.type === "biome").map((entry) => ({ ...entry, source: "batch" })),
                    ...packs.filter((entry) => entry.grouping?.type === "biome").map((entry) => ({ ...entry, source: "pack", batchId: entry.packId, batchName: entry.name })),
                ];

                const structureOptions = [
                    ...batches.filter((entry) => entry.gameAsset?.grouping?.type === "structure").map((entry) => ({ ...entry, source: "batch" })),
                    ...packs.filter((entry) => entry.grouping?.type === "structure").map((entry) => ({ ...entry, source: "pack", batchId: entry.packId, batchName: entry.name })),
                ];

                setAvailableBiomes(biomeOptions);
                setAvailableStructures(structureOptions);

                if (biomeOptions.length > 0) {
                    const firstOption = biomeOptions[0];
                    const name = firstOption.source === "pack"
                        ? (firstOption.grouping?.name || firstOption.name)
                        : (firstOption.gameAsset?.grouping?.name || firstOption.batchName);
                    setSelectedBiomeName(name);
                    setSelectedPackId(firstOption.batchId);
                    setIsPackMode(firstOption.source === "pack");
                }
            } catch (error) {
                console.error("Failed to fetch biome/structure assets:", error);
            }
        }

        void fetchAssets();
    }, []);

    useEffect(() => {
        if (!activeWorldId) {
            setAvailableLocations([]);
            setSavedManifestLocations([]);
            setSelectedLocationId("");
            setGeneratedMap(null);
            return;
        }

        let cancelled = false;
        setIsLoadingLocations(true);
        const requestedLocationId = searchParams.get("locationId");

        const loadLocations = async () => {
            try {
                const response = await fetch(`/api/planet/locations/${activeWorldId}`);
                if (!response.ok) {
                    throw new Error(`Failed to load locations (${response.status})`);
                }
                const data = await response.json();
                if (cancelled) return;

                const locations: LocationOption[] = [
                    {
                        id: TEST_EXPLORATION_LOCATION_ID,
                        name: "Test Exploration",
                        type: "Test Sandbox",
                        lore: "Built-in sandbox used to validate exploration flows quickly.",
                        builtIn: true,
                    },
                    ...((Array.isArray(data)
                    ? data.map((entry: any) => ({
                        id: String(entry.id || ""),
                        name: String(entry.name || "Unnamed Location"),
                        lore: typeof entry.lore === "string" ? entry.lore : "",
                        type: typeof entry.type === "string" ? entry.type : "",
                    }))
                    : []) as LocationOption[]),
                ];

                setAvailableLocations(locations);
                if (locations.length === 0) {
                    setSelectedLocationId("");
                    return;
                }

                setSelectedLocationId((previous) => {
                    if (requestedLocationId && locations.some((entry) => entry.id === requestedLocationId)) {
                        return requestedLocationId;
                    }
                    if (previous && locations.some((entry) => entry.id === previous)) {
                        return previous;
                    }
                    return TEST_EXPLORATION_LOCATION_ID;
                });
            } catch (error) {
                console.error("Failed to load exploration locations", error);
                if (!cancelled) {
                    setAvailableLocations([]);
                    setSelectedLocationId("");
                }
            } finally {
                if (!cancelled) {
                    setIsLoadingLocations(false);
                }
            }
        };

        void loadLocations();
        return () => {
            cancelled = true;
        };
    }, [activeWorldId, searchParams]);

    const worldManifestJobSignature = useMemo(
        () => jobs
            .filter((job) => job.kind === LOCATION_JOB_KIND && job.worldId === activeWorldId)
            .map((job) => `${job.jobId}:${job.status}:${job.updatedAt}`)
            .join("|"),
        [activeWorldId, jobs],
    );

    useEffect(() => {
        if (!activeWorldId) return;
        let cancelled = false;

        const loadManifestIndex = async () => {
            try {
                const manifests = await fetchExplorationManifestIndex(activeWorldId);
                if (!cancelled) {
                    setSavedManifestLocations(manifests);
                }
            } catch (error) {
                console.error("Failed to load exploration manifest index", error);
                if (!cancelled) {
                    setSavedManifestLocations([]);
                }
            }
        };

        void loadManifestIndex();
        return () => {
            cancelled = true;
        };
    }, [activeWorldId, worldManifestJobSignature]);

    useEffect(() => {
        const restoreJobId = searchParams.get("restoreJob");
        if (!restoreJobId || restoredJobIdRef.current === restoreJobId) {
            return;
        }
        restoredJobIdRef.current = restoreJobId;

        const restore = async () => {
            const detail = await getJobDetail(restoreJobId);
            const restorePayload = detail?.metadata && typeof detail.metadata.restore === "object"
                ? (detail.metadata.restore as { payload?: Record<string, unknown> }).payload || {}
                : {};

            if (typeof restorePayload.rows === "number") setRows(restorePayload.rows);
            if (typeof restorePayload.cols === "number") setCols(restorePayload.cols);
            if (typeof restorePayload.prompt === "string") setMapPrompt(restorePayload.prompt);
            if (typeof restorePayload.worldId === "string") setActiveWorldId(restorePayload.worldId);
            if (typeof restorePayload.locationId === "string") setSelectedLocationId(restorePayload.locationId);
            if (typeof restorePayload.biomeName === "string") setSelectedBiomeName(restorePayload.biomeName);
            if (typeof restorePayload.biomePackId === "string") setSelectedPackId(restorePayload.biomePackId);
            if (typeof restorePayload.biomeSource === "string") setIsPackMode(restorePayload.biomeSource === "pack");
            if (Array.isArray(restorePayload.selectedCharIds)) {
                setSelectedCharIds(restorePayload.selectedCharIds.filter((value): value is string => typeof value === "string"));
            }
            if (Array.isArray(restorePayload.structurePackIds)) {
                setSelectedStructureIds(restorePayload.structurePackIds.filter((value): value is string => typeof value === "string"));
            }
            if (restorePayload.structureSourceMap && typeof restorePayload.structureSourceMap === "object") {
                setStructureSourceMap(restorePayload.structureSourceMap as Record<string, "batch" | "pack">);
            }
        };

        void restore();
    }, [getJobDetail, searchParams, setActiveWorldId]);

    const loadExistingManifest = React.useCallback(async () => {
        if (!activeWorldId || !selectedLocationId) {
            setGeneratedMap(null);
            return;
        }

        try {
            setManifestError(null);
            const manifest = await fetchExplorationManifest(activeWorldId, selectedLocationId);
            if (!manifest) {
                setGeneratedMap(null);
                return;
            }
            setGeneratedMap(manifest);
        } catch (error) {
            console.error("Failed to load exploration manifest", error);
            setGeneratedMap(null);
            setManifestError(error instanceof Error ? error.message : "Failed to load manifest");
        }
    }, [activeWorldId, selectedLocationId]);

    useEffect(() => {
        void loadExistingManifest();
    }, [loadExistingManifest]);

    useEffect(() => {
        if (latestLocationJob?.status === "completed") {
            void loadExistingManifest();
        }
    }, [latestLocationJob?.jobId, latestLocationJob?.status, loadExistingManifest]);

    const handleToggleCharacter = (characterId: string) => {
        setSelectedCharIds((previous) => (
            previous.includes(characterId)
                ? previous.filter((id) => id !== characterId)
                : [...previous, characterId]
        ));
    };

    const handleGenerateMap = async () => {
        if (!activeWorldId || !selectedLocationId || !selectedLocation || activeLocationJob) {
            return;
        }

        setIsGenerating(true);
        try {
            const request: GenerateExplorationLocationRequest = {
                worldId: activeWorldId,
                locationId: selectedLocationId,
                locationName: selectedLocation.name,
                prompt: mapPrompt,
                rows,
                cols,
                selectedCharIds,
                biomePackId: selectedPackId,
                biomeSource: isPackMode ? "pack" : "batch",
                biomeName: selectedBiomeName,
                structurePackIds: selectedStructureIds,
                structureSourceMap,
                structureNames: selectedStructureNames,
                seed: Date.now(),
                generationMode: mapPrompt.trim() ? "ai-assisted" : "procedural",
                assetMode: selectedStructureIds.length > 0 || selectedPackId ? "linked-packs" : "textureless",
            };

            await launchTrackedJob<ExplorationJobAcceptedResponse, GenerateExplorationLocationRequest>({
                url: "/api/exploration/generate-location",
                request,
                restore: {
                    route: "/gameplay-engine",
                    search: {
                        step: "EXPLORATION",
                        mode: "setup",
                        worldId: activeWorldId,
                        locationId: selectedLocationId,
                    },
                    payload: request,
                },
                optimisticJob: {
                    kind: LOCATION_JOB_KIND,
                    title: "Generate Exploration Map",
                    tool: "exploration",
                    status: "queued",
                    currentStage: "Queued",
                    worldId: activeWorldId,
                    metadata: {
                        worldId: activeWorldId,
                        locationId: selectedLocationId,
                        locationName: selectedLocation.name,
                        generationMode: request.generationMode,
                        assetMode: request.assetMode,
                        selectedCharIds: request.selectedCharIds,
                        mapSize: {
                            rows: request.rows,
                            cols: request.cols,
                        },
                    },
                },
            });
        } catch (error) {
            console.error("Exploration generation failed:", error);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleLaunch = () => {
        if (!generatedMap) return;
        const { map, selectedPawnId } = attachSelectedPawns(generatedMap, selectedCharIds);
        if (!selectedPawnId) return;
        onStart(map, selectedPawnId);
    };

    const handleExploreLocation = async (locationId: string) => {
        if (!activeWorldId) return;
        try {
            const manifest = await fetchExplorationManifest(activeWorldId, locationId);
            if (!manifest) return;
            const { map, selectedPawnId } = attachSelectedPawns(manifest, selectedCharIds);
            if (!selectedPawnId) return;
            setSelectedLocationId(locationId);
            setIsLibraryOpen(false);
            onStart(map, selectedPawnId);
        } catch (error) {
            console.error("Failed to open saved exploration manifest", error);
        }
    };

    const headerDetail = activeLocationJob
        ? `${activeLocationJob.currentStage} (${Math.round(activeLocationJob.progress)}%)`
        : manifestError
            ? manifestError
            : generatedMap
                ? "Saved exploration manifest ready."
                : latestLocationJob?.status === "failed"
                    ? (latestLocationJob.error || "The latest generation job failed.")
                    : selectedLocationId === TEST_EXPLORATION_LOCATION_ID
                        ? "Built-in sandbox location for testing exploration flows."
                        : "Pick a location or a saved manifest to explore.";

    return (
        <div className="w-full h-full min-h-0 p-3 md:p-4">
            <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border border-white/5 bg-[#111318] shadow-2xl">
                <div className="border-b border-white/5 bg-black/25 px-4 py-4 md:px-5">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="min-w-0">
                            <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white">
                                {selectedLocation?.name || "Location Exploration"}
                            </div>
                            <div className="mt-2 text-[11px] text-gray-400">
                                {headerDetail}
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={handleGenerateMap}
                                disabled={!canQueueGeneration}
                                className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.24em] text-black transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                                {isGenerating ? "Generating..." : activeLocationJob ? "Generating..." : generatedMap ? "Regenerate" : "Generate"}
                            </button>
                            <button
                                type="button"
                                onClick={handleLaunch}
                                disabled={!canLaunch}
                                className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.24em] text-sky-100 transition-colors hover:border-sky-400/40 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-30"
                            >
                                Launch
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsLibraryOpen(true)}
                                disabled={!activeWorldId}
                                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.24em] text-gray-300 transition-colors hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                            >
                                Library
                            </button>
                            <button
                                type="button"
                                onClick={() => latestLocationJob && void openOutput(latestLocationJob)}
                                disabled={!latestLocationJob?.outputRefs.length}
                                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.24em] text-gray-300 transition-colors hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                            >
                                Open
                            </button>
                            {latestLocationJob && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => void redoJob(latestLocationJob.jobId)}
                                        disabled={!latestLocationJob.metadata?.restore}
                                        className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.24em] text-gray-300 transition-colors hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                                    >
                                        Redo
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void cancelJob(latestLocationJob.jobId)}
                                        disabled={latestLocationJob.status !== "queued" && latestLocationJob.status !== "running"}
                                        className="rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.24em] text-red-200 transition-colors hover:border-red-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                                    >
                                        Cancel
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 md:px-5 md:py-5 custom-scrollbar">
                    <div className="space-y-4 pb-16">
                        <section className="rounded-3xl border border-white/5 bg-black/20 p-4 md:p-5">
                            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_112px_112px]">
                                <div>
                                    <label className="text-[9px] uppercase tracking-[0.2em] text-gray-500">Location</label>
                                    <select
                                        value={selectedLocationId}
                                        onChange={(event) => setSelectedLocationId(event.target.value)}
                                        disabled={!activeWorldId || isLoadingLocations || availableLocations.length === 0}
                                        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-all focus:border-cyan-500/40 disabled:opacity-50"
                                    >
                                        {availableLocations.length === 0 ? (
                                            <option value="">
                                                {isLoadingLocations ? "Loading locations..." : "No locations available"}
                                            </option>
                                            ) : (
                                                availableLocations.map((location) => (
                                                    <option key={location.id} value={location.id}>
                                                        {location.name}{savedLocationIds.has(location.id) ? " • saved" : ""}
                                                    </option>
                                                ))
                                            )}
                                    </select>
                                    {selectedLocation?.type && (
                                        <div className="mt-2 text-[10px] uppercase tracking-[0.16em] text-gray-500">
                                            {selectedLocation.type}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="text-[9px] uppercase tracking-[0.2em] text-gray-500">Width</label>
                                    <input
                                        type="number"
                                        value={cols}
                                        onChange={(event) => setCols(Math.max(0, Number(event.target.value) || 0))}
                                        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-all focus:border-emerald-500/40"
                                    />
                                </div>

                                <div>
                                    <label className="text-[9px] uppercase tracking-[0.2em] text-gray-500">Height</label>
                                    <input
                                        type="number"
                                        value={rows}
                                        onChange={(event) => setRows(Math.max(0, Number(event.target.value) || 0))}
                                        className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-all focus:border-emerald-500/40"
                                    />
                                </div>
                            </div>

                            <div className="mt-4">
                                <label className="text-[9px] uppercase tracking-[0.2em] text-gray-500">Prompt</label>
                                <textarea
                                    value={mapPrompt}
                                    onChange={(event) => setMapPrompt(event.target.value)}
                                    placeholder="Ancient ruins hidden in a dense jungle, with a central approach and a blocky outer wall."
                                    rows={2}
                                    className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-relaxed text-white outline-none transition-all placeholder:text-gray-700 focus:border-indigo-500/40"
                                />
                            </div>
                        </section>

                        <section className="rounded-3xl border border-white/5 bg-black/20 p-4 md:p-5">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-300">Party Selection</div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <input
                                        value={crewSearch}
                                        onChange={(event) => setCrewSearch(event.target.value)}
                                        placeholder="Search party..."
                                        className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white outline-none transition-all placeholder:text-gray-700 focus:border-sky-500/40 md:w-[240px]"
                                    />
                                    {(["all", "selected", "humans", "others"] as CrewFilter[]).map((filter) => (
                                        <button
                                            key={filter}
                                            type="button"
                                            onClick={() => setCrewFilter(filter)}
                                            className={`rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] transition-colors ${crewFilter === filter
                                                ? "border-sky-500/40 bg-sky-500/10 text-sky-100"
                                                : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:text-white"}`}
                                        >
                                            {filter}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="mt-4 rounded-2xl border border-sky-500/15 bg-sky-500/5 px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-[9px] uppercase tracking-[0.18em] text-sky-200">Selected Party</div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedCharIds([])}
                                        disabled={selectedCharIds.length === 0}
                                        className="text-[9px] font-black uppercase tracking-[0.18em] text-gray-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        Clear All
                                    </button>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {selectedCharacters.length > 0 ? selectedCharacters.map((character) => (
                                        <button
                                            key={character.id}
                                            type="button"
                                            onClick={() => handleToggleCharacter(character.id)}
                                            className="inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-black/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100 transition-colors hover:border-sky-400/40 hover:text-white"
                                        >
                                            <span>{character.name}</span>
                                            <span className="text-white/50">x</span>
                                        </button>
                                    )) : (
                                        <div className="text-[11px] text-gray-500">No characters selected.</div>
                                    )}
                                </div>
                            </div>

                            <div className="mt-4 max-h-[340px] overflow-y-auto rounded-2xl border border-white/5 bg-black/20 custom-scrollbar">
                                {filteredCharacters.length > 0 ? filteredCharacters.map((character) => {
                                    const isSelected = selectedCharIds.includes(character.id);
                                    const characterKind = getCharacterKind(character);
                                    return (
                                        <button
                                            key={character.id}
                                            type="button"
                                            onClick={() => handleToggleCharacter(character.id)}
                                            className={`flex w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-left transition-colors last:border-b-0 ${isSelected
                                                ? "bg-sky-500/10"
                                                : "hover:bg-white/[0.03]"}`}
                                        >
                                            <div className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border ${isSelected ? "border-sky-400/40 bg-sky-500/10" : "border-white/10 bg-black/40"}`}>
                                                {character.portraitUrl ? (
                                                    <img src={character.portraitUrl} alt="" className="h-full w-full object-cover" />
                                                ) : (
                                                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white">{getCharacterInitials(character)}</span>
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate text-sm font-bold text-white">{character.name}</span>
                                                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.16em] text-gray-400">
                                                        {characterKind}
                                                    </span>
                                                </div>
                                                <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-gray-500">
                                                    LVL {character.level} • {getCharacterLabel(character)}
                                                </div>
                                            </div>
                                            <div className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.16em] ${isSelected
                                                ? "border-sky-400/40 bg-sky-500/15 text-sky-100"
                                                : "border-white/10 bg-white/5 text-gray-500"}`}>
                                                {isSelected ? "Selected" : "Add"}
                                            </div>
                                        </button>
                                    );
                                }) : (
                                    <div className="px-4 py-6 text-center text-[11px] text-gray-500">
                                        No crew members match the current search and filter.
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                            <div className="rounded-3xl border border-white/5 bg-black/20 p-4 md:p-5">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <div className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">Biome</div>
                                    <span className="text-[9px] uppercase tracking-[0.18em] text-gray-500">{selectedBiomeOptions.length} variants</span>
                                </div>
                                {availableBiomes.length === 0 ? (
                                    <div className="rounded-2xl border border-white/5 bg-black/30 px-4 py-4 text-[11px] text-gray-500">
                                        No biome packs found.
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex flex-wrap gap-2">
                                            {Array.from(new Set(availableBiomes.map((entry) => entry.source === "pack" ? entry.grouping?.name : entry.gameAsset?.grouping?.name))).filter(Boolean).map((name) => (
                                                <button
                                                    key={name}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedBiomeName(String(name));
                                                        const firstMatch = availableBiomes.find((entry) => (entry.source === "pack" ? entry.grouping?.name : entry.gameAsset?.grouping?.name) === name);
                                                        setSelectedPackId(firstMatch?.batchId || null);
                                                        setIsPackMode(firstMatch?.source === "pack");
                                                    }}
                                                    className={`rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] transition-colors ${selectedBiomeName === name
                                                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                                                        : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:text-white"}`}
                                                >
                                                    {name}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="mt-4 max-h-[240px] overflow-y-auto rounded-2xl border border-white/5 bg-black/20 custom-scrollbar">
                                            {selectedBiomeOptions.map((pack) => (
                                                <button
                                                    key={pack.batchId}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedPackId(pack.batchId);
                                                        setIsPackMode(pack.source === "pack");
                                                    }}
                                                    className={`flex w-full items-center justify-between gap-3 border-b border-white/5 px-4 py-3 text-left transition-colors last:border-b-0 ${selectedPackId === pack.batchId
                                                        ? "bg-emerald-500/10"
                                                        : "hover:bg-white/[0.03]"}`}
                                                >
                                                    <div className="min-w-0">
                                                        <div className="truncate text-[11px] font-bold uppercase tracking-[0.16em] text-white">{pack.batchName || pack.name || `Batch ${String(pack.batchId).slice(0, 6)}`}</div>
                                                        <div className="mt-1 text-[10px] text-gray-500">
                                                            {pack.source === "pack"
                                                                ? `${Array.isArray(pack.textures) ? pack.textures.length : 0} textures • ${Array.isArray(pack.sprites) ? pack.sprites.length : 0} sprites`
                                                                : `${typeof pack.textureCount === "number" ? pack.textureCount : 0} textures`}
                                                        </div>
                                                    </div>
                                                    <div className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.16em] ${selectedPackId === pack.batchId
                                                        ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                                                        : "border-white/10 bg-white/5 text-gray-500"}`}>
                                                        {pack.source === "pack" ? "Pack" : "Batch"}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="rounded-3xl border border-white/5 bg-black/20 p-4 md:p-5">
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-300">Structures</div>
                                    <span className="text-[9px] uppercase tracking-[0.18em] text-gray-500">{selectedStructureIds.length} selected</span>
                                </div>
                                {availableStructures.length === 0 ? (
                                    <div className="rounded-2xl border border-white/5 bg-black/30 px-4 py-4 text-[11px] text-gray-500">
                                        No structure packs found.
                                    </div>
                                ) : (
                                    <>
                                        {selectedStructureNames.length > 0 && (
                                            <div className="mb-4 flex flex-wrap gap-2">
                                                {selectedStructureNames.map((name) => (
                                                    <span
                                                        key={name}
                                                        className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-amber-100"
                                                    >
                                                        {name}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                        <div className="max-h-[320px] overflow-y-auto rounded-2xl border border-white/5 bg-black/20 custom-scrollbar">
                                            {availableStructures.map((structure) => {
                                                const isSelected = selectedStructureIds.includes(structure.batchId);
                                                const label = structure.source === "pack"
                                                    ? (structure.grouping?.name || structure.name || "Unknown")
                                                    : (structure.gameAsset?.grouping?.name || structure.batchName || "Unknown");
                                                const description = structure.source === "pack"
                                                    ? (structure.grouping?.description || structure.description || "No description available.")
                                                    : (structure.gameAsset?.grouping?.description || "No architectural description available.");
                                                return (
                                                    <button
                                                        key={structure.batchId}
                                                        type="button"
                                                        onClick={() => {
                                                            if (isSelected) {
                                                                setSelectedStructureIds((previous) => previous.filter((id) => id !== structure.batchId));
                                                                setStructureSourceMap((previous) => {
                                                                    const next = { ...previous };
                                                                    delete next[structure.batchId];
                                                                    return next;
                                                                });
                                                            } else {
                                                                setSelectedStructureIds((previous) => [...previous, structure.batchId]);
                                                                setStructureSourceMap((previous) => ({ ...previous, [structure.batchId]: structure.source }));
                                                            }
                                                        }}
                                                        className={`flex w-full items-start gap-3 border-b border-white/5 px-4 py-3 text-left transition-colors last:border-b-0 ${isSelected
                                                            ? "bg-amber-500/10"
                                                            : "hover:bg-white/[0.03]"}`}
                                                    >
                                                        <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-[10px] font-black uppercase tracking-[0.16em] ${isSelected
                                                            ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                                                            : "border-white/10 bg-black/40 text-gray-500"}`}>
                                                            {structure.source === "pack" ? "Pack" : "Batch"}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="truncate text-[11px] font-bold uppercase tracking-[0.16em] text-white">{label}</div>
                                                            <div className="mt-1 text-[10px] leading-relaxed text-gray-500">{description}</div>
                                                        </div>
                                                        <div className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.16em] ${isSelected
                                                            ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                                                            : "border-white/10 bg-white/5 text-gray-500"}`}>
                                                            {isSelected ? "Selected" : "Add"}
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        </section>
                    </div>
                </div>

                {isLibraryOpen && (
                    <div className="absolute inset-0 z-20 flex min-h-0 flex-col bg-[#06080d]/92 backdrop-blur-md">
                        <div className="flex items-center justify-between gap-4 border-b border-white/5 px-5 py-4">
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.24em] text-white">Saved Exploration Library</div>
                                <div className="mt-1 text-[11px] text-gray-500">
                                    Browse generated manifests and the built-in test exploration sandbox.
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsLibraryOpen(false)}
                                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-300 transition-colors hover:border-white/20 hover:text-white"
                            >
                                Close
                            </button>
                        </div>

                        <div className="border-b border-white/5 px-5 py-4">
                            <input
                                value={librarySearch}
                                onChange={(event) => setLibrarySearch(event.target.value)}
                                placeholder="Search saved locations..."
                                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-gray-700 focus:border-cyan-500/40"
                            />
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 custom-scrollbar">
                            {filteredSavedLocations.length > 0 ? (
                                <div className="grid gap-3 xl:grid-cols-2">
                                    {filteredSavedLocations.map((location) => {
                                        const isSelected = location.id === selectedLocationId;
                                        const hasManifest = savedLocationIds.has(location.id) || location.id === TEST_EXPLORATION_LOCATION_ID;
                                        return (
                                            <div
                                                key={location.id}
                                                className={`rounded-3xl border p-4 transition-colors ${isSelected
                                                    ? "border-cyan-500/30 bg-cyan-500/10"
                                                    : "border-white/5 bg-black/20"}`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="truncate text-[11px] font-black uppercase tracking-[0.18em] text-white">
                                                            {location.name}
                                                        </div>
                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                            {location.builtIn && (
                                                                <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-cyan-100">
                                                                    Test Sandbox
                                                                </span>
                                                            )}
                                                            {hasManifest && !location.builtIn && (
                                                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-emerald-100">
                                                                    Generated
                                                                </span>
                                                            )}
                                                            {location.type && (
                                                                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-gray-400">
                                                                    {location.type}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {isSelected && (
                                                        <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-cyan-100">
                                                            Selected
                                                        </span>
                                                    )}
                                                </div>

                                                {location.lore && (
                                                    <div className="mt-3 text-[11px] leading-relaxed text-gray-500">
                                                        {location.lore}
                                                    </div>
                                                )}

                                                <div className="mt-4 flex flex-wrap gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedLocationId(location.id);
                                                            setIsLibraryOpen(false);
                                                        }}
                                                        className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-gray-300 transition-colors hover:border-white/20 hover:text-white"
                                                    >
                                                        Select
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleExploreLocation(location.id)}
                                                        disabled={!canLaunch || !hasManifest}
                                                        className="rounded-2xl border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-sky-100 transition-colors hover:border-sky-400/40 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-30"
                                                    >
                                                        Explore
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="rounded-3xl border border-white/5 bg-black/20 px-4 py-6 text-center text-[11px] text-gray-500">
                                    No saved locations match the current search.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
