import { useEffect, useRef, useState } from "react";
import { Button } from "@ashtrail/ui";

const API_BASE = "http://127.0.0.1:8787";

export type InspectorLayer = "provinces" | "duchies" | "kingdoms" | "continents";

interface GeographyIsolatorPanelProps {
    planetId: string | null;
    selectedId: number | null;
    activeLayer: InspectorLayer;
}

interface IsolatedImage {
    filename: string;
    entityType: string;
    entityId: number;
    url: string;
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

export function GeographyIsolatorPanel({
    planetId,
    selectedId,
    activeLayer,
}: GeographyIsolatorPanelProps) {
    const [isolatedImages, setIsolatedImages] = useState<IsolatedImage[]>([]);
    const [loading, setLoading] = useState(false);
    const [isolating, setIsolating] = useState(false);
    const [deletingFilename, setDeletingFilename] = useState<string | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [regions, setRegions] = useState<Record<number, RegionRecord>>({});
    const [bulkJobId, setBulkJobId] = useState<string | null>(null);
    const [bulkProgress, setBulkProgress] = useState(0);
    const [bulkStage, setBulkStage] = useState<string | null>(null);
    const [bulkRunning, setBulkRunning] = useState(false);
    const [bulkError, setBulkError] = useState<string | null>(null);
    const bulkPollRef = useRef<number | null>(null);

    const entityTypeStr = activeLayer.endsWith("s") ? activeLayer.slice(0, -1) : activeLayer;

    useEffect(() => {
        if (!planetId) return;
        void loadImages();
        void loadRegions();
    }, [planetId, activeLayer]);

    useEffect(() => {
        return () => {
            if (bulkPollRef.current !== null) window.clearInterval(bulkPollRef.current);
        };
    }, []);

    useEffect(() => {
        if (!planetId) {
            if (bulkPollRef.current !== null) {
                window.clearInterval(bulkPollRef.current);
                bulkPollRef.current = null;
            }
            setBulkJobId(null);
            setBulkProgress(0);
            setBulkStage(null);
            setBulkRunning(false);
            setBulkError(null);
        }
    }, [planetId]);

    const loadRegions = async () => {
        if (!planetId) return;
        try {
            const res = await fetch(`${API_BASE}/api/planets/${planetId}/worldgen/${activeLayer}.json`);
            if (res.ok) {
                const data: RegionRecord[] = await res.json();
                const map: Record<number, RegionRecord> = {};
                for (const r of data) map[r.id] = r;
                setRegions(map);
            }
        } catch (err) {
            console.error("Failed to load regions:", err);
        }
    };

    const loadImages = async () => {
        if (!planetId) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/api/worldgen/${planetId}/isolated`);
            if (res.ok) {
                const data = await res.json();
                setIsolatedImages(data.images || []);
            } else {
                setError("Failed to load isolated images.");
            }
        } catch (err: any) {
            setError(err.message || "Failed to load isolated images.");
        } finally {
            setLoading(false);
        }
    };

    const handleIsolate = async () => {
        if (!planetId || selectedId === null) return;
        setIsolating(true);
        setError(null);
        try {
            const res = await fetch(`${API_BASE}/api/worldgen/${planetId}/isolate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    entityType: entityTypeStr,
                    entityId: selectedId,
                }),
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to isolate");
            }
            await loadImages();
        } catch (err: any) {
            setError(err.message || "Failed to isolate region.");
        } finally {
            setIsolating(false);
        }
    };

    const stopBulkPolling = () => {
        if (bulkPollRef.current !== null) {
            window.clearInterval(bulkPollRef.current);
            bulkPollRef.current = null;
        }
    };

    const startBulkPolling = (jobId: string) => {
        stopBulkPolling();
        bulkPollRef.current = window.setInterval(async () => {
            if (!planetId) {
                stopBulkPolling();
                return;
            }

            try {
                const res = await fetch(`${API_BASE}/api/worldgen/${planetId}/job/${jobId}`);
                if (!res.ok) return;

                const data: WorldgenJobStatus = await res.json();
                setBulkProgress(data.progress || 0);
                setBulkStage(data.currentStage || null);

                if (data.status === "completed") {
                    stopBulkPolling();
                    setBulkRunning(false);
                    setBulkJobId(null);
                    setBulkProgress(100);
                    setBulkStage(data.currentStage || "Completed");
                    await loadImages();
                } else if (data.status === "failed" || data.status === "cancelled") {
                    stopBulkPolling();
                    setBulkRunning(false);
                    setBulkJobId(null);
                    setBulkError(data.error || "Bulk province isolation failed.");
                }
            } catch (err: any) {
                setBulkError(err.message || "Failed to poll bulk isolation job.");
                stopBulkPolling();
                setBulkRunning(false);
                setBulkJobId(null);
            }
        }, 800);
    };

    const handleIsolateAllProvinces = async () => {
        if (!planetId || bulkRunning) return;
        setBulkError(null);
        setBulkJobId(null);
        setBulkProgress(0);
        setBulkStage("Queuing province isolation...");
        setBulkRunning(true);

        try {
            const res = await fetch(`${API_BASE}/api/worldgen/${planetId}/isolate/provinces`, {
                method: "POST",
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to start bulk province isolation.");
            }

            const data = await res.json();
            setBulkJobId(data.jobId);
            startBulkPolling(data.jobId);
        } catch (err: any) {
            setBulkRunning(false);
            setBulkStage(null);
            setBulkError(err.message || "Failed to start bulk province isolation.");
        }
    };

    const handleDeleteIsolated = async (filename: string) => {
        if (!planetId || deletingFilename) return;
        if (!window.confirm(`Delete ${filename}?`)) return;

        setDeletingFilename(filename);
        setDeleteError(null);
        try {
            const res = await fetch(`${API_BASE}/api/worldgen/${planetId}/isolated/${encodeURIComponent(filename)}`, {
                method: "DELETE",
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || "Failed to delete isolated image.");
            }

            await loadImages();
        } catch (err: any) {
            setDeleteError(err.message || "Failed to delete isolated image.");
        } finally {
            setDeletingFilename(null);
        }
    };

    if (!planetId) {
        return <div className="p-4 text-xs text-center text-gray-500 font-mono">NO PLANET ACTIVE</div>;
    }

    const selectedName = selectedId !== null && regions[selectedId] ? regions[selectedId].name : `ID: ${selectedId}`;

    return (
        <div className="flex flex-col gap-4 p-4 h-full">
            <div className="bg-[#1e1e1e]/60 border border-white/5 rounded-2xl p-4 shadow-lg backdrop-blur-md">
                <h2 className="text-[10px] font-black tracking-[0.2em] text-cyan-400 mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 15.536c-1.171 1.952-3.07 1.536-4.242 0-1.172-1.536-1.172-4.536 0-6.072 1.171-1.536 3.07-1.952 4.242 0M8 10.5h4m-2-2v4" />
                    </svg>
                    REGION ISOLATOR
                </h2>

                <p className="text-[11px] text-gray-400 leading-relaxed font-mono mb-4">
                    Isolate a selected region, or bulk-isolate all provinces into transparent full-canvas assets.
                </p>

                <div className="bg-black/40 border border-white/10 rounded-xl p-4 text-center mb-4">
                    <p className="text-[10px] text-gray-500 font-mono mb-2">PROVINCE WORKFLOW</p>
                    <p className="text-[11px] text-gray-400 leading-relaxed font-mono mb-4">
                        Isolate every province into its own full-canvas transparent image.
                    </p>
                    <Button
                        variant="primary"
                        onClick={handleIsolateAllProvinces}
                        disabled={!planetId || bulkRunning}
                        className="w-full text-[10px] font-black tracking-widest bg-cyan-600/40 hover:bg-cyan-600/60 border border-cyan-500/40 disabled:opacity-50"
                    >
                        {bulkRunning ? "ISOLATING PROVINCES..." : "ISOLATE ALL PROVINCES"}
                    </Button>
                    {(bulkRunning || bulkJobId || bulkStage) && (
                        <div className="mt-3 text-left bg-black/30 border border-white/10 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] text-cyan-400 font-black tracking-widest">BULK STATUS</span>
                                <span className="text-[10px] text-gray-400 font-mono">{bulkProgress.toFixed(0)}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden mb-2">
                                <div
                                    className="h-full bg-gradient-to-r from-cyan-500 to-green-500 rounded-full transition-all duration-300"
                                    style={{ width: `${bulkProgress}%` }}
                                />
                            </div>
                            {bulkStage && <p className="text-[10px] text-gray-400 font-mono">{bulkStage}</p>}
                        </div>
                    )}
                    {bulkError && <p className="text-[10px] text-red-400 font-mono mt-2">{bulkError}</p>}
                </div>

                {selectedId !== null ? (
                    <div className="bg-black/40 border border-white/10 rounded-xl p-4 text-center">
                        <p className="text-[10px] text-gray-500 font-mono mb-2">SELECTED {entityTypeStr.toUpperCase()}</p>
                        <p className="text-sm font-bold text-white mb-4">{selectedName}</p>
                        <Button
                            variant="primary"
                            onClick={handleIsolate}
                            disabled={isolating || bulkRunning}
                            className="w-full text-[10px] font-black tracking-widest bg-cyan-600/40 hover:bg-cyan-600/60 border border-cyan-500/40 disabled:opacity-50"
                        >
                            {isolating ? "ISOLATING..." : "ISOLATE SELECTION"}
                        </Button>
                        {error && <p className="text-[10px] text-red-400 font-mono mt-2">{error}</p>}
                    </div>
                ) : (
                    <div className="bg-black/20 border border-dashed border-white/10 rounded-xl p-4 text-center text-[10px] text-gray-500 font-mono">
                        Select a region on the map to isolate it.
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto bg-[#1e1e1e]/60 border border-white/5 rounded-2xl p-4 shadow-lg backdrop-blur-md">
                <h3 className="text-[10px] font-black tracking-[0.1em] text-gray-400 mb-4">PREVIOUSLY ISOLATED</h3>

                {loading && <p className="text-[10px] text-gray-500 font-mono animate-pulse">Loading gallery...</p>}
                {!loading && isolatedImages.length === 0 && (
                    <p className="text-[10px] text-gray-500 font-mono text-center mt-4">No regions isolated yet.</p>
                )}
                {deleteError && <p className="text-[10px] text-red-400 font-mono mb-3">{deleteError}</p>}

                <div className="grid grid-cols-2 gap-3 pb-6">
                    {isolatedImages.map((img) => (
                        <div key={img.filename} className="bg-black/40 border border-white/10 rounded-xl overflow-hidden group">
                            <div className="aspect-square bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiMzMzMiLz48cGF0aCBkPSJNMCAwdjRoNHYtNEgweiIgZmlsbD0iIzQ0NCIvPjxwb2x5Z29uIHBvaW50cz0iNCA4IDggOCA4IDQgNCA0IiBmaWxsPSIjNDQ0Ii8+PC9zdmc+')] relative">
                                <img
                                    src={`${API_BASE}${img.url}`}
                                    className="absolute inset-0 w-full h-full object-contain p-2 group-hover:scale-105 transition-transform"
                                    alt={img.filename}
                                />
                            </div>
                            <div className="p-2 border-t border-white/5 bg-black/60 flex items-end justify-between gap-2">
                                <div>
                                    <p className="text-[9px] text-cyan-400 font-black tracking-widest uppercase">{img.entityType}</p>
                                    <p className="text-[10px] text-gray-400 font-mono">ID: {img.entityId}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleDeleteIsolated(img.filename)}
                                    disabled={deletingFilename === img.filename || deletingFilename !== null}
                                    className="px-2 py-1 text-[9px] font-black tracking-widest rounded border border-red-500/40 text-red-300 hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {deletingFilename === img.filename ? "..." : "DELETE"}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
