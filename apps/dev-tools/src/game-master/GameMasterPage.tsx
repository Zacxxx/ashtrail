import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card } from "@ashtrail/ui";
import type { CompiledGmContext, GmSettings } from "../types/lore";
import { useActiveWorld } from "../hooks/useActiveWorld";
import { useGenerationHistory, type GenerationHistoryItem } from "../hooks/useGenerationHistory";
import { WorldPickerModal } from "../components/WorldPickerModal";

type GameMasterTab = "context" | "directives" | "integrations";

const TABS: GameMasterTab[] = ["context", "directives", "integrations"];

const DEFAULT_CONTEXT: CompiledGmContext["sourceSummary"]["loreCounts"] = {
    main: 0,
    critical: 0,
    major: 0,
    minor: 0,
};

function serializeSettings(settings: GmSettings | null) {
    if (!settings) return "";
    const { updatedAt: _updatedAt, ...rest } = settings;
    return JSON.stringify(rest);
}

function isGameMasterTab(value: string | null): value is GameMasterTab {
    return value === "context" || value === "directives" || value === "integrations";
}

export function GameMasterPage() {
    const { history } = useGenerationHistory();
    const { activeWorldId } = useActiveWorld();
    const [searchParams, setSearchParams] = useSearchParams();
    const [selectedWorld, setSelectedWorld] = useState<GenerationHistoryItem | null>(null);
    const [showWorldPicker, setShowWorldPicker] = useState(false);
    const [gmSettings, setGmSettings] = useState<GmSettings | null>(null);
    const [gmContext, setGmContext] = useState<CompiledGmContext | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const hydratedSettingsRef = useRef(false);
    const lastSavedSettingsRef = useRef("");

    const activeTab: GameMasterTab = isGameMasterTab(searchParams.get("tab")) ? searchParams.get("tab") as GameMasterTab : "context";

    useEffect(() => {
        if (!activeWorldId) {
            setSelectedWorld(null);
            return;
        }
        const world = history.find(item => item.id === activeWorldId) || null;
        setSelectedWorld(world);
    }, [activeWorldId, history]);

    useEffect(() => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (!isGameMasterTab(next.get("tab"))) {
                next.set("tab", "context");
            }
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    useEffect(() => {
        if (!selectedWorld) {
            setGmSettings(null);
            setGmContext(null);
            hydratedSettingsRef.current = false;
            return;
        }

        let isCancelled = false;
        async function loadWorldData() {
            setIsLoading(true);
            try {
                const [settingsRes, contextRes] = await Promise.all([
                    fetch(`http://127.0.0.1:8787/api/planet/gm-settings/${selectedWorld.id}`),
                    fetch(`http://127.0.0.1:8787/api/planet/gm-context/${selectedWorld.id}`),
                ]);
                if (!settingsRes.ok || !contextRes.ok) throw new Error("Failed to load GM configuration");
                const [settingsData, contextData] = await Promise.all([settingsRes.json(), contextRes.json()]);
                if (isCancelled) return;
                setGmSettings(settingsData);
                setGmContext(contextData);
                lastSavedSettingsRef.current = serializeSettings(settingsData);
                hydratedSettingsRef.current = true;
                setSaveState("idle");
            } catch (error) {
                if (!isCancelled) {
                    console.error(error);
                    setSaveState("error");
                }
            } finally {
                if (!isCancelled) setIsLoading(false);
            }
        }
        loadWorldData();
        return () => {
            isCancelled = true;
        };
    }, [selectedWorld]);

    useEffect(() => {
        if (!selectedWorld || !gmSettings || !hydratedSettingsRef.current) return;
        if (serializeSettings(gmSettings) === lastSavedSettingsRef.current) return;
        const timeout = window.setTimeout(async () => {
            setSaveState("saving");
            try {
                const response = await fetch(`http://127.0.0.1:8787/api/planet/gm-settings/${selectedWorld.id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(gmSettings),
                });
                if (!response.ok) throw new Error("Failed to save GM settings");
                const saved = await response.json();
                const compiledRes = await fetch(`http://127.0.0.1:8787/api/planet/gm-context/${selectedWorld.id}`);
                if (!compiledRes.ok) throw new Error("Failed to refresh GM context");
                const compiled = await compiledRes.json();
                lastSavedSettingsRef.current = serializeSettings(saved);
                setGmSettings(saved);
                setGmContext(compiled);
                setSaveState("saved");
            } catch (error) {
                console.error(error);
                setSaveState("error");
            }
        }, 500);
        return () => window.clearTimeout(timeout);
    }, [gmSettings, selectedWorld]);

    const loreCounts = gmContext?.sourceSummary?.loreCounts || DEFAULT_CONTEXT;
    const usedLoreCounts = gmContext?.sourceSummary?.usedLoreCounts || DEFAULT_CONTEXT;
    const enabledSources = gmContext?.sourceSummary?.enabledSources || [];

    const selectedWorldName = useMemo(
        () => selectedWorld?.name || selectedWorld?.prompt || "Unknown World",
        [selectedWorld],
    );

    const updateSource = (key: keyof GmSettings["contextSources"], value: boolean) => {
        setGmSettings(prev => prev ? {
            ...prev,
            contextSources: {
                ...prev.contextSources,
                [key]: value,
            },
        } : prev);
    };

    const updateDirective = (key: keyof Pick<GmSettings, "systemDirective" | "ambienceDirective" | "negativeDirective" | "eventPromptPrefix">, value: string) => {
        setGmSettings(prev => prev ? { ...prev, [key]: value } : prev);
    };

    return (
        <div className="h-screen overflow-hidden bg-[#070b12] text-gray-300 font-sans flex flex-col">
            <div className="fixed top-16 left-0 right-0 z-30 bg-[#030508]/60 backdrop-blur-md border-b border-white/5 pointer-events-auto flex items-center justify-between px-6 h-12 shadow-2xl">
                <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 font-bold text-[10px] border border-indigo-500/30">
                        🧠
                    </div>
                    <h1 className="text-[10px] font-black tracking-[0.3em] text-white uppercase">GAME MASTER</h1>
                </div>

                <div className="flex items-center justify-center scale-90">
                    <div className="flex bg-[#1e1e1e]/40 border border-white/5 rounded-full p-1 shadow-lg backdrop-blur-md">
                        {TABS.map(tab => (
                            <button
                                key={tab}
                                onClick={() => setSearchParams({ tab })}
                                className={`relative px-4 py-1.5 text-[9px] font-black tracking-[0.2em] rounded-full transition-all duration-300 overflow-hidden ${activeTab === tab ? "text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"}`}
                            >
                                {activeTab === tab && (
                                    <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/20 to-transparent pointer-events-none" />
                                )}
                                <span className="relative z-10">{tab.toUpperCase()}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3 w-[260px] justify-end">
                    <span className={`text-[10px] font-bold tracking-widest uppercase ${saveState === "saving" ? "text-amber-400" : saveState === "saved" ? "text-emerald-400" : saveState === "error" ? "text-red-400" : "text-gray-500"}`}>
                        {saveState === "saving" ? "Saving" : saveState === "saved" ? "Saved" : saveState === "error" ? "Save error" : "World scoped"}
                    </span>
                    <button
                        onClick={() => setShowWorldPicker(true)}
                        className="px-3 py-1.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold tracking-widest uppercase hover:bg-indigo-500/20 transition-colors"
                    >
                        Pick World
                    </button>
                </div>
            </div>

            <div className="pt-28 px-6 pb-8 flex-1 overflow-y-auto custom-scrollbar">
                {!selectedWorld ? (
                    <div className="h-full flex items-center justify-center">
                        <Card className="max-w-xl w-full p-8 bg-[#121820] border border-white/5 text-center">
                            <div className="text-5xl mb-5 opacity-70">🌍</div>
                            <h2 className="text-lg font-black tracking-[0.2em] text-white uppercase mb-3">World Required</h2>
                            <p className="text-sm text-gray-500 leading-relaxed mb-6">
                                The Game Master settings are stored per world. Pick the target world before editing canon sources or event directives.
                            </p>
                            <Button onClick={() => setShowWorldPicker(true)} className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/20">
                                Open World Picker
                            </Button>
                        </Card>
                    </div>
                ) : isLoading || !gmSettings || !gmContext ? (
                    <div className="h-full flex items-center justify-center text-indigo-300 tracking-widest text-sm font-bold animate-pulse">
                        LOADING GM CONFIGURATION...
                    </div>
                ) : (
                    <div className="max-w-6xl mx-auto flex flex-col gap-6">
                        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6">
                            <Card className="bg-[#121820] border border-white/5 p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="text-[10px] font-bold tracking-widest uppercase text-indigo-300 mb-2">Selected World</div>
                                        <h2 className="text-xl font-black tracking-wide text-white">{selectedWorldName}</h2>
                                        <p className="text-sm text-gray-500 leading-relaxed mt-3 max-w-2xl">
                                            {(selectedWorld.prompt || "No generation prompt available.").slice(0, 280)}
                                        </p>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <Link to="/history?tab=lore" className="px-3 py-2 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[10px] font-bold tracking-widest uppercase hover:bg-cyan-500/20 transition-colors">
                                            Edit Lore
                                        </Link>
                                        <Link to="/gameplay-engine?step=EVENTS" className="px-3 py-2 rounded-lg bg-orange-500/10 text-orange-300 border border-orange-500/20 text-[10px] font-bold tracking-widest uppercase hover:bg-orange-500/20 transition-colors">
                                            Open Events
                                        </Link>
                                    </div>
                                </div>
                            </Card>

                            <Card className="bg-[#121820] border border-white/5 p-5">
                                <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-4">Lore Coverage</div>
                                <div className="grid grid-cols-2 gap-3">
                                    {(["main", "critical", "major", "minor"] as const).map(priority => (
                                        <div key={priority} className="rounded-xl border border-white/5 bg-black/20 p-3">
                                            <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500">{priority}</div>
                                            <div className="mt-2 text-lg font-black text-white">{usedLoreCounts[priority]} <span className="text-xs text-gray-500">/ {loreCounts[priority]}</span></div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>

                        {activeTab === "context" && (
                            <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
                                <Card className="bg-[#121820] border border-white/5 p-5 flex flex-col gap-5">
                                    <div>
                                        <div className="text-[10px] font-bold tracking-widest uppercase text-indigo-300 mb-2">Context Sources</div>
                                        <p className="text-sm text-gray-500">Toggle which world data feeds the gameplay event prompt compiler.</p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {Object.entries(gmSettings.contextSources).map(([key, enabled]) => (
                                            <label key={key} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3">
                                                <span className="text-[11px] font-bold tracking-widest uppercase text-gray-300">{key}</span>
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 accent-indigo-500"
                                                    checked={enabled}
                                                    onChange={e => updateSource(key as keyof GmSettings["contextSources"], e.target.checked)}
                                                />
                                            </label>
                                        ))}
                                    </div>

                                    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Non-main lore budget</div>
                                                <div className="text-lg font-black text-white mt-1">{gmSettings.maxLoreSnippets}</div>
                                            </div>
                                            <input
                                                type="range"
                                                min={1}
                                                max={16}
                                                value={gmSettings.maxLoreSnippets}
                                                onChange={e => setGmSettings(prev => prev ? { ...prev, maxLoreSnippets: Number(e.target.value) } : prev)}
                                                className="w-full max-w-[260px]"
                                            />
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                                        <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-2">Enabled Sources</div>
                                        <div className="flex flex-wrap gap-2">
                                            {enabledSources.map(source => (
                                                <span key={source} className="px-2 py-1 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] font-bold tracking-widest uppercase">
                                                    {source}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </Card>

                                <Card className="bg-[#121820] border border-white/5 p-5 flex flex-col gap-4">
                                    <div>
                                        <div className="text-[10px] font-bold tracking-widest uppercase text-indigo-300 mb-2">Compiled Event Context</div>
                                        <p className="text-sm text-gray-500">This exact block is passed into the gameplay event generator as canon and ambience.</p>
                                    </div>
                                    <textarea
                                        value={gmContext.promptBlock}
                                        readOnly
                                        className="min-h-[520px] w-full rounded-xl border border-white/5 bg-[#05080c] p-4 text-sm text-gray-300 leading-relaxed focus:outline-none resize-none"
                                    />
                                </Card>
                            </div>
                        )}

                        {activeTab === "directives" && (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                <Card className="bg-[#121820] border border-white/5 p-5 flex flex-col gap-4">
                                    <div className="text-[10px] font-bold tracking-widest uppercase text-indigo-300">Prompt Framing</div>
                                    <label className="flex flex-col gap-2">
                                        <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Event prompt prefix</span>
                                        <textarea value={gmSettings.eventPromptPrefix} onChange={e => updateDirective("eventPromptPrefix", e.target.value)} className="min-h-[120px] rounded-xl border border-white/5 bg-[#05080c] p-4 text-sm text-gray-200 resize-none focus:outline-none focus:border-indigo-500/40" />
                                    </label>
                                    <label className="flex flex-col gap-2">
                                        <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">System directive</span>
                                        <textarea value={gmSettings.systemDirective} onChange={e => updateDirective("systemDirective", e.target.value)} className="min-h-[220px] rounded-xl border border-white/5 bg-[#05080c] p-4 text-sm text-gray-200 resize-none focus:outline-none focus:border-indigo-500/40" />
                                    </label>
                                </Card>

                                <Card className="bg-[#121820] border border-white/5 p-5 flex flex-col gap-4">
                                    <div className="text-[10px] font-bold tracking-widest uppercase text-indigo-300">Guardrails</div>
                                    <label className="flex flex-col gap-2">
                                        <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Ambience directive</span>
                                        <textarea value={gmSettings.ambienceDirective} onChange={e => updateDirective("ambienceDirective", e.target.value)} className="min-h-[180px] rounded-xl border border-white/5 bg-[#05080c] p-4 text-sm text-gray-200 resize-none focus:outline-none focus:border-indigo-500/40" />
                                    </label>
                                    <label className="flex flex-col gap-2">
                                        <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Negative directive</span>
                                        <textarea value={gmSettings.negativeDirective} onChange={e => updateDirective("negativeDirective", e.target.value)} className="min-h-[180px] rounded-xl border border-white/5 bg-[#05080c] p-4 text-sm text-gray-200 resize-none focus:outline-none focus:border-indigo-500/40" />
                                    </label>
                                </Card>
                            </div>
                        )}

                        {activeTab === "integrations" && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                <Card className="bg-[#121820] border border-white/5 p-5">
                                    <div className="text-[10px] font-bold tracking-widest uppercase text-cyan-300 mb-3">History</div>
                                    <p className="text-sm text-gray-500 leading-relaxed mb-4">
                                        `/history` is the canonical source. Edit `Main Lore` and ranked snippets there; this page only decides what gets compiled into AI context.
                                    </p>
                                    <Link to="/history?tab=lore" className="inline-flex px-3 py-2 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[10px] font-bold tracking-widest uppercase hover:bg-cyan-500/20 transition-colors">
                                        Open Lore Editor
                                    </Link>
                                </Card>

                                <Card className="bg-[#121820] border border-white/5 p-5">
                                    <div className="text-[10px] font-bold tracking-widest uppercase text-orange-300 mb-3">Gameplay Engine</div>
                                    <p className="text-sm text-gray-500 leading-relaxed mb-4">
                                        `/gameplay-engine?step=EVENTS` consumes the compiled GM context at event generation, rethink, and resolution time.
                                    </p>
                                    <Link to="/gameplay-engine?step=EVENTS" className="inline-flex px-3 py-2 rounded-lg bg-orange-500/10 text-orange-300 border border-orange-500/20 text-[10px] font-bold tracking-widest uppercase hover:bg-orange-500/20 transition-colors">
                                        Open Events View
                                    </Link>
                                </Card>

                                <Card className="bg-[#121820] border border-white/5 p-5">
                                    <div className="text-[10px] font-bold tracking-widest uppercase text-indigo-300 mb-3">Stored Files</div>
                                    <div className="flex flex-col gap-2 text-sm text-gray-500">
                                        <span>`generated/planets/{selectedWorld.id}/lore_snippets.json`</span>
                                        <span>`generated/planets/{selectedWorld.id}/gm_settings.json`</span>
                                        <span>`generated/planets/{selectedWorld.id}/metadata.json`</span>
                                    </div>
                                </Card>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <WorldPickerModal open={showWorldPicker} onClose={() => setShowWorldPicker(false)} />
        </div>
    );
}
