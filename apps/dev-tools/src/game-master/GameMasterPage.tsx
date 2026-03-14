import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card } from "@ashtrail/ui";
import type {
    CompiledGmContext,
    GmAmbienceSettings,
    GmIntensity,
    GmSettings,
} from "../types/lore";
import { useActiveWorld } from "../hooks/useActiveWorld";
import { useGenerationHistory, type GenerationHistoryItem } from "../hooks/useGenerationHistory";
import { useJobs } from "../jobs/useJobs";
import { useTrackedJobLauncher } from "../jobs/useTrackedJobLauncher";
import { WorldPickerModal } from "../components/WorldPickerModal";
import {
    buildGameplayEngineRoute,
    buildHistoryRoute,
    buildQuestsRoute,
    DEVTOOLS_ROUTES,
} from "../lib/routes";

type GameMasterTab = "context" | "directives" | "integrations";

const TABS: GameMasterTab[] = ["context", "directives", "integrations"];
const INTENSITY_LEVELS: GmIntensity[] = ["low", "medium", "high"];
const TONE_PRESETS = ["bleak", "political", "survival", "mystic", "decaying", "frontier"];

const DEFAULT_CONTEXT: CompiledGmContext["sourceSummary"]["loreCounts"] = {
    main: 0,
    critical: 0,
    major: 0,
    minor: 0,
};

const DEFAULT_AMBIENCE: GmAmbienceSettings = {
    atmosphere: "high",
    pressure: "high",
    scarcity: "medium",
    socialTension: "high",
    groundedConsequences: "high",
    tones: ["bleak", "frontier"],
    notes: "",
};

function serializeSettings(settings: GmSettings | null) {
    if (!settings) return "";
    const { updatedAt: _updatedAt, ...rest } = settings;
    return JSON.stringify(rest);
}

function isGameMasterTab(value: string | null): value is GameMasterTab {
    return value === "context" || value === "directives" || value === "integrations";
}

function labelizeIntensity(level: GmIntensity) {
    return level.charAt(0).toUpperCase() + level.slice(1);
}

function buildAmbienceIntentSummary(ambience: GmAmbienceSettings | null | undefined) {
    const resolved = ambience || DEFAULT_AMBIENCE;
    const tones = resolved.tones.length > 0 ? resolved.tones.join(", ") : "none selected";
    const note = resolved.notes.trim();

    return [
        `Atmosphere ${resolved.atmosphere}, pressure ${resolved.pressure}, scarcity ${resolved.scarcity}, social tension ${resolved.socialTension}, grounded consequences ${resolved.groundedConsequences}.`,
        `Tone accents: ${tones}.`,
        note ? `Notes: ${note}` : null,
    ].filter(Boolean).join(" ");
}

function sourceLabel(key: string) {
    switch (key) {
        case "mainLore":
            return "Main Lore";
        case "criticalLore":
            return "Critical Lore";
        case "majorLore":
            return "Major Lore";
        case "minorLore":
            return "Minor Lore";
        case "regions":
            return "Regions";
        case "locations":
            return "Locations";
        case "factions":
            return "Factions";
        case "characters":
            return "Characters";
        case "temporality":
            return "Temporality";
        default:
            return key;
    }
}

