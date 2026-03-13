import { useState, useMemo, useEffect } from "react";
import type { GenerationHistoryItem } from "../hooks/useGenerationHistory";

interface HistoryGalleryProps {
    history: GenerationHistoryItem[];
    activePlanetId: string | null;
    deleteFromHistory: (id: string) => void;
    onSelectPlanet: (item: GenerationHistoryItem) => void;
    onSelectTexture: (planetId: string, textureUrl: string) => void;
    showExtendedTabs?: boolean;
    initialTab?: TabType;
    extendedRefreshKey?: number;
    onRenameWorld?: (id: string, newName: string) => void;
}

type TabType = "planets" | "textures" | "icons" | "characters" | "isolated";

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

interface IsolatedImageItem {
    id: string;
    planetId: string;
    url: string;
    entityType: string;
    entityId: number;
    filename: string;
}

interface UpscaledIsolatedItem {
    id: string;
    planetId: string;
    url: string;
    artifactId: string;
    entityType: string;
    entityId: number;
    provinceId: number;
    provinceIds: number[];
    modelId: string;
    createdAt: number;
}

interface TextureImageItem {
    id: string;
    url: string;
    batchName: string;
    createdAt: string;
    prompt: string;
}

export function HistoryGallery({
    history,
    activePlanetId,
    deleteFromHistory,
    onSelectPlanet,
    onSelectTexture,
    showExtendedTabs = false,
    initialTab = "planets",
    extendedRefreshKey = 0,
    onRenameWorld,
}: HistoryGalleryProps) {
    const ISOLATED_PAGE_SIZE = 24;
    const [activeTab, setActiveTab] = useState<TabType>(initialTab);
    const [iconImages, setIconImages] = useState<IconImageItem[]>([]);
    const [textureImages, setTextureImages] = useState<TextureImageItem[]>([]);
    const [characterPortraits, setCharacterPortraits] = useState<CharacterPortraitItem[]>([]);
    const [isolatedImages, setIsolatedImages] = useState<IsolatedImageItem[]>([]);
    const [upscaledImages, setUpscaledImages] = useState<UpscaledIsolatedItem[]>([]);
    const [isolatedSection, setIsolatedSection] = useState<"isolated" | "upscaled">("isolated");
    const [isolatedGrouping, setIsolatedGrouping] = useState<"all" | "province" | "duchy" | "kingdom">("all");
    const [isolatedPage, setIsolatedPage] = useState(1);
    const [isLoadingExtended, setIsLoadingExtended] = useState(false);
    const [extendedError, setExtendedError] = useState<string | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState("");

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
        : activeTab === "isolated"
            ? "grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4 items-start"
        : activeTab === "characters"
            ? "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5"
            : "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6";

    const scopedIsolatedImages = useMemo(() => {
        const byWorld = activePlanetId
            ? isolatedImages.filter((item) => item.planetId === activePlanetId)
            : isolatedImages;
        if (isolatedGrouping === "all") return byWorld;
        return byWorld.filter((item) => item.entityType === isolatedGrouping);
    }, [activePlanetId, isolatedGrouping, isolatedImages]);

    const scopedUpscaledImages = useMemo(() => {
        const byWorld = activePlanetId
            ? upscaledImages.filter((item) => item.planetId === activePlanetId)
            : upscaledImages;
        if (isolatedGrouping === "all") return byWorld;
        return byWorld.filter((item) => item.entityType === isolatedGrouping);
    }, [activePlanetId, isolatedGrouping, upscaledImages]);

    const isolatedPageCount = useMemo(() => {
        const totalItems = isolatedSection === "isolated" ? scopedIsolatedImages.length : scopedUpscaledImages.length;
        return Math.max(1, Math.ceil(totalItems / ISOLATED_PAGE_SIZE));
    }, [ISOLATED_PAGE_SIZE, isolatedSection, scopedIsolatedImages.length, scopedUpscaledImages.length]);

    const pagedVisibleIsolatedImages = useMemo(() => {
        const start = (isolatedPage - 1) * ISOLATED_PAGE_SIZE;
        return scopedIsolatedImages.slice(start, start + ISOLATED_PAGE_SIZE);
    }, [ISOLATED_PAGE_SIZE, isolatedPage, scopedIsolatedImages]);

    const pagedVisibleUpscaledImages = useMemo(() => {
        const start = (isolatedPage - 1) * ISOLATED_PAGE_SIZE;
        return scopedUpscaledImages.slice(start, start + ISOLATED_PAGE_SIZE);
    }, [ISOLATED_PAGE_SIZE, isolatedPage, scopedUpscaledImages]);

    useEffect(() => {
        setIsolatedPage(1);
    }, [activeTab, isolatedGrouping, isolatedSection]);

    useEffect(() => {
        if (isolatedPage > isolatedPageCount) {
            setIsolatedPage(isolatedPageCount);
        }
    }, [isolatedPage, isolatedPageCount]);

    useEffect(() => {
        setActiveTab(initialTab);
    }, [initialTab]);

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

                const [iconGroups, textureGroups] = await Promise.all([
                    Promise.all(batchList.map(async (batch: any) => {
                        const res = await fetch(`/api/icons/batches/${batch.batchId}`);
                        if (!res.ok) return [];
                        const manifest = await res.json();
                        const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
                        return icons.map((icon: any, index: number) => ({
                            id: `icon-${manifest.batchId}-${icon.filename}-${index}`,
                            url: icon.url,
                            batchName: manifest.batchName || manifest.batchId,
                            createdAt: manifest.createdAt || "",
                            prompt: icon.itemPrompt || icon.prompt || icon.filename || "Icon",
                        } as IconImageItem));
                    })),
                    (async () => {
                        try {
                            const texBatchesRes = await fetch("/api/textures/batches");
                            if (!texBatchesRes.ok) return [];
                            const texBatches = await texBatchesRes.json();
                            const texBatchList = Array.isArray(texBatches) ? texBatches : [];

                            const results = await Promise.all(texBatchList.map(async (batch: any) => {
                                const res = await fetch(`/api/textures/batches/${batch.batchId}`);
                                if (!res.ok) return [];
                                const manifest = await res.json();
                                const textures = Array.isArray(manifest.textures) ? manifest.textures : [];
                                return textures.map((tex: any, index: number) => ({
                                    id: `tex-${manifest.batchId}-${tex.filename}-${index}`,
                                    url: tex.url,
                                    batchName: manifest.batchName || manifest.batchId,
                                    createdAt: manifest.createdAt || "",
                                    prompt: tex.itemPrompt || tex.prompt || tex.filename || "Texture",
                                } as TextureImageItem));
                            }));
                            return results.flat();
                        } catch { return []; }
                    })()
                ]);

                const charsRes = await fetch("/api/data/characters");
                const charsRaw = charsRes.ok ? await charsRes.json() : [];
                const charList = Array.isArray(charsRaw) ? charsRaw : [];
                const portraits = charList
                    .filter((c: any) => typeof c?.portraitUrl === "string" && c.portraitUrl.length > 0)
                    .map((c: any, index: number) => ({
                        id: c.id || c.name || `character-${index}`,
                        name: c.portraitName || c.name || `Character ${index + 1}`,
                        portraitUrl: c.portraitUrl,
                    } as CharacterPortraitItem));

                const isolatedRes = await fetch("/api/worldgen/isolated/all");
                const isolatedRaw = isolatedRes.ok ? await isolatedRes.json() : { images: [] };
                const isolatedItems = (isolatedRaw.images || []).map((img: any, index: number) => ({
                    id: `isolated-${img.filename}-${index}`,
                    planetId: img.planetId || "",
                    url: img.url,
                    entityType: img.entityType,
                    entityId: img.entityId,
                    filename: img.filename,
                } as IsolatedImageItem));

                const upscaledRes = await fetch("/api/worldgen/upscaled/all");
                const upscaledRaw = upscaledRes.ok ? await upscaledRes.json() : { images: [] };
                const upscaledItems = (upscaledRaw.images || []).map((img: any, index: number) => ({
                    id: `upscaled-${img.artifactId || index}-${index}`,
                    planetId: img.planetId || "",
                    url: img.imageUrl,
                    artifactId: img.artifactId,
                    entityType: img.entityType || "province",
                    entityId: img.entityId || img.provinceId || 0,
                    provinceId: img.provinceId,
                    provinceIds: Array.isArray(img.provinceIds) ? img.provinceIds : (img.provinceId ? [img.provinceId] : []),
                    modelId: img.modelId,
                    createdAt: img.createdAt || 0,
                } as UpscaledIsolatedItem));

                if (!isCancelled) {
                    setIconImages(iconGroups.flat());
                    setTextureImages(textureGroups);
                    setCharacterPortraits(portraits);
                    setIsolatedImages(isolatedItems);
                    setUpscaledImages(upscaledItems);
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
    }, [showExtendedTabs, extendedRefreshKey]);

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
                    disabled={!activePlanetId && !showExtendedTabs}
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
                {showExtendedTabs && (
                    <button
                        onClick={() => setActiveTab("isolated")}
                        className={`flex-1 py-3 text-[10px] font-black tracking-widest uppercase transition-all ${activeTab === "isolated" ? "text-purple-300 bg-white/10" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"}`}
                    >
                        Isolated
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
                            if (renamingId !== item.id) onSelectPlanet(item);
                        }}
                    >
                        <img src={item.textureUrl} alt="Planet thumbnail" className="absolute inset-0 w-full h-full object-cover object-center opacity-60 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500" />
                        <div className="absolute top-0 inset-x-0 p-3 bg-gradient-to-b from-black/90 via-black/40 to-transparent pointer-events-none">
                            {renamingId === item.id ? (
                                <div className="pointer-events-auto flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                    <input
                                        autoFocus
                                        value={renameValue}
                                        onChange={e => setRenameValue(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter' && renameValue.trim()) {
                                                onRenameWorld?.(item.id, renameValue.trim());
                                                setRenamingId(null);
                                            }
                                            if (e.key === 'Escape') setRenamingId(null);
                                        }}
                                        className="flex-1 bg-black/70 border border-[#E6E6FA]/40 text-white text-[11px] px-2 py-1 rounded outline-none focus:border-[#E6E6FA]"
                                        placeholder="World name..."
                                    />
                                    <button
                                        onClick={() => {
                                            if (renameValue.trim()) {
                                                onRenameWorld?.(item.id, renameValue.trim());
                                                setRenamingId(null);
                                            }
                                        }}
                                        className="text-emerald-400 hover:text-emerald-300 text-sm"
                                    >✓</button>
                                    <button onClick={() => setRenamingId(null)} className="text-gray-500 hover:text-gray-300 text-sm">✗</button>
                                </div>
                            ) : (
                                <div className="flex items-start gap-2">
                                    <p className="text-[10px] text-gray-200 line-clamp-2 font-medium leading-relaxed drop-shadow-md flex-1">{item.name || item.prompt}</p>
                                    {onRenameWorld && (
                                        <button
                                            onClick={e => {
                                                e.stopPropagation();
                                                setRenamingId(item.id);
                                                setRenameValue(item.name || item.prompt);
                                            }}
                                            className="pointer-events-auto shrink-0 w-5 h-5 flex items-center justify-center rounded bg-black/50 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-all border border-white/10"
                                            title="Rename world"
                                        >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                        </button>
                                    )}
                                </div>
                            )}
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

                {activeTab === "textures" && (activePlanetId ? activeVariants : textureImages).map(variant => (
                    <div key={variant.id} className={`relative justify-end flex flex-col aspect-[2/1] group border border-white/10 bg-black/40 rounded-xl overflow-hidden cursor-pointer hover:border-[#E6E6FA]/40 transition-all shadow-lg`}
                        onClick={() => {
                            if (activePlanetId) onSelectTexture(variant.id, variant.textureUrl);
                            else if ('url' in variant) onSelectTexture("batch", (variant as any).url);
                        }}
                    >
                        <img src={'textureUrl' in variant ? variant.textureUrl : (variant as any).url} alt="Texture variant" className="absolute top-0 left-0 w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-300" />
                        {('isUpscaled' in variant && variant.isUpscaled) && (
                            <div className="absolute top-3 right-3 bg-fuchsia-600/80 text-white text-[8px] font-black tracking-widest px-2 py-1 rounded-md shadow-lg border border-fuchsia-400/50 backdrop-blur-sm z-10 flex items-center gap-1">
                                <span>✨</span>
                                4x HD
                            </div>
                        )}
                        {('isUpscaled' in variant && !variant.isUpscaled) && (
                            <div className="absolute top-3 right-3 bg-blue-600/80 text-white text-[8px] font-black tracking-widest px-2 py-1 rounded-md shadow-lg border border-blue-400/50 backdrop-blur-sm z-10 flex items-center gap-1">
                                Base Map
                            </div>
                        )}
                        {('batchName' in variant) && (
                            <div className="absolute top-3 right-3 bg-emerald-600/80 text-white text-[8px] font-black tracking-widest px-2 py-1 rounded-md shadow-lg border border-emerald-400/50 backdrop-blur-sm z-10">
                                {String(variant.batchName).toUpperCase()}
                            </div>
                        )}
                        <div className="relative p-3 bg-black/70 backdrop-blur-sm pointer-events-none mt-auto">
                            <p className="text-[10px] text-gray-200 truncate">{variant.prompt || "Upscaled Variant"}</p>
                            <div className="flex justify-between items-center mt-1">
                                <p className="text-[8px] font-bold tracking-widest text-gray-500">{new Date('timestamp' in variant ? variant.timestamp : (variant as any).createdAt).toLocaleDateString()}</p>
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
                        onClick={() => onSelectTexture(`characters:${character.id}`, character.portraitUrl)}
                    >
                        <img src={character.portraitUrl} alt={character.name} className="absolute top-0 left-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-300" />
                        <div className="relative p-3 bg-black/70 backdrop-blur-sm mt-auto">
                            <p className="text-[10px] text-gray-100 truncate">{character.name}</p>
                            <p className="text-[8px] text-emerald-300 mt-1">Character Portrait</p>
                        </div>
                    </div>
                ))}

                {activeTab === "isolated" && showExtendedTabs && isLoadingExtended && (
                    <div className="col-span-full text-xs text-gray-500">Loading isolated regions...</div>
                )}
                {activeTab === "isolated" && showExtendedTabs && (
                    <div className="col-span-full flex flex-wrap items-center justify-center gap-3 mb-2">
                        <div className="inline-flex items-center rounded-full border border-white/10 bg-black/40 p-1">
                            <button
                                onClick={() => {
                                    setIsolatedSection("isolated");
                                    setIsolatedPage(1);
                                }}
                                className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest transition-all ${isolatedSection === "isolated" ? "bg-white/10 text-purple-300" : "text-gray-500 hover:text-gray-300"}`}
                            >
                                ISOLATED
                            </button>
                            <button
                                onClick={() => {
                                    setIsolatedSection("upscaled");
                                    setIsolatedPage(1);
                                }}
                                className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest transition-all ${isolatedSection === "upscaled" ? "bg-white/10 text-indigo-300" : "text-gray-500 hover:text-gray-300"}`}
                            >
                                UPSCALED
                            </button>
                        </div>
                        <div className="inline-flex items-center rounded-full border border-white/10 bg-black/40 p-1">
                            {(["all", "province", "duchy", "kingdom"] as const).map((group) => (
                                <button
                                    key={group}
                                    onClick={() => {
                                        setIsolatedGrouping(group);
                                        setIsolatedPage(1);
                                    }}
                                    className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest transition-all ${
                                        isolatedGrouping === group
                                            ? "bg-white/10 text-amber-200"
                                            : "text-gray-500 hover:text-gray-300"
                                    }`}
                                >
                                    {group === "all" ? "ALL" : `${group.toUpperCase()}S`}
                                </button>
                            ))}
                        </div>
                        <p className="text-[9px] tracking-widest uppercase text-gray-500">
                            {activePlanetId ? "Active world only" : "All worlds"}
                        </p>
                    </div>
                )}
                {activeTab === "isolated" && showExtendedTabs && activePlanetId && (
                    <div className="col-span-full text-center text-[9px] uppercase tracking-widest text-gray-500 -mt-1 mb-1">
                        Grouping isolated assets for the selected world
                    </div>
                )}
                {activeTab === "isolated" && showExtendedTabs && !isLoadingExtended && ((isolatedSection === "isolated" && scopedIsolatedImages.length > 0) || (isolatedSection === "upscaled" && scopedUpscaledImages.length > 0)) && (
                    <div className="col-span-full flex items-center justify-between gap-4 mb-1 px-1">
                        <p className="text-[10px] uppercase tracking-widest text-gray-500">
                            Showing {(isolatedPage - 1) * ISOLATED_PAGE_SIZE + 1}-{Math.min(isolatedPage * ISOLATED_PAGE_SIZE, isolatedSection === "isolated" ? scopedIsolatedImages.length : scopedUpscaledImages.length)} of {isolatedSection === "isolated" ? scopedIsolatedImages.length : scopedUpscaledImages.length}
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setIsolatedPage(page => Math.max(1, page - 1))}
                                disabled={isolatedPage === 1}
                                className="px-3 py-1.5 rounded-lg border border-white/10 bg-black/30 text-[10px] font-bold tracking-widest text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed hover:border-white/20"
                            >
                                PREV
                            </button>
                            <span className="text-[10px] font-bold tracking-widest text-gray-400">
                                {isolatedPage} / {isolatedPageCount}
                            </span>
                            <button
                                onClick={() => setIsolatedPage(page => Math.min(isolatedPageCount, page + 1))}
                                disabled={isolatedPage === isolatedPageCount}
                                className="px-3 py-1.5 rounded-lg border border-white/10 bg-black/30 text-[10px] font-bold tracking-widest text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed hover:border-white/20"
                            >
                                NEXT
                            </button>
                        </div>
                    </div>
                )}
                {activeTab === "isolated" && showExtendedTabs && !isLoadingExtended && isolatedSection === "isolated" && scopedIsolatedImages.length === 0 && (
                    <div className="col-span-full text-xs text-gray-500">No isolated regions found yet.</div>
                )}
                {activeTab === "isolated" && showExtendedTabs && !isLoadingExtended && isolatedSection === "upscaled" && scopedUpscaledImages.length === 0 && (
                    <div className="col-span-full text-xs text-gray-500">No upscaled hierarchy artifacts found yet.</div>
                )}
                {activeTab === "isolated" && showExtendedTabs && isolatedSection === "isolated" && pagedVisibleIsolatedImages.map((img) => (
                    <div
                        key={img.id}
                        className="bg-black/40 border border-white/10 rounded-xl overflow-hidden group cursor-pointer hover:border-purple-400/40 transition-all shadow-lg"
                        onClick={() => onSelectTexture("isolated", img.url)}
                    >
                        <div className="aspect-[1.2/1] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiMzMzMiLz48cGF0aCBkPSJNMCAwdjRoNHYtNEh6IiBmaWxsPSIjNDQ0Ii8+PHBvbHlnb24gcG9pbnRzPSI0IDggOCA4IDggNCA0IDQiIGZpbGw9IiM0NDQiLz48L3N2Zz+')] relative">
                            <img
                                src={img.url}
                                className="absolute inset-0 w-full h-full object-contain p-4 group-hover:scale-[1.02] transition-transform"
                                alt={img.filename}
                                loading="lazy"
                                decoding="async"
                            />
                        </div>
                        <div className="p-3 border-t border-white/5 bg-black/70 backdrop-blur-sm">
                            <p className="text-[10px] text-cyan-400 font-black tracking-widest uppercase">{img.entityType}</p>
                            <p className="text-[11px] text-gray-300 font-mono">ID: {img.entityId}</p>
                        </div>
                    </div>
                ))}
                {activeTab === "isolated" && showExtendedTabs && isolatedSection === "upscaled" && pagedVisibleUpscaledImages.map((img) => (
                    <div
                        key={img.id}
                        className="bg-black/40 border border-white/10 rounded-xl overflow-hidden group cursor-pointer hover:border-indigo-400/40 transition-all shadow-lg"
                        onClick={() => onSelectTexture("upscaled", img.url)}
                    >
                        <div className="aspect-[1.2/1] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiMzMzMiLz48cGF0aCBkPSJNMCAwdjRoNHYtNEh6IiBmaWxsPSIjNDQ0Ii8+PHBvbHlnb24gcG9pbnRzPSI0IDggOCA4IDggNCA0IDQiIGZpbGw9IiM0NDQiLz48L3N2Zz+')] relative">
                            <img
                                src={img.url}
                                className="absolute inset-0 w-full h-full object-contain p-4 group-hover:scale-[1.02] transition-transform"
                                alt={img.artifactId}
                                loading="lazy"
                                decoding="async"
                            />
                        </div>
                        <div className="p-3 border-t border-white/5 bg-black/70 backdrop-blur-sm">
                            <p className="text-[10px] text-indigo-300 font-black tracking-widest uppercase">{img.entityType} {img.entityId}</p>
                            {img.provinceIds.length > 1 && (
                                <p className="text-[10px] text-gray-400 font-mono">{img.provinceIds.length} merged provinces</p>
                            )}
                            <p className="text-[10px] text-gray-400 font-mono truncate">{img.modelId}</p>
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
