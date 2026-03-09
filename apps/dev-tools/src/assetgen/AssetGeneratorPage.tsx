import React, { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Button, Slider, Card, CardHeader, CardContent, Modal } from "@ashtrail/ui";
import { GameRegistry } from "@ashtrail/core";

// Presets removed; reference image serves as style

interface BatchIcon {
    filename: string;
    prompt: string;
    stylePrompt?: string;
    itemPrompt?: string;
    url: string;
}

interface BatchManifest {
    batchId: string;
    batchName: string;
    createdAt: string;
    icons: BatchIcon[];
}

interface BatchTexture {
    filename: string;
    prompt: string;
    stylePrompt?: string;
    itemPrompt?: string;
    url: string;
}

interface TextureBatchManifest {
    batchId: string;
    batchName: string;
    createdAt: string;
    category: string;
    subCategory?: string;
    textures: BatchTexture[];
}

interface TextureBatchSummary {
    batchId: string;
    batchName: string;
    textureCount: number;
    createdAt: string;
    category: string;
    subCategory?: string;
    thumbnailUrl: string | null;
}

interface BatchSummary {
    batchId: string;
    batchName: string;
    iconCount: number;
    createdAt: string;
    thumbnailUrl: string | null;
}

const IconCard = React.memo(function IconCard({
    icon,
    lastRefreshedAt,
    setHoveredIcon,
    downloadIcon,
    setAssigningIcon,
    startEditingIcon
}: {
    icon: BatchIcon;
    lastRefreshedAt: number;
    setHoveredIcon: (icon: BatchIcon | null) => void;
    downloadIcon: (url: string) => void;
    setAssigningIcon: (icon: BatchIcon | null) => void;
    startEditingIcon: (icon: BatchIcon) => void;
}) {
    return (
        <div
            className="group relative flex flex-col items-center justify-start bg-[#0f1520] border border-white/5 rounded-xl p-4 hover:border-[#E6E6FA]/20 transition-all h-full"
            onMouseEnter={() => setHoveredIcon(icon)}
            onMouseLeave={() => setHoveredIcon(null)}
        >
            {/* Download */}
            <button
                onClick={() => downloadIcon(icon.url)}
                className="opacity-0 group-hover:opacity-100 absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 backdrop-blur-md text-white border border-white/10 hover:bg-[#E6E6FA] hover:text-[#070b12] transition-all z-20"
                title="Download Icon"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
            </button>

            {/* Icon image */}
            <div className="relative mb-4 flex-shrink-0 group/img shadow-2xl shadow-black/40 rounded-lg overflow-hidden">
                <img
                    src={`${icon.url}?t=${lastRefreshedAt}`}
                    alt={icon.prompt}
                    className="w-20 h-20 relative z-10"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity" />
            </div>

            {/* Prompt label */}
            <div className="flex-1 flex flex-col items-center w-full">
                <p className="text-[11px] text-gray-300 text-center leading-snug line-clamp-2 w-full font-mono mb-3 px-1 min-h-[2.4em]">
                    {icon.itemPrompt || icon.prompt}
                </p>
                <div className="flex gap-2 w-full">
                    <button
                        onClick={() => setAssigningIcon(icon)}
                        className="flex-1 group/btn relative py-2 rounded-lg bg-white/[0.03] border border-white/10 transition-all hover:bg-emerald-500/10 hover:border-emerald-500/30 overflow-hidden"
                        title="Assign to Item/Skill/Trait..."
                    >
                        <div className="flex items-center justify-center gap-1.5 text-[10px] text-[#E6E6FA] group-hover/btn:text-emerald-400 font-black uppercase tracking-widest relative z-10 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            Assign
                        </div>
                    </button>
                    <button
                        onClick={() => startEditingIcon(icon)}
                        className="flex-1 group/btn relative py-2 rounded-lg bg-white/[0.03] border border-white/10 transition-all hover:bg-[#E6E6FA]/10 hover:border-[#E6E6FA]/30 overflow-hidden"
                        title="Regenerate Icon"
                    >
                        <div className="flex items-center justify-center gap-1.5 text-[10px] text-[#E6E6FA] font-black uppercase tracking-widest relative z-10">
                            <svg className="w-3.5 h-3.5 group-hover/btn:rotate-180 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Reroll
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
});

const TextureCard = React.memo(function TextureCard({
    texture,
    lastRefreshedAt,
    setHoveredTexture,
    downloadTexture,
    startEditingTexture
}: {
    texture: BatchTexture;
    lastRefreshedAt: number;
    setHoveredTexture: (texture: BatchTexture | null) => void;
    downloadTexture: (url: string) => void;
    startEditingTexture: (texture: BatchTexture) => void;
}) {
    return (
        <div
            className="group relative flex flex-col bg-[#0f1520] border border-white/5 rounded-xl p-3 hover:border-[#E6E6FA]/20 transition-all"
            onMouseEnter={() => setHoveredTexture(texture)}
            onMouseLeave={() => setHoveredTexture(null)}
        >
            {/* Download */}
            <button
                onClick={() => downloadTexture(texture.url)}
                className="opacity-0 group-hover:opacity-100 absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-lg bg-white/10 backdrop-blur-md text-white border border-white/10 hover:bg-[#E6E6FA] hover:text-[#070b12] transition-all z-20"
                title="Download Texture"
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
            </button>

            {/* Texture image */}
            <div className="relative mb-3 aspect-square shadow-2xl shadow-black/40 rounded-lg overflow-hidden bg-black/20 text-center flex items-center justify-center">
                <img
                    src={`${texture.url}?t=${lastRefreshedAt}`}
                    alt={texture.prompt}
                    className="max-w-full max-h-full object-contain relative z-10"
                />
            </div>

            {/* Label & Actions */}
            <div className="flex flex-col gap-2">
                <p className="text-[10px] text-gray-400 leading-snug line-clamp-1 font-mono px-1">
                    {texture.itemPrompt || texture.prompt}
                </p>
                <button
                    onClick={() => startEditingTexture(texture)}
                    className="w-full group/btn relative py-1.5 rounded-lg bg-white/[0.03] border border-white/10 transition-all hover:bg-[#E6E6FA]/10 hover:border-[#E6E6FA]/30 overflow-hidden"
                    title="Regenerate Texture"
                >
                    <div className="flex items-center justify-center gap-1.5 text-[9px] text-[#E6E6FA] font-black uppercase tracking-widest relative z-10">
                        <svg className="w-3 h-3 group-hover/btn:rotate-180 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Reroll
                    </div>
                </button>
            </div>
        </div>
    );
});

export function AssetGeneratorPage() {
    const [activeTab, setActiveTab] = useState<"icons" | "battlemaps" | "world-assets" | "game-assets">("icons");

    // ── Prompt State (Shared or separate depending on tab) ──
    const [stylePrompt, setStylePrompt] = useState("");
    const [iconListText, setIconListText] = useState("");
    const [batchName, setBatchName] = useState("");

    // ── Texture Specific State ──
    const [textureCategory, setTextureCategory] = useState("battle_assets");
    const [textureSubCategory, setTextureSubCategory] = useState("ground");

    // ── Settings ──
    const [temperature, setTemperature] = useState(0.4);
    const [textureVariations, setTextureVariations] = useState(4);

    // ── Reference Image State ──
    const [referenceImage, setReferenceImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Generation State ──
    const [isGenerating, setIsGenerating] = useState(false);
    const [genProgress, setGenProgress] = useState({ current: 0, total: 0 });
    const [error, setError] = useState<string | null>(null);

    // ── Confirmation Modal ──
    const [showConfirm, setShowConfirm] = useState(false);
    const [pendingPrompts, setPendingPrompts] = useState<string[]>([]);

    // ── Browse State ──
    const [batches, setBatches] = useState<BatchSummary[]>([]);
    const [textureBatches, setTextureBatches] = useState<TextureBatchSummary[]>([]);
    const [activeBatch, setActiveBatch] = useState<BatchManifest | null>(null);
    const [activeTextureBatch, setActiveTextureBatch] = useState<TextureBatchManifest | null>(null);
    const [hoveredIcon, setHoveredIcon] = useState<BatchIcon | null>(null);

    // ── Export State ──
    const [isExporting, setIsExporting] = useState(false);
    const [exportResult, setExportResult] = useState<{ totalIcons: number; totalBatches: number } | null>(null);

    // ── Rename State ──
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState("");
    const [isRenameSaving, setIsRenameSaving] = useState(false);

    // ── Single Icon Regeneration ──
    const [editingIconFilename, setEditingIconFilename] = useState<string | null>(null);
    const [tempIconItem, setTempIconItem] = useState("");
    const [tempIconStyle, setTempIconStyle] = useState("");
    const [tempIconRefImage, setTempIconRefImage] = useState<string | null>(null);
    const [regeneratingIconFilename, setRegeneratingIconFilename] = useState<string | null>(null);
    const [hoveredTexture, setHoveredTexture] = useState<BatchTexture | null>(null);
    const [lastRefreshedAt, setLastRefreshedAt] = useState(Date.now());

    // ── Icon Assignment ──
    const [assigningIcon, setAssigningIcon] = useState<BatchIcon | null>(null);
    const [assignCategory, setAssignCategory] = useState<"traits" | "occupations" | "items" | "skills" | "characters">("items");
    const [assignEntityId, setAssignEntityId] = useState("");
    const [isAssigning, setIsAssigning] = useState(false);

    // ── Parse prompts from textarea ──
    const parsePrompts = useCallback((): string[] => {
        const basePrompts = iconListText
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (activeTab === "icons" || textureVariations <= 1) {
            return basePrompts;
        }

        // Duplicate each prompt based on the textureVariations count
        const duplicatedPrompts: string[] = [];
        basePrompts.forEach(prompt => {
            for (let i = 0; i < textureVariations; i++) {
                duplicatedPrompts.push(prompt);
            }
        });
        return duplicatedPrompts;
    }, [iconListText, activeTab, textureVariations]);

    // ── Load batches on mount ──
    const loadBatches = useCallback(async () => {
        try {
            const res = await fetch("/api/icons/batches");
            if (res.ok) {
                const data = await res.json();
                setBatches(data);
            }
        } catch {
            // silent
        }
    }, []);

    const loadTextureBatches = useCallback(async () => {
        try {
            const res = await fetch("/api/textures/batches");
            if (res.ok) {
                const data = await res.json();
                setTextureBatches(data);
            }
        } catch {
            // silent
        }
    }, []);

    useEffect(() => {
        loadBatches();
        loadTextureBatches();
    }, [loadBatches, loadTextureBatches]);

    // ── Image Upload Handling ──
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            // Extract just the base64 data part (remove "data:image/png;base64,")
            const base64Data = base64String.split(',')[1];
            setReferenceImage(base64Data);
        };
        reader.readAsDataURL(file);
    };

    const clearReferenceImage = () => {
        setReferenceImage(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    // ── Confirm step ──
    const handleGenerateClick = useCallback(() => {
        const prompts = parsePrompts();
        if (prompts.length === 0) return;
        setPendingPrompts(prompts);
        setShowConfirm(true);
    }, [parsePrompts]);

    // ── Actual generation ──
    const confirmAndGenerate = useCallback(async () => {
        setShowConfirm(false);
        if (pendingPrompts.length === 0) return;

        setIsGenerating(true);
        setGenProgress({ current: 0, total: pendingPrompts.length });
        setError(null);

        try {
            const payload: any = {
                prompts: pendingPrompts,
                stylePrompt: stylePrompt.trim(),
                temperature: temperature
            };
            if (referenceImage) {
                payload.base64Image = referenceImage;
            }
            if (batchName.trim()) {
                payload.batchName = batchName.trim();
            }

            if (activeTab === "icons") {
                const res = await fetch("/api/icons/generate-batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const msg = await res.text();
                    throw new Error(msg || `HTTP ${res.status}`);
                }
                const manifest: BatchManifest = await res.json();
                setActiveBatch(manifest);
                await loadBatches();
            } else {
                payload.category = textureCategory;
                if (textureSubCategory) {
                    payload.subCategory = textureSubCategory;
                }
                const res = await fetch("/api/textures/generate-batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const msg = await res.text();
                    throw new Error(msg || `HTTP ${res.status}`);
                }
                const manifest: TextureBatchManifest = await res.json();
                setActiveTextureBatch(manifest);
                await loadTextureBatches();
            }
        } catch (e: any) {
            setError(e.message || "Generation failed");
        } finally {
            setIsGenerating(false);
            setGenProgress({ current: 0, total: 0 });
        }
    }, [pendingPrompts, referenceImage, batchName, stylePrompt, temperature, activeTab, textureCategory, textureSubCategory, loadBatches, loadTextureBatches]);

    // ── Load a batch ──
    const selectBatch = useCallback(async (batchId: string) => {
        try {
            const res = await fetch(`/api/icons/batches/${batchId}`);
            if (res.ok) {
                const data: BatchManifest = await res.json();
                setActiveBatch(data);
            }
        } catch {
            // silent
        }
    }, []);

    const selectTextureBatch = useCallback(async (batchId: string) => {
        try {
            const res = await fetch(`/api/textures/batches/${batchId}`);
            if (res.ok) {
                const data: TextureBatchManifest = await res.json();
                setActiveTextureBatch(data);
                // Also set this as active in broader sense if we want to show it
            }
        } catch {
            // silent
        }
    }, []);

    const downloadIcon = useCallback((url: string) => {
        const a = document.createElement("a");
        a.href = url;
        a.download = url.split("/").pop() || "icon.png";
        a.click();
    }, []);

    // ── Export icons to code ──
    const handleExport = useCallback(async () => {
        setIsExporting(true);
        setExportResult(null);
        try {
            const endpoint = activeTab === "icons" ? "/api/icons/export" : "/api/textures/export";
            const res = await fetch(endpoint, { method: "POST" });
            if (!res.ok) {
                const msg = await res.text();
                throw new Error(msg || `HTTP ${res.status}`);
            }
            const data = await res.json();
            setExportResult({
                totalIcons: data.totalIcons || data.totalTextures || 0,
                totalBatches: data.totalBatches
            });
            setTimeout(() => setExportResult(null), 4000);
        } catch (e: any) {
            setError(e.message || "Export failed");
        } finally {
            setIsExporting(false);
        }
    }, [activeTab]);

    // ── Rename batch ──
    const startRename = useCallback(() => {
        if (activeTab === "icons" && activeBatch) {
            setRenameValue(activeBatch.batchName || "");
            setIsRenaming(true);
        } else if (activeTab === "battlemaps" && activeTextureBatch) {
            setRenameValue(activeTextureBatch.batchName || "");
            setIsRenaming(true);
        }
    }, [activeTab, activeBatch, activeTextureBatch]);

    const cancelRename = useCallback(() => {
        setIsRenaming(false);
        setRenameValue("");
    }, []);

    const confirmRename = useCallback(async () => {
        const batch = activeTab === "icons" ? activeBatch : activeTextureBatch;
        if (!batch || !renameValue.trim()) return;

        setIsRenameSaving(true);
        try {
            const endpoint = activeTab === "icons"
                ? `/api/icons/batches/${batch.batchId}/rename`
                : `/api/textures/batches/${batch.batchId}/rename`;

            const res = await fetch(endpoint, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newName: renameValue.trim() }),
            });
            if (res.ok) {
                if (activeTab === "icons") {
                    const data: BatchManifest = await res.json();
                    setActiveBatch(data);
                    await loadBatches();
                } else {
                    const data: TextureBatchManifest = await res.json();
                    setActiveTextureBatch(data);
                    await loadTextureBatches();
                }
                setIsRenaming(false);
                setRenameValue("");
            } else {
                const msg = await res.text();
                throw new Error(msg || `HTTP ${res.status}`);
            }
        } catch (e: any) {
            setError(e.message || "Rename failed");
        } finally {
            setIsRenameSaving(false);
        }
    }, [activeBatch, renameValue, loadBatches]);

    // ── Regenerate Icon handler ──
    const handleRegenerateIcon = useCallback(async (icon: BatchIcon) => {
        const hasContent = tempIconItem.trim() || tempIconStyle.trim();
        if (!activeBatch || !hasContent) return;

        setRegeneratingIconFilename(icon.filename);
        try {
            const payload: any = {
                itemPrompt: tempIconItem.trim(),
                stylePrompt: tempIconStyle.trim(),
                temperature: temperature
            };

            // Priority: Local ref image > Global ref image
            if (tempIconRefImage) {
                payload.base64Image = tempIconRefImage;
            } else if (referenceImage) {
                payload.base64Image = referenceImage;
            }

            const res = await fetch(`/api/icons/batches/${activeBatch.batchId}/icons/${icon.filename}/regenerate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const msg = await res.text();
                throw new Error(msg || `HTTP ${res.status}`);
            }

            // Refresh only the manifest to get the new URL/prompt
            // We append a timestamp to the URL to force browser refresh if filename is same
            const mRes = await fetch(`/api/icons/batches/${activeBatch.batchId}`);
            if (mRes.ok) {
                const refreshed: BatchManifest = await mRes.json();
                setActiveBatch(refreshed);
                setLastRefreshedAt(Date.now());
            }
            setEditingIconFilename(null);
        } catch (e: any) {
            setError(e.message || "Regeneration failed");
        } finally {
            setRegeneratingIconFilename(null);
        }
    }, [activeBatch, tempIconItem, tempIconStyle, referenceImage]);

    const startEditingIcon = useCallback((icon: BatchIcon) => {
        setEditingIconFilename(icon.filename);
        setTempIconRefImage(null); // Reset local ref
        // If we have separate fields, use them. 
        // Otherwise (legacy), the whole prompt goes to Style, and Item stays empty.
        if (icon.itemPrompt || icon.stylePrompt) {
            setTempIconItem(icon.itemPrompt || "");
            setTempIconStyle(icon.stylePrompt || "");
        } else {
            setTempIconItem("");
            setTempIconStyle(icon.prompt);
        }
    }, []);

    const handleLocalImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = (reader.result as string).split(",")[1];
            setTempIconRefImage(base64);
        };
        reader.readAsDataURL(file);
    };

    // ── Icon Assignment Handler ──
    useEffect(() => {
        if (assigningIcon) {
            GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
        }
    }, [assigningIcon]);

    const getAvailableEntities = () => {
        switch (assignCategory) {
            case "traits": return GameRegistry.getAllTraits();
            case "occupations": return GameRegistry.getAllOccupations();
            case "items": return GameRegistry.getAllItems();
            case "skills": return GameRegistry.getAllSkills();
            case "characters": return GameRegistry.getAllCharacters();
            default: return [];
        }
    };

    const handleAssignIcon = async () => {
        if (!assigningIcon || !assignEntityId) return;
        setIsAssigning(true);
        setError(null);
        try {
            const entityArray = getAvailableEntities();
            const entity = (entityArray as any[]).find(e => e.id === assignEntityId);
            if (!entity) throw new Error("Entity not found");

            const updatedEntity = { ...entity, icon: assigningIcon.url };
            const endpoint = `/api/data/${assignCategory}`;

            const res = await fetch(`http://127.0.0.1:8787${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedEntity)
            });

            if (!res.ok) throw new Error(`Failed to assign icon: ${res.statusText}`);

            await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
            setAssigningIcon(null);
            setAssignEntityId("");
        } catch (e: any) {
            setError(e.message || "Failed to assign icon");
        } finally {
            setIsAssigning(false);
        }
    };

    // The raw line count (for UI display of pending items)
    const rawLineCount = iconListText.split("\n").filter(l => l.trim().length > 0).length;

    return (
        <div className="flex flex-col h-screen bg-[#070b12] text-gray-300 font-sans overflow-hidden">
            {/* ══ Tool-Specific Sub-Header ══ */}
            <div className="fixed top-16 left-0 right-0 z-30 bg-[#030508]/60 backdrop-blur-md border-b border-white/5 pointer-events-auto flex items-center justify-between px-6 h-12 shadow-2xl">
                <div className="flex items-center gap-4">
                    <h1 className="text-[10px] font-black tracking-[0.3em] text-white uppercase">ASSET GENERATOR</h1>

                    {/* Tab Switcher */}
                    <div className="flex items-center bg-white/5 p-1 rounded-lg border border-white/10 ml-4 scale-90">
                        <button
                            onClick={() => setActiveTab("icons")}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest transition-all ${activeTab === "icons"
                                ? "bg-[#E6E6FA]/20 text-[#E6E6FA] shadow-lg shadow-black/20"
                                : "text-gray-500 hover:text-gray-300"
                                }`}
                        >
                            ICONS
                        </button>
                        <button
                            onClick={() => setActiveTab("battlemaps")}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest transition-all ${activeTab === "battlemaps"
                                ? "bg-[#E6E6FA]/20 text-[#E6E6FA] shadow-lg shadow-black/20"
                                : "text-gray-500 hover:text-gray-300"
                                }`}
                        >
                            BATTLEMAPS
                        </button>
                        <button
                            onClick={() => setActiveTab("world-assets")}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest transition-all ${activeTab === "world-assets"
                                ? "bg-[#E6E6FA]/20 text-[#E6E6FA] shadow-lg shadow-black/20"
                                : "text-gray-500 hover:text-gray-300"
                                }`}
                        >
                            WORLD ASSETS
                        </button>
                        <button
                            onClick={() => setActiveTab("game-assets")}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest transition-all ${activeTab === "game-assets"
                                ? "bg-[#E6E6FA]/20 text-[#E6E6FA] shadow-lg shadow-black/20"
                                : "text-gray-500 hover:text-gray-300"
                                }`}
                        >
                            GAME ASSETS
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-3 scale-90">
                    <button
                        onClick={handleExport}
                        disabled={isExporting || batches.length === 0}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border transition-all text-[10px] font-bold tracking-[0.1em] ${isExporting
                            ? "border-white/5 bg-white/5 text-gray-500 cursor-wait"
                            : batches.length === 0
                                ? "border-white/5 bg-white/5 text-gray-600 cursor-not-allowed"
                                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                            }`}
                    >
                        {isExporting ? "EXPORTING..." : "EXPORT TO CODE"}
                    </button>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 flex overflow-hidden pt-28">
                {/* ── Left Panel: Prompt & Settings ── */}
                <aside className="w-[440px] shrink-0 border-r border-white/5 bg-[#0a0f16] flex flex-col p-4 overflow-hidden">
                    {/* Scrollable container for configuration sections */}
                    <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 mb-4">
                        {/* Prompts Section */}
                        <Card className="!bg-[#0f1520] !border-white/5 shrink-0">
                            <CardHeader className="!bg-transparent !border-white/5 !py-2.5">
                                <h3 className="text-[9px] font-bold tracking-[0.15em] text-[#E6E6FA]">
                                    {activeTab === "icons" ? "PROMPTING" : "TEXTURE CONFIG"}
                                </h3>
                            </CardHeader>
                            <CardContent className="space-y-3 max-h-[300px] overflow-y-auto">
                                {activeTab === "battlemaps" && (
                                    <>
                                        <div>
                                            <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">
                                                Category
                                            </label>
                                            <div className="grid grid-cols-2 gap-2">
                                                {["battle_assets", "character", "item"].map((cat) => (
                                                    <button
                                                        key={cat}
                                                        onClick={() => setTextureCategory(cat)}
                                                        className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider border transition-all ${textureCategory === cat
                                                            ? "bg-[#E6E6FA]/10 border-[#E6E6FA]/40 text-[#E6E6FA]"
                                                            : "bg-white/[0.02] border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300"
                                                            }`}
                                                    >
                                                        {cat.replace("_", " ").toUpperCase()}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {textureCategory === "battle_assets" && (
                                            <div>
                                                <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">
                                                    Sub-Category
                                                </label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {["ground", "obstacle", "battlemap"].map((sub) => (
                                                        <button
                                                            key={sub}
                                                            onClick={() => setTextureSubCategory(sub)}
                                                            className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider border transition-all ${textureSubCategory === sub
                                                                ? "bg-[#E6E6FA]/10 border-[#E6E6FA]/40 text-[#E6E6FA]"
                                                                : "bg-white/[0.02] border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300"
                                                                }`}
                                                        >
                                                            {sub.toUpperCase()}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Style Description */}
                                <div>
                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">
                                        {activeTab === "icons" ? "Global Modifier" : "Global Style Modifier"}
                                    </label>
                                    <input
                                        type="text"
                                        value={stylePrompt}
                                        onChange={(e) => setStylePrompt(e.target.value)}
                                        placeholder={activeTab === "icons" ? "e.g. 'glowing dark-magic'" : "e.g. 'realistic metallic', 'stylized stone'"}
                                        className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30 transition-colors font-mono"
                                    />
                                    <p className="text-[8px] text-gray-600 mt-1 uppercase tracking-wider">
                                        Prefixed to every item in the list below.
                                    </p>
                                </div>

                                {/* List */}
                                <div>
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="block text-[8px] text-gray-500 tracking-wider uppercase">
                                            {activeTab === "icons" ? "Icon List" : activeTab === "battlemaps" ? "Battlemap List" : "Asset List"}
                                        </label>
                                        <span className="text-[8px] text-[#E6E6FA] font-mono bg-[#E6E6FA]/10 px-1.5 py-0.5 rounded">
                                            {rawLineCount} ITEMS
                                        </span>
                                    </div>
                                    <textarea
                                        value={iconListText}
                                        onChange={(e) => setIconListText(e.target.value)}
                                        placeholder={activeTab === "icons" ? "potion bottle\niron sword" : activeTab === "battlemaps" ? "cobblestone path\ndirt field" : "e.g. descriptive asset prompt"}
                                        rows={4}
                                        className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30 resize-none transition-colors font-mono leading-relaxed"
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        {/* Reference Image */}
                        <Card className="!bg-[#0f1520] !border-white/5 shrink-0">
                            <CardHeader className="!bg-transparent !border-white/5 !py-2.5">
                                <h3 className="text-[9px] font-bold tracking-[0.15em] text-[#E6E6FA]">REFERENCE IMAGE</h3>
                            </CardHeader>
                            <CardContent className="max-h-[160px] overflow-y-auto">
                                <input
                                    type="file"
                                    accept="image/png, image/jpeg, image/webp"
                                    className="hidden"
                                    ref={fileInputRef}
                                    onChange={handleImageUpload}
                                />

                                {!referenceImage ? (
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full h-20 border-2 border-dashed border-white/10 rounded-lg flex flex-col items-center justify-center gap-1.5 text-gray-500 hover:text-gray-300 hover:border-white/20 transition-all bg-white/[0.02]"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        <span className="text-[9px] tracking-widest font-bold">UPLOAD IMAGE</span>
                                    </button>
                                ) : (
                                    <div className="relative w-full h-20 rounded-lg overflow-hidden border border-[#E6E6FA]/30 group">
                                        <img
                                            src={`data:image/png;base64,${referenceImage}`}
                                            alt="Reference"
                                            className="w-full h-full object-cover blur-[2px] opacity-50"
                                        />
                                        <img
                                            src={`data:image/png;base64,${referenceImage}`}
                                            alt="Reference"
                                            className="absolute inset-0 w-full h-full object-contain"
                                        />
                                        <button
                                            onClick={clearReferenceImage}
                                            className="absolute top-2 right-2 w-6 h-6 bg-black/50 backdrop-blur rounded text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 hover:text-red-400"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                )}
                                <p className="text-[8px] text-gray-600 mt-2 uppercase tracking-wider">
                                    Influences shape, color, and composition.
                                </p>
                            </CardContent>
                        </Card>

                        {/* Batch Name */}
                        <Card className="!bg-[#0f1520] !border-white/5 shrink-0">
                            <CardHeader className="!bg-transparent !border-white/5 !py-2.5">
                                <h3 className="text-[9px] font-bold tracking-[0.15em] text-[#E6E6FA]">BATCH NAME</h3>
                            </CardHeader>
                            <CardContent className="max-h-[100px] overflow-y-auto">
                                <input
                                    type="text"
                                    value={batchName}
                                    onChange={(e) => setBatchName(e.target.value)}
                                    placeholder="e.g. 'weapons', 'potions'"
                                    className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30 transition-colors font-mono"
                                />
                                <p className="text-[8px] text-gray-600 mt-1 uppercase tracking-wider">
                                    Used as the folder name in Icons/. Leave empty for auto-generated ID.
                                </p>
                            </CardContent>
                        </Card>

                        {/* Settings */}
                        <Card className="!bg-[#0f1520] !border-white/5 shrink-0">
                            <CardHeader className="!bg-transparent !border-white/5 !py-2.5">
                                <h3 className="text-[9px] font-bold tracking-[0.15em] text-[#E6E6FA]">SETTINGS</h3>
                            </CardHeader>
                            <CardContent className="space-y-3 max-h-[180px] overflow-y-auto">
                                <Slider
                                    label="TEMPERATURE"
                                    value={temperature}
                                    min={0.1}
                                    max={1.0}
                                    step={0.1}
                                    format={(v) => v.toFixed(1)}
                                    onChange={setTemperature}
                                />
                                {activeTab === "battlemaps" && (
                                    <Slider
                                        label="VARIATIONS PER PROMPT"
                                        value={textureVariations}
                                        min={1}
                                        max={10}
                                        step={1}
                                        format={(v) => v.toString()}
                                        onChange={setTextureVariations}
                                    />
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Pinned Action Area */}
                    <div className="shrink-0 pt-2 flex flex-col gap-2 border-t border-white/5">
                        <Button
                            onClick={handleGenerateClick}
                            disabled={rawLineCount === 0 || isGenerating}
                            className={`!w-full !py-3 !text-[11px] !font-bold !tracking-[0.2em] !rounded-lg transition-all ${isGenerating
                                ? "!bg-[#E6E6FA]/10 !text-[#E6E6FA]/50 !cursor-wait"
                                : "!bg-[#E6E6FA]/20 !text-[#E6E6FA] hover:!bg-[#E6E6FA]/30 !border !border-[#E6E6FA]/20"
                                }`}
                        >
                            {isGenerating ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="inline-block w-3 h-3 border-2 border-[#E6E6FA]/30 border-t-[#E6E6FA] rounded-full animate-spin" />
                                    GENERATING {genProgress.total} {activeTab.toUpperCase()}...
                                </span>
                            ) : (
                                `⚡ BAKE ${rawLineCount > 0 ? rawLineCount : ""} ${activeTab === "icons" ? "ICON" : activeTab === "battlemaps" ? "BATTLEMAP" : "ASSET"}${rawLineCount !== 1 ? "S" : ""}`
                            )}
                        </Button>

                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                                {error}
                            </div>
                        )}
                    </div>
                </aside>

                {/* ── Middle: Batch Browser ── */}
                <div className="w-[200px] shrink-0 border-r border-white/5 bg-[#080d14] overflow-y-auto">
                    <div className="p-3 border-b border-white/5">
                        <h3 className="text-[10px] font-bold tracking-[0.15em] text-gray-500 uppercase">
                            {activeTab === "icons" ? "Icon Batches" : activeTab === "battlemaps" ? "Battlemap Batches" : "Asset Batches"}
                        </h3>
                    </div>
                    {activeTab === "icons" ? (
                        batches.length === 0 ? (
                            <div className="p-4 text-center text-[10px] text-gray-600 tracking-wider uppercase">
                                No Icon Batches
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {batches.map((batch) => (
                                    <button
                                        key={batch.batchId}
                                        onClick={() => selectBatch(batch.batchId)}
                                        className={`flex items-center gap-3 px-3 py-3 text-left border-b border-white/5 transition-all ${activeBatch?.batchId === batch.batchId
                                            ? "bg-[#E6E6FA]/10 border-l-2 !border-l-[#E6E6FA]/50"
                                            : "hover:bg-white/[0.03]"
                                            }`}
                                    >
                                        {/* Thumbnail */}
                                        {batch.thumbnailUrl ? (
                                            <img
                                                src={batch.thumbnailUrl}
                                                alt=""
                                                className="w-8 h-8 rounded border border-white/10 shrink-0 object-cover"
                                            />
                                        ) : (
                                            <div className="w-8 h-8 rounded border border-white/10 bg-white/5 shrink-0 flex items-center justify-center text-xs">🎨</div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[10px] font-bold text-gray-300 tracking-wider truncate">
                                                {batch.batchName || batch.batchId.substring(0, 8).toUpperCase()}
                                            </div>
                                            <div className="text-[9px] text-gray-600">
                                                {batch.iconCount} icon{batch.iconCount !== 1 ? "s" : ""} · {new Date(batch.createdAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )
                    ) : (
                        textureBatches.length === 0 ? (
                            <div className="p-4 text-center text-[10px] text-gray-600 tracking-wider uppercase">
                                No Texture Batches
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {textureBatches.map((batch) => (
                                    <button
                                        key={batch.batchId}
                                        onClick={() => selectTextureBatch(batch.batchId)}
                                        className={`flex items-center gap-3 px-3 py-3 text-left border-b border-white/5 transition-all ${activeTextureBatch?.batchId === batch.batchId
                                            ? "bg-[#E6E6FA]/10 border-l-2 !border-l-[#E6E6FA]/50"
                                            : "hover:bg-white/[0.03]"
                                            }`}
                                    >
                                        {/* Thumbnail */}
                                        {batch.thumbnailUrl ? (
                                            <img
                                                src={batch.thumbnailUrl}
                                                alt=""
                                                className="w-8 h-8 rounded border border-white/10 shrink-0 object-cover"
                                            />
                                        ) : (
                                            <div className="w-8 h-8 rounded border border-white/10 bg-white/5 shrink-0 flex items-center justify-center text-xs">🖼️</div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[10px] font-bold text-gray-300 tracking-wider truncate">
                                                {batch.batchName || batch.batchId.substring(0, 8).toUpperCase()}
                                            </div>
                                            <div className="text-[8px] text-gray-500 uppercase tracking-[0.05em] mb-0.5">
                                                {batch.category.replace("_", " ")} {batch.subCategory ? `· ${batch.subCategory}` : ""}
                                            </div>
                                            <div className="text-[9px] text-gray-600">
                                                {batch.textureCount} txtrs · {new Date(batch.createdAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )
                    )}
                </div>

                {/* ── Right: Gallery ── */}
                <main className="flex-1 overflow-y-auto p-8 relative">
                    {((activeTab === "icons" && !activeBatch) || (activeTab === "battlemaps" && !activeTextureBatch)) && !isGenerating ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="text-6xl mb-6 opacity-30">{activeTab === "icons" ? "🎨" : "🖼️"}</div>
                            <h2 className="text-lg font-bold text-gray-500 tracking-wider mb-2">NO BATCH SELECTED</h2>
                            <p className="text-sm text-gray-600 max-w-sm">
                                {activeTab === "icons"
                                    ? "Enter an icon list (one item per line), add an optional style modifier or reference image, and click Generate."
                                    : `Select a category (${textureCategory.replace("_", " ")}), enter a texture list, and click Generate.`}
                            </p>
                        </div>
                    ) : (activeTab === "icons" && activeBatch) ? (
                        <div className="space-y-6">
                            {/* Batch Header */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {isRenaming ? (
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={renameValue}
                                                onChange={(e) => setRenameValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") confirmRename();
                                                    if (e.key === "Escape") cancelRename();
                                                }}
                                                autoFocus
                                                className="bg-[#080d14] border border-[#E6E6FA]/30 rounded px-2 py-1 text-sm text-[#E6E6FA] font-mono focus:outline-none focus:border-[#E6E6FA]/60 w-48"
                                                placeholder="batch name..."
                                            />
                                            <button
                                                onClick={confirmRename}
                                                disabled={isRenameSaving || !renameValue.trim()}
                                                className="w-6 h-6 flex items-center justify-center rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-all disabled:opacity-30"
                                                title="Confirm"
                                            >
                                                {isRenameSaving ? (
                                                    <span className="inline-block w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                                                ) : (
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </button>
                                            <button
                                                onClick={cancelRename}
                                                className="w-6 h-6 flex items-center justify-center rounded bg-white/5 text-gray-400 hover:bg-white/10 transition-all"
                                                title="Cancel"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <h2 className="text-[10px] font-bold tracking-[0.15em] text-gray-500">
                                                <span className="text-[#E6E6FA]">{activeBatch.batchName || activeBatch.batchId.substring(0, 8).toUpperCase()}</span>
                                            </h2>
                                            <button
                                                onClick={startRename}
                                                className="w-5 h-5 flex items-center justify-center rounded bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300 transition-all"
                                                title="Rename batch"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                            </button>
                                        </>
                                    )}
                                    <p className="text-[9px] text-gray-600">
                                        {activeBatch.icons.length} icons · {new Date(activeBatch.createdAt).toLocaleString()}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setActiveBatch(null)}
                                    className="text-[10px] tracking-wider text-gray-600 hover:text-gray-300 transition-colors"
                                >
                                    CLOSE
                                </button>
                            </div>

                            {/* Icons Grid */}
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
                                {activeBatch.icons.map((icon, i) => (
                                    <IconCard
                                        key={`${icon.url}-${i}`}
                                        icon={icon}
                                        lastRefreshedAt={lastRefreshedAt}
                                        setHoveredIcon={setHoveredIcon}
                                        downloadIcon={downloadIcon}
                                        setAssigningIcon={setAssigningIcon}
                                        startEditingIcon={startEditingIcon}
                                    />
                                ))}
                            </div>

                            {/* Global Hover Preview - Moved to the far right and made smaller */}
                            {hoveredIcon && (
                                <div className="fixed top-1/2 right-8 -translate-y-1/2 z-[60] p-4 bg-[#0a0f16]/95 backdrop-blur-xl border border-[#E6E6FA]/20 rounded-xl shadow-2xl shadow-black pointer-events-none select-none">
                                    <div className="flex flex-col items-center">
                                        <img
                                            src={`${hoveredIcon.url}?t=${lastRefreshedAt}`}
                                            alt="preview"
                                            className="w-[256px] h-[256px] rounded-lg shadow-inner bg-black/20"
                                        />
                                        <p className="text-[10px] text-gray-400 text-center mt-4 max-w-[256px] font-mono leading-relaxed break-words whitespace-pre-wrap px-1">
                                            {hoveredIcon.prompt}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (activeTab === "battlemaps" && activeTextureBatch) ? (
                        <div className="space-y-6">
                            {/* Texture Batch Header */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-[10px] font-bold tracking-[0.15em] text-gray-500">
                                        <span className="text-[#E6E6FA]">{activeTextureBatch.batchName || activeTextureBatch.batchId.substring(0, 8).toUpperCase()}</span>
                                    </h2>
                                    <p className="text-[9px] text-gray-400 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded">
                                        {activeTextureBatch.category.replace("_", " ")} {activeTextureBatch.subCategory ? `· ${activeTextureBatch.subCategory}` : ""}
                                    </p>
                                    <p className="text-[9px] text-gray-600">
                                        {activeTextureBatch.textures.length} textures · {new Date(activeTextureBatch.createdAt).toLocaleString()}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setActiveTextureBatch(null)}
                                    className="text-[10px] tracking-wider text-gray-600 hover:text-gray-300 transition-colors"
                                >
                                    CLOSE
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 pb-20">
                                {activeTextureBatch.textures.map((texture) => (
                                    <TextureCard
                                        key={texture.filename}
                                        texture={texture}
                                        lastRefreshedAt={lastRefreshedAt}
                                        setHoveredTexture={setHoveredTexture}
                                        downloadTexture={downloadIcon}
                                        startEditingTexture={() => { }} // TODO
                                    />
                                ))}
                            </div>
                        </div>
                    ) : (
                        /* Generating shimmer */
                        <div className="space-y-6">
                            <h2 className="text-[10px] font-bold tracking-[0.15em] text-gray-500">
                                GENERATING <span className="text-[#E6E6FA]">{genProgress.total}</span> {activeTab.toUpperCase()}...
                            </h2>
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-4">
                                {Array.from({ length: genProgress.total }).map((_, i) => (
                                    <div
                                        key={`shimmer-${i}`}
                                        className="flex flex-col items-center bg-[#0f1520] border border-white/5 rounded-xl p-4 animate-pulse h-[140px]"
                                    >
                                        <div className="w-16 h-16 bg-white/5 rounded mb-3 flex-shrink-0" />
                                        <div className="w-full space-y-2">
                                            <div className="w-full h-2 bg-white/5 rounded" />
                                            <div className="w-2/3 h-2 bg-white/5 rounded mx-auto" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </main>
            </div >

            {/* ── Confirmation Modal ── */}
            < Modal open={showConfirm} onClose={() => setShowConfirm(false)
            } title="CONFIRM BATCH GENERATION" >
                <div className="space-y-4 p-4">
                    <div className="flex items-center justify-between bg-[#0f1520] border border-white/5 rounded-lg p-4">
                        <div>
                            <p className="text-[10px] text-gray-500 tracking-wider mb-1">ICONS TO GENERATE</p>
                            <p className="text-3xl font-black text-[#E6E6FA]">{pendingPrompts.length}</p>
                        </div>
                        {referenceImage && (
                            <div className="text-right pl-4 border-l border-white/10">
                                <p className="text-[10px] text-[#E6E6FA] tracking-wider mb-1">REF IMAGE</p>
                                <img src={`data:image/png;base64,${referenceImage}`} className="w-8 h-8 rounded shrink-0 object-cover" alt="ref" />
                            </div>
                        )}
                    </div>

                    <div className="bg-[#0f1520] border border-white/5 rounded-lg p-3 max-h-[200px] overflow-y-auto">
                        <p className="text-[9px] text-gray-500 tracking-wider mb-2">FULL PROMPTS (MODIFIER + ITEM)</p>
                        {pendingPrompts.map((p, i) => (
                            <div key={i} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0 overflow-hidden">
                                <span className="text-[9px] text-gray-600 font-mono w-5 shrink-0 text-right">{i + 1}.</span>
                                <span className="text-[10px] text-gray-300 font-mono whitespace-nowrap overflow-hidden text-ellipsis" title={p}>{p}</span>
                            </div>
                        ))}
                    </div>

                    {pendingPrompts.length > 10 && (
                        <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] tracking-wider">
                            ⚠ LARGE BATCH — THIS MAY TAKE SEVERAL MINUTES
                        </div>
                    )}

                    <div className="flex items-center gap-3 pt-2">
                        <button
                            onClick={() => setShowConfirm(false)}
                            className="flex-1 py-2.5 rounded-lg border border-white/10 text-gray-400 text-[11px] font-bold tracking-[0.15em] hover:bg-white/5 transition-all"
                        >
                            CANCEL
                        </button>
                        <button
                            onClick={confirmAndGenerate}
                            className="flex-1 py-2.5 rounded-lg bg-[#E6E6FA]/20 border border-[#E6E6FA]/30 text-[#E6E6FA] text-[11px] font-bold tracking-[0.15em] hover:bg-[#E6E6FA]/30 transition-all font-sans"
                        >
                            ⚡ BAKE {pendingPrompts.length} {activeTab === "icons" ? "ICONS" : "TEXTURES"}
                        </button>
                    </div>
                </div>
            </Modal >

            {/* ── Assign Icon Modal ── */}
            < Modal open={!!assigningIcon} onClose={() => setAssigningIcon(null)} title="ASSIGN SECURED ICON" >
                <div className="space-y-6 p-4">
                    {assigningIcon && (
                        <div className="flex items-center gap-4 bg-[#0f1520] border border-white/10 rounded-lg p-4">
                            <img src={assigningIcon.url} alt="To Assign" className="w-16 h-16 rounded border border-white/10 shrink-0" />
                            <div>
                                <h4 className="text-[10px] font-bold tracking-[0.15em] text-[#E6E6FA] mb-1">ICON TO ASSIGN</h4>
                                <p className="text-[11px] font-mono text-gray-400">{assigningIcon.itemPrompt || assigningIcon.prompt}</p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-500 tracking-[0.15em]">CATEGORY</label>
                            <select
                                value={assignCategory}
                                onChange={e => {
                                    setAssignCategory(e.target.value as any);
                                    setAssignEntityId("");
                                }}
                                className="w-full bg-[#080d14] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50 transition-colors"
                            >
                                <option value="items">Items</option>
                                <option value="skills">Skills</option>
                                <option value="traits">Traits</option>
                                <option value="occupations">Occupations</option>
                                <option value="characters">Characters/Monsters</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-gray-500 tracking-[0.15em]">ENTITY</label>
                            <select
                                value={assignEntityId}
                                onChange={e => setAssignEntityId(e.target.value)}
                                className="w-full bg-[#080d14] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50 transition-colors"
                            >
                                <option value="" disabled>-- Select {assignCategory} --</option>
                                {getAvailableEntities().map((e: any) => (
                                    <option key={e.id} value={e.id}>
                                        {e.name} ({e.id})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2 pt-4">
                        <button
                            onClick={handleAssignIcon}
                            disabled={!assignEntityId || isAssigning}
                            className="w-full py-3 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold tracking-[0.2em] hover:bg-emerald-500/30 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                        >
                            {isAssigning ? (
                                <>
                                    <span className="inline-block w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                                    ASSIGNING...
                                </>
                            ) : (
                                "CONFIRM BINDING"
                            )}
                        </button>
                        <button
                            onClick={() => setAssigningIcon(null)}
                            disabled={isAssigning}
                            className="w-full py-2.5 rounded-lg border border-white/5 text-gray-500 text-[10px] font-bold tracking-[0.1em] hover:bg-white/5 hover:text-gray-300 transition-all"
                        >
                            CANCEL
                        </button>
                    </div>
                </div>
            </Modal >

            {/* ── Icon Regeneration Frameless Overlay ── */}
            {
                editingIconFilename && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                        <div className="relative w-[700px] bg-[#0a1120] rounded-[24px] border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in zoom-in duration-200">
                            {/* Close button - Top Right */}
                            <button
                                onClick={() => setEditingIconFilename(null)}
                                className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all z-20"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>

                            <div className="flex p-10 gap-10">
                                {/* Left Column */}
                                <div className="w-[200px] shrink-0 space-y-8">
                                    <div className="relative aspect-square bg-[#E6E6FA]/5 rounded-[20px] border border-[#E6E6FA]/10 flex items-center justify-center overflow-hidden shadow-inner">
                                        <div className="absolute inset-0 bg-gradient-to-br from-[#E6E6FA]/10 to-transparent opacity-40" />
                                        <img
                                            src={activeBatch?.icons.find(i => i.filename === editingIconFilename)?.url + `?t=${lastRefreshedAt}`}
                                            className="w-32 h-32 relative z-10 drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]"
                                            alt="Current"
                                        />
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 px-1">
                                            <div className="w-1 h-3 bg-emerald-500 rounded-full" />
                                            <label className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">Subject</label>
                                        </div>
                                        <input
                                            type="text"
                                            value={tempIconItem}
                                            onChange={(e) => setTempIconItem(e.target.value)}
                                            className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-medium focus:outline-none focus:border-emerald-500/40 transition-all placeholder:text-white/10"
                                            placeholder="Item name..."
                                        />
                                    </div>
                                </div>

                                {/* Right Column */}
                                <div className="flex-1 flex flex-col gap-8 pt-2">
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between px-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-3 bg-[#E6E6FA] rounded-full" />
                                                <label className="text-[10px] text-[#E6E6FA] font-black uppercase tracking-widest">Global Style</label>
                                            </div>
                                            <div className="relative">
                                                <div
                                                    className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center cursor-pointer hover:border-[#E6E6FA]/40 hover:bg-white/10 transition-all shadow-lg overflow-hidden group/ref"
                                                    onClick={() => document.getElementById(`modal-ref-upload`)?.click()}
                                                >
                                                    {(tempIconRefImage || referenceImage) ? (
                                                        <img src={`data:image/png;base64,${tempIconRefImage || referenceImage}`} className="w-full h-full object-cover" alt="ref" />
                                                    ) : (
                                                        <svg className="w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <input id="modal-ref-upload" type="file" className="hidden" onChange={handleLocalImageUpload} />
                                            </div>
                                        </div>
                                        <textarea
                                            value={tempIconStyle}
                                            onChange={(e) => setTempIconStyle(e.target.value)}
                                            className="w-full bg-[#070b12]/50 border border-white/10 rounded-2xl px-5 py-4 text-[12px] text-white/50 font-mono focus:outline-none focus:border-[#E6E6FA]/40 min-h-[160px] resize-none leading-relaxed transition-all shadow-inner custom-scrollbar"
                                            placeholder="Artistic parameters..."
                                        />
                                    </div>

                                    <div className="flex items-center justify-between pt-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${tempIconItem.trim() ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-white/10'}`} />
                                            <span className="text-[9px] text-white/20 font-black uppercase tracking-[0.2em]">
                                                {tempIconItem.trim() ? 'Ready' : 'Awaiting subject'}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const icon = activeBatch?.icons.find(i => i.filename === editingIconFilename);
                                                if (icon) handleRegenerateIcon(icon);
                                            }}
                                            disabled={regeneratingIconFilename === editingIconFilename || !tempIconItem.trim()}
                                            className={`px-10 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] transition-all ${regeneratingIconFilename === editingIconFilename
                                                ? "bg-white/5 text-white/10 cursor-not-allowed"
                                                : "bg-white text-[#070b12] hover:bg-[#E6E6FA] shadow-[0_10px_40px_rgba(255,255,255,0.1)] hover:-translate-y-0.5"
                                                }`}
                                        >
                                            {regeneratingIconFilename === editingIconFilename ? "..." : "⚡ Regenerate"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
