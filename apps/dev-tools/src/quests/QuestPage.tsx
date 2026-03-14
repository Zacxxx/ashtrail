import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card, Modal, TabBar } from "@ashtrail/ui";
import {
    Character,
    CombatResolutionSummary,
    GameRegistry,
    QuestChainRecord,
    QuestGlossaryEntry,
    QuestIllustrationRecord,
    QuestJobAcceptedResponse,
    QuestRunRecord,
    QuestRunSummary,
    QuestSeedConfig,
    QuestTermRef,
} from "@ashtrail/core";
import { useActiveWorld } from "../hooks/useActiveWorld";
import { useGenerationHistory } from "../hooks/useGenerationHistory";
import { HistoryGallery } from "../worldgeneration/HistoryGallery";
import type { Faction } from "../history/FactionsTab";
import type { Area } from "../history/locationTypes";
import type { EcologyBundle } from "../ecology/types";
import { CharacterSheetPanel } from "../components/CharacterSheetPanel";
import { CombatEncounterView } from "../gameplay-engine/combat/CombatSimulator";
import { useJobs } from "../jobs/useJobs";
import { useTrackedJobLauncher } from "../jobs/useTrackedJobLauncher";
import type { JobDetail, JobListItem } from "../jobs/types";
import { QuestWorkflowBar } from "./QuestWorkflowBar";
import { buildGameMasterRoute, DEVTOOLS_ROUTES } from "../lib/routes";

type QuestTab = "seed" | "run" | "archive";
type QuestSeedStep = "BRIEF" | "PARTY" | "ANCHORS" | "REVIEW";
type QuestLogTab = "HISTORY" | "CHAIN" | "GLOSSARY" | "ARC";

interface EcologyOption {
    id: string;
    kind: "biome" | "climate" | "fauna" | "flora";
    label: string;
    summary: string;
}

interface QuestEngineResponse {
    run: QuestRunRecord;
    materializedCharacters?: Character[];
    restoredCharacters?: Character[];
    warnings?: string[];
    partyUpdates?: Array<Record<string, unknown>>;
}

const DEFAULT_SEED: QuestSeedConfig = {
    premise: "",
    objective: "",
    stakes: "",
    tone: "tense",
    difficulty: "medium",
    runLength: "medium",
    openness: "balanced",
    targetEndingCount: 3,
    factionAnchorIds: [],
    locationAnchorIds: [],
    ecologyAnchorIds: [],
    notes: "",
};

const QUEST_SEED_STEPS: QuestSeedStep[] = ["BRIEF", "PARTY", "ANCHORS", "REVIEW"];
const QUEST_LOG_TABS: QuestLogTab[] = ["HISTORY", "CHAIN", "GLOSSARY", "ARC"];
const API_BASE = "/api";

function isQuestTab(value: string | null): value is QuestTab {
    return value === "seed" || value === "run" || value === "archive";
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
        const details = await response.text().catch(() => "");
        throw new Error(details || `Request failed: ${response.status}`);
    }
    return response.json();
}

function buildEcologyOptions(bundle: EcologyBundle | null): EcologyOption[] {
    if (!bundle) return [];
    return [
        ...(bundle.biomes || []).map((entry) => ({
            id: `biome:${entry.id}`,
            kind: "biome" as const,
            label: entry.name,
            summary: entry.description || entry.biomeType,
        })),
        ...(bundle.fauna || []).map((entry) => ({
            id: `fauna:${entry.id}`,
            kind: "fauna" as const,
            label: entry.name,
            summary: [
                entry.description,
                `${entry.bodyProfile.sizeClass} ${entry.bodyProfile.locomotion}`,
                `${entry.behaviorProfile.temperament} threat ${entry.dangerLevel}/100`,
                `skills: ${(entry.skillIds || []).slice(0, 3).join(", ") || "none"}`,
                `trainability ${entry.behaviorProfile.trainability}/100`,
            ].filter(Boolean).join(" • "),
        })),
        ...(bundle.flora || []).map((entry) => ({
            id: `flora:${entry.id}`,
            kind: "flora" as const,
            label: entry.name,
            summary: [
                entry.description,
                `${entry.bodyProfile.sizeClass} growth ${entry.bodyProfile.growthRate}/100`,
                `toxicity ${entry.hazardProfile.toxicity}/100`,
                `yield ${entry.resourceProfile.yieldPerHarvest}/100`,
                `medicinal ${entry.resourceProfile.medicinalValue}/100`,
                `rarity ${entry.resourceProfile.rarity}/100`,
            ].filter(Boolean).join(" • "),
        })),
    ];
}

function buildMaterializationNotice(characters?: Character[]): string | null {
    if (!characters?.length) return null;
    const names = characters.map((character) => character.name).filter(Boolean).slice(0, 3);
    const label = characters.length === 1 ? "quest NPC" : "quest NPCs";
    const suffix = characters.length > names.length ? ", ..." : "";
    const details = names.length > 0 ? `: ${names.join(", ")}${suffix}` : "";
    return `Added ${characters.length} ${label} to Character Builder${details}.`;
}

function buildQuestNotices(response: QuestEngineResponse): string[] {
    const notices = [...(response.warnings || [])];
    if (response.restoredCharacters?.length) {
        notices.unshift("Run reset to the opening state and the party was restored from the retry snapshot.");
    }
    const materializationNotice = buildMaterializationNotice(response.materializedCharacters);
    if (materializationNotice) {
        notices.unshift(materializationNotice);
    }
    return notices;
}

function isQuestRunJob(job?: Pick<JobListItem, "kind"> | null): boolean {
    return job?.kind === "quests.generate-run.v2" || job?.kind === "quests.advance-run.v2";
}

function toLegacyQuestKind(job?: Pick<JobListItem, "kind"> | null): "generate-run" | "advance-run" | null {
    if (job?.kind === "quests.generate-run.v2") return "generate-run";
    if (job?.kind === "quests.advance-run.v2") return "advance-run";
    return null;
}

function extractJobMetadata(job?: Pick<JobListItem, "metadata"> | null): Record<string, unknown> | null {
    if (!job?.metadata || typeof job.metadata !== "object") return null;
    const direct = job.metadata as Record<string, unknown>;
    if (direct.metadata && typeof direct.metadata === "object") {
        return direct.metadata as Record<string, unknown>;
    }
    return direct;
}

function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseGeneratedQuestBrief(rawText: string): Pick<QuestSeedConfig, "premise" | "objective" | "stakes"> | null {
    const trimmed = rawText.trim();
    if (!trimmed) return null;

    const normalized = trimmed
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");

    try {
        const parsed = JSON.parse(normalized);
        if (parsed && typeof parsed === "object") {
            const premise = String((parsed as any).premise || "").trim();
            const objective = String((parsed as any).objective || "").trim();
            const stakes = String((parsed as any).stakes || "").trim();
            if (premise || objective || stakes) {
                return { premise, objective, stakes };
            }
        }
    } catch {
        // Fall through to loose parsing.
    }

    const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
    const readSection = (label: string) => {
        const match = lines.find((line) => line.toLowerCase().startsWith(`${label.toLowerCase()}:`));
        return match ? match.slice(label.length + 1).trim() : "";
    };

    const premise = readSection("premise");
    const objective = readSection("objective");
    const stakes = readSection("stakes");
    if (premise || objective || stakes) {
        return { premise, objective, stakes };
    }

    return null;
}

function FieldCard({
    label,
    children,
}: {
    label: string;
    children: ReactNode;
}) {
    return (
        <label className="flex min-h-0 flex-col gap-2 rounded-2xl border border-white/5 bg-black/20 p-4">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</span>
            {children}
        </label>
    );
}

