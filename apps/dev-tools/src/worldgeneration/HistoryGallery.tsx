import { useState, useMemo } from "react";
import type { GenerationHistoryItem } from "../hooks/useGenerationHistory";

interface HistoryGalleryProps {
    history: GenerationHistoryItem[];
    activePlanetId: string | null;
    deleteFromHistory: (id: string) => void;
    onSelectPlanet: (item: GenerationHistoryItem) => void;
    onSelectTexture: (planetId: string, textureUrl: string) => void;
}

type TabType = "planets" | "textures";

export function HistoryGallery({
    history,
    activePlanetId,
    deleteFromHistory,
    onSelectPlanet,
    onSelectTexture,
}: HistoryGalleryProps) {
    const [activeTab, setActiveTab] = useState<TabType>("planets");

    // Group history items by parentId to find variants (e.g. upscales)
    const { mainPlanets, textureVariants } = useMemo(() => {
        const main = history.filter(item => !item.parentId);
        const variants = new Map<string, GenerationHistoryItem[]>();

        main.forEach(p => variants.set(p.id, []));
        history.forEach(item => {
            if (item.parentId && variants.has(item.parentId)) {
                variants.get(item.parentId)!.push(item);
            }
            // For older unmigrated items or items that just spawned via upscale endpoint linking to parent
            if (item.parentId && !variants.has(item.parentId)) {
                variants.set(item.parentId, [item]);
            }
        });
        return { mainPlanets: main, textureVariants: variants };
    }, [history]);

    const activePlanet = history.find(p => p.id === activePlanetId);
    // Include the base planet itself as a texture option
    const activeVariants = activePlanet ? [activePlanet, ...(textureVariants.get(activePlanet.id) || [])] : [];

    return (
        <div className="flex flex-col h-full bg-black/50 overflow-hidden">
            {/* Tab Bar */}
            <div className="flex border-b justify-center border-white/10 bg-black/60 sticky top-0 z-10">
                <button
                    onClick={() => setActiveTab("planets")}
                    className={`flex-1 py-3 text-[10px] font-black tracking-widest uppercase transition-all ${activeTab === "planets" ? "text-white bg-white/10" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"}`}
                >
                    Planets
                </button>
                <button
                    onClick={() => setActiveTab("textures")}
                    disabled={!activePlanetId}
                    className={`flex-1 py-3 text-[10px] font-black tracking-widest uppercase transition-all disabled:opacity-30 disabled:cursor-not-allowed ${activeTab === "textures" ? "text-[#E6E6FA] bg-white/10" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"}`}
                >
                    Textures
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 scrollbar-thin">
                {activeTab === "planets" && mainPlanets.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center h-40 text-center space-y-3 opacity-50">
                        <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
                        <p className="text-[9px] font-bold tracking-widest text-gray-500">NO GENESIS ARCHIVES FOUND</p>
                    </div>
                )}

                {activeTab === "planets" && mainPlanets.map(item => (
                    <div key={item.id} className={`relative aspect-[2/1] group border ${activePlanetId === item.id ? 'border-[#E6E6FA] shadow-[0_0_15px_rgba(230,230,250,0.3)]' : 'border-white/10'} bg-black/40 rounded-xl overflow-hidden cursor-pointer hover:border-[#E6E6FA]/40 transition-all`}
                        onClick={() => {
                            onSelectPlanet(item);
                        }}
                    >
                        <img src={item.textureUrl} alt="Planet thumbnail" className="absolute inset-0 w-full h-full object-cover object-center opacity-60 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" />
                        <div className="absolute top-0 inset-x-0 p-3 bg-gradient-to-b from-black/90 via-black/40 to-transparent pointer-events-none">
                            <p className="text-[10px] text-gray-200 line-clamp-2 font-medium leading-relaxed drop-shadow-md">{item.prompt}</p>
                            <div className="flex justify-between items-center mt-2">
                                <p className="text-[8px] font-bold tracking-widest text-gray-400">{new Date(item.timestamp).toLocaleDateString()}</p>
                                <p className="text-[8px] font-bold tracking-widest text-[#E6E6FA] bg-black/50 px-2 py-0.5 rounded">
                                    {1 + (textureVariants.get(item.id)?.length || 0)} Textures
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); deleteFromHistory(item.id); }}
                            className="absolute bottom-3 right-3 text-[9px] font-bold tracking-widest bg-red-500/20 hover:bg-red-500 text-red-200 hover:text-white px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all border border-red-500/30"
                        >
                            DELETE
                        </button>
                    </div>
                ))}

                {activeTab === "textures" && activeVariants.map(variant => (
                    <div key={variant.id} className={`relative justify-end flex flex-col aspect-[2/1] group border border-white/10 bg-black/40 rounded-xl overflow-hidden cursor-pointer hover:border-[#E6E6FA]/40 transition-all shadow-lg`}
                        onClick={() => {
                            if (activePlanetId) onSelectTexture(activePlanetId, variant.textureUrl);
                        }}
                    >
                        <img src={variant.textureUrl} alt="Texture variant" className="absolute top-0 left-0 w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-300" />
                        {variant.isUpscaled && (
                            <div className="absolute top-3 right-3 bg-fuchsia-600/80 text-white text-[8px] font-black tracking-widest px-2 py-1 rounded-md shadow-lg border border-fuchsia-400/50 backdrop-blur-sm z-10 flex items-center gap-1">
                                <span>✨</span>
                                4x HD
                            </div>
                        )}
                        {!variant.isUpscaled && (
                            <div className="absolute top-3 right-3 bg-blue-600/80 text-white text-[8px] font-black tracking-widest px-2 py-1 rounded-md shadow-lg border border-blue-400/50 backdrop-blur-sm z-10 flex items-center gap-1">
                                Base Map
                            </div>
                        )}
                        <div className="relative p-3 bg-black/70 backdrop-blur-sm pointer-events-none mt-auto">
                            <p className="text-[10px] text-gray-200 truncate">{variant.prompt || "Upscaled Variant"}</p>
                            <p className="text-[8px] font-bold tracking-widest text-gray-500 mt-1">{new Date(variant.timestamp).toLocaleDateString()}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
