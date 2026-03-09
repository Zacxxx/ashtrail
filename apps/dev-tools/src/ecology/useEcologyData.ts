import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
    BaselineEntityId,
    BaselineScope,
    ClimateProfile,
    EcologyBaseline,
    EcologyBundle,
    EcologyJobState,
    EcologyStatus,
    FaunaEntry,
    FloraEntry,
    ProvinceEcologyRecord,
    WorldgenRegion,
} from "./types";

const API_BASE = "http://127.0.0.1:8787";

function emptyBundle(worldId: string): EcologyBundle {
    return {
        worldId,
        updatedAt: new Date().toISOString(),
        baselines: [],
        climates: [],
        flora: [],
        fauna: [],
        provinces: [],
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
            setRegions([]);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const [bundleRes, regionsRes] = await Promise.all([
                fetch(`${API_BASE}/api/planet/ecology-data/${worldId}`),
                fetch(`${API_BASE}/api/planet/worldgen-regions/${worldId}`),
            ]);
            if (!bundleRes.ok) {
                throw new Error(await bundleRes.text());
            }
            if (!regionsRes.ok) {
                throw new Error(await regionsRes.text());
            }
            const [bundleData, regionData] = await Promise.all([bundleRes.json(), regionsRes.json()]);
            setBundle(bundleData);
            setRegions(Array.isArray(regionData) ? regionData : []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load ecology data.");
            setBundle(worldId ? emptyBundle(worldId) : null);
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
                setBundle(saved);
                return saved as EcologyBundle;
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

    const updateProvince = useCallback(
        async (record: ProvinceEcologyRecord) => {
            if (!bundle) return null;
            const next = structuredClone(bundle) as EcologyBundle;
            const index = next.provinces.findIndex((entry) => entry.provinceId === record.provinceId);
            const incoming = record.status === "approved" ? markEntryDraft(record) : record;
            if (index >= 0) next.provinces[index] = incoming;
            else next.provinces.push(incoming);
            return saveBundle(next);
        },
        [bundle, saveBundle],
    );

    const updateClimate = useCallback(
        async (entry: ClimateProfile) => {
            if (!bundle) return null;
            const next = structuredClone(bundle) as EcologyBundle;
            const index = next.climates.findIndex((candidate) => candidate.id === entry.id);
            const normalized = entry.status === "approved" ? markEntryDraft(entry) : entry;
            if (index >= 0) next.climates[index] = normalized;
            else next.climates.push(normalized);
            return saveBundle(next);
        },
        [bundle, saveBundle],
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
        async (kind: "climates" | "flora" | "fauna", id: string) => {
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

    const approveProvince = useCallback(
        async (provinceId: number) => {
            if (!bundle) return null;
            const next = structuredClone(bundle) as EcologyBundle;
            const province = next.provinces.find((entry) => entry.provinceId === provinceId);
            if (!province) return null;
            province.status = "approved";
            province.approvedAt = new Date().toISOString();
            next.climates = next.climates.map((entry) =>
                province.climateProfileIds.includes(entry.id) ? markEntryApproved(entry) : entry,
            );
            next.flora = next.flora.map((entry) =>
                province.floraIds.includes(entry.id) ? markEntryApproved(entry) : entry,
            );
            next.fauna = next.fauna.map((entry) =>
                province.faunaIds.includes(entry.id) ? markEntryApproved(entry) : entry,
            );
            return saveBundle(next);
        },
        [bundle, saveBundle],
    );

    const regionsByType = useMemo(
        () => ({
            kingdoms: regions.filter((entry) => entry.type === "Kingdom"),
            duchies: regions.filter((entry) => entry.type === "Duchy"),
            provinces: regions.filter((entry) => entry.type === "Province"),
        }),
        [regions],
    );

    const baselineLookup = useMemo(() => {
        const map = new Map<string, EcologyBaseline>();
        for (const baseline of bundle?.baselines ?? []) {
            map.set(`${baseline.scope}:${String(baseline.entityId)}`, baseline);
        }
        return map;
    }, [bundle]);

    return {
        bundle: bundle ?? (worldId ? emptyBundle(worldId) : null),
        regions,
        regionsByType,
        baselineLookup,
        isLoading,
        isSaving,
        error,
        jobState,
        reload,
        saveBundle,
        updateProvince,
        updateClimate,
        updateFlora,
        updateFauna,
        updateBaseline,
        approveBaseline,
        approveProvince,
        approveEntryById,
        generateWorldBaseline: () =>
            worldId ? startGeneration(`/api/planet/ecology-data/${worldId}/generate/world`) : Promise.resolve(),
        generateKingdomBaseline: (kingdomId: number) =>
            worldId ? startGeneration(`/api/planet/ecology-data/${worldId}/generate/kingdom/${kingdomId}`) : Promise.resolve(),
        generateDuchyBaseline: (duchyId: number) =>
            worldId ? startGeneration(`/api/planet/ecology-data/${worldId}/generate/duchy/${duchyId}`) : Promise.resolve(),
        generateProvince: (provinceId: number) =>
            worldId ? startGeneration(`/api/planet/ecology-data/${worldId}/generate/province/${provinceId}`) : Promise.resolve(),
    };
}
