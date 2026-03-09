import { useEffect, useRef, useState } from "react";
import { Button } from "@ashtrail/ui";

const API_BASE = "http://127.0.0.1:8787";

type InspectorLayer = "provinces" | "duchies" | "kingdoms" | "continents";

interface ProvinceRefinementPanelProps {
    planetId: string | null;
    selectedId: number | null;
    activeLayer: InspectorLayer;
    onAppliedVariant?: (payload: {
        historyItem: any;
        variantId: string;
        textureUrl: string;
        parentId: string;
        applyMode?: string;
        overlayCount?: number;
    }) => void;
}

interface UpscaledImage {
    artifactId: string;
    planetId: string;
    provinceId: number;
    modelId: string;
    fallbackModelId?: string | null;
    prompt: string;
    createdAt: number;
    scale: number;
    artifactWidth: number;
    artifactHeight: number;
    bbox: { x: number; y: number; width: number; height: number };
    sourceWidth: number;
    sourceHeight: number;
    imageUrl: string;
}

interface ImageModel {
    id: string;
    label: string;
    available: boolean;
}

interface ImageModelCatalog {
    models: ImageModel[];
    defaultModelId: string;
    fallbackChain: string[];
}

interface RegionRecord {
    id: number;
    name: string;
}

interface WorldgenJobStatus {
    status: string;
    progress: number;
    currentStage: string;
    error?: string | null;
}

