import { useState, useEffect } from "react";
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

export function GeographyIsolatorPanel({ planetId, selectedId, activeLayer }: GeographyIsolatorPanelProps) {
    const [isolatedImages, setIsolatedImages] = useState<IsolatedImage[]>([]);
    const [loading, setLoading] = useState(false);
    const [isolating, setIsolating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [regions, setRegions] = useState<Record<number, RegionRecord>>({});

    const entityTypeStr = activeLayer.endsWith("s") ? activeLayer.slice(0, -1) : activeLayer;

    useEffect(() => {
        if (!planetId) return;
        loadImages();
        loadRegions();
    }, [planetId, activeLayer]);

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
                })
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
                    Isolate a specific region (province, duchy, kingdom, continent) into its own transparent image.
                </p>

                {selectedId !== null ? (
                    <div className="bg-black/40 border border-white/10 rounded-xl p-4 text-center">
                        <p className="text-[10px] text-gray-500 font-mono mb-2">SELECTED {entityTypeStr.toUpperCase()}</p>
                        <p className="text-sm font-bold text-white mb-4">{selectedName}</p>
                        <Button
                            variant="primary"
                            onClick={handleIsolate}
                            disabled={isolating}
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

                <div className="grid grid-cols-2 gap-3 pb-8">
                    {isolatedImages.map((img) => (
                        <div key={img.filename} className="bg-black/40 border border-white/10 rounded-xl overflow-hidden group">
                            <div className="aspect-square bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiMzMzMiLz48cGF0aCBkPSJNMCAwdjRoNHYtNEgweiIgZmlsbD0iIzQ0NCIvPjxwb2x5Z29uIHBvaW50cz0iNCA4IDggOCA4IDQgNCA0IiBmaWxsPSIjNDQ0Ii8+PC9zdmc+')] relative">
                                <img
                                    src={`${API_BASE}${img.url}`}
                                    className="absolute inset-0 w-full h-full object-contain p-2 group-hover:scale-105 transition-transform"
                                    alt={img.filename}
                                />
                            </div>
                            <div className="p-2 border-t border-white/5 bg-black/60">
                                <p className="text-[9px] text-cyan-400 font-black tracking-widest uppercase">{img.entityType}</p>
                                <p className="text-[10px] text-gray-400 font-mono">ID: {img.entityId}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
