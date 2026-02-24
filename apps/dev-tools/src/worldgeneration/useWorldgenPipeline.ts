import { useState, useCallback, useEffect, useRef } from "react";

// ── Pipeline Stage Definition ──

export interface PipelineStage {
    id: string;
    name: string;
    description: string;
    /** Which output files this stage produces */
    outputs: string[];
    /** Stage dependencies — IDs of stages that must complete first */
    requires: string[];
}

export const PIPELINE_STAGES: PipelineStage[] = [
    {
        id: "normalize",
        name: "Normalize Albedo",
        description: "Flatten input map by removing baked lighting and shadows",
        outputs: ["albedo_flat.png"],
        requires: [],
    },
    {
        id: "landmask",
        name: "Land Mask",
        description: "Segment land vs water from RGB color heuristics",
        outputs: ["landmask.png"],
        requires: ["normalize"],
    },
    {
        id: "height",
        name: "Height Reconstruction",
        description: "Synthesize elevation field from albedo features and noise",
        outputs: ["height16.png"],
        requires: ["normalize", "landmask"],
    },
    {
        id: "rivers",
        name: "Rivers & Flow",
        description: "D8 flow direction, accumulation, and river mask extraction",
        outputs: ["river_mask.png"],
        requires: ["height", "landmask"],
    },
    {
        id: "biome",
        name: "Biome Classification",
        description: "Classify biomes from latitude, elevation, slope, and coast distance",
        outputs: ["biome.png"],
        requires: ["height", "landmask"],
    },
    {
        id: "suitability",
        name: "Suitability Map",
        description: "Compute settlement density from rivers, coast, slope, and biome",
        outputs: ["suitability.bin"],
        requires: ["rivers", "biome"],
    },
    {
        id: "seeds",
        name: "Seed Placement",
        description: "Place county seeds using weighted Poisson disk sampling",
        outputs: ["seeds.json"],
        requires: ["suitability"],
    },
    {
        id: "partition",
        name: "Province Growth",
        description: "Multi-source Dijkstra partitioning with cost-aware borders",
        outputs: ["province_id.png"],
        requires: ["seeds", "height", "rivers"],
    },
    {
        id: "postprocess",
        name: "Postprocessing",
        description: "Enforce contiguity, min area, and border smoothing",
        outputs: ["province_id.png"],
        requires: ["partition"],
    },
    {
        id: "adjacency",
        name: "Adjacency Graph",
        description: "Build province neighbor graph with border/river crossing info",
        outputs: ["adjacency.json"],
        requires: ["postprocess", "rivers"],
    },
    {
        id: "clustering",
        name: "Hierarchy Clustering",
        description: "Group counties into duchies and kingdoms",
        outputs: ["duchy_id.png", "kingdom_id.png", "provinces.json", "duchies.json", "kingdoms.json"],
        requires: ["adjacency"],
    },
    {
        id: "naming",
        name: "Naming & Flavor",
        description: "Generate names, culture tags, and lore (placeholder)",
        outputs: ["provinces.json"],
        requires: ["clustering"],
    },
];

// ── Stage Status ──

export type StageStatus = "pending" | "ready" | "running" | "completed" | "failed";

export interface StageState {
    status: StageStatus;
    progress: number;
    jobId: string | null;
    error: string | null;
    /** Timestamp of last successful completion */
    completedAt: number | null;
}

// ── Pipeline Config ──

export interface WorldgenConfig {
    counties: number;
    minCountyArea: number;
    seedRadiusMin: number;
    seedRadiusMax: number;
    costSlope: number;
    costRiverCrossing: number;
    costRidgeCrossing: number;
    duchySizeMin: number;
    duchySizeMax: number;
    kingdomSizeMin: number;
    kingdomSizeMax: number;
    smoothIterations: number;
}

export const DEFAULT_WORLDGEN_CONFIG: WorldgenConfig = {
    counties: 500,
    minCountyArea: 100,
    seedRadiusMin: 8,
    seedRadiusMax: 40,
    costSlope: 2.0,
    costRiverCrossing: 5.0,
    costRidgeCrossing: 3.0,
    duchySizeMin: 4,
    duchySizeMax: 8,
    kingdomSizeMin: 6,
    kingdomSizeMax: 12,
    smoothIterations: 2,
};

const API_BASE = "http://127.0.0.1:8787";

// ── Hook ──