export function ProvinceRefinementPanel({
    planetId,
    selectedId,
    activeLayer,
    onAppliedVariant,
}: ProvinceRefinementPanelProps) {
    const [upscaledImages, setUpscaledImages] = useState<UpscaledImage[]>([]);
    const [regions, setRegions] = useState<Record<number, RegionRecord>>({});
    const [modelCatalog, setModelCatalog] = useState<ImageModelCatalog | null>(null);
    const [selectedModelId, setSelectedModelId] = useState<string>("");
    const [refinePrompt, setRefinePrompt] = useState("");
    const [refineTemperature, setRefineTemperature] = useState(0.35);
    const [refineScale, setRefineScale] = useState<2 | 4>(2);
    const [refineJobId, setRefineJobId] = useState<string | null>(null);
    const [refineRunning, setRefineRunning] = useState(false);
    const [refineProgress, setRefineProgress] = useState(0);
    const [refineStage, setRefineStage] = useState<string | null>(null);
    const [refineError, setRefineError] = useState<string | null>(null);
    const [deletingUpscaledId, setDeletingUpscaledId] = useState<string | null>(null);
    const [applyingUpscaledId, setApplyingUpscaledId] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const refinePollRef = useRef<number | null>(null);
    const canRefineProvince = activeLayer === "provinces" && selectedId !== null;

    useEffect(() => {
        if (!planetId) return;
        void loadUpscaledImages();
        void loadRegions();
        void loadImageModels();
    }, [planetId, activeLayer]);

    useEffect(() => {
        return () => {
            if (refinePollRef.current !== null) {
                window.clearInterval(refinePollRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!planetId) {
            stopRefinePolling();
            setRefineJobId(null);
            setRefineProgress(0);
            setRefineStage(null);
            setRefineRunning(false);
            setRefineError(null);
        }
    }, [planetId]);

    const stopRefinePolling = () => {
        if (refinePollRef.current !== null) {
            window.clearInterval(refinePollRef.current);
            refinePollRef.current = null;
        }
    };

    const loadImageModels = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/ai/image-models`);
            if (!res.ok) return;
            const data: ImageModelCatalog = await res.json();
            setModelCatalog(data);
            if (!selectedModelId) {
                setSelectedModelId(data.defaultModelId || data.models[0]?.id || "");
            }
        } catch (err) {
            console.error("Failed to load image model catalog:", err);
        }
    };

    const loadRegions = async () => {
        if (!planetId || activeLayer !== "provinces") return;
        try {
            const res = await fetch(`${API_BASE}/api/planets/${planetId}/worldgen/provinces.json`);
            if (!res.ok) return;
            const data: RegionRecord[] = await res.json();
            const next: Record<number, RegionRecord> = {};
            for (const record of data) next[record.id] = record;
            setRegions(next);
        } catch (err) {
            console.error("Failed to load province records:", err);
        }
    };

    const loadUpscaledImages = async () => {
        if (!planetId) return;
        try {
            const res = await fetch(`${API_BASE}/api/worldgen/${planetId}/upscaled`);
            if (!res.ok) return;
            const data = await res.json();
            setUpscaledImages(data.images || []);
        } catch (err) {
            console.error("Failed to load upscaled images:", err);
        }
    };

    const startRefinePolling = (jobId: string) => {
        stopRefinePolling();
        refinePollRef.current = window.setInterval(async () => {
            if (!planetId) {
                stopRefinePolling();
                return;
            }
            try {
                const res = await fetch(`${API_BASE}/api/worldgen/${planetId}/job/${jobId}`);
                if (!res.ok) return;
                const data: WorldgenJobStatus = await res.json();
                setRefineProgress(data.progress || 0);
                setRefineStage(data.currentStage || null);
                if (data.status === "completed") {
                    stopRefinePolling();
                    setRefineRunning(false);
                    setRefineJobId(null);
                    setRefineProgress(100);
                    await loadUpscaledImages();
                } else if (data.status === "failed" || data.status === "cancelled") {
                    stopRefinePolling();
                    setRefineRunning(false);
                    setRefineJobId(null);
                    if (data.status === "cancelled") {
                        setRefineError(null);
                        setRefineStage("Cancelled");
                    } else {
                        setRefineError(data.error || "Province refinement failed.");
                    }
                }
            } catch (err: any) {
                setRefineError(err.message || "Failed to poll province refinement.");
                stopRefinePolling();
                setRefineRunning(false);
                setRefineJobId(null);
            }
        }, 800);
    };

    const handleRefineProvince = async () => {
        if (!planetId || !canRefineProvince || refineRunning) return;
        setRefineError(null);
        setRefineRunning(true);
        setRefineStage("Queuing province refinement...");
        setRefineProgress(0);
        try {
            const res = await fetch(`${API_BASE}/api/worldgen/${planetId}/upscaled/province`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provinceId: selectedId,
                    prompt: refinePrompt.trim() || undefined,
                    modelId: selectedModelId || undefined,
                    temperature: Number.isFinite(refineTemperature) ? refineTemperature : undefined,
                    scale: refineScale,
                }),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to start province refinement.");
            }
            const data = await res.json();
            setRefineJobId(data.jobId);
            startRefinePolling(data.jobId);
        } catch (err: any) {
            setRefineRunning(false);
            setRefineStage(null);
            setRefineError(err.message || "Failed to start province refinement.");
        }
    };

    const handleCancelRefine = async () => {
        if (!planetId || !refineJobId) return;
        try {
            await fetch(`${API_BASE}/api/worldgen/${planetId}/job/${refineJobId}`, {
                method: "DELETE",
            });
            setRefineStage("Cancellation requested");
        } catch (err: any) {
            setRefineError(err.message || "Failed to cancel province refinement.");
        }
    };

    const handleApplyUpscaled = async (artifactId: string) => {
        if (!planetId || applyingUpscaledId) return;
        setApplyingUpscaledId(artifactId);
        setRefineError(null);
        try {
            const res = await fetch(`${API_BASE}/api/worldgen/${planetId}/upscaled/${encodeURIComponent(artifactId)}/apply`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to apply upscaled province.");
            }
            const data = await res.json();
            onAppliedVariant?.({
                historyItem: data.historyItem,
                variantId: data.variantId,
                textureUrl: data.textureUrl,
                parentId: data.parentId,
                applyMode: data.applyMode,
                overlayCount: data.overlayCount,
            });
        } catch (err: any) {
            setRefineError(err.message || "Failed to apply upscaled province.");
        } finally {
            setApplyingUpscaledId(null);
        }
    };

    const handleDeleteUpscaled = async (artifactId: string) => {
        if (!planetId || deletingUpscaledId) return;
        if (!window.confirm(`Delete upscaled artifact ${artifactId}?`)) return;

        setDeletingUpscaledId(artifactId);
        setDeleteError(null);
        try {
            const res = await fetch(`${API_BASE}/api/worldgen/${planetId}/upscaled/${encodeURIComponent(artifactId)}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to delete upscaled artifact.");
            }
            await loadUpscaledImages();
        } catch (err: any) {
            setDeleteError(err.message || "Failed to delete upscaled artifact.");
        } finally {
            setDeletingUpscaledId(null);
        }
    };

    if (!planetId) {
        return <div className="p-4 text-xs text-center text-gray-500 font-mono">NO PLANET ACTIVE</div>;
    }

    const selectedName = selectedId !== null && regions[selectedId] ? regions[selectedId].name : `ID: ${selectedId}`;

    return (
        <div className="flex flex-col gap-4 p-4 h-full">
            <div className="bg-[#1e1e1e]/60 border border-white/5 rounded-2xl p-4 shadow-lg backdrop-blur-md">
                <h2 className="text-[10px] font-black tracking-[0.2em] text-indigo-300 mb-4">PROVINCE REFINEMENT</h2>
                <p className="text-[11px] text-gray-400 leading-relaxed font-mono mb-4">
                    Refine one selected province into a high-resolution artifact, then apply it as a layered map variant.
                </p>

                <div className="text-left space-y-3">
                    <div>
                        <label className="block text-[9px] text-gray-500 font-mono mb-1">MODEL</label>
                        <select
                            value={selectedModelId}
                            onChange={(e) => setSelectedModelId(e.target.value)}
                            className="w-full bg-black/50 border border-white/10 rounded px-2 py-1.5 text-[10px] text-gray-200 font-mono"
                        >
                            {(modelCatalog?.models || []).map((model) => (
                                <option key={model.id} value={model.id}>
                                    {model.label} {model.available ? "" : "(Unavailable)"}
                                </option>
                            ))}
                        </select>
                        {modelCatalog && modelCatalog.fallbackChain.length > 0 && (
                            <p className="mt-1 text-[9px] text-gray-500 font-mono">
                                Fallback: {modelCatalog.fallbackChain.join(" -> ")}
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => setRefineScale(2)}
                            className={`px-2 py-1 text-[10px] font-black tracking-widest rounded border transition-all ${refineScale === 2
                                ? "border-indigo-400/60 text-indigo-200 bg-indigo-500/20"
                                : "border-white/10 text-gray-400 hover:text-gray-200 hover:border-white/20"
                                }`}
                        >
                            2X GENERATIVE
                        </button>
                        <button
                            type="button"
                            onClick={() => setRefineScale(4)}
                            className={`px-2 py-1 text-[10px] font-black tracking-widest rounded border transition-all ${refineScale === 4
                                ? "border-indigo-400/60 text-indigo-200 bg-indigo-500/20"
                                : "border-white/10 text-gray-400 hover:text-gray-200 hover:border-white/20"
                                }`}
                        >
                            4X GENERATIVE
                        </button>
                    </div>

                    <div>
                        <label className="block text-[9px] text-gray-500 font-mono mb-1">PROMPT (OPTIONAL)</label>
                        <textarea
                            value={refinePrompt}
                            onChange={(e) => setRefinePrompt(e.target.value)}
                            rows={2}
                            className="w-full bg-black/50 border border-white/10 rounded px-2 py-1.5 text-[10px] text-gray-200 font-mono resize-y"
                            placeholder="Enhance cliffs and river deltas while preserving topology..."
                        />
                    </div>
                    <div>
                        <label className="block text-[9px] text-gray-500 font-mono mb-1">
                            TEMPERATURE ({refineTemperature.toFixed(2)})
                        </label>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={refineTemperature}
                            onChange={(e) => setRefineTemperature(Number(e.target.value))}
                            className="w-full accent-cyan-500"
                        />
                    </div>

                    <Button
                        variant="primary"
                        onClick={handleRefineProvince}
                        disabled={!canRefineProvince || refineRunning || !selectedModelId}
                        className="w-full text-[10px] font-black tracking-widest bg-indigo-600/40 hover:bg-indigo-600/60 border border-indigo-500/40 disabled:opacity-50"
                    >
                        {refineRunning ? "REFINING..." : "REFINE SELECTED PROVINCE"}
                    </Button>

                    <Button
                        variant="secondary"
                        onClick={handleCancelRefine}
                        disabled={!refineJobId}
                        className="w-full text-[10px] font-black tracking-widest border border-red-500/40 text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                    >
                        CANCEL CURRENT JOB
                    </Button>

                    {!canRefineProvince && (
                        <p className="text-[10px] text-gray-500 font-mono">
                            Select a province while the Provinces layer is active.
                        </p>
                    )}
                    {canRefineProvince && (
                        <p className="text-[10px] text-gray-400 font-mono">
                            Selected: {selectedName}
                        </p>
                    )}
                    {(refineRunning || refineJobId || refineStage) && (
                        <div className="mt-1 text-left bg-black/30 border border-white/10 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] text-indigo-300 font-black tracking-widest">REFINE STATUS</span>
                                <span className="text-[10px] text-gray-400 font-mono">{refineProgress.toFixed(0)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden mb-2">
                                <div
                                    className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full transition-all duration-300"
                                    style={{ width: `${refineProgress}%` }}
                                />
                            </div>
                            {refineStage && <p className="text-[10px] text-gray-400 font-mono">{refineStage}</p>}
                        </div>
                    )}
                    {refineError && <p className="text-[10px] text-red-400 font-mono">{refineError}</p>}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-[#1e1e1e]/60 border border-white/5 rounded-2xl p-4 shadow-lg backdrop-blur-md">
                <h3 className="text-[10px] font-black tracking-[0.1em] text-indigo-300 mb-3 mt-1">UPSCALED PROVINCES</h3>
                {deleteError && <p className="text-[10px] text-red-400 font-mono mb-3">{deleteError}</p>}
                {upscaledImages.length === 0 && (
                    <p className="text-[10px] text-gray-500 font-mono text-center mb-4">No upscaled artifacts yet.</p>
                )}
                <div className="grid grid-cols-2 gap-3 pb-8">
                    {upscaledImages.map((img) => (
                        <div key={img.artifactId} className="bg-black/40 border border-white/10 rounded-xl overflow-hidden group">
                            <div className="aspect-square bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiMzMzMiLz48cGF0aCBkPSJNMCAwdjRoNHYtNEgweiIgZmlsbD0iIzQ0NCIvPjxwb2x5Z29uIHBvaW50cz0iNCA4IDggOCA4IDQgNCA0IiBmaWxsPSIjNDQ0Ii8+PC9zdmc+')] relative">
                                <img
                                    src={`${API_BASE}${img.imageUrl}`}
                                    className="absolute inset-0 w-full h-full object-contain p-2 group-hover:scale-105 transition-transform"
                                    alt={img.artifactId}
                                />
                            </div>
                            <div className="p-2 border-t border-white/5 bg-black/60">
                                <p className="text-[9px] text-indigo-300 font-black tracking-widest uppercase">
                                    PROVINCE {img.provinceId} • {img.scale}X
                                </p>
                                <p className="text-[9px] text-gray-500 font-mono truncate">{img.modelId}</p>
                                <p className="text-[9px] text-gray-500 font-mono">
                                    {img.artifactWidth}x{img.artifactHeight}
                                </p>
                                <p className="text-[9px] text-gray-500 font-mono">
                                    {new Date(img.createdAt).toLocaleString()}
                                </p>
                                <div className="mt-2 flex gap-1">
                                    <button
                                        type="button"
                                        onClick={() => handleApplyUpscaled(img.artifactId)}
                                        disabled={applyingUpscaledId !== null}
                                        className="flex-1 px-2 py-1 text-[8px] font-black tracking-widest rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
                                    >
                                        {applyingUpscaledId === img.artifactId ? "..." : "APPLY"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteUpscaled(img.artifactId)}
                                        disabled={deletingUpscaledId !== null}
                                        className="flex-1 px-2 py-1 text-[8px] font-black tracking-widest rounded border border-red-500/40 text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                                    >
                                        {deletingUpscaledId === img.artifactId ? "..." : "DELETE"}
                                    </button>
                                    <a
                                        href={`${API_BASE}${img.imageUrl}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="px-2 py-1 text-[8px] font-black tracking-widest rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/20"
                                    >
                                        OPEN
                                    </a>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
