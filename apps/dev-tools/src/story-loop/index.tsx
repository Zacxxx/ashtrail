import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@ashtrail/ui";
import type { QuestRunRecord, QuestRunSummary } from "@ashtrail/core";
import { useActiveWorld } from "../hooks/useActiveWorld";
import { useGenerationHistory } from "../hooks/useGenerationHistory";
import type { CompiledGmContext } from "../types/lore";
import {
    fetchExplorationManifestIndex,
    type ExplorationManifestListItem,
} from "../gameplay-engine/explorationSupport";
import {
    buildAssetGeneratorRoute,
    buildExplorationRoute,
    buildGameMasterRoute,
    buildGameplayEngineRoute,
    buildQuestsRoute,
    DEVTOOLS_ROUTES,
} from "../lib/routes";

const API_BASE = "/api";

type LoopMode = "quest-led" | "hybrid" | "exploration-led";
type ReadinessTone = "ready" | "partial" | "missing";

interface LoopStep {
    id: string;
    phase: string;
    owner: string;
    title: string;
    description: string;
    signal: string;
    href?: string;
    ctaLabel?: string;
}

interface MediaChannel {
    id: string;
    label: string;
    status: string;
    summary: string;
}

function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    return fetch(url, init).then(async (response) => {
        if (!response.ok) {
            const details = await response.text().catch(() => "");
            throw new Error(details || `Request failed: ${response.status}`);
        }
        return response.json() as Promise<T>;
    });
}

