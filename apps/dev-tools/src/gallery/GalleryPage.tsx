import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Modal } from "@ashtrail/ui";
import { useGenerationHistory } from "../hooks/useGenerationHistory";
import { HistoryGallery } from "../worldgeneration/HistoryGallery";
import type { GenerationHistoryItem } from "../hooks/useGenerationHistory";

interface CloudObject {
    path: string;
    name: string;
    sizeBytes?: number;
    updatedAt?: string;
    publicUrl: string;
}

export function GalleryPage() {
    const { history, deleteFromHistory } = useGenerationHistory();
    const [activePlanetId, setActivePlanetId] = useState<string | null>(null);
    const [previewTexture, setPreviewTexture] = useState<{ url: string, planetId: string } | null>(null);
    const [isSyncingCloud, setIsSyncingCloud] = useState(false);
    const [syncResult, setSyncResult] = useState<string | null>(null);
    const [cloudError, setCloudError] = useState<string | null>(null);
    const [cloudObjects, setCloudObjects] = useState<CloudObject[]>([]);
    const [showCloudBrowser, setShowCloudBrowser] = useState(false);
    const [isLoadingCloudBrowser, setIsLoadingCloudBrowser] = useState(false);

    const activePlanet = useMemo(() => history.find(h => h.id === activePlanetId), [history, activePlanetId]);

    const syncCloudStorage = async () => {
        setIsSyncingCloud(true);
        setCloudError(null);
        setSyncResult(null);
        try {
            const res = await fetch("/api/storage/supabase/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ direction: "both", imagesOnly: false }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload?.error || "Cloud sync failed");
            }
            setSyncResult(
                `Sync done - uploaded: ${payload.uploaded ?? 0}, downloaded: ${payload.downloaded ?? 0}, skipped: ${payload.skipped ?? 0}, failed: ${payload.failed ?? 0}`
            );
        } catch (e) {
            const message = e instanceof Error ? e.message : "Cloud sync failed";
            setCloudError(message);
        } finally {
            setIsSyncingCloud(false);
        }
    };

    const openCloudBrowser = async () => {
        setShowCloudBrowser(true);
        setIsLoadingCloudBrowser(true);
        setCloudError(null);
        try {
            const res = await fetch("/api/storage/supabase/browse?imagesOnly=true");
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload?.error || "Failed to browse cloud bucket");
            }
            setCloudObjects(Array.isArray(payload.objects) ? payload.objects : []);
        } catch (e) {
            const message = e instanceof Error ? e.message : "Failed to browse cloud bucket";
            setCloudError(message);
        } finally {
            setIsLoadingCloudBrowser(false);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-[#1e1e1e] text-gray-300 font-sans tracking-wide overflow-hidden relative">
            <div className="absolute inset-0 z-0 pointer-events-none opacity-40 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-teal-900/20 via-[#030508] to-[#030508]" />

            {/* ══ Header ══ */}
            <header className="absolute top-0 left-0 right-0 z-30 bg-[#030508]/90 backdrop-blur-md border-b border-white/5 pointer-events-auto">
                <div className="h-16 flex items-center justify-between px-6 w-full">
                    {/* Left: Logo & Contextual Tabs */}
                    <div className="flex items-center gap-6">
                        <Link to="/" className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-all">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        </Link>
                        <h1 className="text-xs font-black tracking-[0.3em] text-white">
                            ASHTRAIL <span className="text-gray-500">| GENERATION GALLERY</span>
                        </h1>
                    </div>
                    {/* Right: Actions */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={openCloudBrowser}
                            className="px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest transition-all text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-100"
                        >
                            BROWSE BUCKET
                        </button>
                        <button
                            onClick={syncCloudStorage}
                            disabled={isSyncingCloud}
                            className="px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest transition-all text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSyncingCloud ? "SYNCING..." : "SYNC CLOUD <-> LOCAL"}
                        </button>
                        <Link to="/worldgen" className="px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest transition-all text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white">
                            RETURN TO WORLDGEN
                        </Link>
                    </div>
                </div>
                {(syncResult || cloudError) && (
                    <div className="px-6 pb-3 text-[10px] font-mono tracking-wide">
                        {syncResult && <p className="text-emerald-300">{syncResult}</p>}
                        {cloudError && <p className="text-red-300">{cloudError}</p>}
                    </div>
                )}
            </header>

            {/* ══ Main Layout ══ */}
            <div className="flex-1 flex overflow-hidden relative z-10 pt-[64px] bg-black/30 w-full">

                {/* Left: History Gallery */}
                <div className="flex-1 h-full overflow-hidden">
                    <HistoryGallery
                        history={history}
                        activePlanetId={activePlanetId}
                        showExtendedTabs={true}
                        deleteFromHistory={(id) => {
                            deleteFromHistory(id);
                            if (activePlanetId === id) setActivePlanetId(null);
                        }}
                        onSelectPlanet={(item: GenerationHistoryItem) => {
                            setActivePlanetId(prevId => prevId === item.id ? null : item.id);
                        }}
                        onSelectTexture={(planetId, textureUrl) => {
                            setPreviewTexture({ url: textureUrl, planetId });
                        }}
                    />
                </div>

                {/* Right: Planet Inspector */}
                {activePlanetId && activePlanet && (
                    <div className="w-[450px] shrink-0 bg-black/60 border-l border-white/10 flex flex-col h-full overflow-hidden shadow-2xl">
                        {/* Panel Header */}
                        <div className="p-6 border-b border-white/10 bg-black/40">
                            <h2 className="text-sm font-black tracking-widest text-[#E6E6FA] mb-1">PLANET INSPECTOR</h2>
                            <p className="text-[10px] text-gray-500 font-mono">{activePlanet.id}</p>
                        </div>

                        {/* Scrollable Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin">

                            {/* Prompt/Info */}
                            <section>
                                <h3 className="text-[10px] font-bold tracking-widest text-teal-500 mb-3 border-b border-white/10 pb-2">PROMPT MATRIX</h3>
                                <p className="text-xs text-gray-400 bg-white/5 p-4 rounded-xl leading-relaxed whitespace-pre-wrap border border-white/10 max-h-[300px] overflow-y-auto scrollbar-thin">
                                    {activePlanet.prompt}
                                </p>
                            </section>

                            {/* Base Config Stats */}
                            <section>
                                <h3 className="text-[10px] font-bold tracking-widest text-amber-500 mb-3 border-b border-white/10 pb-2">CLIMATE & GEO PARAMETERS</h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                        <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Seed</p>
                                        <p className="font-mono text-sm text-gray-200">{activePlanet.config?.world?.seed}</p>
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                        <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Water Cov</p>
                                        <p className="font-mono text-sm text-gray-200">{Math.round((activePlanet.config?.world?.oceanCoverage || 0) * 100)}%</p>
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                        <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Mean Temp</p>
                                        <p className="font-mono text-sm text-gray-200">{activePlanet.config?.climate?.globalMeanTemp}°C</p>
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                        <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Tectonic Int.</p>
                                        <p className="font-mono text-sm text-gray-200">{activePlanet.config?.geo?.tectonicIntensity}</p>
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                        <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Volcanism</p>
                                        <p className="font-mono text-sm text-gray-200">{activePlanet.config?.geo?.volcanicDensity}</p>
                                    </div>
                                    <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                        <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Plates</p>
                                        <p className="font-mono text-sm text-gray-200">{activePlanet.config?.geo?.plateCount}</p>
                                    </div>
                                </div>
                            </section>

                            {/* Actions */}
                            <section>
                                <h3 className="text-[10px] font-bold tracking-widest text-blue-500 mb-3 border-b border-white/10 pb-2">DATA ARCHIVE</h3>
                                <div className="space-y-2">
                                    <a href={`/api/planets/${activePlanet.id}/world_data.json`} target="_blank" rel="noreferrer" className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors group">
                                        <span className="text-xs font-bold tracking-widest text-gray-300 group-hover:text-white">World Data [JSON]</span>
                                        <span className="text-gray-500 group-hover:text-teal-400">↗</span>
                                    </a>
                                    <a href={activePlanet.textureUrl} target="_blank" rel="noreferrer" className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-colors group">
                                        <span className="text-xs font-bold tracking-widest text-gray-300 group-hover:text-white">Base Texture [JPG/PNG]</span>
                                        <span className="text-gray-500 group-hover:text-teal-400">↗</span>
                                    </a>
                                </div>
                            </section>
                        </div>
                    </div>
                )}
            </div>

            {/* Fullscreen Texture Modal */}
            <Modal open={!!previewTexture} onClose={() => setPreviewTexture(null)} title="TEXTURE PREVIEW">
                {previewTexture && (
                    <div className="flex flex-col items-center justify-center p-4 bg-black/80 rounded-xl max-w-7xl mx-auto border border-white/10 shadow-2xl">
                        <img
                            src={previewTexture.url}
                            alt="Full Resolution Texture"
                            className="w-auto max-h-[75vh] object-contain rounded-lg shadow-black/50 shadow-2xl"
                        />
                        <div className="mt-6 flex gap-4">
                            <a
                                href={previewTexture.url}
                                target="_blank"
                                rel="noreferrer"
                                className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded font-bold tracking-wider text-sm transition-colors border border-white/20"
                            >
                                Open Original
                            </a>
                            <button
                                onClick={() => setPreviewTexture(null)}
                                className="px-6 py-2 bg-black hover:bg-white/5 border border-white/20 text-gray-300 rounded font-bold tracking-wider text-sm transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal open={showCloudBrowser} onClose={() => setShowCloudBrowser(false)} title="SUPABASE BUCKET BROWSER">
                <div className="p-4 bg-black/80 rounded-xl border border-white/10 max-h-[75vh] overflow-y-auto">
                    {isLoadingCloudBrowser && (
                        <p className="text-xs text-gray-400">Loading cloud assets...</p>
                    )}
                    {!isLoadingCloudBrowser && cloudObjects.length === 0 && (
                        <p className="text-xs text-gray-500">No cloud images found for the configured Supabase prefix.</p>
                    )}
                    {!isLoadingCloudBrowser && cloudObjects.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {cloudObjects.map((obj) => (
                                <a
                                    key={obj.path}
                                    href={obj.publicUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="group block bg-white/5 border border-white/10 rounded-lg overflow-hidden hover:border-cyan-400/50 transition-colors"
                                >
                                    <img src={obj.publicUrl} alt={obj.name} className="w-full h-28 object-cover bg-black/40" />
                                    <div className="p-2">
                                        <p className="text-[10px] text-gray-200 truncate">{obj.name}</p>
                                        <p className="text-[9px] text-gray-500 truncate">{obj.path}</p>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            </Modal>
        </div>
    );
}
