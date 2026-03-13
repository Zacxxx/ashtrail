import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
    BaselineEntityId,
    BaselineScope,
    BiomeEntry,
    BiomeReport,
    EcologyBaseline,
    EcologyBundle,
    EcologyJobState,
    EcologyStatus,
    FaunaEntry,
    FloraEntry,
    RefreshDerivedStatsResponse,
    WorldgenRegion,
} from "./types";

const API_BASE = "http://127.0.0.1:8787";

interface BulkEcologyGenerationRequest {
    prompt: string;
    count: number;
    biomeIds: string[];
}

function defaultFloraBodyProfile() {
    return {
        sizeClass: "medium" as const,
        heightMeters: 1,
        spreadMeters: 1,
        rootDepthMeters: 0.5,
        biomassKg: 10,
        lifespanYears: 5,
        growthRate: 50,
    };
}

function defaultFloraResourceProfile() {
    return {
        rarity: 20,
        yieldPerHarvest: 20,
        regrowthDays: 30,
        harvestDifficulty: 20,
        nutritionValue: 0,
        medicinalValue: 0,
        fuelValue: 0,
        structuralValue: 0,
        concealmentValue: 20,
    };
}

function defaultFloraHazardProfile() {
    return {
        toxicity: 0,
        irritation: 0,
        thorniness: 0,
        flammability: 20,
        resilience: 40,
    };
}

function defaultFaunaCombatProfile() {
    return {
        level: 1,
        strength: 10,
        agility: 10,
        intelligence: 6,
        wisdom: 6,
        endurance: 10,
        charisma: 6,
        critChance: 0.1,
        resistance: 0.1,
        socialBonus: 0,
        baseEvasion: 5,
        baseDefense: 2,
        baseHpBonus: 4,
        baseApBonus: 0,
        baseMpBonus: 0,
    };
}

function defaultFaunaBodyProfile() {
    return {
        sizeClass: "medium" as const,
        heightMeters: 1,
        lengthMeters: 1.5,
        weightKg: 60,
        locomotion: "walker" as const,
        naturalWeapon: "bite" as const,
        armorClass: "furred" as const,
    };
}

function defaultFaunaBehaviorProfile() {
    return {
        temperament: "docile" as const,
        activityCycle: "diurnal" as const,
        packSizeMin: 1,
        packSizeMax: 4,
        perception: 50,
        stealth: 20,
        trainability: 20,
    };
}

function createDraftId(prefix: string) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyBundle(worldId: string): EcologyBundle {
    return {
        worldId,
        updatedAt: new Date().toISOString(),
        baselines: [],
        flora: [],
        fauna: [],
        biomes: [],
        archetypes: { archetypes: [] },
        biomeModelSettings: {
            deterministicWeight: 1,
            colorWeight: 0.8,
            visionWeight: 0.6,
            smoothingPasses: 1,
            confidenceFloor: 0.45,
            visionModelId: "gemini-2.5-flash",
            visionTileSize: 1024,
            analysisVersion: "v1",
        },
    };
}