export function useWorldgenPipeline(planetId: string | null) {
    const [stages, setStages] = useState<Record<string, StageState>>(() => {
        const init: Record<string, StageState> = {};
        for (const stage of PIPELINE_STAGES) {
            init[stage.id] = { status: "pending", progress: 0, jobId: null, error: null, completedAt: null };
        }
        return init;
    });
    const [config, setConfig] = useState<WorldgenConfig>({ ...DEFAULT_WORLDGEN_CONFIG });
    const pollRef = useRef<number | null>(null);

    // Compute "ready" statuses based on dependencies
    useEffect(() => {
        setStages(prev => {
            const next = { ...prev };
            for (const stage of PIPELINE_STAGES) {
                const current = next[stage.id];
                if (current.status === "pending") {
                    const depsCompleted = stage.requires.every(dep => next[dep]?.status === "completed");
                    if (depsCompleted && (stage.requires.length === 0 || stage.requires.length > 0)) {
                        next[stage.id] = { ...current, status: stage.requires.length === 0 ? "ready" : depsCompleted ? "ready" : "pending" };
                    }
                }
            }
            return next;
        });
    }, [stages]);

    // Load pipeline status from backend
    const loadStatus = useCallback(async () => {
        if (!planetId) return;
        try {
            const res = await fetch(`${API_BASE}/api/worldgen/${planetId}/status`);
            if (res.ok) {
                const data = await res.json();
                setStages(prev => {
                    const next = { ...prev };
                    for (const [stageId, info] of Object.entries(data.stages || {})) {
                        if (next[stageId]) {
                            const stageInfo = info as any;
                            next[stageId] = {
                                ...next[stageId],
                                status: stageInfo.completed ? "completed" : next[stageId].status,
                                completedAt: stageInfo.completedAt || null,
                            };
                        }
                    }
                    // Recompute readiness
                    for (const stage of PIPELINE_STAGES) {
                        if (next[stage.id].status === "pending" || next[stage.id].status === "ready") {
                            const depsCompleted = stage.requires.every(dep => next[dep]?.status === "completed");
                            next[stage.id] = {
                                ...next[stage.id],
                                status: depsCompleted ? "ready" : "pending",
                            };
                        }
                    }
                    return next;
                });
            }
        } catch (err) {
            console.error("Failed to load pipeline status", err);
        }
    }, [planetId]);

    useEffect(() => {
        loadStatus();
    }, [planetId, loadStatus]);

    // Run a specific stage
    const runStage = useCallback(async (stageId: string) => {
        if (!planetId) return;

        setStages(prev => ({
            ...prev,
            [stageId]: { ...prev[stageId], status: "running", progress: 0, error: null },
        }));

        try {
            const res = await fetch(`${API_BASE}/api/worldgen/${planetId}/run/${stageId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ config }),
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || `HTTP ${res.status}`);
            }

            const { jobId } = await res.json();

            setStages(prev => ({
                ...prev,
                [stageId]: { ...prev[stageId], jobId },
            }));

            // Start polling
            const poll = () => {
                const interval = window.setInterval(async () => {
                    try {
                        const statusRes = await fetch(`${API_BASE}/api/worldgen/${planetId}/job/${jobId}`);
                        if (!statusRes.ok) return;
                        const jobData = await statusRes.json();

                        setStages(prev => {
                            const current = prev[stageId];
                            if (jobData.status === "completed") {
                                window.clearInterval(interval);
                                // Trigger readiness recomputation
                                const next = { ...prev };
                                next[stageId] = {
                                    ...current,
                                    status: "completed",
                                    progress: 100,
                                    completedAt: Date.now(),
                                };
                                // Update downstream stages
                                for (const stage of PIPELINE_STAGES) {
                                    if (stage.requires.includes(stageId) && next[stage.id].status === "pending") {
                                        const depsCompleted = stage.requires.every(dep => next[dep]?.status === "completed");
                                        if (depsCompleted) {
                                            next[stage.id] = { ...next[stage.id], status: "ready" };
                                        }
                                    }
                                }
                                return next;
                            } else if (jobData.status === "failed") {
                                window.clearInterval(interval);
                                return {
                                    ...prev,
                                    [stageId]: {
                                        ...current,
                                        status: "failed" as StageStatus,
                                        error: jobData.error || "Unknown error",
                                    },
                                };
                            } else {
                                return {
                                    ...prev,
                                    [stageId]: {
                                        ...current,
                                        progress: jobData.progress || current.progress,
                                    },
                                };
                            }
                        });
                    } catch {
                        // Polling failure — ignore, retry on next tick
                    }
                }, 800);
                return interval;
            };

            pollRef.current = poll();
        } catch (err: any) {
            setStages(prev => ({
                ...prev,
                [stageId]: {
                    ...prev[stageId],
                    status: "failed",
                    error: err.message || "Failed to start stage",
                },
            }));
        }
    }, [planetId, config]);

    // Reset a stage (and downstream)
    const resetStage = useCallback((stageId: string) => {
        setStages(prev => {
            const next = { ...prev };
            const toReset = new Set<string>([stageId]);
            // Find all downstream stages
            let changed = true;
            while (changed) {
                changed = false;
                for (const stage of PIPELINE_STAGES) {
                    if (!toReset.has(stage.id) && stage.requires.some(dep => toReset.has(dep))) {
                        toReset.add(stage.id);
                        changed = true;
                    }
                }
            }
            for (const id of toReset) {
                next[id] = { status: "pending", progress: 0, jobId: null, error: null, completedAt: null };
            }
            // Recompute readiness
            for (const stage of PIPELINE_STAGES) {
                if (next[stage.id].status === "pending") {
                    const depsCompleted = stage.requires.every(dep => next[dep]?.status === "completed");
                    if (depsCompleted) {
                        next[stage.id] = { ...next[stage.id], status: "ready" };
                    }
                }
            }
            return next;
        });
    }, []);

    // Cleanup
    useEffect(() => {
        return () => {
            if (pollRef.current) {
                window.clearInterval(pollRef.current);
            }
        };
    }, []);

    return {
        stages,
        config,
        setConfig,
        runStage,
        resetStage,
        loadStatus,
    };
}
