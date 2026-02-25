import { useState, useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Button, Slider, Card, CardHeader, CardContent, Modal } from "@ashtrail/ui";

// Presets removed; reference image serves as style

interface BatchIcon {
    filename: string;
    prompt: string;
    url: string;
}

interface BatchManifest {
    batchId: string;
    batchName: string;
    createdAt: string;
    icons: BatchIcon[];
}

interface BatchSummary {
    batchId: string;
    batchName: string;
    iconCount: number;
    createdAt: string;
    thumbnailUrl: string | null;
}

export function IconGenPage() {
    // ── Prompt State ──
    const [stylePrompt, setStylePrompt] = useState("");
    const [iconListText, setIconListText] = useState("");
    const [batchName, setBatchName] = useState("");

    // ── Settings ──
    const [temperature, setTemperature] = useState(0.4);

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
    const [activeBatch, setActiveBatch] = useState<BatchManifest | null>(null);
    const [hoveredIcon, setHoveredIcon] = useState<string | null>(null);

    // ── Export State ──
    const [isExporting, setIsExporting] = useState(false);
    const [exportResult, setExportResult] = useState<{ totalIcons: number; totalBatches: number } | null>(null);

    // ── Parse prompts from textarea ──
    const parsePrompts = useCallback((): string[] => {
        return iconListText
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .map(line => stylePrompt.trim() ? `${stylePrompt.trim()} ${line}` : line);
    }, [iconListText, stylePrompt]);

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

    useEffect(() => {
        loadBatches();
    }, [loadBatches]);

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
            const payload: any = { prompts: pendingPrompts };
            if (referenceImage) {
                payload.base64Image = referenceImage;
            }
            if (batchName.trim()) {
                payload.batchName = batchName.trim();
            }

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
        } catch (e: any) {
            setError(e.message || "Generation failed");
        } finally {
            setIsGenerating(false);
            setGenProgress({ current: 0, total: 0 });
        }
    }, [pendingPrompts, referenceImage, batchName, loadBatches]);

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
            const res = await fetch("/api/icons/export", { method: "POST" });
            if (!res.ok) {
                const msg = await res.text();
                throw new Error(msg || `HTTP ${res.status}`);
            }
            const data = await res.json();
            setExportResult({ totalIcons: data.totalIcons, totalBatches: data.totalBatches });
            setTimeout(() => setExportResult(null), 4000);
        } catch (e: any) {
            setError(e.message || "Export failed");
        } finally {
            setIsExporting(false);
        }
    }, []);

    // The raw line count (for UI display of pending items)
    const rawLineCount = iconListText.split("\n").filter(l => l.trim().length > 0).length;

    return (
        <div className="flex flex-col h-screen bg-[#070b12] text-gray-300 font-sans overflow-hidden">
            {/* ── Header ── */}
            <header className="shrink-0 bg-[#030508]/90 backdrop-blur-md border-b border-white/5 z-30">
                <div className="h-16 flex items-center px-6 gap-6">
                    <Link
                        to="/"
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-all"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                    </Link>
                    <h1 className="text-xs font-black tracking-[0.3em] text-white">
                        ASHTRAIL <span className="text-gray-600 font-normal tracking-widest">| ICON FORGE</span>
                    </h1>
                    <div className="ml-auto flex items-center gap-3 text-[10px] tracking-widest text-gray-600">
                        {exportResult && (
                            <span className="text-emerald-400 tracking-wider animate-pulse">
                                ✓ {exportResult.totalIcons} icons exported ({exportResult.totalBatches} batches)
                            </span>
                        )}
                        <button
                            onClick={handleExport}
                            disabled={isExporting || batches.length === 0}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border transition-all text-[10px] font-bold tracking-[0.1em] ${isExporting
                                ? "border-white/5 bg-white/5 text-gray-500 cursor-wait"
                                : batches.length === 0
                                    ? "border-white/5 bg-white/5 text-gray-600 cursor-not-allowed"
                                    : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                                }`}
                            title="Export all batches to game-assets/assets/icons/"
                        >
                            {isExporting ? (
                                <>
                                    <span className="inline-block w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                                    EXPORTING...
                                </>
                            ) : (
                                <>
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                    EXPORT TO CODE
                                </>
                            )}
                        </button>
                        <span className="inline-block w-2 h-2 rounded-full bg-amber-500/60" />
                        WIP
                    </div>
                </div>
            </header>

            {/* ── Body ── */}
            <div className="flex-1 flex overflow-hidden">
                {/* ── Left Panel: Prompt & Settings ── */}
                <aside className="w-[360px] shrink-0 border-r border-white/5 bg-[#0a0f16] overflow-y-auto p-5 flex flex-col gap-5">
                    {/* Removed Style Presets */}
                    {/* Prompts Section */}
                    <Card className="!bg-[#0f1520] !border-white/5">
                        <CardHeader className="!bg-transparent !border-white/5">
                            <h3 className="text-[10px] font-bold tracking-[0.15em] text-[#E6E6FA]">PROMPTING</h3>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Style Description */}
                            <div>
                                <label className="block text-[9px] text-gray-500 tracking-wider mb-2">
                                    GLOBAL MODIFIER (OPTIONAL)
                                </label>
                                <input
                                    type="text"
                                    value={stylePrompt}
                                    onChange={(e) => setStylePrompt(e.target.value)}
                                    placeholder="e.g. 'glowing dark-magic'"
                                    className="w-full bg-[#080d14] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30 transition-colors font-mono"
                                />
                                <p className="text-[8px] text-gray-600 mt-1 uppercase tracking-wider">
                                    Prefixed to every item in the list below.
                                </p>
                            </div>

                            {/* Icon List */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-[9px] text-gray-500 tracking-wider">
                                        ICON LIST (ONE PER LINE)
                                    </label>
                                    <span className="text-[9px] text-[#E6E6FA] font-mono bg-[#E6E6FA]/10 px-1.5 py-0.5 rounded">
                                        {rawLineCount} ITEMS
                                    </span>
                                </div>
                                <textarea
                                    value={iconListText}
                                    onChange={(e) => setIconListText(e.target.value)}
                                    placeholder={"potion bottle\niron sword\nwooden shield\ngolden crown"}
                                    rows={6}
                                    className="w-full bg-[#080d14] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30 resize-none transition-colors font-mono leading-relaxed max-h-[200px]"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Reference Image */}
                    <Card className="!bg-[#0f1520] !border-white/5">
                        <CardHeader className="!bg-transparent !border-white/5">
                            <h3 className="text-[10px] font-bold tracking-[0.15em] text-[#E6E6FA]">REFERENCE IMAGE</h3>
                        </CardHeader>
                        <CardContent>
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
                                    className="w-full h-24 border-2 border-dashed border-white/10 rounded-lg flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-gray-300 hover:border-white/20 transition-all bg-white/[0.02]"
                                >
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span className="text-[10px] tracking-widest font-bold">UPLOAD IMAGE</span>
                                </button>
                            ) : (
                                <div className="relative w-full h-24 rounded-lg overflow-hidden border border-[#E6E6FA]/30 group">
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
                    <Card className="!bg-[#0f1520] !border-white/5">
                        <CardHeader className="!bg-transparent !border-white/5">
                            <h3 className="text-[10px] font-bold tracking-[0.15em] text-[#E6E6FA]">BATCH NAME</h3>
                        </CardHeader>
                        <CardContent>
                            <input
                                type="text"
                                value={batchName}
                                onChange={(e) => setBatchName(e.target.value)}
                                placeholder="e.g. 'weapons', 'potions'"
                                className="w-full bg-[#080d14] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30 transition-colors font-mono"
                            />
                            <p className="text-[8px] text-gray-600 mt-1 uppercase tracking-wider">
                                Used as the folder name in Icons/. Leave empty for auto-generated ID.
                            </p>
                        </CardContent>
                    </Card>

                    {/* Settings */}
                    <Card className="!bg-[#0f1520] !border-white/5">
                        <CardHeader className="!bg-transparent !border-white/5">
                            <h3 className="text-[10px] font-bold tracking-[0.15em] text-[#E6E6FA]">SETTINGS</h3>
                        </CardHeader>
                        <CardContent>
                            <Slider
                                label="TEMPERATURE"
                                value={temperature}
                                min={0.1}
                                max={1.0}
                                step={0.1}
                                format={(v) => v.toFixed(1)}
                                onChange={setTemperature}
                            />
                        </CardContent>
                    </Card>

                    {/* Generate Button */}
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
                                GENERATING {genProgress.total} ICONS...
                            </span>
                        ) : (
                            `⚡ GENERATE ${rawLineCount > 0 ? rawLineCount : ""} ICON${rawLineCount !== 1 ? "S" : ""}`
                        )}
                    </Button>

                    {error && (
                        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                            {error}
                        </div>
                    )}
                </aside>

                {/* ── Middle: Batch Browser ── */}
                <div className="w-[200px] shrink-0 border-r border-white/5 bg-[#080d14] overflow-y-auto">
                    <div className="p-3 border-b border-white/5">
                        <h3 className="text-[10px] font-bold tracking-[0.15em] text-gray-500">BATCHES</h3>
                    </div>
                    {batches.length === 0 ? (
                        <div className="p-4 text-center text-[10px] text-gray-600 tracking-wider">
                            NO BATCHES YET
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
                    )}
                </div>

                {/* ── Right: Gallery ── */}
                <main className="flex-1 overflow-y-auto p-8 relative">
                    {!activeBatch && !isGenerating ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="text-6xl mb-6 opacity-30">🎨</div>
                            <h2 className="text-lg font-bold text-gray-500 tracking-wider mb-2">NO BATCH SELECTED</h2>
                            <p className="text-sm text-gray-600 max-w-sm">
                                Enter an icon list (one item per line), add an optional style modifier or reference image, and click Generate.
                            </p>
                        </div>
                    ) : activeBatch ? (
                        <div className="space-y-6">
                            {/* Batch Header */}
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-[10px] font-bold tracking-[0.15em] text-gray-500">
                                        <span className="text-[#E6E6FA]">{activeBatch.batchName || activeBatch.batchId.substring(0, 8).toUpperCase()}</span>
                                    </h2>
                                    <p className="text-[9px] text-gray-600 mt-0.5">
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
                                    <div
                                        key={`${icon.url}-${i}`}
                                        className="group relative flex flex-col items-center justify-start bg-[#0f1520] border border-white/5 rounded-xl p-4 hover:border-[#E6E6FA]/20 transition-all h-full"
                                        onMouseEnter={() => setHoveredIcon(icon.url)}
                                        onMouseLeave={() => setHoveredIcon(null)}
                                    >
                                        {/* Icon image */}
                                        <div className="relative mb-3 flex-shrink-0">
                                            <img
                                                src={icon.url}
                                                alt={icon.prompt}
                                                className="w-16 h-16"
                                            />
                                        </div>

                                        {/* Prompt label */}
                                        <div className="flex-1 flex items-start overflow-hidden w-full">
                                            <p className="text-[9px] text-gray-400 text-center leading-tight line-clamp-3 w-full font-mono">
                                                {icon.prompt}
                                            </p>
                                        </div>

                                        {/* Hover preview */}
                                        {hoveredIcon === icon.url && (
                                            <div className="fixed top-1/2 left-3/4 -translate-x-1/2 -translate-y-1/2 z-50 p-6 bg-[#0a0f16]/95 backdrop-blur-xl border border-[#E6E6FA]/20 rounded-2xl shadow-2xl shadow-black">
                                                <img
                                                    src={icon.url}
                                                    alt="preview"
                                                    className="w-[256px] h-[256px]"
                                                />
                                                <p className="text-[10px] text-gray-400 text-center mt-4 max-w-[256px] font-mono leading-relaxed break-words whitespace-pre-wrap">
                                                    {icon.prompt}
                                                </p>
                                            </div>
                                        )}

                                        {/* Download */}
                                        <button
                                            onClick={() => downloadIcon(icon.url)}
                                            className="opacity-0 group-hover:opacity-100 absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-md bg-[#E6E6FA]/10 text-[#E6E6FA] hover:bg-[#E6E6FA]/20 transition-all"
                                            title="Download"
                                        >
                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        /* Generating shimmer */
                        <div className="space-y-6">
                            <h2 className="text-[10px] font-bold tracking-[0.15em] text-gray-500">
                                GENERATING <span className="text-[#E6E6FA]">{genProgress.total}</span> ICONS...
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
            </div>

            {/* ── Confirmation Modal ── */}
            <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="CONFIRM BATCH GENERATION">
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
                            className="flex-1 py-2.5 rounded-lg bg-[#E6E6FA]/20 border border-[#E6E6FA]/30 text-[#E6E6FA] text-[11px] font-bold tracking-[0.15em] hover:bg-[#E6E6FA]/30 transition-all"
                        >
                            ⚡ GENERATE {pendingPrompts.length} ICONS
                        </button>
                    </div>
                </div>
            </Modal >
        </div >
    );
}