function normalizeBundle(bundle: any, worldId: string): EcologyBundle {
    const base = emptyBundle(worldId);
    return {
        ...base,
        ...bundle,
        updatedAt: bundle?.updatedAt || new Date().toISOString(),
        flora: Array.isArray(bundle?.flora)
            ? bundle.flora.map((entry: any) => ({
                biomeIds: [],
                vegetationAssetBatchIds: [],
                illustrationAssetBatchIds: [],
                illustrationAssets: [],
                bodyProfile: defaultFloraBodyProfile(),
                resourceProfile: defaultFloraResourceProfile(),
                hazardProfile: defaultFloraHazardProfile(),
                statsVersion: "v1",
                statsSource: "backfilled" as const,
                ...entry,
            }))
            : base.flora,
        fauna: Array.isArray(bundle?.fauna)
            ? bundle.fauna.map((entry: any) => ({
                biomeIds: [],
                illustrationAssetBatchIds: [],
                illustrationAssets: [],
                combatProfile: defaultFaunaCombatProfile(),
                bodyProfile: defaultFaunaBodyProfile(),
                behaviorProfile: defaultFaunaBehaviorProfile(),
                skillIds: [],
                statsVersion: "v1",
                statsSource: "backfilled" as const,
                ...entry,
            }))
            : base.fauna,
        biomes: Array.isArray(bundle?.biomes)
            ? bundle.biomes.map((entry: any) => ({
                archetypeId: entry?.archetypeId ?? entry?.id ?? "",
                typicalFloraIds: [],
                typicalFaunaIds: [],
                provinceIds: [],
                provinceCount: 0,
                pixelShare: 0,
                avgConfidence: 0,
                topCandidateIds: [],
                ...entry,
            }))
            : base.biomes,
        archetypes: bundle?.archetypes ?? base.archetypes,
        biomeModelSettings: {
            ...base.biomeModelSettings,
            ...(bundle?.biomeModelSettings ?? {}),
        },
    };
}

function markEntryApproved<T extends { status: string; approvedAt?: string }>(entry: T): T {
    return {
        ...entry,
        status: "approved",
        approvedAt: new Date().toISOString(),
    };
}

function markEntryDraft<T extends { status: string; approvedAt?: string }>(entry: T): T {
    return {
        ...entry,
        status: "draft",
        approvedAt: undefined,
    };
}

function sameEntityId(left: BaselineEntityId, right: BaselineEntityId) {
    return left === right;
}

