import React, { useEffect, useMemo, useRef, useState } from "react";
import { Character, ExplorationMap, GameRegistry } from "@ashtrail/core";
import { useSearchParams } from "react-router-dom";
import { useActiveWorld } from "../hooks/useActiveWorld";
import { useJobs } from "../jobs/useJobs";
import type { JobListItem, JobStatus } from "../jobs/types";
import { useTrackedJobLauncher } from "../jobs/useTrackedJobLauncher";
import {
    attachSelectedPawns,
    type ExplorationJobAcceptedResponse,
    fetchExplorationManifest,
    type GenerateExplorationLocationRequest,
} from "./explorationSupport";

interface ExplorationSetupProps {
    onStart: (map: ExplorationMap, selectedPawnId: string) => void;
}

type CrewFilter = "all" | "selected" | "humans" | "others";

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

function getStatusTone(status: JobStatus | "missing" | "ready" | "updating") {
    switch (status) {
        case "completed":
        case "ready":
            return {
                pill: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
                text: "text-emerald-300",
                bar: "bg-emerald-400",
            };
        case "queued":
            return {
                pill: "border-sky-500/30 bg-sky-500/10 text-sky-300",
                text: "text-sky-300",
                bar: "bg-sky-400",
            };
        case "running":
        case "updating":
            return {
                pill: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
                text: "text-indigo-300",
                bar: "bg-indigo-400",
            };
        case "failed":
            return {
                pill: "border-red-500/30 bg-red-500/10 text-red-300",
                text: "text-red-300",
                bar: "bg-red-400",
            };
        case "cancelled":
            return {
                pill: "border-amber-500/30 bg-amber-500/10 text-amber-300",
                text: "text-amber-300",
                bar: "bg-amber-400",
            };
        default:
            return {
                pill: "border-white/10 bg-white/5 text-gray-400",
                text: "text-gray-400",
                bar: "bg-white/20",
            };
    }
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
        setPanelOpen,
    } = useJobs();
    const launchTrackedJob = useTrackedJobLauncher();

    const [rows, setRows] = useState(64);
    const [cols, setCols] = useState(64);
    const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
    const [crewSearch, setCrewSearch] = useState("");
    const [crewFilter, setCrewFilter] = useState<CrewFilter>("all");
    const [mapPrompt, setMapPrompt] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [mapName, setMapName] = useState<string | null>(null);
    const [generatedMap, setGeneratedMap] = useState<ExplorationMap | null>(null);
    const [manifestError, setManifestError] = useState<string | null>(null);
    const [locationLoreExpanded, setLocationLoreExpanded] = useState(false);

    const [availableBiomes, setAvailableBiomes] = useState<any[]>([]);
    const [availableStructures, setAvailableStructures] = useState<any[]>([]);
    const [selectedBiomeName, setSelectedBiomeName] = useState<string | null>(null);
    const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
    const [isPackMode, setIsPackMode] = useState(false);
    const [selectedStructureIds, setSelectedStructureIds] = useState<string[]>([]);
    const [structureSourceMap, setStructureSourceMap] = useState<Record<string, "batch" | "pack">>({});
    const [availableLocations, setAvailableLocations] = useState<Array<{ id: string; name: string; lore?: string; type?: string }>>([]);
    const [selectedLocationId, setSelectedLocationId] = useState<string>("");
    const [isLoadingLocations, setIsLoadingLocations] = useState(false);
    const restoredJobIdRef = useRef<string | null>(null);
    const initializedPartyRef = useRef(false);

    const allCharacters = GameRegistry.getAllCharacters();

    const selectedLocation = useMemo(
        () => availableLocations.find((entry) => entry.id === selectedLocationId) || null,
        [availableLocations, selectedLocationId],
    );

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

    const manifestState = useMemo(() => {
        if (generatedMap && activeLocationJob) {
            return {
                label: "Updating",
                status: "updating" as const,
                detail: "Existing manifest is ready while a new generation job is running.",
            };
        }
        if (generatedMap) {
            return {
                label: "Ready",
                status: "ready" as const,
                detail: mapName || "A manifest is available for this location.",
            };
        }
        if (activeLocationJob) {
            return {
                label: activeLocationJob.status === "queued" ? "Queued" : "Running",
                status: activeLocationJob.status,
                detail: activeLocationJob.currentStage,
            };
        }
        if (latestLocationJob?.status === "failed") {
            return {
                label: "Failed",
                status: "failed" as const,
                detail: latestLocationJob.error || "The latest generation job failed.",
            };
        }
        if (latestLocationJob?.status === "cancelled") {
            return {
                label: "Cancelled",
                status: "cancelled" as const,
                detail: "The latest generation job was cancelled.",
            };
        }
        return {
            label: "Missing",
            status: "missing" as const,
            detail: "No generated manifest is stored for this location yet.",
        };
    }, [activeLocationJob, generatedMap, latestLocationJob, mapName]);

    const selectedStructureNames = useMemo(
        () => selectedStructures.map((entry) => entry.source === "pack"
            ? (entry.grouping?.name || entry.name || "Unknown")
            : (entry.gameAsset?.grouping?.name || entry.batchName || "Unknown")),
        [selectedStructures],
    );

    const locationLorePreview = useMemo(() => {
        const lore = selectedLocation?.lore?.trim() || "";
        if (!lore) return "Pick a generated location from the active world to queue an exploration map.";
        if (locationLoreExpanded || lore.length <= 240) return lore;
        return `${lore.slice(0, 240).trimEnd()}...`;
    }, [locationLoreExpanded, selectedLocation?.lore]);

    useEffect(() => {
        if (!initializedPartyRef.current && allCharacters.length > 0 && selectedCharIds.length === 0) {
            initializedPartyRef.current = true;
            setSelectedCharIds([allCharacters[0].id]);
        }
    }, [allCharacters, selectedCharIds.length]);

    useEffect(() => {
        setLocationLoreExpanded(false);
    }, [selectedLocationId]);

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
            setSelectedLocationId("");
            setGeneratedMap(null);
            setMapName(null);
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
                const locations = Array.isArray(data)
                    ? data.map((entry: any) => ({
                        id: String(entry.id || ""),
                        name: String(entry.name || "Unnamed Location"),
                        lore: typeof entry.lore === "string" ? entry.lore : "",
                        type: typeof entry.type === "string" ? entry.type : "",
                    }))
                    : [];

                setAvailableLocations(locations);
                if (locations.length === 0) {
                    setSelectedLocationId("");
                    return;
                }

                const requested = requestedLocationId && locations.some((entry) => entry.id === requestedLocationId)
                    ? requestedLocationId
                    : locations[0].id;
                setSelectedLocationId(requested);
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
            setMapName(null);
            return;
        }

        try {
            setManifestError(null);
            const manifest = await fetchExplorationManifest(activeWorldId, selectedLocationId);
            if (!manifest) {
                setGeneratedMap(null);
                setMapName(null);
                return;
            }
            setGeneratedMap(manifest);
            setMapName(manifest.name || selectedLocation?.name || "Generated Exploration Map");
        } catch (error) {
            console.error("Failed to load exploration manifest", error);
            setGeneratedMap(null);
            setMapName(null);
            setManifestError(error instanceof Error ? error.message : "Failed to load manifest");
        }
    }, [activeWorldId, selectedLocation?.name, selectedLocationId]);

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

    const handleRemoveSelectedCharacter = (characterId: string) => {
        setSelectedCharIds((previous) => previous.filter((id) => id !== characterId));
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

    const promptModeLabel = mapPrompt.trim() ? "AI Assisted" : "Procedural";
    const manifestTone = getStatusTone(manifestState.status);
    const latestJobTone = getStatusTone(latestLocationJob?.status || "missing");

    return (
        <div className="w-full h-full min-h-0 p-4 md:p-6">
            <div className="h-full min-h-0 overflow-hidden rounded-[28px] border border-white/5 bg-[#111318] shadow-2xl">
                <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,1.45fr)_360px]">
                    <aside className="order-1 border-b border-white/5 bg-[#0b1117] lg:order-2 lg:border-b-0 lg:border-l">
                        <div className="flex h-full min-h-0 flex-col">
                            <div className="border-b border-white/5 px-5 py-5">
                                <div className="text-[10px] font-black uppercase tracking-[0.35em] text-emerald-400">Exploration Control</div>
                                <div className="mt-2 text-xs text-gray-500">Manifest state, tracked jobs, selected party, and launch actions.</div>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 custom-scrollbar">
                                <div className="space-y-4">
                                    <section className="rounded-2xl border border-white/5 bg-black/20 p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="text-[9px] uppercase tracking-[0.25em] text-gray-500">Location</div>
                                                <div className="mt-2 text-base font-black text-white">{selectedLocation?.name || "No location selected"}</div>
                                                <div className="mt-1 text-[10px] uppercase tracking-widest text-gray-500">{activeWorldId || "No active world"}</div>
                                            </div>
                                            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.25em] ${manifestTone.pill}`}>
                                                {manifestState.label}
                                            </span>
                                        </div>
                                        <div className="mt-3 text-[11px] leading-relaxed text-gray-400">{manifestState.detail}</div>
                                        {manifestError && (
                                            <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-red-300">
                                                {manifestError}
                                            </div>
                                        )}
                                    </section>

                                    <section className="rounded-2xl border border-white/5 bg-black/20 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-[9px] uppercase tracking-[0.25em] text-gray-500">Latest Job</div>
                                            {latestLocationJob && (
                                                <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.25em] ${latestJobTone.pill}`}>
                                                    {latestLocationJob.status}
                                                </span>
                                            )}
                                        </div>
                                        {latestLocationJob ? (
                                            <>
                                                <div className="mt-3 text-sm font-bold text-white">{latestLocationJob.title}</div>
                                                <div className="mt-1 text-[11px] text-gray-400">{latestLocationJob.currentStage}</div>
                                                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                                                    <div
                                                        className={`h-full transition-all ${latestJobTone.bar}`}
                                                        style={{ width: `${Math.max(6, Math.min(100, latestLocationJob.progress || 0))}%` }}
                                                    />
                                                </div>
                                                <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-gray-500">
                                                    {Math.round(latestLocationJob.progress)}% complete
                                                </div>
                                                {latestLocationJob.error && (
                                                    <div className="mt-3 text-[11px] text-red-300">{latestLocationJob.error}</div>
                                                )}
                                            </>
                                        ) : (
                                            <div className="mt-3 text-[11px] text-gray-500">No exploration generation job has been queued for this location yet.</div>
                                        )}
                                    </section>

                                    <section className="rounded-2xl border border-white/5 bg-black/20 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-[9px] uppercase tracking-[0.25em] text-gray-500">Party</div>
                                            <div className="text-sm font-black text-white">{selectedCharacters.length}</div>
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            {selectedCharacters.length > 0 ? selectedCharacters.map((character) => (
                                                <button
                                                    key={character.id}
                                                    type="button"
                                                    onClick={() => handleRemoveSelectedCharacter(character.id)}
                                                    className="inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-200 transition-colors hover:border-sky-400/40 hover:text-white"
                                                >
                                                    <span>{character.name}</span>
                                                    <span className="text-white/60">x</span>
                                                </button>
                                            )) : (
                                                <div className="text-[11px] text-gray-500">Select one or more characters to seed the exploration party.</div>
                                            )}
                                        </div>
                                    </section>

                                    <section className="rounded-2xl border border-white/5 bg-black/20 p-4">
                                        <div className="text-[9px] uppercase tracking-[0.25em] text-gray-500">Map Summary</div>
                                        <div className="mt-3 grid grid-cols-2 gap-3">
                                            <div className="rounded-xl border border-white/5 bg-black/30 px-3 py-2">
                                                <div className="text-[9px] uppercase tracking-[0.2em] text-gray-500">Size</div>
                                                <div className="mt-1 text-sm font-black text-white">{cols} x {rows}</div>
                                            </div>
                                            <div className="rounded-xl border border-white/5 bg-black/30 px-3 py-2">
                                                <div className="text-[9px] uppercase tracking-[0.2em] text-gray-500">Mode</div>
                                                <div className="mt-1 text-sm font-black text-white">{promptModeLabel}</div>
                                            </div>
                                            <div className="col-span-2 rounded-xl border border-white/5 bg-black/30 px-3 py-2">
                                                <div className="text-[9px] uppercase tracking-[0.2em] text-gray-500">Biome</div>
                                                <div className="mt-1 text-sm font-black text-white">{selectedBiomeName || "No biome selected"}</div>
                                            </div>
                                            <div className="col-span-2 rounded-xl border border-white/5 bg-black/30 px-3 py-2">
                                                <div className="text-[9px] uppercase tracking-[0.2em] text-gray-500">Structures</div>
                                                <div className="mt-1 text-[11px] leading-relaxed text-gray-300">
                                                    {selectedStructureNames.length > 0 ? selectedStructureNames.join(", ") : "No structures selected."}
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            </div>

                            <div className="border-t border-white/5 bg-[#0d141b] px-5 py-4">
                                <div className="grid gap-2">
                                    <button
                                        type="button"
                                        onClick={handleGenerateMap}
                                        disabled={!canQueueGeneration}
                                        className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-[10px] font-black uppercase tracking-[0.3em] text-black transition-all hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-30"
                                    >
                                        {isGenerating ? "Queuing..." : activeLocationJob ? "Job Running" : "Queue Generation"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleLaunch}
                                        disabled={!canLaunch}
                                        className="w-full rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.3em] text-sky-100 transition-all hover:border-sky-400/40 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-30"
                                    >
                                        Launch Exploration
                                    </button>

                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setPanelOpen(true)}
                                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.24em] text-gray-300 transition-colors hover:border-white/20 hover:text-white"
                                        >
                                            Job Center
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => latestLocationJob && void openOutput(latestLocationJob)}
                                            disabled={!latestLocationJob?.outputRefs.length}
                                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.24em] text-gray-300 transition-colors hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                                        >
                                            Open Result
                                        </button>
                                    </div>

                                    {latestLocationJob && (
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void redoJob(latestLocationJob.jobId)}
                                                disabled={!latestLocationJob.metadata?.restore}
                                                className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[9px] font-black uppercase tracking-[0.24em] text-gray-300 transition-colors hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                                            >
                                                Redo
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void cancelJob(latestLocationJob.jobId)}
                                                disabled={latestLocationJob.status !== "queued" && latestLocationJob.status !== "running"}
                                                className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[9px] font-black uppercase tracking-[0.24em] text-red-200 transition-colors hover:border-red-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </aside>

                    <div className="order-2 min-h-0 overflow-hidden lg:order-1">
                        <div className="flex h-full min-h-0 flex-col">
                            <div className="border-b border-white/5 bg-black/30 px-5 py-5 md:px-6">
                                <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500">Exploration Setup</div>
                                        <p className="mt-2 text-xs text-gray-500">World-scoped map generation tracked through the Job Center.</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.25em] ${getStatusTone(generatedMap ? "ready" : "missing").pill}`}>
                                            {generatedMap ? "Manifest Loaded" : "No Manifest"}
                                        </span>
                                        <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.25em] ${getStatusTone(promptModeLabel === "AI Assisted" ? "running" : "ready").pill}`}>
                                            {promptModeLabel}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-6 md:py-6 custom-scrollbar">
                                <div className="space-y-6">
                                    <section className="rounded-3xl border border-white/5 bg-black/20 p-5">
                                        <div className="mb-4 flex items-center justify-between gap-3">
                                            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-cyan-300">World Context</div>
                                            <span className="text-[9px] uppercase tracking-[0.25em] text-gray-500">{selectedLocation?.type || "Location"}</span>
                                        </div>
                                        <div className="grid gap-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                                            <div className="rounded-2xl border border-white/5 bg-black/30 px-4 py-4">
                                                <div className="text-[9px] uppercase tracking-[0.2em] text-gray-500">Active World</div>
                                                <div className="mt-2 text-sm font-black text-white">{activeWorldId || "No world selected"}</div>
                                                <div className="mt-2 text-[11px] leading-relaxed text-gray-500">
                                                    Exploration generation is scoped to the active world and stored as a reusable manifest.
                                                </div>
                                            </div>
                                            <div className="space-y-3">
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
                                                                    {location.name}
                                                                </option>
                                                            ))
                                                        )}
                                                    </select>
                                                </div>
                                                <div className="rounded-2xl border border-white/5 bg-black/30 px-4 py-3">
                                                    <div className="text-[9px] uppercase tracking-[0.2em] text-gray-500">Location Lore</div>
                                                    <div className="mt-2 text-[11px] leading-relaxed text-gray-400">{locationLorePreview}</div>
                                                    {selectedLocation?.lore && selectedLocation.lore.length > 240 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setLocationLoreExpanded((value) => !value)}
                                                            className="mt-3 text-[9px] font-black uppercase tracking-[0.24em] text-cyan-300 transition-colors hover:text-white"
                                                        >
                                                            {locationLoreExpanded ? "Collapse" : "Expand"}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                                        <div className="rounded-3xl border border-white/5 bg-black/20 p-5">
                                            <div className="mb-4 flex items-center justify-between gap-3">
                                                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-300">Map Parameters</div>
                                                <span className={`rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] ${getStatusTone(promptModeLabel === "AI Assisted" ? "running" : "ready").pill}`}>
                                                    {promptModeLabel}
                                                </span>
                                            </div>
                                            <div className="grid gap-4 sm:grid-cols-2">
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
                                        </div>

                                        <section className="rounded-3xl border border-white/5 bg-black/20 p-5">
                                            <div className="mb-4 flex items-center justify-between gap-3">
                                                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-300">Prompt</div>
                                                <span className="text-[9px] uppercase tracking-[0.2em] text-gray-500">{mapPrompt.trim().length} chars</span>
                                            </div>
                                            <textarea
                                                value={mapPrompt}
                                                onChange={(event) => setMapPrompt(event.target.value)}
                                                placeholder="Ancient ruins hidden in a dense jungle, with a central approach and a blocky outer wall."
                                                rows={5}
                                                className="w-full resize-none rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm leading-relaxed text-white outline-none transition-all placeholder:text-gray-700 focus:border-indigo-500/40"
                                            />
                                            <div className="mt-3 text-[11px] leading-relaxed text-gray-500">
                                                Leave this empty for a procedural-only manifest or add direction for AI-assisted semantic hints.
                                            </div>
                                        </section>
                                    </section>

                                    <section className="rounded-3xl border border-white/5 bg-black/20 p-5">
                                        <div className="mb-4 flex items-center justify-between gap-3">
                                            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-sky-300">Crew Manifest</div>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedCharIds([])}
                                                disabled={selectedCharIds.length === 0}
                                                className="text-[9px] font-black uppercase tracking-[0.24em] text-gray-500 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                                Clear All
                                            </button>
                                        </div>

                                        <div className="rounded-2xl border border-sky-500/15 bg-sky-500/5 px-4 py-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="text-[9px] uppercase tracking-[0.2em] text-sky-200">Selected Party</div>
                                                <div className="text-sm font-black text-white">{selectedCharacters.length}</div>
                                            </div>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {selectedCharacters.length > 0 ? selectedCharacters.map((character) => (
                                                    <button
                                                        key={character.id}
                                                        type="button"
                                                        onClick={() => handleRemoveSelectedCharacter(character.id)}
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

                                        <div className="mt-4 flex flex-col gap-3 md:flex-row">
                                            <input
                                                value={crewSearch}
                                                onChange={(event) => setCrewSearch(event.target.value)}
                                                placeholder="Search crew by name, trait, occupation..."
                                                className="flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-gray-700 focus:border-sky-500/40"
                                            />
                                            <div className="flex flex-wrap gap-2">
                                                {(["all", "selected", "humans", "others"] as CrewFilter[]).map((filter) => (
                                                    <button
                                                        key={filter}
                                                        type="button"
                                                        onClick={() => setCrewFilter(filter)}
                                                        className={`rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] transition-all ${crewFilter === filter
                                                            ? "border-sky-500/40 bg-sky-500/10 text-sky-100"
                                                            : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:text-white"}`}
                                                    >
                                                        {filter}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="mt-4 max-h-[360px] overflow-y-auto rounded-2xl border border-white/5 bg-black/20 custom-scrollbar">
                                            {filteredCharacters.length > 0 ? filteredCharacters.map((character) => {
                                                const isSelected = selectedCharIds.includes(character.id);
                                                const characterKind = getCharacterKind(character);
                                                return (
                                                    <button
                                                        key={character.id}
                                                        type="button"
                                                        onClick={() => handleToggleCharacter(character.id)}
                                                        className={`flex w-full items-center gap-3 border-b border-white/5 px-4 py-3 text-left transition-all last:border-b-0 ${isSelected
                                                            ? "bg-sky-500/10"
                                                            : "hover:bg-white/[0.03]"}`}
                                                    >
                                                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border ${isSelected ? "border-sky-400/40 bg-sky-500/10" : "border-white/10 bg-black/40"}`}>
                                                            {character.portraitUrl ? (
                                                                <img src={character.portraitUrl} alt="" className="h-full w-full object-cover" />
                                                            ) : (
                                                                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white">{getCharacterInitials(character)}</span>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="truncate text-sm font-bold text-white">{character.name}</span>
                                                                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-gray-400">
                                                                    {characterKind}
                                                                </span>
                                                            </div>
                                                            <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-gray-500">
                                                                LVL {character.level} • {getCharacterLabel(character)}
                                                            </div>
                                                        </div>
                                                        <div className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${isSelected
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

                                    <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                                        <div className="rounded-3xl border border-white/5 bg-black/20 p-5">
                                            <div className="mb-4 flex items-center justify-between gap-3">
                                                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-300">Biome Selection</div>
                                                <span className="text-[9px] uppercase tracking-[0.2em] text-gray-500">{selectedBiomeOptions.length} variants</span>
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
                                                                className={`rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-[0.2em] transition-all ${selectedBiomeName === name
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
                                                                className={`flex w-full items-center justify-between gap-3 border-b border-white/5 px-4 py-3 text-left transition-all last:border-b-0 ${selectedPackId === pack.batchId
                                                                    ? "bg-emerald-500/10"
                                                                    : "hover:bg-white/[0.03]"}`}
                                                            >
                                                                <div className="min-w-0">
                                                                    <div className="truncate text-[11px] font-bold uppercase tracking-[0.18em] text-white">{pack.batchName || pack.name || `Batch ${String(pack.batchId).slice(0, 6)}`}</div>
                                                                    <div className="mt-1 text-[10px] text-gray-500">
                                                                        {pack.source === "pack"
                                                                            ? `${Array.isArray(pack.textures) ? pack.textures.length : 0} textures • ${Array.isArray(pack.sprites) ? pack.sprites.length : 0} sprites`
                                                                            : `${typeof pack.textureCount === "number" ? pack.textureCount : 0} textures`}
                                                                    </div>
                                                                </div>
                                                                <div className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.18em] ${selectedPackId === pack.batchId
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

                                        <div className="rounded-3xl border border-white/5 bg-black/20 p-5">
                                            <div className="mb-4 flex items-center justify-between gap-3">
                                                <div className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-300">Target Structures</div>
                                                <span className="text-[9px] uppercase tracking-[0.2em] text-gray-500">{selectedStructureIds.length} selected</span>
                                            </div>
                                            {availableStructures.length === 0 ? (
                                                <div className="rounded-2xl border border-white/5 bg-black/30 px-4 py-4 text-[11px] text-gray-500">
                                                    No structure packs found.
                                                </div>
                                            ) : (
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
                                                                className={`flex w-full items-start gap-3 border-b border-white/5 px-4 py-3 text-left transition-all last:border-b-0 ${isSelected
                                                                    ? "bg-amber-500/10"
                                                                    : "hover:bg-white/[0.03]"}`}
                                                            >
                                                                <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-[10px] font-black uppercase tracking-[0.18em] ${isSelected
                                                                    ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                                                                    : "border-white/10 bg-black/40 text-gray-500"}`}>
                                                                    {structure.source === "pack" ? "Pack" : "Batch"}
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="truncate text-[11px] font-bold uppercase tracking-[0.18em] text-white">{label}</div>
                                                                    <div className="mt-1 text-[10px] leading-relaxed text-gray-500">{description}</div>
                                                                </div>
                                                                <div className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.18em] ${isSelected
                                                                    ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                                                                    : "border-white/10 bg-white/5 text-gray-500"}`}>
                                                                    {isSelected ? "Selected" : "Add"}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
