import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Modal } from "@ashtrail/ui";
import { useGenerationHistory } from "../hooks/useGenerationHistory";
import { HistoryGallery } from "../worldgeneration/HistoryGallery";
import type { GenerationHistoryItem } from "../hooks/useGenerationHistory";

export function GalleryPage() {
    const { history, deleteFromHistory } = useGenerationHistory();
    const [activePlanetId, setActivePlanetId] = useState<string | null>(null);
    const [previewTexture, setPreviewTexture] = useState<{ url: string, planetId: string } | null>(null);

    const activePlanet = useMemo(() => history.find(h => h.id === activePlanetId), [history, activePlanetId]);

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
                        <Link to="/worldgen" className="px-4 py-1.5 rounded-full text-[10px] font-bold tracking-widest transition-all text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white">
                            RETURN TO WORLDGEN
                        </Link>
                    </div>
                </div>
            </header>

            {/* ══ Main Layout ══ */}
            <div className="flex-1 flex overflow-hidden relative z-10 pt-[64px] bg-black/30 w-full">

                {/* Left: History Gallery */}
                <div className="flex-1 h-full overflow-hidden">
                    <HistoryGallery
                        history={history}
                        activePlanetId={activePlanetId}
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
        </div>
    );
}