export function useEcologyData(worldId: string | null) {
    const [bundle, setBundle] = useState<EcologyBundle | null>(null);
    const [biomeReport, setBiomeReport] = useState<BiomeReport | null>(null);
    const [regions, setRegions] = useState<WorldgenRegion[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [jobState, setJobState] = useState<EcologyJobState>({
        jobId: null,
        status: "idle",
        progress: 0,
        stage: "",
        error: null,
    });
    const pollRef = useRef<number | null>(null);

    const stopPolling = useCallback(() => {
        if (pollRef.current !== null) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const reload = useCallback(async () => {
        if (!worldId) {
            setBundle(null);
            setBiomeReport(null);
            setRegions([]);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const [bundleRes, regionsRes, biomeReportRes] = await Promise.all([
                fetch(`${API_BASE}/api/planet/ecology-data/${worldId}`),
                fetch(`${API_BASE}/api/planet/worldgen-regions/${worldId}`),
                fetch(`${API_BASE}/api/worldgen/${worldId}/biome/report`).catch(() => null),
            ]);
            if (!bundleRes.ok) {
                throw new Error(await bundleRes.text());
            }
            if (!regionsRes.ok) {
                throw new Error(await regionsRes.text());
            }
            const [bundleData, regionData] = await Promise.all([bundleRes.json(), regionsRes.json()]);
            setBundle(normalizeBundle(bundleData, worldId));
            setRegions(Array.isArray(regionData) ? regionData : []);
            if (biomeReportRes && biomeReportRes.ok) {
                setBiomeReport(await biomeReportRes.json());
            } else {
                setBiomeReport(null);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load ecology data.");
            setBundle(worldId ? emptyBundle(worldId) : null);
            setBiomeReport(null);
        } finally {
            setIsLoading(false);
        }
    }, [worldId]);

    useEffect(() => {
        void reload();
        return () => stopPolling();
    }, [reload, stopPolling]);

    const saveBundle = useCallback(
        async (nextBundle: EcologyBundle) => {
            if (!worldId) return null;
            setIsSaving(true);
            setError(null);
            try {
                const response = await fetch(`${API_BASE}/api/planet/ecology-data/${worldId}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(nextBundle),
                });
                if (!response.ok) {
                    throw new Error(await response.text());
                }
                const saved = await response.json();
                const normalized = normalizeBundle(saved, worldId);
                setBundle(normalized);
                return normalized as EcologyBundle;
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to save ecology data.");
                return null;
            } finally {
                setIsSaving(false);
            }
        },
        [worldId],
    );

    const pollJob = useCallback(
        (jobId: string) => {
            stopPolling();
            pollRef.current = window.setInterval(async () => {
                try {
                    const response = await fetch(`${API_BASE}/api/planet/ecology-jobs/${jobId}`);
                    if (!response.ok) return;
                    const data = await response.json();
                    const status = data.status as EcologyJobState["status"];
                    setJobState({
                        jobId,
                        status,
                        progress: data.progress || 0,
                        stage: data.currentStage || "",
                        error: data.error,
                    });
                    if (status === "completed") {
                        stopPolling();
                        await reload();
                    } else if (status === "failed") {
                        stopPolling();
                    }
                } catch (err) {
                    stopPolling();
                    setJobState({
                        jobId,
                        status: "failed",
                        progress: 0,
                        stage: "Failed to poll ecology job",
                        error: err instanceof Error ? err.message : "Unknown polling error",
                    });
                }
            }, 900);
        },
        [reload, stopPolling],
    );

    const startGeneration = useCallback(
        async (path: string) => {
            try {
                const response = await fetch(`${API_BASE}${path}`, { method: "POST" });
                if (!response.ok) {
                    throw new Error(await response.text());
                }
                const data = await response.json();
                setJobState({
                    jobId: data.jobId,
                    status: "queued",
                    progress: 0,
                    stage: "Queued ecology generation",
                    error: null,
                });
                pollJob(data.jobId);
            } catch (err) {
                setJobState({
                    jobId: null,
                    status: "failed",
                    progress: 0,
                    stage: "Failed to start ecology generation",
                    error: err instanceof Error ? err.message : "Unknown start error",
                });
            }
        },
        [pollJob],
    );

    const updateFlora = useCallback(
        async (entry: FloraEntry) => {
            if (!bundle) return null;
            const next = structuredClone(bundle) as EcologyBundle;
            const index = next.flora.findIndex((candidate) => candidate.id === entry.id);
            const normalized = entry.status === "approved" ? markEntryDraft(entry) : entry;
            if (index >= 0) next.flora[index] = normalized;
            else next.flora.push(normalized);
            return saveBundle(next);
        },
        [bundle, saveBundle],
    );

    const createFlora = useCallback(async () => {
        if (!bundle) return null;
        const next = structuredClone(bundle) as EcologyBundle;
        const id = createDraftId("flora");
        next.flora.unshift({
            id,
            status: "draft",
            name: "New Flora",
            category: "tree",
            description: "",
            ecologicalRoles: [],
            adaptations: [],
            edibility: "none",
            agricultureValue: 0,
            biomeIds: [],
            vegetationAssetBatchIds: [],
            illustrationAssetBatchIds: [],
            illustrationAssets: [],
            bodyProfile: defaultFloraBodyProfile(),
            resourceProfile: defaultFloraResourceProfile(),
            hazardProfile: defaultFloraHazardProfile(),
            statsVersion: "v1",
            statsSource: "manual",
        });
        const saved = await saveBundle(next);
        return saved ? id : null;
    }, [bundle, saveBundle]);

    const deleteFlora = useCallback(
        async (id: string) => {
            if (!bundle) return null;
            const next = structuredClone(bundle) as EcologyBundle;
            next.flora = next.flora.filter((entry) => entry.id !== id);
            next.biomes = next.biomes.map((entry) => ({
                ...entry,
                typicalFloraIds: entry.typicalFloraIds.filter((floraId) => floraId !== id),
            }));
            return saveBundle(next);
        },
        [bundle, saveBundle],
    );

    const updateFauna = useCallback(
        async (entry: FaunaEntry) => {
            if (!bundle) return null;
            const next = structuredClone(bundle) as EcologyBundle;
            const index = next.fauna.findIndex((candidate) => candidate.id === entry.id);
            const normalized = entry.status === "approved" ? markEntryDraft(entry) : entry;
            if (index >= 0) next.fauna[index] = normalized;
            else next.fauna.push(normalized);
            return saveBundle(next);
        },
        [bundle, saveBundle],
    );

    const createFauna = useCallback(async () => {
        if (!bundle) return null;
        const next = structuredClone(bundle) as EcologyBundle;
        const id = createDraftId("fauna");
        next.fauna.unshift({
            id,
            status: "draft",
            name: "New Fauna",
            category: "herbivore",
            description: "",
            ecologicalRoles: [],
            adaptations: [],
            domesticationPotential: 0,
            dangerLevel: 0,
            biomeIds: [],
            earthAnalog: "",
            ancestralStock: "",
            evolutionaryPressures: [],
            mutationSummary: "",
            divergenceSummary: "",
            illustrationAssetBatchIds: [],
            illustrationAssets: [],
            combatProfile: defaultFaunaCombatProfile(),
            bodyProfile: defaultFaunaBodyProfile(),
            behaviorProfile: defaultFaunaBehaviorProfile(),
            skillIds: [],
            statsVersion: "v1",
            statsSource: "manual",
        });
        const saved = await saveBundle(next);
        return saved ? id : null;
    }, [bundle, saveBundle]);

    const deleteFauna = useCallback(
        async (id: string) => {
            if (!bundle) return null;
            const next = structuredClone(bundle) as EcologyBundle;
            next.fauna = next.fauna.filter((entry) => entry.id !== id);
            next.biomes = next.biomes.map((entry) => ({
                ...entry,
                typicalFaunaIds: entry.typicalFaunaIds.filter((faunaId) => faunaId !== id),
            }));
            return saveBundle(next);
        },
        [bundle, saveBundle],
    );

    const generateFloraBatch = useCallback(
        async (request: BulkEcologyGenerationRequest) => {
            if (!worldId) return [];
            setError(null);
            const response = await fetch(`${API_BASE}/api/planet/ecology-data/${worldId}/generate/flora-batch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(request),
            });
            if (!response.ok) {
                const message = await response.text();
                setError(message || "Failed to generate flora batch.");
                throw new Error(message || "Failed to generate flora batch.");
            }
            const data = await response.json();
            const entries = Array.isArray(data?.entries) ? data.entries as FloraEntry[] : [];
            setBundle((current) => {
                if (!current) return current;
                return {
                    ...current,
                    flora: [...entries, ...current.flora],
                    updatedAt: new Date().toISOString(),
                };
            });
            return entries;
        },
        [worldId],
    );

    const generateFaunaBatch = useCallback(
        async (request: BulkEcologyGenerationRequest) => {
            if (!worldId) return [];
            setError(null);
            const response = await fetch(`${API_BASE}/api/planet/ecology-data/${worldId}/generate/fauna-batch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(request),
            });
            if (!response.ok) {
                const message = await response.text();
                setError(message || "Failed to generate fauna batch.");
                throw new Error(message || "Failed to generate fauna batch.");
            }
            const data = await response.json();
            const entries = Array.isArray(data?.entries) ? data.entries as FaunaEntry[] : [];
            setBundle((current) => {
                if (!current) return current;
                return {
                    ...current,
                    fauna: [...entries, ...current.fauna],
                    updatedAt: new Date().toISOString(),
                };
            });
            return entries;
        },
        [worldId],
    );

    const refreshDerivedStats = useCallback(async () => {
        if (!worldId) return null;
        setError(null);
        const response = await fetch(`${API_BASE}/api/planet/ecology-data/${worldId}/refresh-derived-stats`, {
            method: "POST",
        });
        if (!response.ok) {
            const message = await response.text();
            setError(message || "Failed to refresh ecology stats.");
            throw new Error(message || "Failed to refresh ecology stats.");
        }
        const data = await response.json() as RefreshDerivedStatsResponse;
        await reload();
        return data;
    }, [reload, worldId]);

    const attachFloraIllustrationBatch = useCallback(
        async (floraIds: string[], batchId: string, filenamesById?: Record<string, string>) => {
            if (!worldId || floraIds.length === 0) return null;
            const latestResponse = await fetch(`${API_BASE}/api/planet/ecology-data/${worldId}`);
            if (!latestResponse.ok) {
                throw new Error(await latestResponse.text());
            }
            const next = normalizeBundle(await latestResponse.json(), worldId);
            next.flora = next.flora.map((entry) =>
                floraIds.includes(entry.id)
                    ? {
                        ...entry,
                        illustrationAssetBatchIds: Array.from(new Set([...(entry.illustrationAssetBatchIds ?? []), batchId])),
                        illustrationAssets: filenamesById?.[entry.id]
                            ? Array.from(
                                new Map(
                                    [...(entry.illustrationAssets ?? []), { batchId, filename: filenamesById[entry.id] }]
                                        .map((asset) => [`${asset.batchId}:${asset.filename}`, asset]),
                                ).values(),
                            )
                            : (entry.illustrationAssets ?? []),
                    }
                    : entry,
            );
            return saveBundle(next);
        },
        [saveBundle, worldId],
    );

    const attachFaunaIllustrationBatch = useCallback(
        async (faunaIds: string[], batchId: string, filenamesById?: Record<string, string>) => {
            if (!worldId || faunaIds.length === 0) return null;
            const latestResponse = await fetch(`${API_BASE}/api/planet/ecology-data/${worldId}`);
            if (!latestResponse.ok) {
                throw new Error(await latestResponse.text());
            }
            const next = normalizeBundle(await latestResponse.json(), worldId);
            next.fauna = next.fauna.map((entry) =>
                faunaIds.includes(entry.id)
                    ? {
                        ...entry,
                        illustrationAssetBatchIds: Array.from(new Set([...(entry.illustrationAssetBatchIds ?? []), batchId])),
                        illustrationAssets: filenamesById?.[entry.id]
                            ? Array.from(
                                new Map(
                                    [...(entry.illustrationAssets ?? []), { batchId, filename: filenamesById[entry.id] }]
                                        .map((asset) => [`${asset.batchId}:${asset.filename}`, asset]),
                                ).values(),
                            )
                            : (entry.illustrationAssets ?? []),
                    }
                    : entry,
            );
            return saveBundle(next);
        },
        [saveBundle, worldId],
    );

    const updateBiome = useCallback(
        async (entry: BiomeEntry) => {
            if (!bundle) return null;
            const next = structuredClone(bundle) as EcologyBundle;
            const index = next.biomes.findIndex((candidate) => candidate.id === entry.id);
            const normalized = entry.status === "approved" ? markEntryDraft(entry) : entry;
            if (index >= 0) next.biomes[index] = normalized;
            else next.biomes.push(normalized);
            return saveBundle(next);
        },
        [bundle, saveBundle],
    );

    const updateArchetype = useCallback(
        async (archetype: any) => {
            if (!bundle) return null;
            const next = structuredClone(bundle) as EcologyBundle;
            const index = next.archetypes.archetypes.findIndex((a) => a.id === archetype.id);
            if (index >= 0) next.archetypes.archetypes[index] = archetype;
            else next.archetypes.archetypes.push(archetype);
            return saveBundle(next);
        },
        [bundle, saveBundle],
    );

    const deleteArchetype = useCallback(
        async (id: string) => {
            if (!bundle) return null;
            const next = structuredClone(bundle) as EcologyBundle;
            next.archetypes.archetypes = next.archetypes.archetypes.filter((a) => a.id !== id);
            return saveBundle(next);
        },
        [bundle, saveBundle],
    );

    const updateBaseline = useCallback(
        async (baseline: EcologyBaseline) => {
            if (!bundle) return null;
            const next = structuredClone(bundle) as EcologyBundle;
            const index = next.baselines.findIndex(
                (entry) => entry.scope === baseline.scope && sameEntityId(entry.entityId, baseline.entityId),
            );
            const normalized = baseline.status === "approved" ? { ...baseline, status: "draft" as EcologyStatus, approvedAt: undefined } : baseline;
            if (index >= 0) next.baselines[index] = normalized;
            else next.baselines.push(normalized);
            return saveBundle(next);
        },
        [bundle, saveBundle],
    );

    const approveBaseline = useCallback(
        async (scope: BaselineScope, entityId: BaselineEntityId) => {
            if (!bundle) return null;
            const next = structuredClone(bundle) as EcologyBundle;
            const baseline = next.baselines.find(
                (entry) => entry.scope === scope && sameEntityId(entry.entityId, entityId),
            );
            if (!baseline) return null;
            baseline.status = "approved";
            baseline.approvedAt = new Date().toISOString();
            return saveBundle(next);
        },
        [bundle, saveBundle],
    );

    const approveEntryById = useCallback(
        async (kind: "flora" | "fauna" | "biomes", id: string) => {
            if (!bundle) return null;
            const next = structuredClone(bundle) as EcologyBundle;
            const targetList = next[kind];
            const entry = targetList.find((candidate) => candidate.id === id);
            if (!entry) return null;
            entry.status = "approved";
            entry.approvedAt = new Date().toISOString();
            return saveBundle(next);
        },
        [bundle, saveBundle],
    );

    const regionsByType = useMemo(
        () => ({
            kingdoms: regions.filter((entry) => entry.type === "Kingdom"),
            duchies: regions.filter((entry) => entry.type === "Duchy"),
        }),
        [regions],
    );

    const clearBiomes = useCallback(async () => {
        if (!bundle) return null;
        const next = structuredClone(bundle) as EcologyBundle;
        next.biomes = [];
        next.flora = next.flora.map(f => ({ ...f, biomeIds: [] }));
        next.fauna = next.fauna.map(f => ({ ...f, biomeIds: [] }));
        return saveBundle(next);
    }, [bundle, saveBundle]);

    const baselineLookup = useMemo(() => {
        const map = new Map<string, EcologyBaseline>();
        for (const baseline of bundle?.baselines ?? []) {
            map.set(`${baseline.scope}:${String(baseline.entityId)}`, baseline);
        }
        return map;
    }, [bundle]);

    return {
        bundle: bundle ?? (worldId ? emptyBundle(worldId) : null),
        biomeReport,
        regions,
        regionsByType,
        baselineLookup,
        isLoading,
        isSaving,
        error,
        jobState,
        reload,
        saveBundle,
        updateFlora,
        createFlora,
        deleteFlora,
        generateFloraBatch,
        attachFloraIllustrationBatch,
        updateFauna,
        createFauna,
        deleteFauna,
        generateFaunaBatch,
        refreshDerivedStats,
        attachFaunaIllustrationBatch,
        updateBaseline,
        approveBaseline,
        approveEntryById,
        updateBiome,
        clearBiomes,
        syncBiomesWithMap: () =>
            worldId ? startGeneration(`/api/planet/ecology-data/${worldId}/sync-biomes`) : Promise.resolve(),
        updateArchetype,
        deleteArchetype,
        generateWorldBaseline: () =>
            worldId ? startGeneration(`/api/planet/ecology-data/${worldId}/generate/world`) : Promise.resolve(),
        generateKingdomBaseline: (kingdomId: number) =>
            worldId ? startGeneration(`/api/planet/ecology-data/${worldId}/generate/kingdom/${kingdomId}`) : Promise.resolve(),
        generateDuchyBaseline: (duchyId: number) =>
            worldId ? startGeneration(`/api/planet/ecology-data/${worldId}/generate/duchy/${duchyId}`) : Promise.resolve(),
        generateBiomeDescription: (biomeId: string) =>
            worldId ? startGeneration(`/api/planet/ecology-data/${worldId}/generate/biome/${biomeId}`) : Promise.resolve(),
    };
}