export function GameMasterPage() {
    const { waitForJob } = useJobs();
    const launchTrackedJob = useTrackedJobLauncher();
    const { history } = useGenerationHistory();
    const { activeWorldId } = useActiveWorld();
    const [searchParams, setSearchParams] = useSearchParams();
    const [selectedWorld, setSelectedWorld] = useState<GenerationHistoryItem | null>(null);
    const [showWorldPicker, setShowWorldPicker] = useState(false);
    const [gmSettings, setGmSettings] = useState<GmSettings | null>(null);
    const [gmContext, setGmContext] = useState<CompiledGmContext | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [isGeneratingWorldPrompt, setIsGeneratingWorldPrompt] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
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
    const ambience = gmSettings?.ambience || gmContext?.ambience || DEFAULT_AMBIENCE;

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

    const updateDirective = (key: keyof Pick<GmSettings, "worldPrompt" | "systemDirective" | "negativeDirective" | "eventPromptPrefix">, value: string) => {
        setGmSettings(prev => prev ? { ...prev, [key]: value } : prev);
    };

    const updateAmbienceLevel = (key: keyof Pick<GmAmbienceSettings, "atmosphere" | "pressure" | "scarcity" | "socialTension" | "groundedConsequences">, value: GmIntensity) => {
        setGmSettings(prev => prev ? {
            ...prev,
            ambience: {
                ...(prev.ambience || DEFAULT_AMBIENCE),
                [key]: value,
            },
        } : prev);
    };

    const updateAmbienceNotes = (value: string) => {
        setGmSettings(prev => prev ? {
            ...prev,
            ambience: {
                ...(prev.ambience || DEFAULT_AMBIENCE),
                notes: value,
            },
        } : prev);
    };

    const toggleTone = (tone: string) => {
        setGmSettings(prev => {
            if (!prev) return prev;
            const currentTones = prev.ambience?.tones || [];
            const nextTones = currentTones.includes(tone)
                ? currentTones.filter(entry => entry !== tone)
                : [...currentTones, tone];
            return {
                ...prev,
                ambience: {
                    ...(prev.ambience || DEFAULT_AMBIENCE),
                    tones: nextTones,
                },
            };
        });
    };

    const handleGenerateWorldPrompt = async () => {
        if (!selectedWorld || !gmContext || !gmSettings || isGeneratingWorldPrompt) return;
        setIsGeneratingWorldPrompt(true);
        try {
            const prompt = [
                "You are writing a canonical narrative world prompt for the Ashtrail Game Master.",
                "This is NOT an image-generation prompt and must not describe rendering style, camera, or graphics.",
                "Write 2 compact paragraphs that define the world's narrative identity, pressures, history, ecology, and social tensions.",
                "Use the following canon as source material.",
                "",
                `World: ${selectedWorldName}`,
                `World seed prompt to ignore as graphics-only source: ${selectedWorld.prompt || "None"}`,
                "",
                gmContext.promptBlock,
            ].join("\n");

            const accepted = await launchTrackedJob<{ jobId: string }, { prompt: string }>({
                url: "/api/text/generate",
                request: { prompt },
                optimisticJob: {
                    kind: "gm.world-prompt-generate",
                    title: "Generate World Prompt",
                    tool: "game-master",
                    status: "queued",
                    currentStage: "Queued",
                    worldId: selectedWorld.id,
                },
                restore: {
                    route: DEVTOOLS_ROUTES.gameMaster,
                    search: { tab: "directives" },
                    payload: {
                        worldId: selectedWorld.id,
                    },
                },
                metadata: {
                    worldId: selectedWorld.id,
                    worldName: selectedWorldName,
                },
            });
            const detail = await waitForJob(accepted.jobId);
            if (detail.status !== "completed") throw new Error(detail.error || "Failed to generate world prompt");
            const text = String((detail.result as { text?: string } | undefined)?.text || "").trim();
            if (!text) throw new Error("World prompt generation returned empty text");
            updateDirective("worldPrompt", text);
        } catch (error) {
            console.error(error);
            setSaveState("error");
        } finally {
            setIsGeneratingWorldPrompt(false);
        }
    };

    const contextSections = gmContext?.sourceSummary?.sections || [];
    const isWorldPromptMissing = !gmSettings?.worldPrompt?.trim();

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
                                The Game Master settings are stored per world. Pick the target world before editing canon sources or AI-director behavior.
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
                        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-6">
                            <Card className="bg-[#121820] border border-white/5 p-5">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="space-y-3">
                                        <div className="text-[10px] font-bold tracking-widest uppercase text-indigo-300">AI GM World</div>
                                        <h2 className="text-xl font-black tracking-wide text-white">{selectedWorldName}</h2>
                                        <p className="text-sm text-gray-400 leading-relaxed max-w-2xl">
                                            {gmSettings.worldPrompt
                                                ? gmSettings.worldPrompt.slice(0, 320)
                                                : "No canonical world prompt written yet. Events and Quests should rely on this field, not the graphical world-generation prompt."}
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4">
                                                <div className="text-[10px] font-bold tracking-widest uppercase text-indigo-300 mb-2">Canonical Prompt</div>
                                                <div className="text-xs text-gray-400 leading-relaxed">
                                                    Narrative identity, pressures, and canon framing for Events and Quests.
                                                </div>
                                            </div>
                                            <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
                                                <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-2">Visual Seed Prompt</div>
                                                <div className="text-xs text-gray-500 leading-relaxed">
                                                    Graphics-only reference. This does not drive GM generation.
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <Link to={buildHistoryRoute({ tab: "lore" })} className="px-3 py-2 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[10px] font-bold tracking-widest uppercase hover:bg-cyan-500/20 transition-colors">
                                            Edit Lore
                                        </Link>
                                        <Link to={buildQuestsRoute()} className="px-3 py-2 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] font-bold tracking-widest uppercase hover:bg-indigo-500/20 transition-colors">
                                            Open Quests
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
                                            <div className="mt-2 text-lg font-black text-white">
                                                {usedLoreCounts[priority]} <span className="text-xs text-gray-500">/ {loreCounts[priority]}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 rounded-xl border border-white/5 bg-black/20 p-3">
                                    <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-2">Live Context Feeds</div>
                                    <div className="flex flex-wrap gap-2">
                                        {enabledSources.map(source => (
                                            <span key={source} className="px-2 py-1 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] font-bold tracking-widest uppercase">
                                                {sourceLabel(source)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </Card>
                        </div>

                        {isWorldPromptMissing && (
                            <Card className="bg-red-500/10 border border-red-500/20 p-5">
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                    <div>
                                        <div className="text-[10px] font-bold tracking-widest uppercase text-red-300 mb-2">Canonical World Prompt Missing</div>
                                        <p className="text-sm text-red-100/80 leading-relaxed max-w-3xl">
                                            The AI GM can compile live world context, but it still needs a canonical world prompt to define the narrative identity of the world. Quests remain blocked until this is written or generated.
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button onClick={handleGenerateWorldPrompt} disabled={isGeneratingWorldPrompt} className="bg-red-500/10 text-red-200 border border-red-400/30 hover:bg-red-500/20">
                                            {isGeneratingWorldPrompt ? "Generating..." : "Generate from Canon"}
                                        </Button>
                                        <Link to={buildQuestsRoute()} className="px-4 py-2 rounded-lg bg-white/5 text-white border border-white/10 text-[11px] font-bold tracking-widest uppercase hover:bg-white/10 transition-colors">
                                            Review Quests
                                        </Link>
                                    </div>
                                </div>
                            </Card>
                        )}

                        {activeTab === "directives" && (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                                <Card className="bg-[#121820] border border-white/5 p-5 flex flex-col gap-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <div className="text-[10px] font-bold tracking-widest uppercase text-indigo-300 mb-2">World</div>
                                            <h3 className="text-lg font-black text-white">Canonical World Prompt</h3>
                                            <p className="text-sm text-gray-500 mt-2 max-w-2xl">
                                                This is the world canon and ambience anchor used by the AI GM for Events and Quests. Keep it narrative and systemic. Do not describe visuals, rendering, or image composition here.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleGenerateWorldPrompt}
                                            disabled={isGeneratingWorldPrompt}
                                            className="px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold tracking-widest uppercase hover:bg-indigo-500/20 disabled:opacity-50 transition-colors"
                                        >
                                            {isGeneratingWorldPrompt ? "Generating..." : "Generate from Canon"}
                                        </button>
                                    </div>
                                    <textarea
                                        value={gmSettings.worldPrompt}
                                        onChange={e => updateDirective("worldPrompt", e.target.value)}
                                        className="min-h-[220px] rounded-2xl border border-white/5 bg-[#05080c] p-4 text-sm text-gray-200 resize-none focus:outline-none focus:border-indigo-500/40"
                                        placeholder="Write the canonical world prompt used by the AI GM. This should express the world, its pressures, history, atmosphere, and narrative identity."
                                    />
                                    <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
                                        <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-2">Visual World Seed Prompt</div>
                                        <p className="text-xs text-gray-500 leading-relaxed">
                                            {gmContext.worldSeedPrompt || selectedWorld.prompt || "No graphical world-generation prompt is stored for this world."}
                                        </p>
                                    </div>
                                </Card>

                                <Card className="bg-[#121820] border border-white/5 p-5 flex flex-col gap-4">
                                    <div>
                                        <div className="text-[10px] font-bold tracking-widest uppercase text-indigo-300 mb-2">System Role</div>
                                        <h3 className="text-lg font-black text-white">System Directive</h3>
                                        <p className="text-sm text-gray-500 mt-2 max-w-2xl">
                                            This governs how the AI GM reasons about scenes, consequences, escalation, and progression. It should define behavior, not repeat world canon.
                                        </p>
                                    </div>
                                    <textarea
                                        value={gmSettings.systemDirective}
                                        onChange={e => updateDirective("systemDirective", e.target.value)}
                                        className="min-h-[260px] rounded-2xl border border-white/5 bg-[#05080c] p-4 text-sm text-gray-200 resize-none focus:outline-none focus:border-indigo-500/40"
                                    />
                                    <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/10 p-4">
                                        <div className="text-[10px] font-bold tracking-widest uppercase text-emerald-300 mb-2">AI GM Model</div>
                                        <p className="text-sm text-emerald-100/80 leading-relaxed">
                                            Hidden framework guardrails stay in the backend. This page is for authoring the world identity, the GM role, and the intended dramatic pressure while the canon feeds stay dynamic.
                                        </p>
                                    </div>
                                </Card>

                                <Card className="xl:col-span-2 bg-[#121820] border border-white/5 p-5 flex flex-col gap-5">
                                    <div>
                                        <div className="text-[10px] font-bold tracking-widest uppercase text-indigo-300 mb-2">Tone and Intent</div>
                                        <h3 className="text-lg font-black text-white">Structured Ambience</h3>
                                        <p className="text-sm text-gray-500 mt-2 max-w-3xl">
                                            Set the pressure profile of the AI GM here. The backend converts these intentions into the hidden ambience instruction used during event and quest generation.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                                        {([
                                            ["atmosphere", "Atmosphere"],
                                            ["pressure", "Pressure"],
                                            ["scarcity", "Scarcity"],
                                            ["socialTension", "Social Tension"],
                                            ["groundedConsequences", "Grounded Consequences"],
                                        ] as Array<[keyof Pick<GmAmbienceSettings, "atmosphere" | "pressure" | "scarcity" | "socialTension" | "groundedConsequences">, string]>).map(([key, label]) => (
                                            <div key={key} className="rounded-2xl border border-white/5 bg-black/20 p-4">
                                                <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-3">{label}</div>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {INTENSITY_LEVELS.map(level => {
                                                        const isActive = ambience[key] === level;
                                                        return (
                                                            <button
                                                                key={level}
                                                                type="button"
                                                                onClick={() => updateAmbienceLevel(key, level)}
                                                                className={`rounded-xl border px-3 py-2 text-[11px] font-bold tracking-widest uppercase transition-colors ${isActive ? "border-indigo-400/50 bg-indigo-500/20 text-white" : "border-white/5 bg-[#05080c] text-gray-400 hover:border-white/10 hover:text-gray-200"}`}
                                                            >
                                                                {labelizeIntensity(level)}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
                                        <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-3">Tone Presets</div>
                                        <div className="flex flex-wrap gap-2">
                                            {TONE_PRESETS.map(tone => {
                                                const isActive = ambience.tones.includes(tone);
                                                return (
                                                    <button
                                                        key={tone}
                                                        type="button"
                                                        onClick={() => toggleTone(tone)}
                                                        className={`px-3 py-2 rounded-full border text-[10px] font-bold tracking-[0.18em] uppercase transition-colors ${isActive ? "border-orange-400/40 bg-orange-500/15 text-orange-100" : "border-white/5 bg-[#05080c] text-gray-500 hover:text-gray-300 hover:border-white/10"}`}
                                                    >
                                                        {tone}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <label className="flex flex-col gap-2">
                                        <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Ambience Notes</span>
                                        <textarea
                                            value={ambience.notes}
                                            onChange={e => updateAmbienceNotes(e.target.value)}
                                            className="min-h-[120px] rounded-2xl border border-white/5 bg-[#05080c] p-4 text-sm text-gray-200 resize-none focus:outline-none focus:border-indigo-500/40"
                                            placeholder="Optional nuance for the GM: what kind of pressure, social texture, or atmosphere should dominate play?"
                                        />
                                    </label>

                                    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4">
                                        <div className="text-[10px] font-bold tracking-widest uppercase text-indigo-300 mb-2">Compiled Intent Preview</div>
                                        <p className="text-sm text-indigo-100/80 leading-relaxed">
                                            {buildAmbienceIntentSummary(ambience)}
                                        </p>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {activeTab === "context" && (
                            <div className="flex flex-col gap-6">
                                <Card className="bg-[#121820] border border-white/5 p-5">
                                    <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                                        <div>
                                            <div className="text-[10px] font-bold tracking-widest uppercase text-indigo-300 mb-2">Canon Context</div>
                                            <h3 className="text-lg font-black text-white">Dynamic World Inputs</h3>
                                            <p className="text-sm text-gray-500 mt-2 max-w-3xl">
                                                These feeds are pulled from History and world data at runtime. They are shown here so you can see what the AI GM is grounded against, but they are not meant to be hand-authored as static prompt prose.
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowAdvanced(prev => !prev)}
                                            className="px-4 py-2 rounded-full bg-white/5 text-gray-300 border border-white/10 text-[10px] font-bold tracking-widest uppercase hover:bg-white/10 transition-colors"
                                        >
                                            {showAdvanced ? "Hide Advanced" : "Show Advanced"}
                                        </button>
                                    </div>
                                </Card>

                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                    {contextSections.map(section => (
                                        <Card key={section.key} className="bg-[#121820] border border-white/5 p-5 flex flex-col gap-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-[10px] font-bold tracking-widest uppercase text-indigo-300 mb-2">{section.label}</div>
                                                    <div className="text-2xl font-black text-white">{section.itemCount}</div>
                                                </div>
                                                <span className={`px-2 py-1 rounded-full border text-[10px] font-bold tracking-widest uppercase ${section.enabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5 text-gray-500"}`}>
                                                    {section.enabled ? "Live" : "Muted"}
                                                </span>
                                            </div>
                                            {section.meta && (
                                                <div className="text-xs text-gray-500 leading-relaxed">
                                                    {section.meta}
                                                </div>
                                            )}
                                            <div className="rounded-2xl border border-white/5 bg-black/20 p-4 min-h-[150px]">
                                                <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-2">Preview</div>
                                                <div className="text-sm text-gray-400 leading-relaxed whitespace-pre-wrap">
                                                    {section.preview}
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>

                                {showAdvanced && (
                                    <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-6">
                                        <Card className="bg-[#121820] border border-white/5 p-5 flex flex-col gap-5">
                                            <div>
                                                <div className="text-[10px] font-bold tracking-widest uppercase text-orange-300 mb-2">Advanced Controls</div>
                                                <p className="text-sm text-gray-500">
                                                    Use this layer for debugging, source gating, and framework overrides. Normal GM authoring should happen in the visible World/System/Tone sections.
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {Object.entries(gmSettings.contextSources).map(([key, enabled]) => (
                                                    <label key={key} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3">
                                                        <span className="text-[11px] font-bold tracking-widest uppercase text-gray-300">{sourceLabel(key)}</span>
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

                                            <label className="flex flex-col gap-2">
                                                <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Framework Prefix</span>
                                                <textarea
                                                    value={gmSettings.eventPromptPrefix}
                                                    onChange={e => updateDirective("eventPromptPrefix", e.target.value)}
                                                    className="min-h-[90px] rounded-xl border border-white/5 bg-[#05080c] p-4 text-sm text-gray-200 resize-none focus:outline-none focus:border-orange-500/40"
                                                />
                                            </label>

                                            <label className="flex flex-col gap-2">
                                                <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Negative Directive</span>
                                                <textarea
                                                    value={gmSettings.negativeDirective}
                                                    onChange={e => updateDirective("negativeDirective", e.target.value)}
                                                    className="min-h-[120px] rounded-xl border border-white/5 bg-[#05080c] p-4 text-sm text-gray-200 resize-none focus:outline-none focus:border-orange-500/40"
                                                />
                                            </label>
                                        </Card>

                                        <Card className="bg-[#121820] border border-white/5 p-5 flex flex-col gap-4">
                                            <div>
                                                <div className="text-[10px] font-bold tracking-widest uppercase text-orange-300 mb-2">Raw Prompt Preview</div>
                                                <p className="text-sm text-gray-500">
                                                    This is the exact compiled prompt block passed to event and quest generation. Hidden by default so the page stays focused on intent, not scaffolding.
                                                </p>
                                            </div>
                                            <textarea
                                                value={gmContext.promptBlock}
                                                readOnly
                                                className="min-h-[520px] w-full rounded-xl border border-white/5 bg-[#05080c] p-4 text-sm text-gray-300 leading-relaxed focus:outline-none resize-none"
                                            />
                                        </Card>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === "integrations" && (
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                <Card className="bg-[#121820] border border-white/5 p-5">
                                    <div className="text-[10px] font-bold tracking-widest uppercase text-cyan-300 mb-3">History</div>
                                    <p className="text-sm text-gray-500 leading-relaxed mb-4">
                                        `/devtools/history` remains the canonical source. Lore, factions, characters, regions, locations, and temporality flow into the AI GM dynamically from there.
                                    </p>
                                    <Link to={buildHistoryRoute({ tab: "lore" })} className="inline-flex px-3 py-2 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[10px] font-bold tracking-widest uppercase hover:bg-cyan-500/20 transition-colors">
                                        Open Lore Editor
                                    </Link>
                                </Card>

                                <Card className="bg-[#121820] border border-white/5 p-5">
                                    <div className="text-[10px] font-bold tracking-widest uppercase text-orange-300 mb-3">Gameplay Events</div>
                                    <p className="text-sm text-gray-500 leading-relaxed mb-4">
                                        `/devtools/gameplay-engine?step=EVENTS` consumes the compiled GM context at generation, rethink, and resolution time.
                                    </p>
                                    <Link to={buildGameplayEngineRoute({ step: "EVENTS" })} className="inline-flex px-3 py-2 rounded-lg bg-orange-500/10 text-orange-300 border border-orange-500/20 text-[10px] font-bold tracking-widest uppercase hover:bg-orange-500/20 transition-colors">
                                        Open Events View
                                    </Link>
                                </Card>

                                <Card className="bg-[#121820] border border-white/5 p-5">
                                    <div className="text-[10px] font-bold tracking-widest uppercase text-indigo-300 mb-3">Quests</div>
                                    <p className="text-sm text-gray-500 leading-relaxed mb-4">
                                        `/devtools/quests` uses the canonical GM world prompt and the same compiled world context. Missing world prompt blocks new quest generation.
                                    </p>
                                    <Link to={buildQuestsRoute()} className="inline-flex px-3 py-2 rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-[10px] font-bold tracking-widest uppercase hover:bg-indigo-500/20 transition-colors">
                                        Open Quests
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
