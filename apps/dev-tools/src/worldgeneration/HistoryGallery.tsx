import { useState, useMemo, useEffect } from "react";
import type { GenerationHistoryItem } from "../hooks/useGenerationHistory";

interface HistoryGalleryProps {
    history: GenerationHistoryItem[];
    activePlanetId: string | null;
    deleteFromHistory: (id: string) => void;
    onSelectPlanet: (item: GenerationHistoryItem) => void;
    onSelectTexture: (planetId: string, textureUrl: string) => void;
    showExtendedTabs?: boolean;
}

type TabType = "planets" | "textures" | "icons" | "characters";

interface IconImageItem {
    id: string;
    url: string;
    batchName: string;
    createdAt: string;
    prompt: string;
}

interface CharacterPortraitItem {
    id: string;
    name: string;
    portraitUrl: string;
}

export function HistoryGallery({
    history,
    activePlanetId,
    deleteFromHistory,
    onSelectPlanet,
    onSelectTexture,
    showExtendedTabs = false,
}: HistoryGalleryProps) {
    const [activeTab, setActiveTab] = useState<TabType>("planets");
    const [iconImages, setIconImages] = useState<IconImageItem[]>([]);
    const [characterPortraits, setCharacterPortraits] = useState<CharacterPortraitItem[]>([]);
    const [isLoadingExtended, setIsLoadingExtended] = useState(false);
    const [extendedError, setExtendedError] = useState<string | null>(null);

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
    const contentGridClassName = activeTab === "icons"
        ? "grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8 gap-2.5"
        : activeTab === "characters"
            ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5"
            : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6";

    useEffect(() => {
        if (!showExtendedTabs) return;

        let isCancelled = false;
        setIsLoadingExtended(true);
        setExtendedError(null);

        (async () => {
            try {
                const batchesRes = await fetch("/api/icons/batches");
                if (!batchesRes.ok) throw new Error("Failed to load icon batches");
                const batches = await batchesRes.json();
                const batchList = Array.isArray(batches) ? batches : [];

                const iconGroups = await Promise.all(
                    batchList.map(async (batch: any) => {
                        const res = await fetch(`/api/icons/batches/${batch.batchId}`);
                        if (!res.ok) return [];
                        const manifest = await res.json();
                        const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
                        return icons.map((icon: any, index: number) => ({
                            id: `${manifest.batchId}-${icon.filename}-${index}`,
                            url: icon.url,
                            batchName: manifest.batchName || manifest.batchId,
                            createdAt: manifest.createdAt || "",
                            prompt: icon.itemPrompt || icon.prompt || icon.filename || "Icon",
                        } as IconImageItem));
                    })
                );

                const charsRes = await fetch("/api/data/characters");
                const charsRaw = charsRes.ok ? await charsRes.json() : [];
                const charList = Array.isArray(charsRaw) ? charsRaw : [];
                const portraits = charList
                    .filter((c: any) => typeof c?.portraitUrl === "string" && c.portraitUrl.length > 0)
                    .map((c: any, index: number) => ({
                        id: c.id || c.name || `character-${index}`,
                        name: c.name || `Character ${index + 1}`,
                        portraitUrl: c.portraitUrl,
                    } as CharacterPortraitItem));

                if (!isCancelled) {
                    setIconImages(iconGroups.flat());
                    setCharacterPortraits(portraits);
                }
            } catch (e) {
                if (!isCancelled) {
                    setExtendedError(e instanceof Error ? e.message : "Failed to load image tabs");
                }
            } finally {
                if (!isCancelled) setIsLoadingExtended(false);
            }
        })();

        return () => {
            isCancelled = true;
        };
    }, [showExtendedTabs]);

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
                {showExtendedTabs && (
                    <button
                        onClick={() => setActiveTab("icons")}
                        className={`flex-1 py-3 text-[10px] font-black tracking-widest uppercase transition-all ${activeTab === "icons" ? "text-cyan-300 bg-white/10" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"}`}
                    >
                        Icons
                    </button>
                )}
                {showExtendedTabs && (
                    <button
                        onClick={() => setActiveTab("characters")}
                        className={`flex-1 py-3 text-[10px] font-black tracking-widest uppercase transition-all ${activeTab === "characters" ? "text-emerald-300 bg-white/10" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"}`}
                    >
                        Characters
                    </button>
                )}
            </div>

            <div className={`flex-1 overflow-y-auto p-6 scrollbar-thin ${contentGridClassName}`}>
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
                                <div className="flex items-center gap-2">
                                    <p className="text-[8px] font-mono tracking-widest text-[#E6E6FA] bg-black/50 px-2 py-0.5 rounded opacity-70">
                                        ID: {item.id.substring(0, 8)}
                                    </p>
                                    <p className="text-[8px] font-bold tracking-widest text-[#E6E6FA] bg-black/50 px-2 py-0.5 rounded">
                                        {1 + (textureVariants.get(item.id)?.length || 0)} Textures
                                    </p>
                                </div>
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
                            <div className="flex justify-between items-center mt-1">
                                <p className="text-[8px] font-bold tracking-widest text-gray-500">{new Date(variant.timestamp).toLocaleDateString()}</p>
                                <p className="text-[8px] font-mono tracking-widest text-gray-400 opacity-70">ID: {variant.id.substring(0, 8)}</p>
                            </div>
                        </div>
                    </div>
                ))}

                {activeTab === "icons" && showExtendedTabs && isLoadingExtended && (
                    <div className="col-span-full text-xs text-gray-500">Loading icon images...</div>
                )}
                {activeTab === "icons" && showExtendedTabs && !isLoadingExtended && iconImages.length === 0 && (
                    <div className="col-span-full text-xs text-gray-500">No icons found yet.</div>
                )}
                {activeTab === "icons" && showExtendedTabs && iconImages.map(icon => (
                    <div
                        key={icon.id}
                        className="group border border-white/10 bg-black/40 rounded-xl overflow-hidden cursor-pointer hover:border-cyan-400/40 transition-all shadow-lg"
                        onClick={() => onSelectTexture("icons", icon.url)}
                    >
                        <div className="aspect-square p-2 bg-[linear-gradient(45deg,_rgba(255,255,255,0.04)_25%,_transparent_25%,_transparent_50%,_rgba(255,255,255,0.04)_50%,_rgba(255,255,255,0.04)_75%,_transparent_75%,_transparent)] bg-[length:10px_10px]">
                            <div className="w-full h-full rounded-lg border border-white/10 bg-black/40 flex items-center justify-center overflow-hidden">
                                <img
                                    src={icon.url}
                                    alt={icon.prompt}
                                    className="w-full h-full object-contain p-1.5 opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300"
                                />
                            </div>
                        </div>
                        <div className="p-1.5 bg-black/70 backdrop-blur-sm border-t border-white/10">
                            <p className="text-[9px] text-gray-200 truncate">{icon.prompt}</p>
                            <p className="text-[7px] text-cyan-300 truncate">{icon.batchName}</p>
                        </div>
                    </div>
                ))}

                {activeTab === "characters" && showExtendedTabs && isLoadingExtended && (
                    <div className="col-span-full text-xs text-gray-500">Loading character portraits...</div>
                )}
                {activeTab === "characters" && showExtendedTabs && !isLoadingExtended && characterPortraits.length === 0 && (
                    <div className="col-span-full text-xs text-gray-500">No character portraits found yet.</div>
                )}
                {activeTab === "characters" && showExtendedTabs && characterPortraits.map(character => (
                    <div
                        key={character.id}
                        className="relative flex flex-col justify-end aspect-[3/4] group border border-white/10 bg-black/40 rounded-xl overflow-hidden cursor-pointer hover:border-emerald-400/40 transition-all"
                        onClick={() => onSelectTexture("characters", character.portraitUrl)}
                    >
                        <img src={character.portraitUrl} alt={character.name} className="absolute top-0 left-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-300" />
                        <div className="relative p-3 bg-black/70 backdrop-blur-sm mt-auto">
                            <p className="text-[10px] text-gray-100 truncate">{character.name}</p>
                            <p className="text-[8px] text-emerald-300 mt-1">Character Portrait</p>
                        </div>
                    </div>
                ))}

                {showExtendedTabs && extendedError && (
                    <div className="col-span-full text-xs text-red-400">{extendedError}</div>
                )}
            </div>
        </div>
    );
}