export function QuestPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<QuestTab>(isQuestTab(searchParams.get("tab")) ? searchParams.get("tab") as QuestTab : "seed");
    const [seedStep, setSeedStep] = useState<QuestSeedStep>("BRIEF");
    const [showGalleryModal, setShowGalleryModal] = useState(false);
    const [builderCharacters, setBuilderCharacters] = useState<Character[]>([]);
    const [factions, setFactions] = useState<Faction[]>([]);
    const [locations, setLocations] = useState<Area[]>([]);
    const [gmContext, setGmContext] = useState<any | null>(null);
    const [ecologyBundle, setEcologyBundle] = useState<EcologyBundle | null>(null);
    const [questArchive, setQuestArchive] = useState<QuestRunSummary[]>([]);
    const [selectedArchiveRun, setSelectedArchiveRun] = useState<QuestRunRecord | null>(null);
    const [activeRun, setActiveRun] = useState<QuestRunRecord | null>(null);
    const [questSeed, setQuestSeed] = useState<QuestSeedConfig>(DEFAULT_SEED);
    const [selectedPartyIds, setSelectedPartyIds] = useState<string[]>([]);
    const [freeformAction, setFreeformAction] = useState("");
    const [isLoadingWorldData, setIsLoadingWorldData] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isGeneratingBriefSeed, setIsGeneratingBriefSeed] = useState(false);
    const [isAdvancing, setIsAdvancing] = useState(false);
    const [notices, setNotices] = useState<string[]>([]);
    const [activeChain, setActiveChain] = useState<QuestChainRecord | null>(null);
    const [glossaryEntries, setGlossaryEntries] = useState<Record<string, QuestGlossaryEntry>>({});
    const [currentIllustration, setCurrentIllustration] = useState<QuestIllustrationRecord | null>(null);
    const [activeQuestJobId, setActiveQuestJobId] = useState<string | null>(null);
    const [activeBriefJobId, setActiveBriefJobId] = useState<string | null>(null);
    const [pendingQuestAction, setPendingQuestAction] = useState<"generate" | "advance" | null>(null);
    const [generatingPortraitIds, setGeneratingPortraitIds] = useState<string[]>([]);
    const [selectedPartyCharacterId, setSelectedPartyCharacterId] = useState<string | null>(null);
    const [isPartyModalOpen, setIsPartyModalOpen] = useState(false);
    const [isRunLogOpen, setIsRunLogOpen] = useState(false);
    const [isCombatEncounterActive, setIsCombatEncounterActive] = useState(false);
    const [isCombatBriefModalOpen, setIsCombatBriefModalOpen] = useState(false);
    const [activeRunLogTab, setActiveRunLogTab] = useState<QuestLogTab>("HISTORY");

    const { history, deleteFromHistory, renameInHistory } = useGenerationHistory();
    const { activeWorldId, setActiveWorldId } = useActiveWorld();
    const { jobs, getJobDetail, refreshJobs, waitForJob } = useJobs();
    const launchTrackedJob = useTrackedJobLauncher();
    const processedQuestJobIdRef = useRef<string | null>(null);
    const processedBriefJobIdRef = useRef<string | null>(null);
    const restoredJobIdRef = useRef<string | null>(null);
    const illustrationNoticeRef = useRef<string | null>(null);
    const selectedWorld = history.find((item) => item.id === activeWorldId) ?? null;
    const questJob = useMemo(
        () => (activeQuestJobId ? jobs.find((job) => job.jobId === activeQuestJobId) ?? null : null),
        [activeQuestJobId, jobs],
    );
    const briefJob = useMemo(
        () => (activeBriefJobId ? jobs.find((job) => job.jobId === activeBriefJobId) ?? null : null),
        [activeBriefJobId, jobs],
    );
    const currentIllustrationJob = useMemo(() => {
        const illustrationId = activeRun?.currentNode?.illustrationId;
        if (!illustrationId) return null;
        return jobs.find((job) => (
            job.kind === "quests.generate-illustration"
            && typeof extractJobMetadata(job)?.illustrationId === "string"
            && extractJobMetadata(job)?.illustrationId === illustrationId
        )) ?? null;
    }, [activeRun?.currentNode?.illustrationId, jobs]);
    const currentIllustrationAssetPath = currentIllustration?.assetPath
        || currentIllustrationJob?.outputRefs.find((output) => output.id === "illustration-image")?.href
        || null;
    const currentIllustrationStatus = currentIllustrationJob?.status === "completed"
        ? "ready"
        : currentIllustrationJob?.status === "failed"
            ? "failed"
            : currentIllustration?.status
                || (currentIllustrationJob ? "generating" : null);

    const partyCharacters = useMemo(
        () => builderCharacters.filter((character) => selectedPartyIds.includes(character.id)),
        [builderCharacters, selectedPartyIds],
    );
    const availablePartyCharacters = useMemo(
        () => builderCharacters.filter((character) => character.worldId === activeWorldId && !character.isNPC),
        [activeWorldId, builderCharacters],
    );
    const activeRunParty = useMemo(
        () => (activeRun ? builderCharacters.filter((character) => activeRun.partyCharacterIds.includes(character.id)) : []),
        [activeRun, builderCharacters],
    );
    const ecologyOptions = useMemo(() => buildEcologyOptions(ecologyBundle), [ecologyBundle]);
    const hasCanonicalWorldPrompt = !!gmContext?.worldPrompt?.trim();

    useEffect(() => {
        const tab = searchParams.get("tab");
        if (isQuestTab(tab) && tab !== activeTab) {
            setActiveTab(tab);
        }
        if (!isQuestTab(tab)) {
            setSearchParams({ tab: "seed" }, { replace: true });
        }
    }, [activeTab, searchParams, setSearchParams]);

    const refreshBuilderCharacters = useCallback(async () => {
        await GameRegistry.fetchFromBackend();
        setBuilderCharacters(GameRegistry.getAllCharacters());
    }, []);

    const refreshArchive = useCallback(async (worldId: string) => {
        const archive = await fetchJson<QuestRunSummary[]>(`${API_BASE}/planet/quests/${worldId}`);
        setQuestArchive(Array.isArray(archive) ? archive : []);
        return archive;
    }, []);

    const saveRun = useCallback(async (run: QuestRunRecord) => {
        await fetchJson(`${API_BASE}/planet/quests/${run.worldId}/${run.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(run),
        });
    }, []);

    const loadRunDetail = useCallback(async (worldId: string, runId: string) => {
        return fetchJson<QuestRunRecord>(`${API_BASE}/planet/quests/${worldId}/${runId}`);
    }, []);

    const refreshChains = useCallback(async (worldId: string, preferredChainId?: string | null) => {
        const chains = await fetchJson<QuestChainRecord[]>(`${API_BASE}/planet/quests/${worldId}/chains`).catch(() => []);
        const selected = (chains || []).find((chain) => chain.id === preferredChainId)
            || (chains || []).find((chain) => chain.status === "active")
            || (chains || [])[0]
            || null;
        setActiveChain(selected);
        return selected;
    }, []);

    const loadIllustration = useCallback(async (worldId: string, illustrationId?: string | null) => {
        if (!illustrationId) {
            setCurrentIllustration(null);
            return null;
        }
        const illustration = await fetchJson<QuestIllustrationRecord>(`${API_BASE}/planet/quests/${worldId}/illustrations/${illustrationId}`).catch(() => null);
        setCurrentIllustration(illustration);
        return illustration;
    }, []);

    useEffect(() => {
        if (!activeWorldId) {
            setActiveRun(null);
            setSelectedArchiveRun(null);
            setQuestArchive([]);
            setFactions([]);
            setLocations([]);
            setGmContext(null);
            setEcologyBundle(null);
            setSelectedPartyIds([]);
            setActiveChain(null);
            setGlossaryEntries({});
            setCurrentIllustration(null);
            setActiveQuestJobId(null);
            setActiveBriefJobId(null);
            setPendingQuestAction(null);
            return;
        }

        let cancelled = false;
        async function loadWorldData() {
            setIsLoadingWorldData(true);
            try {
                await refreshBuilderCharacters();
                const [nextFactions, nextLocations, nextGmContext, nextEcology, archive, nextChain] = await Promise.all([
                    fetchJson<Faction[]>(`${API_BASE}/planet/factions/${activeWorldId}`).catch(() => []),
                    fetchJson<Area[]>(`${API_BASE}/planet/locations/${activeWorldId}`).catch(() => []),
                    fetchJson<any>(`${API_BASE}/planet/gm-context/${activeWorldId}`).catch(() => null),
                    fetchJson<EcologyBundle>(`${API_BASE}/planet/ecology-data/${activeWorldId}`).catch(() => null),
                    refreshArchive(activeWorldId).catch(() => []),
                    refreshChains(activeWorldId).catch(() => null),
                ]);
                if (cancelled) return;
                setFactions(Array.isArray(nextFactions) ? nextFactions : []);
                setLocations(Array.isArray(nextLocations) ? nextLocations : []);
                setGmContext(nextGmContext);
                setEcologyBundle(nextEcology);
                setActiveChain(nextChain);
                const firstActive = Array.isArray(archive) ? archive.find((run) => run.status === "active") : null;
                if (firstActive) {
                    const detail = await loadRunDetail(activeWorldId, firstActive.id).catch(() => null);
                    if (!cancelled && detail) {
                        setActiveRun(detail);
                        setSelectedArchiveRun(detail);
                    }
                } else if (!cancelled) {
                    setActiveRun(null);
                }
            } catch (error) {
                console.error("Failed to load quest world data", error);
            } finally {
                if (!cancelled) setIsLoadingWorldData(false);
            }
        }
        void loadWorldData();
        return () => {
            cancelled = true;
        };
    }, [activeWorldId, loadRunDetail, refreshArchive, refreshBuilderCharacters, refreshChains]);

    useEffect(() => {
        if (availablePartyCharacters.length === 0) {
            setSelectedPartyIds([]);
            return;
        }
        setSelectedPartyIds((previous) => {
            const filtered = previous.filter((id) => availablePartyCharacters.some((character) => character.id === id));
            if (filtered.length > 0) return filtered.slice(0, 3);
            return availablePartyCharacters.slice(0, 1).map((character) => character.id);
        });
    }, [availablePartyCharacters]);

    useEffect(() => {
        const source = activeRunParty.length > 0 ? activeRunParty : partyCharacters;
        if (source.length === 0) {
            setSelectedPartyCharacterId(null);
            return;
        }
        setSelectedPartyCharacterId((previous) => (
            previous && source.some((character) => character.id === previous) ? previous : source[0].id
        ));
    }, [activeRunParty, partyCharacters]);

    useEffect(() => {
        if (!activeRun?.worldId || !activeRun.currentNode?.illustrationId) {
            setCurrentIllustration(null);
            return;
        }
        void loadIllustration(activeRun.worldId, activeRun.currentNode?.illustrationId);
    }, [activeRun?.currentNode?.illustrationId, activeRun?.worldId, loadIllustration]);

    useEffect(() => {
        if (!activeRun?.worldId || !activeRun.currentNode?.illustrationId || !currentIllustrationJob) {
            return;
        }
        if (currentIllustrationJob.status === "completed" || currentIllustrationJob.status === "failed") {
            void loadIllustration(activeRun.worldId, activeRun.currentNode.illustrationId);
        }
    }, [
        activeRun?.currentNode?.illustrationId,
        activeRun?.worldId,
        currentIllustrationJob?.jobId,
        currentIllustrationJob?.status,
        currentIllustrationJob?.updatedAt,
        loadIllustration,
    ]);

    useEffect(() => {
        if (!currentIllustrationJob || currentIllustrationJob.status !== "failed") {
            illustrationNoticeRef.current = null;
            return;
        }
        const nextError = currentIllustrationJob.error || "Quest illustration generation failed.";
        const noticeKey = `${currentIllustrationJob.jobId}:${nextError}`;
        if (illustrationNoticeRef.current === noticeKey) {
            return;
        }
        illustrationNoticeRef.current = noticeKey;
        setNotices((previous) => [nextError, ...previous.filter((entry) => entry !== nextError)]);
    }, [currentIllustrationJob?.error, currentIllustrationJob?.jobId, currentIllustrationJob?.status]);

    useEffect(() => {
        if (!questJob || !isQuestRunJob(questJob) || !pendingQuestAction) {
            return;
        }
        if (processedQuestJobIdRef.current === `${questJob.jobId}:${questJob.updatedAt}`) {
            return;
        }
        if (questJob.status === "queued" || questJob.status === "running") {
            return;
        }

        processedQuestJobIdRef.current = `${questJob.jobId}:${questJob.updatedAt}`;
        const response = (questJob.metadata?.result || (questJob as JobDetail).result || {}) as QuestEngineResponse;
        if (questJob.status !== "completed") {
            setNotices([questJob.error || (pendingQuestAction === "generate" ? "Quest generation failed." : "Failed to advance quest.")]);
            setIsGenerating(false);
            setIsAdvancing(false);
            setPendingQuestAction(null);
            return;
        }

        const finalize = async () => {
            if (pendingQuestAction === "generate") {
                await refreshBuilderCharacters();
                if (activeWorldId) {
                    await refreshArchive(activeWorldId);
                    await refreshChains(activeWorldId, response.run?.chainId);
                }
                if (response.run) {
                    setActiveRun(response.run);
                    setSelectedArchiveRun(response.run);
                }
                setNotices(buildQuestNotices(response));
                setActiveTab("run");
                setSearchParams({ tab: "run" });
                setIsGenerating(false);
            } else {
                if (activeRun?.worldId) {
                    await refreshArchive(activeRun.worldId);
                    await refreshChains(activeRun.worldId, response.run?.chainId);
                }
                await refreshBuilderCharacters();
                if (response.run) {
                    setActiveRun(response.run);
                    setSelectedArchiveRun(response.run);
                }
                setFreeformAction("");
                setNotices(buildQuestNotices(response));
                setIsAdvancing(false);
            }
            await refreshJobs();
            window.setTimeout(() => {
                void refreshJobs();
            }, 400);
            setPendingQuestAction(null);
        };

        void finalize();
    }, [
        activeRun?.worldId,
        activeWorldId,
        pendingQuestAction,
        questJob,
        refreshArchive,
        refreshBuilderCharacters,
        refreshChains,
        refreshJobs,
        setSearchParams,
    ]);

    useEffect(() => {
        if (!briefJob || briefJob.status === "queued" || briefJob.status === "running") {
            return;
        }
        const processedKey = `${briefJob.jobId}:${briefJob.updatedAt}`;
        if (processedBriefJobIdRef.current === processedKey) {
            return;
        }
        processedBriefJobIdRef.current = processedKey;

        const finalize = async () => {
            if (briefJob.status !== "completed") {
                setNotices((previous) => [briefJob.error || "Failed to generate quest brief.", ...previous]);
                setIsGeneratingBriefSeed(false);
                return;
            }

            const detail = await getJobDetail(briefJob.jobId);
            const text = String((detail?.result as { text?: string } | undefined)?.text || "").trim();
            const nextBrief = parseGeneratedQuestBrief(text);
            if (!nextBrief) {
                setNotices((previous) => ["Quest brief generation returned invalid content", ...previous]);
                setIsGeneratingBriefSeed(false);
                return;
            }
            setQuestSeed((previous) => ({
                ...previous,
                premise: nextBrief.premise || previous.premise,
                objective: nextBrief.objective || previous.objective,
                stakes: nextBrief.stakes || previous.stakes,
            }));
            setNotices((previous) => ["Generated premise, objective, and stakes.", ...previous]);
            setIsGeneratingBriefSeed(false);
        };

        void finalize();
    }, [briefJob, getJobDetail]);

    useEffect(() => {
        return () => {
            processedQuestJobIdRef.current = null;
        };
    }, []);

    useEffect(() => {
        const restoreJobId = searchParams.get("restoreJob");
        if (!restoreJobId || restoredJobIdRef.current === restoreJobId) {
            return;
        }
        restoredJobIdRef.current = restoreJobId;
        const restore = async () => {
            const detail = await getJobDetail(restoreJobId);
            const metadata = detail?.metadata as Record<string, unknown> | undefined;
            const restoreSpec = metadata?.restore as { search?: Record<string, unknown>; payload?: Record<string, unknown> } | undefined;
            const payload = restoreSpec?.payload || {};
            if (typeof payload.worldId === "string") {
                setActiveWorldId(payload.worldId);
            }
            const nextTab = typeof restoreSpec?.search?.tab === "string" ? restoreSpec.search.tab : "seed";
            setActiveTab(nextTab as QuestTab);
            setSearchParams({ tab: String(nextTab) }, { replace: true });
            if (payload.questSeed && typeof payload.questSeed === "object") {
                setQuestSeed((previous) => ({ ...previous, ...(payload.questSeed as Partial<QuestSeedConfig>) }));
            }
            if (Array.isArray(payload.selectedPartyIds)) {
                setSelectedPartyIds(payload.selectedPartyIds.filter((value): value is string => typeof value === "string"));
            }
            if (typeof payload.runId === "string" && typeof payload.worldId === "string") {
                const run = await loadRunDetail(payload.worldId, payload.runId).catch(() => null);
                if (run) {
                    setActiveRun(run);
                    setSelectedArchiveRun(run);
                    const historicalRunUpdatedAt = typeof metadata?.runUpdatedAt === "number" ? metadata.runUpdatedAt : null;
                    if (historicalRunUpdatedAt && run.updatedAt !== historicalRunUpdatedAt) {
                        setNotices((previous) => [
                            "This redo payload was created for an older state of this run. Review before advancing again.",
                            ...previous,
                        ]);
                    }
                }
            }
            if (typeof payload.freeformAction === "string") {
                setFreeformAction(payload.freeformAction);
            }
        };
        void restore();
    }, [getJobDetail, loadRunDetail, searchParams, setActiveWorldId, setSearchParams]);

    const persistCharacters = useCallback(async (characters: Character[]) => {
        if (!characters.length) return;
        await Promise.all(characters.map((character) => fetchJson(`${API_BASE}/data/characters`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(character),
        })));
        await refreshBuilderCharacters();
    }, [refreshBuilderCharacters]);

    const ensureGlossaryEntry = useCallback(async (termRef: QuestTermRef) => {
        if (!activeWorldId) return null;
        if (glossaryEntries[termRef.slug]) return glossaryEntries[termRef.slug];
        const entry = await fetchJson<QuestGlossaryEntry>(`${API_BASE}/planet/quests/${activeWorldId}/glossary?term=${encodeURIComponent(termRef.term)}`).catch(() => null);
        if (entry) {
            setGlossaryEntries((previous) => ({ ...previous, [entry.slug]: entry }));
        }
        return entry;
    }, [activeWorldId, glossaryEntries]);

    const handleGenerateNpcPortrait = useCallback(async (npcId: string) => {
        const character = builderCharacters.find((entry) => entry.id === npcId);
        if (!character || generatingPortraitIds.includes(npcId)) return;
        const prompt = [
            character.name,
            character.occupation?.name || character.title || character.type,
            character.backstory || character.history || character.currentStory || "",
            character.faction || "",
        ].filter(Boolean).join(". ");

        setGeneratingPortraitIds((previous) => [...previous, npcId]);
        try {
            const accepted = await launchTrackedJob<{ jobId: string }, { prompt: string }>({
                url: `${API_BASE}/gm/generate-character-portrait`,
                request: { prompt },
                optimisticJob: {
                    kind: "gm.generate-character-portrait",
                    title: "Generate Character Portrait",
                    tool: "game-master",
                    status: "queued",
                    currentStage: "Queued",
                    worldId: activeWorldId,
                    metadata: {
                        worldId: activeWorldId,
                        characterId: character.id,
                        characterName: character.name,
                    },
                },
                metadata: {
                    worldId: activeWorldId,
                    characterId: character.id,
                    characterName: character.name,
                },
                restore: {
                    route: DEVTOOLS_ROUTES.quests,
                    search: { tab: "run" },
                    payload: {
                        worldId: activeWorldId,
                        runId: activeRun?.id || null,
                    },
                },
            });
            const detail = await waitForJob(accepted.jobId);
            const dataUrl = String((detail.result as { dataUrl?: string } | undefined)?.dataUrl || "");
            if (detail.status !== "completed" || !dataUrl) {
                throw new Error(detail.error || "Failed to generate NPC portrait.");
            }
            if (dataUrl) {
                await persistCharacters([{
                    ...character,
                    portraitUrl: dataUrl,
                    portraitName: character.name || character.id,
                }]);
                setNotices((previous) => [`Generated portrait for ${character.name}.`, ...previous]);
            }
        } catch (error) {
            console.error("Failed to generate NPC portrait", error);
            setNotices((previous) => [error instanceof Error ? error.message : "Failed to generate NPC portrait.", ...previous]);
        } finally {
            setGeneratingPortraitIds((previous) => previous.filter((id) => id !== npcId));
        }
    }, [activeRun?.id, activeWorldId, builderCharacters, generatingPortraitIds, launchTrackedJob, persistCharacters, waitForJob]);

    const selectedFactionAnchors = factions.filter((faction) => questSeed.factionAnchorIds.includes(faction.id));
    const selectedLocationAnchors = locations.filter((location) => questSeed.locationAnchorIds.includes(location.id));
    const selectedEcologyAnchors = ecologyOptions.filter((option) => questSeed.ecologyAnchorIds.includes(option.id));

    const handleGenerateQuest = useCallback(async () => {
        if (!activeWorldId || !gmContext || selectedPartyIds.length === 0) return;
        setIsGenerating(true);
        setNotices([]);
        setPendingQuestAction("generate");
        try {
            const accepted = await launchTrackedJob<QuestJobAcceptedResponse, Record<string, unknown>>({
                url: `${API_BASE}/quests/generate-run`,
                request: {
                    worldId: activeWorldId,
                    seed: questSeed,
                    partyCharacterIds: selectedPartyIds,
                },
                optimisticJob: {
                    kind: "quests.generate-run.v2",
                    title: "Generate Quest Run",
                    tool: "quests",
                    status: "queued",
                    currentStage: "Queued",
                    worldId: activeWorldId,
                    metadata: {
                        questTitle: questSeed.premise || null,
                    },
                },
                restore: {
                    route: DEVTOOLS_ROUTES.quests,
                    search: { tab: "seed" },
                    payload: {
                        worldId: activeWorldId,
                        questSeed,
                        selectedPartyIds,
                    },
                },
            });
            setActiveQuestJobId(accepted.jobId);
            processedQuestJobIdRef.current = null;
        } catch (error) {
            console.error("Failed to generate quest run", error);
            setNotices([error instanceof Error ? error.message : "Failed to generate quest run."]);
            setPendingQuestAction(null);
            setIsGenerating(false);
            setActiveQuestJobId(null);
        } finally {
        }
    }, [activeWorldId, gmContext, launchTrackedJob, questSeed, selectedPartyIds]);

    const handleGenerateQuestBrief = useCallback(async () => {
        if (!selectedWorld || !gmContext || isGeneratingBriefSeed) return;
        setIsGeneratingBriefSeed(true);
        setActiveBriefJobId(null);
        processedBriefJobIdRef.current = null;
        try {
            const prompt = [
                "You are generating a quest seed for Ashtrail.",
                "Return valid raw JSON only with keys: premise, objective, stakes.",
                "Each field must be 1 to 2 sentences, concrete, grounded, and gameable.",
                "Do not include markdown fences or extra commentary.",
                "",
                `World: ${gmContext?.worldName || selectedWorld.name || "Unknown World"}`,
                `Canonical world prompt: ${gmContext?.worldPrompt || "None"}`,
                `Visual world seed prompt: ${gmContext?.worldSeedPrompt || selectedWorld.prompt || "None"}`,
                `Selected party: ${partyCharacters.map((character) => `${character.name} (${character.occupation?.name || character.type || "Wanderer"})`).join(", ") || "No party selected yet"}`,
                `Faction anchors: ${selectedFactionAnchors.map((entry) => entry.name).join(", ") || "None"}`,
                `Location anchors: ${selectedLocationAnchors.map((entry) => entry.name).join(", ") || "None"}`,
                `Ecology anchors: ${selectedEcologyAnchors.map((entry) => entry.label).join(", ") || "None"}`,
                `Tone: ${questSeed.tone || "tense"}`,
                `Difficulty: ${questSeed.difficulty}`,
                `Run length: ${questSeed.runLength}`,
                `Openness: ${questSeed.openness}`,
                questSeed.notes?.trim() ? `Extra notes: ${questSeed.notes.trim()}` : "",
            ].filter(Boolean).join("\n");

            const accepted = await launchTrackedJob<{ jobId: string }, { prompt: string }>({
                url: "/api/text/generate",
                request: { prompt },
                optimisticJob: {
                    kind: "quests.generate-brief",
                    title: "Generate Quest Brief",
                    tool: "quests",
                    status: "queued",
                    currentStage: "Queued",
                    worldId: selectedWorld.id,
                    metadata: {
                        questTitle: questSeed.premise || null,
                    },
                },
                restore: {
                    route: DEVTOOLS_ROUTES.quests,
                    search: { tab: "seed" },
                    payload: {
                        worldId: selectedWorld.id,
                        questSeed,
                        selectedPartyIds,
                    },
                },
            });
            setActiveBriefJobId(accepted.jobId);
        } catch (error) {
            console.error("Failed to generate quest brief", error);
            setNotices((previous) => [error instanceof Error ? error.message : "Failed to generate quest brief.", ...previous]);
            setIsGeneratingBriefSeed(false);
        } finally {
        }
    }, [
        gmContext,
        isGeneratingBriefSeed,
        launchTrackedJob,
        partyCharacters,
        questSeed.difficulty,
        questSeed.notes,
        questSeed.openness,
        questSeed.premise,
        questSeed.runLength,
        questSeed.tone,
        questSeed,
        selectedPartyIds,
        selectedEcologyAnchors,
        selectedFactionAnchors,
        selectedLocationAnchors,
        selectedWorld,
    ]);

    const handleAdvanceQuest = useCallback(async (choice?: string, combatResolution?: CombatResolutionSummary, freeform?: string) => {
        if (!activeRun || !gmContext) return;
        setIsAdvancing(true);
        setNotices([]);
        setPendingQuestAction("advance");
        try {
            const accepted = await launchTrackedJob<QuestJobAcceptedResponse, Record<string, unknown>>({
                url: `${API_BASE}/quests/advance`,
                request: {
                    worldId: activeRun.worldId,
                    runId: activeRun.id,
                    chosenAction: choice || undefined,
                    freeformAction: freeform || undefined,
                    combatResolution,
                },
                optimisticJob: {
                    kind: "quests.advance-run.v2",
                    title: "Advance Quest Run",
                    tool: "quests",
                    status: "queued",
                    currentStage: "Queued",
                    worldId: activeRun.worldId,
                    runId: activeRun.id,
                    metadata: {
                        questTitle: activeRun.title,
                        nodeIndex: activeRun.nodeCount,
                        nodeCount: activeRun.maxNodeCount,
                    },
                },
                restore: {
                    route: DEVTOOLS_ROUTES.quests,
                    search: { tab: "run" },
                    payload: {
                        worldId: activeRun.worldId,
                        runId: activeRun.id,
                        chosenAction: choice || null,
                        freeformAction: freeform || "",
                        combatResolution: combatResolution || null,
                    },
                },
            });
            setActiveQuestJobId(accepted.jobId);
            processedQuestJobIdRef.current = null;
        } catch (error) {
            console.error("Failed to advance quest", error);
            setNotices([error instanceof Error ? error.message : "Failed to advance quest."]);
            setPendingQuestAction(null);
            setIsAdvancing(false);
            setActiveQuestJobId(null);
        } finally {
        }
    }, [activeRun, gmContext, launchTrackedJob]);

    const handleDeleteRun = useCallback(async (summary: QuestRunSummary) => {
        await fetch(`${API_BASE}/planet/quests/${summary.worldId}/${summary.id}`, { method: "DELETE" });
        const nextArchive = await refreshArchive(summary.worldId);
        if (activeRun?.id === summary.id) setActiveRun(null);
        if (selectedArchiveRun?.id === summary.id) {
            setSelectedArchiveRun(null);
            const nextActive = Array.isArray(nextArchive) ? nextArchive.find((run) => run.status === "active") : null;
            if (nextActive) {
                const detail = await loadRunDetail(summary.worldId, nextActive.id).catch(() => null);
                if (detail) setActiveRun(detail);
            }
        }
    }, [activeRun?.id, loadRunDetail, refreshArchive, selectedArchiveRun?.id]);

    const handleAbandonRun = useCallback(async () => {
        if (!activeRun) return;
        const abandonedRun: QuestRunRecord = {
            ...activeRun,
            status: "abandoned",
            updatedAt: Date.now(),
            completedAt: Date.now(),
        };
        await saveRun(abandonedRun);
        await refreshArchive(abandonedRun.worldId);
        setActiveRun(null);
        setSelectedArchiveRun(abandonedRun);
        setActiveTab("archive");
        setSearchParams({ tab: "archive" });
    }, [activeRun, refreshArchive, saveRun, setSearchParams]);

    const currentNode = activeRun?.currentNode;
    const hasPendingCombat = currentNode?.kind === "combat" && !!currentNode.pendingCombat?.enemyIds?.length;
    const currentTermRefs = useMemo(
        () => [...(currentNode?.termRefs || [])].sort((a, b) => b.term.length - a.term.length),
        [currentNode?.termRefs],
    );

    useEffect(() => {
        setIsCombatEncounterActive(false);
        setIsCombatBriefModalOpen(false);
    }, [activeRun?.id, currentNode?.id, currentNode?.kind]);

    const renderGlossaryText = useCallback((text: string) => {
        if (!text || currentTermRefs.length === 0) return <>{text}</>;
        const pattern = new RegExp(`(${currentTermRefs.map((termRef) => escapeRegex(termRef.term)).join("|")})`, "gi");
        return text.split(pattern).map((part, index) => {
            const termRef = currentTermRefs.find((candidate) => candidate.term.toLowerCase() === part.toLowerCase());
            if (!termRef) return <span key={`${part}-${index}`}>{part}</span>;
            const glossaryEntry = glossaryEntries[termRef.slug];
            return (
                <span key={`${termRef.slug}-${index}`} className="group relative inline-flex">
                    <button type="button" onClick={() => { void ensureGlossaryEntry(termRef); }} className="cursor-help rounded px-1 py-0.5 text-amber-200 underline decoration-dotted underline-offset-4">
                        {part}
                    </button>
                    <span className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-72 rounded-xl border border-amber-500/20 bg-[#081018] px-3 py-3 text-xs leading-relaxed text-amber-50 shadow-2xl group-hover:block">
                        {glossaryEntry?.flavorText || "Click the term to load glossary text."}
                    </span>
                </span>
            );
        });
    }, [currentTermRefs, ensureGlossaryEntry, glossaryEntries]);

    const activePartyCharacters = activeRun ? activeRunParty : partyCharacters;
    const selectedPartyCharacter = activePartyCharacters.find((character) => character.id === selectedPartyCharacterId) || activePartyCharacters[0] || null;
    const seedStepIndex = QUEST_SEED_STEPS.indexOf(seedStep);
    const canGenerateQuest = !isGenerating
        && !!gmContext
        && hasCanonicalWorldPrompt
        && selectedPartyIds.length > 0
        && !!questSeed.premise.trim()
        && !!questSeed.objective.trim()
        && !!questSeed.stakes.trim();

    const openPartyModal = (characterId?: string | null) => {
        const nextCharacterId = characterId || activePartyCharacters[0]?.id || null;
        setSelectedPartyCharacterId(nextCharacterId);
        setIsPartyModalOpen(true);
    };

    const openRunLog = (tab: QuestLogTab = "HISTORY") => {
        setActiveRunLogTab(tab);
        setIsRunLogOpen(true);
    };

    const renderIllustration = (title: string, borderClass: string) => (
        <div className={`min-h-[260px] overflow-hidden rounded-3xl border ${borderClass} bg-black/20`}>
            {currentIllustrationAssetPath && currentIllustrationStatus === "ready" ? (
                <img src={currentIllustrationAssetPath} alt={title} className="h-full w-full object-cover" />
            ) : (
                <div className="flex h-full items-center justify-center px-6 text-center">
                    <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400">Quest Scene</div>
                        <div className="mt-3 text-sm text-gray-500">
                            {currentIllustrationStatus === "failed"
                                ? (currentIllustrationJob?.error || "Illustration generation failed.")
                                : "Generating a key-beat illustration..."}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    const renderEncounterBrief = (mode: "stage" | "modal") => {
        if (!activeRun || !currentNode || !hasPendingCombat) return null;

        const enemyCount = currentNode.pendingCombat?.enemyIds?.length || 0;
        const encounterLabel = currentNode.pendingCombat?.encounterLabel || "Encounter";
        const isModal = mode === "modal";

        return (
            <div className={`grid min-h-0 gap-5 ${isModal ? "lg:grid-cols-[1.05fr_0.95fr]" : "h-full lg:grid-cols-[1.1fr_0.9fr]"}`}>
                <div className="flex min-h-0 flex-col rounded-[28px] border border-red-500/20 bg-[linear-gradient(145deg,rgba(55,15,15,0.92),rgba(8,12,18,0.96))] p-6 shadow-2xl">
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-full border border-red-500/25 bg-red-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-red-200">
                            {encounterLabel}
                        </span>
                        <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-gray-300">
                            Node {activeRun.nodeCount}/{activeRun.maxNodeCount}
                        </span>
                    </div>
                    <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.3em] text-gray-500">Encounter Brief</div>
                    <div className="mt-3 text-3xl font-black text-white">{currentNode.title}</div>
                    <div className="mt-5 rounded-3xl border border-white/10 bg-black/25 p-5 text-sm leading-relaxed text-gray-200">
                        {renderGlossaryText(currentNode.text)}
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                            <div className="text-[10px] uppercase tracking-widest text-gray-500">Enemy Count</div>
                            <div className="mt-2 text-2xl font-black text-white">{enemyCount}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                            <div className="text-[10px] uppercase tracking-widest text-gray-500">Run Progress</div>
                            <div className="mt-2 text-2xl font-black text-white">{activeRun.nodeCount}/{activeRun.maxNodeCount}</div>
                        </div>
                    </div>
                    <div className="mt-auto pt-6">
                        <div className="flex flex-wrap gap-3">
                            <Button
                                onClick={() => {
                                    if (isModal) {
                                        setIsCombatBriefModalOpen(false);
                                        return;
                                    }
                                    setIsCombatEncounterActive(true);
                                }}
                                className="border border-orange-400 bg-gradient-to-b from-orange-300 to-orange-600 text-black hover:from-orange-200 hover:to-orange-500"
                            >
                                {isModal ? "Return to Combat" : "Begin Combat"}
                            </Button>
                            <Button onClick={() => openPartyModal()} className="border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20">
                                Party
                            </Button>
                            <Button onClick={() => openRunLog("HISTORY")} className="border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10">
                                Run Log
                            </Button>
                            {!isModal && (
                                <Button onClick={() => { void handleAbandonRun(); }} className="border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20">
                                    Abandon
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
                <div className="min-h-0 overflow-hidden rounded-[28px] border border-red-500/15 bg-[#091019] p-3 shadow-2xl">
                    {renderIllustration(currentNode.title, "border-red-500/20")}
                </div>
            </div>
        );
    };

    const renderSeedStep = () => {
        if (seedStep === "BRIEF") {
            return (
                <div className="h-full min-h-0 overflow-y-auto custom-scrollbar pr-2">
                    <div className="grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                        <div className="grid min-h-0 grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="md:col-span-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">AI Brief Generator</div>
                                        <div className="mt-2 text-sm text-gray-300">
                                            Generate a fresh premise, objective, and stakes from the current world, party, and selected anchors.
                                        </div>
                                    </div>
                                    <Button
                                        onClick={() => void handleGenerateQuestBrief()}
                                        disabled={!gmContext || !hasCanonicalWorldPrompt || isGeneratingBriefSeed}
                                        className="border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-30"
                                    >
                                        {isGeneratingBriefSeed ? "Generating..." : "Generate"}
                                    </Button>
                                </div>
                            </div>
                            <FieldCard label="Premise">
                                <textarea value={questSeed.premise} onChange={(event) => setQuestSeed((previous) => ({ ...previous, premise: event.target.value }))} rows={6} className="min-h-0 flex-1 resize-none rounded-2xl border border-white/5 bg-[#05080c] p-4 text-sm text-gray-200 focus:border-amber-500/40 focus:outline-none" placeholder="What tension or inciting problem defines this run?" />
                            </FieldCard>
                            <FieldCard label="Objective">
                                <textarea value={questSeed.objective} onChange={(event) => setQuestSeed((previous) => ({ ...previous, objective: event.target.value }))} rows={6} className="min-h-0 flex-1 resize-none rounded-2xl border border-white/5 bg-[#05080c] p-4 text-sm text-gray-200 focus:border-amber-500/40 focus:outline-none" placeholder="What is the party trying to achieve?" />
                            </FieldCard>
                            <FieldCard label="Stakes">
                                <textarea value={questSeed.stakes} onChange={(event) => setQuestSeed((previous) => ({ ...previous, stakes: event.target.value }))} rows={5} className="min-h-0 flex-1 resize-none rounded-2xl border border-white/5 bg-[#05080c] p-4 text-sm text-gray-200 focus:border-amber-500/40 focus:outline-none" placeholder="What changes if the party fails?" />
                            </FieldCard>
                            <FieldCard label="Custom Notes">
                                <textarea value={questSeed.notes || ""} onChange={(event) => setQuestSeed((previous) => ({ ...previous, notes: event.target.value }))} rows={5} className="min-h-0 flex-1 resize-none rounded-2xl border border-white/5 bg-[#05080c] p-4 text-sm text-gray-200 focus:border-amber-500/40 focus:outline-none" placeholder="Extra constraints, story motifs, or themes." />
                            </FieldCard>
                        </div>
                        <div className="grid gap-4">
                            <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
                                <div className="mb-4 text-[10px] font-bold uppercase tracking-widest text-amber-300">Tone and Pace</div>
                                <div className="grid grid-cols-2 gap-4">
                                    <FieldCard label="Tone"><input value={questSeed.tone} onChange={(event) => setQuestSeed((previous) => ({ ...previous, tone: event.target.value }))} className="rounded-xl border border-white/5 bg-[#05080c] p-3 text-sm text-gray-200 focus:border-amber-500/40 focus:outline-none" /></FieldCard>
                                    <FieldCard label="Difficulty"><select value={questSeed.difficulty} onChange={(event) => setQuestSeed((previous) => ({ ...previous, difficulty: event.target.value as QuestSeedConfig["difficulty"] }))} className="rounded-xl border border-white/5 bg-[#05080c] p-3 text-sm text-gray-200 focus:border-amber-500/40 focus:outline-none"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="deadly">Deadly</option></select></FieldCard>
                                    <FieldCard label="Run Length"><select value={questSeed.runLength} onChange={(event) => setQuestSeed((previous) => ({ ...previous, runLength: event.target.value as QuestSeedConfig["runLength"] }))} className="rounded-xl border border-white/5 bg-[#05080c] p-3 text-sm text-gray-200 focus:border-amber-500/40 focus:outline-none"><option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option></select></FieldCard>
                                    <FieldCard label="Openness"><select value={questSeed.openness} onChange={(event) => setQuestSeed((previous) => ({ ...previous, openness: event.target.value as QuestSeedConfig["openness"] }))} className="rounded-xl border border-white/5 bg-[#05080c] p-3 text-sm text-gray-200 focus:border-amber-500/40 focus:outline-none"><option value="guided">Guided</option><option value="balanced">Balanced</option><option value="open">Open</option></select></FieldCard>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-white/5 bg-black/20 p-4">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">Ending Spread</div>
                                <div className="mt-4 flex items-center gap-4">
                                    <div>
                                        <div className="text-3xl font-black text-white">{questSeed.targetEndingCount}</div>
                                        <div className="text-[10px] uppercase tracking-widest text-gray-500">Target endings</div>
                                    </div>
                                    <input type="range" min={3} max={6} value={questSeed.targetEndingCount} onChange={(event) => setQuestSeed((previous) => ({ ...previous, targetEndingCount: Math.max(3, Math.min(6, Number(event.target.value) || 3)) }))} className="w-full accent-amber-400" />
                                </div>
                            </div>
                            <div className="rounded-2xl border border-white/5 bg-[linear-gradient(135deg,rgba(245,158,11,0.08),rgba(8,12,18,0.85))] p-4">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Loaded World</div>
                                <div className="mt-2 text-xl font-black text-white">{gmContext?.worldName || selectedWorld?.name || "Unknown World"}</div>
                                <div className="mt-3 text-sm leading-relaxed text-gray-400">{gmContext?.worldPrompt || "No canonical world prompt written yet."}</div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        if (seedStep === "PARTY") {
            return (
                <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                    <div className="flex min-h-0 flex-col rounded-3xl border border-white/5 bg-black/20 p-4">
                        <div className="mb-4 flex items-center justify-between"><div><div className="text-[10px] font-bold uppercase tracking-widest text-amber-300">Party Roster</div><div className="mt-1 text-sm text-gray-500">Select 1 to 3 player characters.</div></div><div className="text-[10px] uppercase tracking-widest text-gray-500">{selectedPartyIds.length}/3</div></div>
                        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                            {availablePartyCharacters.map((character) => {
                                const selected = selectedPartyIds.includes(character.id);
                                const atLimit = selectedPartyIds.length >= 3 && !selected;
                                return (
                                    <label key={character.id} className={`block rounded-2xl border p-4 ${selected ? "border-amber-500/40 bg-amber-500/10" : "border-white/5 bg-[#05080c]"} ${atLimit ? "opacity-50" : ""}`}>
                                        <div className="flex items-start gap-3">
                                            <input type="checkbox" checked={selected} disabled={atLimit} onChange={() => setSelectedPartyIds((previous) => (selected ? previous.filter((id) => id !== character.id) : [...previous, character.id].slice(0, 3)))} />
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-sm font-bold text-white">{character.name}</div>
                                                <div className="mt-1 text-[10px] uppercase tracking-widest text-gray-500">{character.occupation?.name || character.type || "Wanderer"}</div>
                                                <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-widest text-gray-500"><span>STR {character.stats.strength}</span><span>AGI {character.stats.agility}</span><span>END {character.stats.endurance}</span></div>
                                            </div>
                                        </div>
                                    </label>
                                );
                            })}
                            {availablePartyCharacters.length === 0 && <div className="rounded-2xl border border-white/10 bg-[#05080c] p-5 text-sm text-gray-500">No Builder characters are available for this world.</div>}
                        </div>
                    </div>
                    <div className="grid gap-4">
                        <div className="rounded-3xl border border-white/5 bg-black/20 p-4">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">Selected Squad</div>
                            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                                {partyCharacters.map((character) => (
                                    <button key={character.id} type="button" onClick={() => openPartyModal(character.id)} className="rounded-2xl border border-white/10 bg-[#05080c] p-4 text-left transition-colors hover:border-cyan-500/30 hover:bg-cyan-500/10">
                                        <div className="text-sm font-bold text-white">{character.name}</div>
                                        <div className="mt-1 text-[10px] uppercase tracking-widest text-gray-500">{character.occupation?.name || character.type || "Wanderer"}</div>
                                        <div className="mt-4 text-xs font-mono text-cyan-200">HP {character.hp}/{character.maxHp}</div>
                                    </button>
                                ))}
                                {partyCharacters.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-5 text-sm text-gray-500 md:col-span-3">Pick at least one party member to continue.</div>}
                            </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-3xl border border-white/5 bg-black/20 p-4 text-sm leading-relaxed text-gray-500">Quest generation uses live character stats, traits, inventory, and relationships. Quest rewards and changes write back into Character Builder state.</div>
                            <div className="rounded-3xl border border-white/5 bg-black/20 p-4"><div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Quest Archive</div><div className="mt-2 text-3xl font-black text-white">{questArchive.length}</div><div className="text-[10px] uppercase tracking-widest text-gray-500">Saved runs for this world</div></div>
                        </div>
                    </div>
                </div>
            );
        }

        if (seedStep === "ANCHORS") {
            const renderAnchorList = (title: string, tone: string, items: Array<{ id: string; label: string; subtitle: string; summary?: string }>, selectedIds: string[], onToggle: (id: string, selected: boolean) => void) => (
                <div className="flex min-h-0 flex-col rounded-3xl border border-white/5 bg-black/20 p-4">
                    <div className="mb-4 flex items-center justify-between"><div className={`text-[10px] font-bold uppercase tracking-widest ${tone}`}>{title}</div><div className="text-[10px] uppercase tracking-widest text-gray-500">{selectedIds.length}</div></div>
                    <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                        {items.map((item) => {
                            const selected = selectedIds.includes(item.id);
                            return (
                                <label key={item.id} className={`block rounded-2xl border p-4 ${selected ? "border-white/20 bg-white/10" : "border-white/5 bg-[#05080c]"}`}>
                                    <div className="flex items-start gap-3">
                                        <input type="checkbox" checked={selected} onChange={() => onToggle(item.id, selected)} />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-bold text-white">{item.label}</div>
                                            <div className="mt-1 text-[10px] uppercase tracking-widest text-gray-500">{item.subtitle}</div>
                                            {item.summary && <div className="mt-2 text-xs leading-relaxed text-gray-500">{item.summary}</div>}
                                        </div>
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                </div>
            );

            return (
                <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-3">
                    {renderAnchorList("Faction Anchors", "text-cyan-300", factions.map((faction) => ({ id: faction.id, label: faction.name, subtitle: `${faction.type} • ${faction.status}` })), questSeed.factionAnchorIds, (id, selected) => setQuestSeed((previous) => ({ ...previous, factionAnchorIds: selected ? previous.factionAnchorIds.filter((entry) => entry !== id) : [...previous.factionAnchorIds, id] })))}
                    {renderAnchorList("Location Anchors", "text-emerald-300", locations.map((location) => ({ id: location.id, label: location.name, subtitle: `${location.type} • ${location.status}` })), questSeed.locationAnchorIds, (id, selected) => setQuestSeed((previous) => ({ ...previous, locationAnchorIds: selected ? previous.locationAnchorIds.filter((entry) => entry !== id) : [...previous.locationAnchorIds, id] })))}
                    {renderAnchorList("Ecology Anchors", "text-violet-300", ecologyOptions.map((option) => ({ id: option.id, label: option.label, subtitle: option.kind, summary: option.summary })), questSeed.ecologyAnchorIds, (id, selected) => setQuestSeed((previous) => ({ ...previous, ecologyAnchorIds: selected ? previous.ecologyAnchorIds.filter((entry) => entry !== id) : [...previous.ecologyAnchorIds, id] })))}
                </div>
            );
        }

        return (
            <div className="grid h-full min-h-0 grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <div className="grid gap-4">
                    <div className="rounded-3xl border border-white/5 bg-black/20 p-5"><div className="text-[10px] font-bold uppercase tracking-widest text-amber-300">World Context</div><div className="mt-2 text-2xl font-black text-white">{gmContext?.worldName || selectedWorld?.name || "Unknown World"}</div><div className="mt-4 text-sm leading-relaxed text-gray-400">{gmContext?.worldPrompt || "No canonical world prompt written yet. Quests are blocked until the Game Master prompt is written."}</div><div className="mt-3 text-xs text-gray-600">Visual seed prompt: {gmContext?.worldSeedPrompt || selectedWorld?.prompt || "No generation seed prompt available."}</div></div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-3xl border border-white/5 bg-black/20 p-4"><div className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">GM Sources</div><div className="mt-4 flex flex-wrap gap-2">{(gmContext?.sourceSummary?.enabledSources || []).map((source: string) => <span key={source} className="rounded-full border border-white/10 bg-[#05080c] px-3 py-1 text-[10px] uppercase tracking-widest text-gray-300">{source}</span>)}{(gmContext?.sourceSummary?.enabledSources || []).length === 0 && <span className="text-sm text-gray-500">No compiled GM sources are currently enabled.</span>}</div></div>
                        <div className="rounded-3xl border border-white/5 bg-black/20 p-4"><div className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Validation</div><div className="mt-4 space-y-3 text-sm"><div className={questSeed.premise.trim() && questSeed.objective.trim() && questSeed.stakes.trim() ? "text-emerald-200" : "text-red-300"}>Story brief {questSeed.premise.trim() && questSeed.objective.trim() && questSeed.stakes.trim() ? "ready" : "missing required fields"}</div><div className={selectedPartyIds.length > 0 ? "text-emerald-200" : "text-red-300"}>Party {selectedPartyIds.length > 0 ? `ready (${selectedPartyIds.length})` : "not selected"}</div><div className={hasCanonicalWorldPrompt ? "text-emerald-200" : "text-red-300"}>Canon prompt {hasCanonicalWorldPrompt ? "ready" : "required"}</div></div></div>
                    </div>
                </div>
                <div className="grid gap-4">
                    <div className="rounded-3xl border border-white/5 bg-black/20 p-4"><div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Selected Party</div><div className="mt-4 space-y-3">{partyCharacters.map((character) => <div key={character.id} className="rounded-2xl border border-white/10 bg-[#05080c] px-4 py-3"><div className="text-sm font-bold text-white">{character.name}</div><div className="mt-1 text-[10px] uppercase tracking-widest text-gray-500">Lvl {character.level} • HP {character.hp}/{character.maxHp}</div></div>)}{partyCharacters.length === 0 && <div className="text-sm text-gray-500">Select 1-3 characters to seed the quest.</div>}</div></div>
                    <div className="rounded-3xl border border-white/5 bg-black/20 p-4"><div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Anchor Summary</div><div className="mt-4 grid grid-cols-3 gap-3"><div className="rounded-2xl border border-white/10 bg-[#05080c] p-4 text-center"><div className="text-2xl font-black text-white">{selectedFactionAnchors.length}</div><div className="text-[10px] uppercase tracking-widest text-gray-500">Factions</div></div><div className="rounded-2xl border border-white/10 bg-[#05080c] p-4 text-center"><div className="text-2xl font-black text-white">{selectedLocationAnchors.length}</div><div className="text-[10px] uppercase tracking-widest text-gray-500">Locations</div></div><div className="rounded-2xl border border-white/10 bg-[#05080c] p-4 text-center"><div className="text-2xl font-black text-white">{selectedEcologyAnchors.length}</div><div className="text-[10px] uppercase tracking-widest text-gray-500">Ecology</div></div></div></div>
                </div>
            </div>
        );
    };

    const renderRunStage = () => {
        if (!activeRun) {
            return <Card className="flex h-full items-center justify-center rounded-[28px] border border-white/5 bg-[#121820] p-8 text-center"><div><div className="text-4xl">🧭</div><div className="mt-4 text-2xl font-black uppercase tracking-[0.2em] text-white">No Active Run</div><div className="mt-4 text-sm text-gray-500">Generate a new quest from the Seed tab, or resume an archived run.</div></div></Card>;
        }
        if (hasPendingCombat && currentNode) {
            if (!isCombatEncounterActive) {
                return renderEncounterBrief("stage");
            }

            return (
                <div className="h-full min-h-0 overflow-hidden rounded-[30px] border border-white/5 bg-[#091019] p-2 shadow-2xl">
                    <CombatEncounterView
                        key={`${activeRun.id}-${activeRun.nodeCount}`}
                        playerIds={activeRun.partyCharacterIds}
                        enemyIds={currentNode.pendingCombat?.enemyIds || []}
                        faunaEntries={ecologyBundle?.fauna || []}
                        config={{ gridRows: 12, gridCols: 12 }}
                        variant="quest"
                        utilityActions={[
                            { label: "Encounter Brief", onClick: () => setIsCombatBriefModalOpen(true), tone: "neutral" },
                            { label: "Party", onClick: () => openPartyModal(), tone: "primary" },
                            { label: "Run Log", onClick: () => openRunLog("HISTORY"), tone: "neutral" },
                            { label: "Abandon", onClick: () => { void handleAbandonRun(); }, tone: "danger" },
                        ]}
                        onCombatFinished={(summary) => { void handleAdvanceQuest(undefined, summary); }}
                    />
                </div>
            );
        }
        if (!currentNode) {
            return <Card className="flex h-full items-center justify-center rounded-[28px] border border-white/5 bg-[#121820] p-8 text-center"><div className="text-sm text-gray-500">This run no longer has an active node.</div></Card>;
        }
        const borderClass = currentNode.kind === "discussion" ? "border-cyan-500/15" : currentNode.kind === "ending" ? "border-emerald-500/20" : "border-amber-500/15";
        const badgeClass = currentNode.kind === "discussion" ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-200" : currentNode.kind === "ending" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200" : "border-amber-500/20 bg-amber-500/10 text-amber-200";
        return (
            <Card className={`flex h-full min-h-0 flex-col rounded-[30px] ${borderClass} bg-[#101720] shadow-2xl`}>
                <div className="border-b border-white/5 px-6 py-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-gray-300">
                                    Act {currentNode.act}
                                </span>
                                <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400">
                                    Node {activeRun.nodeCount}/{activeRun.maxNodeCount}
                                </span>
                                <span className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${badgeClass}`}>
                                    {currentNode.kind}
                                </span>
                            </div>
                            <div className="mt-4 text-3xl font-black leading-tight text-white">{currentNode.title}</div>
                        </div>
                    </div>
                </div>
                <div className="min-h-0 flex-1 overflow-hidden px-6 pb-5 pt-7">
                    <div className="grid h-full min-h-0 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                        <div className="grid min-h-0 gap-4 xl:grid-rows-[minmax(0,1fr)_auto]">
                            <div className="flex min-h-0 flex-col rounded-[28px] border border-white/5 bg-[linear-gradient(145deg,rgba(10,14,20,0.98),rgba(5,8,12,0.9))] p-5">
                                <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-2 text-[15px] leading-7 text-gray-100">
                                    {renderGlossaryText(currentNode.text)}
                                </div>
                                {currentNode.kind === "ending" && (
                                    <div className="mt-4 rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                                        <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-300">Ending Reached</div>
                                        <div className="mt-2 text-sm text-emerald-100">
                                            {activeRun.status === "failed" ? "The run has failed." : "The run has concluded."}
                                        </div>
                                        <div className="mt-3 text-sm text-gray-300">{activeRun.summary}</div>
                                    </div>
                                )}
                            </div>
                            <div className="rounded-[26px] border border-white/5 bg-black/25 p-4">
                                {currentNode.kind === "ending" ? (
                                    <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-100">
                                        {activeRun.summary}
                                    </div>
                                ) : (
                                    <div className="grid gap-3">
                                        <div className="flex flex-wrap gap-2">
                                            {(currentNode.choices || []).map((choice) => (
                                                <button
                                                    key={choice.id}
                                                    type="button"
                                                    onClick={() => void handleAdvanceQuest(choice.label)}
                                                    disabled={isAdvancing}
                                                    className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-xs font-bold tracking-wide text-orange-100 transition-colors hover:bg-orange-500/20 disabled:opacity-50"
                                                >
                                                    {choice.label}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_160px]">
                                            <textarea
                                                value={freeformAction}
                                                onChange={(event) => setFreeformAction(event.target.value)}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter" && !event.shiftKey && freeformAction.trim() && !isAdvancing) {
                                                        event.preventDefault();
                                                        void handleAdvanceQuest(undefined, undefined, freeformAction);
                                                    }
                                                }}
                                                rows={2}
                                                className="min-h-[68px] resize-none rounded-2xl border border-white/10 bg-black/50 p-3 text-sm text-gray-100 focus:border-orange-500/40 focus:outline-none"
                                                placeholder={currentNode.kind === "discussion" ? "Type what your party says or asks." : "Describe a custom action beyond the offered choices."}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => void handleAdvanceQuest(undefined, undefined, freeformAction)}
                                                disabled={isAdvancing || !freeformAction.trim()}
                                                className="rounded-2xl border border-orange-400 bg-gradient-to-b from-orange-400 to-orange-600 px-4 py-3 text-sm font-black uppercase tracking-widest text-black transition-all hover:from-orange-300 hover:to-orange-500 disabled:cursor-not-allowed disabled:opacity-30"
                                            >
                                                {isAdvancing ? "Resolving" : currentNode.kind === "discussion" ? "Send" : "Resolve"}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="grid min-h-0 gap-4 xl:grid-rows-[minmax(240px,1fr)_auto]">
                            {renderIllustration(currentNode.title, borderClass)}
                            <div className="rounded-[26px] border border-white/5 bg-black/20 p-4">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                    <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-500">Party</div>
                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" onClick={() => openPartyModal()} className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-cyan-200 transition-colors hover:bg-cyan-500/20">Party</button>
                                        <button type="button" onClick={() => openRunLog("HISTORY")} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-200 transition-colors hover:bg-white/10">Run Log</button>
                                        <button type="button" onClick={() => void handleAbandonRun()} className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-red-200 transition-colors hover:bg-red-500/20">Abandon</button>
                                    </div>
                                </div>
                                <div className="flex gap-3 overflow-x-auto pb-1 custom-scrollbar">
                                    {activeRunParty.map((character) => (
                                        <button key={character.id} type="button" onClick={() => openPartyModal(character.id)} className="min-w-[220px] rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-left transition-colors hover:border-cyan-500/30 hover:bg-cyan-500/10">
                                            <div className="flex items-center gap-3">
                                                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#05080c]">
                                                    {character.portraitUrl ? (
                                                        <img src={character.portraitUrl} alt={character.name} className="h-full w-full object-cover" />
                                                    ) : (
                                                        <div className="flex h-full w-full items-center justify-center text-sm font-black uppercase text-gray-500">
                                                            {(character.name || "?").slice(0, 2)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="truncate text-sm font-bold text-white">{character.name}</div>
                                                    <div className="mt-1 text-[10px] uppercase tracking-widest text-gray-500">{character.occupation?.name || character.type || "Wanderer"}</div>
                                                </div>
                                                <div className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-cyan-200">
                                                    HP {character.hp}/{character.maxHp}
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                    {activeRunParty.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-500">No resolved party members are available.</div>}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </Card>
        );
    };

    const renderRunLogContent = () => {
        if (!activeRun) return <div className="text-sm text-gray-500">No active run selected.</div>;
        if (activeRunLogTab === "CHAIN") {
            return activeChain ? (
                <div className="rounded-3xl border border-cyan-500/20 bg-cyan-500/10 p-5">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">Quest Chain</div>
                    <div className="mt-2 text-xl font-black text-white">{activeChain.title}</div>
                    <div className="mt-3 text-sm text-gray-200">{activeChain.premise}</div>
                    <div className="mt-4 text-[10px] uppercase tracking-widest text-gray-500">{activeChain.completedRunIds.length} completed runs • {activeChain.nextQuestHooks.length} live hooks</div>
                    <div className="mt-4 space-y-2">{(activeChain.nextQuestHooks || []).map((hook) => <div key={hook} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-cyan-50/90">{hook}</div>)}</div>
                </div>
            ) : <div className="text-sm text-gray-500">No active chain is loaded for this run.</div>;
        }
        if (activeRunLogTab === "GLOSSARY") {
            return currentTermRefs.length > 0 ? (
                <div className="space-y-3">{currentTermRefs.map((termRef) => { const entry = glossaryEntries[termRef.slug]; return <button key={termRef.slug} type="button" onClick={() => { void ensureGlossaryEntry(termRef); }} className="block w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-left"><div className="text-xs font-bold uppercase tracking-widest text-white">{termRef.term}</div><div className="mt-3 text-sm leading-relaxed text-gray-400">{entry?.flavorText || "Click to load glossary text."}</div></button>; })}</div>
            ) : <div className="text-sm text-gray-500">No glossary terms are active on this node.</div>;
        }
        if (activeRunLogTab === "ARC") {
            return (
                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="rounded-3xl border border-white/10 bg-black/20 p-5"><div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Arc Pressure</div><div className="mt-4 space-y-3">{(activeRun.arc.recurringTensions || []).length > 0 ? activeRun.arc.recurringTensions.map((tension) => <div key={tension} className="rounded-2xl border border-white/10 bg-[#05080c] px-4 py-3 text-sm text-gray-300">{tension}</div>) : <div className="text-sm text-gray-500">No recurring tensions recorded.</div>}</div></div>
                    <div className="rounded-3xl border border-white/10 bg-black/20 p-5"><div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Ending Tracks</div><div className="mt-4 space-y-3">{(activeRun.arc.endingTracks || []).map((ending) => <div key={ending.id} className="rounded-2xl border border-white/10 bg-[#05080c] px-4 py-3"><div className="text-sm font-bold text-white">{ending.title}</div><div className="mt-2 text-sm text-gray-400">{ending.description}</div></div>)}</div></div>
                </div>
            );
        }
        return <div className="space-y-3">{(activeRun.log || []).slice().reverse().map((entry) => <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-widest text-gray-500">{entry.kind}</div><div className="mt-1 text-sm font-bold text-white">{entry.title}</div><div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-400">{entry.text}</div>{(entry.effects || []).length > 0 && <div className="mt-3 flex flex-wrap gap-2">{entry.effects?.map((effect) => <span key={effect} className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] uppercase tracking-widest text-amber-200">{effect}</span>)}</div>}</div>)}</div>;
    };

    if (!activeWorldId || !selectedWorld) {
        return (
            <div className="h-screen overflow-hidden bg-[#070b12] p-8 text-gray-300 font-sans flex flex-col">
                <div className="flex-1 flex items-center justify-center rounded-2xl border border-white/10 bg-[#121820]"><div className="max-w-md text-center"><h2 className="mb-3 text-lg font-bold uppercase tracking-widest text-gray-100">No World Selected</h2><p className="mb-5 text-sm text-gray-500">Pick a world to generate and play persisted quest runs.</p><button type="button" onClick={() => setShowGalleryModal(true)} className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-xs font-bold tracking-[0.2em] text-amber-300 transition-all hover:bg-amber-500/20">PICK WORLD</button></div></div>
                <Modal open={showGalleryModal} onClose={() => setShowGalleryModal(false)} title="QUESTS - PICK A WORLD">
                    <div className="relative flex h-[75vh] w-[80vw] max-w-[1200px] flex-col overflow-hidden rounded-b-xl bg-black ring-1 ring-white/10 shadow-2xl">
                        <HistoryGallery history={history} activePlanetId={activeWorldId} deleteFromHistory={deleteFromHistory} onRenameWorld={renameInHistory} onSelectPlanet={(item) => { setActiveWorldId(item.id); setShowGalleryModal(false); }} onSelectTexture={() => { }} showExtendedTabs={false} />
                    </div>
                </Modal>
            </div>
        );
    }

    return (
        <div className="h-screen overflow-hidden bg-[#070b12] text-gray-300 font-sans flex flex-col">
            <div className="flex-1 overflow-hidden px-6 pb-6 pt-20">
                <div className={`mx-auto flex h-full w-full flex-col gap-4 overflow-hidden ${activeTab === "run" ? "max-w-[1600px]" : "max-w-7xl"}`}>
                    {questJob && (questJob.status === "queued" || questJob.status === "running") && <div className="shrink-0 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-100">{toLegacyQuestKind(questJob) === "generate-run" ? "Quest generation" : "Quest advance"} • {questJob.currentStage} • {Math.round(questJob.progress)}%</div>}
                    {notices.length > 0 && <div className="shrink-0 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">{notices.map((notice) => <div key={notice}>{notice}</div>)}</div>}
                    {!hasCanonicalWorldPrompt && <div className="shrink-0 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-4"><div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-red-300">Canonical World Prompt Required</div><div className="text-sm text-red-100">Quests use the Game Master narrative world prompt, not the graphical world-generation seed prompt. Write it manually or generate it from canon on the Game Master page before generating quests.</div><div className="mt-3"><Link to={buildGameMasterRoute({ tab: "directives" })} className="text-[10px] font-bold uppercase tracking-widest text-red-200 hover:text-white">Open Game Master Directives</Link></div></div>}

                    {activeTab === "seed" && (
                        <Card className="flex min-h-0 flex-1 flex-col rounded-[30px] border border-white/5 bg-[#121820]">
                            <div className="border-b border-white/5 px-6 py-5"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-bold uppercase tracking-widest text-amber-300">Quest Seed</div><h2 className="mt-2 text-2xl font-black text-white">Generate a New Run</h2><p className="mt-3 text-sm leading-relaxed text-gray-500">World-scoped, party-based, multi-ending quests that draw from lore, history, ecology, and live character state.</p></div><div className="text-right text-[10px] uppercase tracking-widest text-gray-500">{isLoadingWorldData ? "Loading world data" : `${questArchive.length} saved runs`}</div></div></div>
                            <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">{renderSeedStep()}</div>
                            <div className="flex items-center justify-between gap-4 border-t border-white/5 px-6 py-4"><div className="text-xs text-gray-500">{activeRun ? "An active run already exists. Generating a new run will create another archive entry." : "No active run loaded."}</div><div className="flex items-center gap-3"><Button onClick={() => setSeedStep(QUEST_SEED_STEPS[Math.max(0, seedStepIndex - 1)])} disabled={seedStepIndex === 0} className="border border-white/10 bg-white/5 text-gray-200 hover:bg-white/10 disabled:opacity-30">Back</Button>{seedStep !== "REVIEW" ? <Button onClick={() => setSeedStep(QUEST_SEED_STEPS[Math.min(QUEST_SEED_STEPS.length - 1, seedStepIndex + 1)])} className="border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20">Next</Button> : <Button onClick={handleGenerateQuest} disabled={!canGenerateQuest} className="border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 disabled:opacity-30">{isGenerating ? "Generating..." : "Generate Quest"}</Button>}</div></div>
                        </Card>
                    )}

                    {activeTab === "run" && (
                        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
                            <div className="min-h-0 flex-1 overflow-hidden">{renderRunStage()}</div>
                        </div>
                    )}

                    {activeTab === "archive" && (
                        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden xl:grid-cols-[340px_minmax(0,1fr)]">
                            <Card className="flex min-h-0 flex-col rounded-[28px] border border-white/5 bg-[#121820] p-4"><div className="mb-4 flex items-center justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Quest Archive</div><div className="mt-1 text-lg font-black text-white">{questArchive.length} runs</div></div>{activeRun && <Button onClick={() => { setSelectedArchiveRun(activeRun); setActiveTab("run"); setSearchParams({ tab: "run" }); }} className="border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20">Return</Button>}</div><div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-3">{questArchive.map((summary) => <button key={summary.id} onClick={async () => { const detail = await loadRunDetail(summary.worldId, summary.id).catch(() => null); if (detail) setSelectedArchiveRun(detail); }} className={`block w-full rounded-2xl border px-4 py-4 text-left transition-colors ${selectedArchiveRun?.id === summary.id ? "border-amber-500/30 bg-amber-500/10" : "border-white/5 bg-black/20 hover:border-white/15"}`}><div className="flex items-center justify-between gap-3"><div className="text-sm font-bold text-white">{summary.title}</div><span className="text-[10px] uppercase tracking-widest text-gray-500">{summary.status}</span></div><div className="mt-2 text-xs text-gray-500">{summary.summary}</div><div className="mt-3 text-[10px] uppercase tracking-widest text-gray-600">Nodes {summary.nodeCount} {summary.endingReached ? `• ${summary.endingReached}` : ""}</div></button>)}{questArchive.length === 0 && <div className="text-sm text-gray-500">No quest runs have been saved for this world.</div>}</div></Card>
                            <Card className="flex min-h-0 flex-col rounded-[28px] border border-white/5 bg-[#121820] p-5">{!selectedArchiveRun ? <div className="flex h-full items-center justify-center text-sm text-gray-500">Select a run from the archive to inspect it.</div> : <><div className="mb-5 flex items-start justify-between gap-4"><div><div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Run Detail</div><h2 className="mt-2 text-2xl font-black text-white">{selectedArchiveRun.title}</h2><p className="mt-3 text-sm text-gray-500">{selectedArchiveRun.summary}</p></div><div className="flex gap-3">{selectedArchiveRun.status === "active" && <Button onClick={() => { setActiveRun(selectedArchiveRun); setActiveTab("run"); setSearchParams({ tab: "run" }); }} className="border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20">Resume</Button>}<Button onClick={() => void handleDeleteRun(selectedArchiveRun)} className="border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20">Delete</Button></div></div><div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4"><div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-widest text-gray-500">Status</div><div className="mt-2 text-lg font-black text-white">{selectedArchiveRun.status}</div></div><div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-widest text-gray-500">Nodes</div><div className="mt-2 text-lg font-black text-white">{selectedArchiveRun.nodeCount}</div></div><div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-widest text-gray-500">Ending</div><div className="mt-2 text-sm font-black text-white">{selectedArchiveRun.endingReached || "Unresolved"}</div></div><div className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-widest text-gray-500">Party Size</div><div className="mt-2 text-lg font-black text-white">{selectedArchiveRun.partyCharacterIds.length}</div></div></div><div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-3">{(selectedArchiveRun.log || []).map((entry) => <div key={entry.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="text-[10px] uppercase tracking-widest text-gray-500">{entry.kind}</div><div className="mt-1 text-sm font-bold text-white">{entry.title}</div><div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-400">{entry.text}</div></div>)}</div></>}</Card>
                        </div>
                    )}
                </div>
            </div>

            <Modal
                open={isPartyModalOpen}
                onClose={() => setIsPartyModalOpen(false)}
                title="QUESTS - PARTY"
                maxWidth="max-w-[1180px]"
                headerContent={selectedPartyCharacter ? (
                    <div className="flex items-center justify-end">
                        <select
                            value={selectedPartyCharacter.id}
                            onChange={(event) => setSelectedPartyCharacterId(event.target.value)}
                            className="min-w-[320px] rounded-2xl border border-white/10 bg-[#05080c] px-4 py-2 text-sm font-bold text-white outline-none transition-colors focus:border-cyan-500/40"
                        >
                            {activePartyCharacters.map((character) => (
                                <option key={character.id} value={character.id}>
                                    {character.name} • {character.occupation?.name || character.type || "Wanderer"}
                                </option>
                            ))}
                        </select>
                    </div>
                ) : null}
            >
                <div className="h-full bg-[#05080c] p-5">
                    {!selectedPartyCharacter ? (
                        <div className="text-sm text-gray-500">No party member selected.</div>
                    ) : (
                        <div className="flex h-full min-h-0 flex-col">
                            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar pr-1">
                                <CharacterSheetPanel
                                    character={selectedPartyCharacter}
                                    currentLocationLabel={currentNode?.title || activeRun?.title || "No Current Location"}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </Modal>

            <Modal open={isRunLogOpen} onClose={() => setIsRunLogOpen(false)} title="QUESTS - RUN LOG" maxWidth="max-w-6xl">
                <div className="flex h-full min-h-0 flex-col bg-[#05080c]"><div className="border-b border-white/10 p-4"><TabBar tabs={QUEST_LOG_TABS} activeTab={activeRunLogTab} onTabChange={(tab) => setActiveRunLogTab(tab as QuestLogTab)} /></div><div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar p-5">{renderRunLogContent()}</div></div>
            </Modal>

            <Modal open={isCombatBriefModalOpen} onClose={() => setIsCombatBriefModalOpen(false)} title="QUESTS - ENCOUNTER BRIEF" maxWidth="max-w-6xl">
                <div className="h-[80vh] min-h-0 bg-[#05080c] p-5">
                    {renderEncounterBrief("modal")}
                </div>
            </Modal>

            <Modal open={showGalleryModal} onClose={() => setShowGalleryModal(false)} title="QUESTS - PICK A WORLD">
                <div className="relative flex h-[75vh] w-[80vw] max-w-[1200px] flex-col overflow-hidden rounded-b-xl bg-black ring-1 ring-white/10 shadow-2xl">
                    <HistoryGallery history={history} activePlanetId={activeWorldId} deleteFromHistory={deleteFromHistory} onRenameWorld={renameInHistory} onSelectPlanet={(item) => { setActiveWorldId(item.id); setShowGalleryModal(false); }} onSelectTexture={() => { }} showExtendedTabs={false} />
                </div>
            </Modal>
        </div>
    );
}