function ReadinessBadge({ tone, label }: { tone: ReadinessTone; label: string }) {
    const palette = tone === "ready"
        ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
        : tone === "partial"
            ? "border-amber-500/25 bg-amber-500/10 text-amber-200"
            : "border-rose-500/25 bg-rose-500/10 text-rose-200";
    return (
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${palette}`}>
            {label}
        </span>
    );
}

function SummaryCard({
    label,
    value,
    hint,
}: {
    label: string;
    value: string;
    hint: string;
}) {
    return (
        <Card className="rounded-[28px] border border-white/5 bg-[#121820] p-5">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</div>
            <div className="mt-3 text-2xl font-black text-white">{value}</div>
            <div className="mt-2 text-sm leading-relaxed text-gray-500">{hint}</div>
        </Card>
    );
}

function summarizeQuestNodeText(text?: string | null): string {
    const normalized = (text || "").replace(/\s+/g, " ").trim();
    if (!normalized) return "No active node loaded.";
    return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized;
}

export function StoryLoopPage() {
    const { activeWorldId } = useActiveWorld();
    const { history } = useGenerationHistory();
    const [isLoading, setIsLoading] = useState(false);
    const [gmContext, setGmContext] = useState<CompiledGmContext | null>(null);
    const [questArchive, setQuestArchive] = useState<QuestRunSummary[]>([]);
    const [activeRun, setActiveRun] = useState<QuestRunRecord | null>(null);
    const [explorationManifests, setExplorationManifests] = useState<ExplorationManifestListItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const selectedWorld = useMemo(
        () => history.find((item) => item.id === activeWorldId) ?? null,
        [activeWorldId, history],
    );

    const loadLoopData = useCallback(async () => {
        if (!activeWorldId) {
            setGmContext(null);
            setQuestArchive([]);
            setActiveRun(null);
            setExplorationManifests([]);
            setError(null);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const [nextGmContext, archive, manifests] = await Promise.all([
                fetchJson<CompiledGmContext>(`${API_BASE}/planet/gm-context/${activeWorldId}`).catch(() => null),
                fetchJson<QuestRunSummary[]>(`${API_BASE}/planet/quests/${activeWorldId}`).catch(() => []),
                fetchExplorationManifestIndex(activeWorldId).catch(() => []),
            ]);

            const prioritizedRun = archive.find((run) => run.status === "active") || archive[0] || null;
            const nextActiveRun = prioritizedRun
                ? await fetchJson<QuestRunRecord>(`${API_BASE}/planet/quests/${activeWorldId}/${prioritizedRun.id}`).catch(() => null)
                : null;

            setGmContext(nextGmContext);
            setQuestArchive(Array.isArray(archive) ? archive : []);
            setActiveRun(nextActiveRun);
            setExplorationManifests(Array.isArray(manifests) ? manifests : []);
        } catch (nextError: any) {
            console.error("Failed to load story loop data", nextError);
            setError(nextError?.message || "Failed to load story loop data.");
        } finally {
            setIsLoading(false);
        }
    }, [activeWorldId]);

    useEffect(() => {
        void loadLoopData();
    }, [loadLoopData]);

    const recommendedMode = useMemo<LoopMode>(() => {
        if (activeRun && explorationManifests.length > 0) return "hybrid";
        if (activeRun) return "quest-led";
        if (explorationManifests.length > 0) return "exploration-led";
        return "quest-led";
    }, [activeRun, explorationManifests.length]);

    const [mode, setMode] = useState<LoopMode>("quest-led");

    useEffect(() => {
        setMode(recommendedMode);
    }, [recommendedMode]);

    const activeManifest = explorationManifests[0] || null;
    const ambienceSummary = gmContext?.ambience
        ? [
            `atmosphere ${gmContext.ambience.atmosphere}`,
            `pressure ${gmContext.ambience.pressure}`,
            `scarcity ${gmContext.ambience.scarcity}`,
            `social ${gmContext.ambience.socialTension}`,
        ].join(" | ")
        : "No ambience profile compiled yet.";
    const currentIllustrationUrl = activeRun?.currentNode?.illustrationId
        ? `${API_BASE}/planet/quests/${activeRun.worldId}/illustrations/${activeRun.currentNode.illustrationId}/image`
        : null;

    const loopSteps = useMemo<LoopStep[]>(() => {
        const questHref = activeRun ? buildQuestsRoute("run") : buildQuestsRoute("seed");
        const explorationHref = activeWorldId ? buildExplorationRoute(activeWorldId, activeManifest?.locationId) : buildGameplayEngineRoute({ step: "EXPLORATION" });

        if (mode === "exploration-led") {
            return [
                {
                    id: "world-brief",
                    phase: "Phase 01",
                    owner: "World Architect Agent",
                    title: "Assemble the current world brief",
                    description: "Load the canonical world prompt, active tones, and regional lore before any scene generation happens.",
                    signal: gmContext?.worldPrompt?.trim() || "Write the canonical world prompt in Game Master first.",
                    href: buildGameMasterRoute({ tab: "directives" }),
                    ctaLabel: "Open Game Master",
                },
                {
                    id: "manifest-pick",
                    phase: "Phase 02",
                    owner: "GM Agent",
                    title: "Pick an exploration insert as the playable anchor",
                    description: "Use an existing exploration manifest as the scene shell, then let the GM package it as a cutscene-to-play transition.",
                    signal: activeManifest?.name || "No exploration manifest available yet.",
                    href: explorationHref,
                    ctaLabel: "Open Exploration",
                },
                {
                    id: "media-package",
                    phase: "Phase 03",
                    owner: "GM Agent",
                    title: "Emit interleaved scene media",
                    description: "The runtime packages narration, voice, cutscene stills, and OST cues around the selected exploration location.",
                    signal: currentIllustrationUrl ? "Quest illustration can already seed the visual channel." : "Visual channel should call asset generation on demand.",
                },
                {
                    id: "choice",
                    phase: "Phase 04",
                    owner: "Player + UI Loop",
                    title: "Resolve player action inside the location beat",
                    description: "After the scene package lands, drop into a short playable exploration beat before resuming the story stream.",
                    signal: "Reuse the existing exploration runtime for locomotion and interactions.",
                    href: buildGameplayEngineRoute({ step: "EXPLORATION", explorationTab: "location" }),
                    ctaLabel: "Open Gameplay Engine",
                },
            ];
        }

        if (mode === "hybrid") {
            return [
                {
                    id: "quest-spine",
                    phase: "Phase 01",
                    owner: "World Architect Agent",
                    title: "Use the quest system as the story spine",
                    description: "Treat the quest run as the structural backbone so the demo has stakes, pacing, and ending pressure from the first minute.",
                    signal: activeRun?.title || "Generate or activate a quest run first.",
                    href: questHref,
                    ctaLabel: activeRun ? "Resume Quest Run" : "Seed a Quest Run",
                },
                {
                    id: "scene-package",
                    phase: "Phase 02",
                    owner: "GM Agent",
                    title: "Turn the current node into a media package",
                    description: "Each quest node becomes a bundle: narration text, voice line, cutscene still, OST cue, and player choices.",
                    signal: activeRun?.currentNode?.title || "No active quest node loaded.",
                },
                {
                    id: "exploration-insert",
                    phase: "Phase 03",
                    owner: "GM Agent + Tool Layer",
                    title: "Insert exploration only when the node needs a playable beat",
                    description: "Exploration is an insert, not the backbone. Use it for scouting, traversal, and spatial tension when the story benefits from control handoff.",
                    signal: activeManifest?.name || "Generate at least one exploration manifest for hybrid inserts.",
                    href: explorationHref,
                    ctaLabel: activeManifest ? "Open Insert Location" : "Prep Exploration",
                },
                {
                    id: "state-update",
                    phase: "Phase 04",
                    owner: "World Architect Agent",
                    title: "Write consequences back into canon",
                    description: "After the choice or exploration beat, persist the result into the quest archive, glossary, or world context so the next scene is grounded.",
                    signal: `${questArchive.length} saved quest runs already persist this shape.`,
                    href: buildQuestsRoute("archive"),
                    ctaLabel: "Open Quest Archive",
                },
            ];
        }

        return [
            {
                id: "world-brief",
                phase: "Phase 01",
                owner: "World Architect Agent",
                title: "Compile the world canon into a quest-ready brief",
                description: "The architect agent reduces world canon into a compact prompt block and target tensions for the runtime.",
                signal: gmContext?.worldPrompt?.trim() || "Canonical world prompt missing.",
                href: buildGameMasterRoute({ tab: "directives" }),
                ctaLabel: "Write World Prompt",
            },
            {
                id: "quest-run",
                phase: "Phase 02",
                owner: "World Architect Agent",
                title: "Generate or resume a quest run",
                description: "Use the quest engine to establish the current objective, failure pressure, and scene order before media generation starts.",
                signal: activeRun?.title || `${questArchive.length} archived runs available.`,
                href: questHref,
                ctaLabel: activeRun ? "Open Active Run" : "Open Quest Seed",
            },
                {
                    id: "media-package",
                    phase: "Phase 03",
                    owner: "GM Agent",
                    title: "Interleave narration, voice, art, and OST around the active node",
                    description: "This is the judged surface: a single scene pipeline that progressively reveals media instead of showing disconnected generators.",
                    signal: activeRun?.currentNode?.text ? summarizeQuestNodeText(activeRun.currentNode.text) : activeRun?.summary || "No active node loaded.",
                },
            {
                id: "decision",
                phase: "Phase 04",
                owner: "Player + UI Loop",
                title: "Present choices and resolve the next beat",
                description: "Use quest choices as the primary interaction, then escalate to exploration inserts only when the current node calls for spatial play.",
                signal: activeManifest ? "Exploration insert is available as a secondary beat." : "No exploration insert prepared yet.",
                href: activeManifest ? explorationHref : undefined,
                ctaLabel: activeManifest ? "Open Exploration Insert" : undefined,
            },
        ];
    }, [activeManifest, activeRun, activeWorldId, gmContext?.worldPrompt, mode, questArchive.length]);

    const readiness = useMemo(() => {
        const canonReady = !!gmContext?.worldPrompt?.trim();
        const questReady = !!activeRun || questArchive.length > 0;
        const explorationReady = explorationManifests.length > 0;

        return [
            {
                label: "Canon",
                tone: canonReady ? "ready" : "missing",
                value: canonReady ? "Ready" : "Blocked",
                hint: canonReady ? "GM context already has a canonical world prompt." : "Use the Game Master page to lock the world prompt first.",
            },
            {
                label: "Quest Backbone",
                tone: questReady ? "ready" : "partial",
                value: questReady ? "Ready" : "Seed Needed",
                hint: questReady ? "Quest archive can already serve as the story spine." : "Generate at least one quest run to anchor the loop.",
            },
            {
                label: "Exploration Insert",
                tone: explorationReady ? "ready" : "partial",
                value: explorationReady ? "Ready" : "Optional",
                hint: explorationReady ? "A location manifest can be inserted when the GM needs playable space." : "Exploration is optional for the first vertical slice, but the hook is already here.",
            },
        ] as Array<{ label: string; tone: ReadinessTone; value: string; hint: string }>;
    }, [activeRun, explorationManifests.length, gmContext?.worldPrompt, questArchive.length]);

    const mediaChannels = useMemo<MediaChannel[]>(() => {
        const tones = gmContext?.ambience?.tones?.join(", ") || "bleak, frontier";
        return [
            {
                id: "narration",
                label: "Narration",
                status: activeRun ? "Prompt-ready" : "Waiting on quest beat",
                summary: activeRun?.currentNode?.text ? summarizeQuestNodeText(activeRun.currentNode.text) : gmContext?.worldPrompt || "Needs a quest node or world prompt to generate scene text.",
            },
            {
                id: "voice",
                label: "Voice",
                status: "Scaffold next",
                summary: "Feed the GM narration stream into a speech channel so quest content lands as voiced scene beats.",
            },
            {
                id: "cutscene",
                label: "Cutscene Still",
                status: currentIllustrationUrl ? "Reusable now" : "Generate on node open",
                summary: currentIllustrationUrl
                    ? "Active quest illustration already exists and can seed the cutscene track."
                    : "Use quest node summaries or asset prompts to request a still when the beat opens.",
            },
            {
                id: "ost",
                label: "OST Cue",
                status: "Scaffold next",
                summary: `Derive adaptive cues from ambience and quest pressure. Current tone seed: ${tones}.`,
            },
        ];
    }, [activeRun, currentIllustrationUrl, gmContext]);

    if (!activeWorldId || !selectedWorld) {
        return (
            <div className="min-h-screen bg-[#070b12] px-8 pb-10 pt-24 text-gray-300">
                <div className="mx-auto max-w-6xl">
                    <Card className="rounded-[32px] border border-white/5 bg-[#121820] p-8">
                        <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-300">Story Loop</div>
                        <h1 className="mt-3 text-4xl font-black uppercase tracking-[0.18em] text-white">Select a world first</h1>
                        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-gray-400">
                            This loop frontend is intentionally built on the existing dev-tools stack. Pick an active world, then use the page to drive a quest-first hybrid demo that interleaves canon, media generation, and optional exploration inserts.
                        </p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <Link className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-cyan-200 transition-colors hover:bg-cyan-500/20" to={DEVTOOLS_ROUTES.worldgen}>
                                Open World Generator
                            </Link>
                            <Link className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-gray-200 transition-colors hover:bg-white/10" to={buildGameMasterRoute()}>
                                Open Game Master
                            </Link>
                            <Link className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-gray-200 transition-colors hover:bg-white/10" to={buildQuestsRoute("seed")}>
                                Open Quests
                            </Link>
                        </div>
                    </Card>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#070b12] px-8 pb-10 pt-24 text-gray-300">
            <div className="mx-auto flex max-w-7xl flex-col gap-6">
                <Card className="overflow-hidden rounded-[34px] border border-white/5 bg-[#121820]">
                    <div className="grid gap-6 border-b border-white/5 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.12),_transparent_48%),radial-gradient(circle_at_top_right,_rgba(251,191,36,0.12),_transparent_42%),linear-gradient(180deg,#121820_0%,#0a1018_100%)] px-8 py-8 lg:grid-cols-[1.7fr_0.9fr]">
                        <div>
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-cyan-300">Story Loop Frontend</div>
                                <ReadinessBadge tone={recommendedMode === "hybrid" ? "ready" : "partial"} label={`${recommendedMode} recommended`} />
                                {isLoading && <ReadinessBadge tone="partial" label="loading" />}
                            </div>
                            <h1 className="mt-4 max-w-4xl text-4xl font-black uppercase tracking-[0.16em] text-white">
                                Build the demo around quests first, then inject exploration as a controlled beat.
                            </h1>
                            <p className="mt-4 max-w-4xl text-sm leading-relaxed text-gray-400">
                                The current repo is already much closer to a strong quest-first hybrid than a full open exploration demo. This page packages the existing world canon, quest archive, and exploration manifests into one judged narrative loop.
                            </p>
                            <div className="mt-6 flex flex-wrap gap-3">
                                {([
                                    { id: "quest-led", label: "Quest-led" },
                                    { id: "hybrid", label: "Hybrid" },
                                    { id: "exploration-led", label: "Exploration-led" },
                                ] as Array<{ id: LoopMode; label: string }>).map((entry) => (
                                    <button
                                        key={entry.id}
                                        type="button"
                                        onClick={() => setMode(entry.id)}
                                        className={`rounded-full border px-4 py-2 text-[10px] font-bold uppercase tracking-[0.24em] transition-colors ${mode === entry.id
                                            ? "border-cyan-500/35 bg-cyan-500/15 text-cyan-100"
                                            : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                                            }`}
                                    >
                                        {entry.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-[28px] border border-white/8 bg-black/20 p-5">
                            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300">Active World</div>
                            <div className="mt-3 text-2xl font-black text-white">{selectedWorld.name || selectedWorld.prompt || "Unknown World"}</div>
                            <div className="mt-3 text-sm leading-relaxed text-gray-400">
                                {gmContext?.worldPrompt?.trim() || "No canonical world prompt is written yet. Use the Game Master tool to define the world before the live loop starts."}
                            </div>
                            <div className="mt-4 rounded-2xl border border-white/8 bg-[#05080c] px-4 py-3 text-xs uppercase tracking-[0.18em] text-gray-500">
                                {ambienceSummary}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 px-8 py-6 md:grid-cols-3">
                        <SummaryCard
                            label="Quest Backbone"
                            value={activeRun?.title || `${questArchive.length} archived runs`}
                            hint={activeRun
                                ? `Current node: ${activeRun.currentNode?.title || "No node title yet"}`
                                : "Use quests as the structural spine for the demo."}
                        />
                        <SummaryCard
                            label="Exploration Inserts"
                            value={activeManifest?.name || `${explorationManifests.length} manifests`}
                            hint={activeManifest
                                ? "The first manifest is ready to be inserted as a playable scene."
                                : "Exploration remains optional for the first vertical slice."}
                        />
                        <SummaryCard
                            label="GM Context Sources"
                            value={`${gmContext?.sourceSummary?.enabledSources?.length || 0} enabled`}
                            hint={gmContext
                                ? `${gmContext.sourceSummary.usedLoreCounts.main} main | ${gmContext.sourceSummary.usedLoreCounts.critical} critical | ${gmContext.sourceSummary.usedLoreCounts.major} major snippets in prompt block.`
                                : "Compile the GM context to get grounded canon inputs."}
                        />
                    </div>
                </Card>

                {error && (
                    <Card className="rounded-[28px] border border-rose-500/20 bg-rose-500/10 p-5 text-sm text-rose-100">
                        {error}
                    </Card>
                )}

                <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                    <Card className="rounded-[30px] border border-white/5 bg-[#121820] p-6">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-gray-500">Loop Blueprint</div>
                                <h2 className="mt-2 text-2xl font-black uppercase tracking-[0.14em] text-white">
                                    Interleaved scene pipeline
                                </h2>
                                <p className="mt-3 max-w-3xl text-sm leading-relaxed text-gray-400">
                                    The new frontend should not try to replace quests or exploration. It should orchestrate them into a single scene loop where the world architect agent preps canon and the GM agent packages each beat into mixed media.
                                </p>
                            </div>
                            <Link
                                to={buildGameMasterRoute({ tab: "integrations" })}
                                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.24em] text-gray-200 transition-colors hover:bg-white/10"
                            >
                                Open Integrations
                            </Link>
                        </div>

                        <div className="mt-6 space-y-4">
                            {loopSteps.map((step, index) => (
                                <div key={step.id} className="rounded-[26px] border border-white/6 bg-black/20 p-5">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-500/25 bg-cyan-500/10 text-xs font-black text-cyan-200">
                                            {index + 1}
                                        </div>
                                        <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-gray-500">{step.phase}</div>
                                        <ReadinessBadge tone={index < 2 ? "ready" : "partial"} label={step.owner} />
                                    </div>
                                    <div className="mt-4 text-lg font-black text-white">{step.title}</div>
                                    <div className="mt-2 text-sm leading-relaxed text-gray-400">{step.description}</div>
                                    <div className="mt-4 rounded-2xl border border-white/8 bg-[#05080c] px-4 py-3 text-sm text-gray-300">
                                        {step.signal}
                                    </div>
                                    {step.href && step.ctaLabel && (
                                        <div className="mt-4">
                                            <Link
                                                to={step.href}
                                                className="inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-100 transition-colors hover:bg-cyan-500/20"
                                            >
                                                {step.ctaLabel}
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </Card>

                    <div className="space-y-6">
                        <Card className="rounded-[30px] border border-white/5 bg-[#121820] p-6">
                            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-gray-500">Readiness</div>
                            <div className="mt-5 space-y-4">
                                {readiness.map((item) => (
                                    <div key={item.label} className="rounded-[24px] border border-white/6 bg-black/20 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm font-bold text-white">{item.label}</div>
                                            <ReadinessBadge tone={item.tone} label={item.value} />
                                        </div>
                                        <div className="mt-2 text-sm leading-relaxed text-gray-400">{item.hint}</div>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <Card className="rounded-[30px] border border-white/5 bg-[#121820] p-6">
                            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-gray-500">Media Channels</div>
                            <div className="mt-5 space-y-4">
                                {mediaChannels.map((channel) => (
                                    <div key={channel.id} className="rounded-[24px] border border-white/6 bg-black/20 p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm font-bold text-white">{channel.label}</div>
                                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-gray-300">
                                                {channel.status}
                                            </span>
                                        </div>
                                        <div className="mt-2 text-sm leading-relaxed text-gray-400">{channel.summary}</div>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <Card className="overflow-hidden rounded-[30px] border border-white/5 bg-[#121820] p-6">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-gray-500">Visual Seed</div>
                                    <div className="mt-2 text-lg font-black text-white">
                                        {currentIllustrationUrl ? "Active quest illustration" : "Waiting on illustration"}
                                    </div>
                                </div>
                                {currentIllustrationUrl && (
                                    <ReadinessBadge tone="ready" label="reusable now" />
                                )}
                            </div>
                            <div className="mt-4 rounded-[24px] border border-white/8 bg-[#05080c] p-3">
                                {currentIllustrationUrl ? (
                                    <img
                                        src={currentIllustrationUrl}
                                        alt="Active quest illustration"
                                        className="h-56 w-full rounded-[18px] object-cover"
                                    />
                                ) : (
                                    <div className="flex h-56 items-center justify-center rounded-[18px] border border-dashed border-white/10 text-center text-sm leading-relaxed text-gray-500">
                                        Reuse the current quest illustration here first. If none exists, let the GM agent call asset generation when the scene package opens.
                                    </div>
                                )}
                            </div>
                        </Card>
                    </div>
                </div>

                <Card className="rounded-[30px] border border-white/5 bg-[#121820] p-6">
                    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                        <div>
                            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-gray-500">Agent Split</div>
                            <div className="mt-3 grid gap-4 md:grid-cols-2">
                                <div className="rounded-[24px] border border-cyan-500/15 bg-cyan-500/5 p-5">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-300">World Architect Agent</div>
                                    <div className="mt-3 text-sm leading-relaxed text-gray-300">
                                        Owns world canon, quest structure, and exploration availability. It should call the existing dev-tools tool layer, then persist durable outputs before play begins.
                                    </div>
                                    <div className="mt-4 text-xs uppercase tracking-[0.18em] text-gray-500">
                                        Inputs: worldgen, ecology, history, quest seed, GM context
                                    </div>
                                </div>
                                <div className="rounded-[24px] border border-amber-500/15 bg-amber-500/5 p-5">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-amber-300">GM Agent</div>
                                    <div className="mt-3 text-sm leading-relaxed text-gray-300">
                                        Owns the live scene package. It reads the current canon snapshot, decides when to emit media, and only invokes exploration when the current beat needs a playable insert.
                                    </div>
                                    <div className="mt-4 text-xs uppercase tracking-[0.18em] text-gray-500">
                                        Outputs: narration, voice, cutscene still, OST cue, player choices
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-[26px] border border-white/6 bg-black/20 p-5">
                            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-gray-500">Launch Surfaces</div>
                            <div className="mt-4 flex flex-col gap-3">
                                <Link className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-center text-[10px] font-bold uppercase tracking-[0.24em] text-gray-200 transition-colors hover:bg-white/10" to={buildGameMasterRoute({ tab: "directives" })}>
                                    Canon + GM directives
                                </Link>
                                <Link className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-center text-[10px] font-bold uppercase tracking-[0.24em] text-gray-200 transition-colors hover:bg-white/10" to={activeRun ? buildQuestsRoute("run") : buildQuestsRoute("seed")}>
                                    Quest backbone
                                </Link>
                                <Link className="rounded-full border border-white/10 bg-white/5 px-4 py-3 text-center text-[10px] font-bold uppercase tracking-[0.24em] text-gray-200 transition-colors hover:bg-white/10" to={activeWorldId ? buildExplorationRoute(activeWorldId, activeManifest?.locationId) : buildGameplayEngineRoute({ step: "EXPLORATION" })}>
                                    Exploration insert
                                </Link>
                                <Link className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-center text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-100 transition-colors hover:bg-cyan-500/20" to={buildAssetGeneratorRoute()}>
                                    Asset generation follow-up
                                </Link>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
}
