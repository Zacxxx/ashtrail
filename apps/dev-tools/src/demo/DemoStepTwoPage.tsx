import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Headphones, LoaderCircle, Pause, Play } from "lucide-react";
import { Button, ScreenShell } from "@ashtrail/ui";
import { GameRegistry, type Character, type Item } from "@ashtrail/core";
import { CharacterSheetPanel } from "../components/CharacterSheetPanel";
import { useHomepageAudio } from "./useHomepageAudio";
import { useTrackedJobLauncher } from "../jobs/useTrackedJobLauncher";
import { useJobs } from "../jobs/useJobs";
import { useGenerationHistory } from "../hooks/useGenerationHistory";
import { useActiveWorld } from "../hooks/useActiveWorld";
import { DEMO_STEP_THREE_ROUTE, DEMO_STEP_TWO_ROUTE } from "../lib/routes";
import {
    buildDemoHeroIdentity,
    buildDemoHeroCharacter,
    buildDemoHeroGenerationRequest,
    buildDemoHeroPortraitPrompt,
    buildDemoHeroStoryRequest,
    pickRandomDemoHeroVariant,
    parseGeneratedCharacterDrafts,
    type BuilderGeneratedCharacterDraft,
    type DemoHeroIdentity,
    type DemoHeroWorldContext,
} from "../character-builder/aiGeneration";
import { isDemoStepOneResult, isDemoStepOneSelectionResult } from "../media/generatedMediaAudio";
import { DEMO_STEP_TWO_INTRO_LINES } from "./demoStepTwo";
import { useDemoFlow } from "./DemoFlowContext";

type DemoStepTwoPhase =
    | "intro"
    | "resolvingContext"
    | "generatingCharacter"
    | "generatingLore"
    | "generatingPortrait"
    | "ready"
    | "error";

type DemoStepTwoGeneratedState = {
    draft: BuilderGeneratedCharacterDraft;
    loreText: string;
    portraitUrl?: string;
    worldContext: DemoHeroWorldContext;
    character: Character;
    weaponArtifact?: DemoStepTwoGeneratedWeaponArtifact | null;
    voiceAsset?: {
        url: string;
        mimeType?: string;
    } | null;
    loreIllustrations: DemoStepTwoLoreIllustrationAsset[];
    loreInsights: DemoStepTwoLoreInsightArtifact[];
};

type DemoStepTwoGeneratedWeaponArtifact = {
    weapon: {
        id: string;
        name: string;
        description: string;
        rarity: string;
        weaponType: string;
        weaponRange: number;
        baseDamage: number;
    };
    loreText: string;
    image: {
        url: string;
        mimeType?: string;
    };
};

type PersistedDemoStepTwoArtifact = {
    heroVariant: string;
    heroName: string;
    worldId?: string | null;
    draft: BuilderGeneratedCharacterDraft;
    loreText: string;
    portraitUrl?: string | null;
    worldContext: DemoHeroWorldContext;
    weaponArtifact?: DemoStepTwoGeneratedWeaponArtifact | null;
    voiceAsset?: {
        url: string;
        mimeType?: string;
    } | null;
    loreIllustrations?: DemoStepTwoLoreIllustrationAsset[];
    loreInsights?: DemoStepTwoLoreInsightArtifact[];
};

type DemoStepTwoLoreIllustrationAsset = {
    paragraphIndex: number;
    image: {
        url: string;
        mimeType?: string;
    };
};

type DemoStepTwoLoreInsightArtifact = {
    term: string;
    title: string;
    explanation: string;
    image: {
        url: string;
        mimeType?: string;
    };
};

const LORE_TERM_STOP_WORDS = new Set([
    "The",
    "A",
    "An",
    "And",
    "But",
    "When",
    "Where",
    "While",
    "They",
    "Their",
    "There",
    "This",
    "That",
    "These",
    "Those",
    "You",
    "Your",
    "Ashtrail",
]);

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeLoreInsightTerm(value: string) {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function dedupeLoreInsights(insights: DemoStepTwoLoreInsightArtifact[]) {
    const seen = new Set<string>();
    return insights.filter((insight) => {
        const key = normalizeLoreInsightTerm(insight.term);
        if (!key || seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

function collectInteractiveLoreTerms(
    loreText: string,
    worldTitle: string,
    heroName: string,
    selectedDirectionTitle?: string | null,
) {
    const candidates: string[] = [];
    const blockedTerms = new Set<string>();
    const heroNameNormalized = heroName.trim().replace(/\s+/g, " ");
    if (heroNameNormalized) {
        blockedTerms.add(normalizeLoreInsightTerm(heroNameNormalized));
        heroNameNormalized.split(" ").forEach((part) => {
            if (part.trim().length >= 3) {
                blockedTerms.add(normalizeLoreInsightTerm(part));
            }
        });
    }
    const push = (term: string | null | undefined) => {
        const normalized = term?.trim().replace(/\s+/g, " ");
        if (!normalized) {
            return;
        }
        if (blockedTerms.has(normalizeLoreInsightTerm(normalized))) {
            return;
        }
        candidates.push(normalized);
    };

    push(worldTitle);
    push(selectedDirectionTitle);

    const phrasePattern = /\b[A-Z][a-z]{3,}(?:\s+[A-Z][a-z]{3,}){0,2}\b/g;
    for (const match of loreText.matchAll(phrasePattern)) {
        const term = match[0].trim();
        if (LORE_TERM_STOP_WORDS.has(term)) {
            continue;
        }
        if (term.split(" ").length === 1 && term.length < 6) {
            continue;
        }
        if (blockedTerms.has(normalizeLoreInsightTerm(term))) {
            continue;
        }
        push(term);
    }

    const seen = new Set<string>();
    return candidates.filter((term) => {
        const key = normalizeLoreInsightTerm(term);
        if (!key || seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    }).slice(0, 8);
}

function renderInteractiveLoreParagraph(
    paragraph: string,
    interactiveTerms: string[],
    activeInsightKey: string | null,
    activeInsightTerm: string | null,
    activeInsight: DemoStepTwoLoreInsightArtifact | null,
    isGeneratingInsight: boolean,
    insightError: string | null,
    onActivate: (term: string, key: string) => void,
    onDeactivate: () => void,
) {
    if (!paragraph.trim() || interactiveTerms.length === 0) {
        return paragraph;
    }

    const matcher = new RegExp(
        `(${interactiveTerms
            .slice()
            .sort((left, right) => right.length - left.length)
            .map(escapeRegExp)
            .join("|")})`,
        "g",
    );
    const parts = paragraph.split(matcher);
    if (parts.length === 1) {
        return paragraph;
    }

    return parts.map((part, index) => {
        const matchedTerm = interactiveTerms.find(
            (term) => normalizeLoreInsightTerm(term) === normalizeLoreInsightTerm(part),
        );
        if (!matchedTerm) {
            return <span key={`text-${index}`}>{part}</span>;
        }
        const termKey = `term-${normalizeLoreInsightTerm(matchedTerm)}-${index}`;
        const isCurrentTerm = activeInsightTerm !== null
            && normalizeLoreInsightTerm(activeInsightTerm) === normalizeLoreInsightTerm(matchedTerm);
        const isActive = activeInsightKey === termKey && isCurrentTerm;
        return (
            <span
                key={termKey}
                className="relative inline-block"
                onMouseLeave={onDeactivate}
            >
                <button
                    type="button"
                    onMouseEnter={() => onActivate(matchedTerm, termKey)}
                    onFocus={() => onActivate(matchedTerm, termKey)}
                    onClick={() => onActivate(matchedTerm, termKey)}
                    onBlur={onDeactivate}
                    className={`rounded-sm border-b border-dashed px-0.5 text-left transition-colors ${
                        isActive
                            ? "border-cyan-200/80 text-cyan-100"
                            : "border-[#f1c765]/45 text-[#f4d98f] hover:border-cyan-200/60 hover:text-cyan-100"
                    }`}
                >
                    {part}
                </button>

                {isActive && (
                    <span className="absolute left-1/2 top-full z-[200] mt-3 block w-[min(20rem,80vw)] -translate-x-1/2">
                        <span className="block rounded-[20px] border border-cyan-200/12 bg-[#071018]/95 p-3 shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur-md">
                            {activeInsight ? (
                                <span className="grid gap-3 sm:grid-cols-[88px_minmax(0,1fr)]">
                                    <span className="overflow-hidden rounded-[16px] border border-cyan-200/10 bg-black/30">
                                        <img
                                            src={activeInsight.image.url}
                                            alt={activeInsight.title}
                                            className="aspect-square h-full w-full object-cover"
                                        />
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-[10px] font-black uppercase tracking-[0.24em] text-cyan-100">
                                            {activeInsight.title}
                                        </span>
                                        <span className="mt-2 block text-xs leading-5 text-slate-200">
                                            {activeInsight.explanation}
                                        </span>
                                    </span>
                                </span>
                            ) : (
                                <span className="block space-y-2">
                                    <span className="block text-[10px] font-black uppercase tracking-[0.28em] text-cyan-100/90">
                                        {insightError ? matchedTerm : `Interpreting ${matchedTerm}`}
                                    </span>
                                    {insightError ? (
                                        <span className="block text-xs leading-5 text-red-200">
                                            {insightError}
                                        </span>
                                    ) : (
                                        <span className="block">
                                            <span className="relative block h-1.5 overflow-hidden rounded-full bg-white/10">
                                                <span className="absolute inset-0 rounded-full bg-cyan-200/10" />
                                                <span
                                                    className="absolute left-0 top-0 h-full w-14 rounded-full bg-gradient-to-r from-transparent via-white to-cyan-200 shadow-[0_0_18px_rgba(165,243,252,0.55)]"
                                                    style={{ animation: "demo-step-ping-bar 1.15s ease-in-out infinite alternate" }}
                                                />
                                            </span>
                                            <span className="mt-2 block text-xs leading-5 text-slate-300">
                                                {isGeneratingInsight ? "Generating contextual note and visual reference." : "Loading contextual note."}
                                            </span>
                                        </span>
                                    )}
                                </span>
                            )}
                        </span>
                    </span>
                )}
            </span>
        );
    });
}

type HistoryCharacterRecord = {
    id: string;
    name: string;
    role: "Leader" | "Civilian" | "Scavenger" | "Soldier" | "Scholar" | "Merchant" | "Other";
    status: "Alive" | "Deceased" | "Missing" | "Imprisoned";
    location: string;
    affiliation: string;
    lore: string;
    relationships: string;
};

async function postJson(path: string, payload: unknown) {
    const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Request failed: ${response.status}`);
    }
    return response;
}

async function loadPersistedStepTwoArtifact(stepOneJobId: string | null, heroVariant: string) {
    const params = new URLSearchParams();
    if (stepOneJobId) {
        params.set("stepOneJobId", stepOneJobId);
    }
    params.set("hero", heroVariant);
    const response = await fetch(`/api/demo/step-2/artifact?${params.toString()}`);
    if (response.status === 404) {
        return null;
    }
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Failed to load persisted demo step 2 artifact: ${response.status}`);
    }
    return await response.json() as PersistedDemoStepTwoArtifact;
}

async function persistStepTwoArtifact(stepOneJobId: string | null, artifact: PersistedDemoStepTwoArtifact) {
    await postJson("/api/demo/step-2/artifact", {
        stepOneJobId,
        ...artifact,
    });
}

async function resolveCombatReadyCharacter(character: Character) {
    const response = await postJson("/api/progression/resolve-character", character);
    return await response.json() as Character;
}

async function findPersistedCharacter(characterId: string) {
    const response = await fetch("/api/data/characters");
    if (!response.ok) {
        return null;
    }
    const list = await response.json() as Character[];
    return Array.isArray(list)
        ? list.find((entry) => entry.id === characterId) ?? null
        : null;
}

function normalizeWeaponRarity(value: string): Item["rarity"] {
    switch (value.trim().toLowerCase()) {
        case "salvaged":
        case "reinforced":
        case "pre-ash":
        case "specialized":
        case "relic":
        case "ashmarked":
            return value.trim().toLowerCase() as Item["rarity"];
        default:
            return "specialized";
    }
}

function buildWeaponItem(artifact: DemoStepTwoGeneratedWeaponArtifact): Item {
    const combatDamage = Math.max(18, artifact.weapon.baseDamage);
    return {
        id: artifact.weapon.id,
        name: artifact.weapon.name,
        category: "weapon",
        rarity: normalizeWeaponRarity(artifact.weapon.rarity),
        description: artifact.weapon.description,
        cost: Math.max(240, combatDamage * 18),
        equipSlot: "mainHand",
        weaponType: artifact.weapon.weaponType === "ranged" ? "ranged" : "melee",
        weaponRange: Math.max(1, artifact.weapon.weaponRange),
        weaponAreaType: "single",
        weaponAreaSize: 0,
        icon: artifact.image.url,
        effects: [
            {
                id: `${artifact.weapon.id}-damage`,
                name: "Weapon Damage",
                description: artifact.weapon.description,
                type: "COMBAT_BONUS",
                target: "damage",
                value: combatDamage,
                trigger: "passive",
                scope: "combat",
            },
        ],
    };
}

function applyGeneratedWeapon(character: Character, artifact: DemoStepTwoGeneratedWeaponArtifact): Character {
    const weaponItem = buildWeaponItem(artifact);
    return {
        ...character,
        inventory: [weaponItem, ...character.inventory.filter((item) => item.id !== weaponItem.id)],
        equipped: {
            ...(character.equipped || {}),
            mainHand: weaponItem,
        },
    };
}

function buildHistoryCharacter(character: Character, worldTitle: string): HistoryCharacterRecord {
    return {
        id: character.id,
        name: character.name,
        role: "Leader",
        status: "Alive",
        location: worldTitle,
        affiliation: character.faction || "Ashtrail Vanguard",
        lore: character.history || character.backstory || "",
        relationships: "Central Ashtrail demo protagonist.",
    };
}

async function persistDemoStepTwoCharacter(character: Character, worldId: string | null, worldTitle: string) {
    await postJson("/api/data/characters", character);
    const persistedCharacter = await findPersistedCharacter(character.id) ?? character;

    if (worldId) {
        const existingResponse = await fetch(`/api/planet/characters/${encodeURIComponent(worldId)}`);
        const existing = existingResponse.ok ? await existingResponse.json() as HistoryCharacterRecord[] : [];
        const next = Array.isArray(existing) ? [...existing] : [];
        const record = buildHistoryCharacter(persistedCharacter, worldTitle);
        const index = next.findIndex((entry) => entry.id === record.id);
        if (index >= 0) {
            next[index] = record;
        } else {
            next.unshift(record);
        }
        await postJson(`/api/planet/characters/${encodeURIComponent(worldId)}`, next);
    }

    await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
    return persistedCharacter;
}

async function resolveStepOneContext(
    waitForJob: ReturnType<typeof useJobs>["waitForJob"],
    stepOneJobId: string | null,
    selectionJobId: string | null,
    fallbackWorldTitle: string | null,
): Promise<DemoHeroWorldContext> {
    let worldTitle = fallbackWorldTitle?.trim() || "Ashtrail Frontier";
    const paragraphs: string[] = [];
    let selectedDirectionTitle: string | null = null;

    if (stepOneJobId) {
        try {
            const detail = await waitForJob(stepOneJobId);
            if (isDemoStepOneResult(detail.result)) {
                worldTitle = detail.result.artifact.metadata.title || worldTitle;
                if (detail.result.artifact.loreText.trim()) {
                    paragraphs.push(detail.result.artifact.loreText.trim());
                }
            }
        } catch {
            // Fall back to query-provided title if the job is no longer available.
        }
    }

    if (selectionJobId) {
        try {
            const detail = await waitForJob(selectionJobId);
            if (isDemoStepOneSelectionResult(detail.result)) {
                selectedDirectionTitle = detail.result.artifact.selectedOptionTitle;
                paragraphs.push(
                    ...detail.result.artifact.additionalLoreParagraphs
                        .map((paragraph) => paragraph.trim())
                        .filter(Boolean),
                );
            }
        } catch {
            // Keep the step functional even if the selection job cannot be reloaded.
        }
    }

    const worldLore = paragraphs.join("\n\n").trim();
    return {
        worldTitle,
        worldLore: worldLore || `The world of ${worldTitle} has just been authored for the Ashtrail demo and needs a hero who fits its canon, tensions, and atmosphere.`,
        selectedDirectionTitle,
    };
}

export function DemoStepTwoPage() {
    useHomepageAudio(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const { setPlanetAsset, setPlanetView } = useDemoFlow();
    const launchTrackedJob = useTrackedJobLauncher();
    const { waitForJob, jobs } = useJobs();
    const { history } = useGenerationHistory();
    const { activeWorldId, setActiveWorldId } = useActiveWorld();
    const [phase, setPhase] = useState<DemoStepTwoPhase>("intro");
    const [currentJobId, setCurrentJobId] = useState<string | null>(null);
    const [result, setResult] = useState<DemoStepTwoGeneratedState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [attemptKey, setAttemptKey] = useState(0);
    const [persistError, setPersistError] = useState<string | null>(null);
    const [weaponError, setWeaponError] = useState<string | null>(null);
    const [isGeneratingWeapon, setIsGeneratingWeapon] = useState(false);
    const [voiceError, setVoiceError] = useState<string | null>(null);
    const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
    const [isVoicePlaying, setIsVoicePlaying] = useState(false);
    const [illustrationError, setIllustrationError] = useState<string | null>(null);
    const [isGeneratingIllustrations, setIsGeneratingIllustrations] = useState(false);
    const [insightError, setInsightError] = useState<string | null>(null);
    const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
    const [activeInsightKey, setActiveInsightKey] = useState<string | null>(null);
    const [activeInsightTerm, setActiveInsightTerm] = useState<string | null>(null);
    const [activeInsight, setActiveInsight] = useState<DemoStepTwoLoreInsightArtifact | null>(null);
    const [typedLoreLength, setTypedLoreLength] = useState(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const stepOneJobId = searchParams.get("stepOneJobId");
    const selectionJobId = searchParams.get("selectionJobId");
    const planetTexture = searchParams.get("planetTexture");
    const planetTitle = searchParams.get("planetTitle");
    const heroVariantParam = searchParams.get("hero");
    const resolvedWorldId = activeWorldId ?? history[0]?.id ?? null;
    const activeJob = currentJobId ? jobs.find((job) => job.jobId === currentJobId) : null;
    const [heroIdentity, setHeroIdentity] = useState<DemoHeroIdentity>(() =>
        buildDemoHeroIdentity(heroVariantParam || pickRandomDemoHeroVariant()),
    );

    useEffect(() => {
        const node = audioRef.current;
        if (!node) {
            return;
        }

        const handleEnded = () => setIsVoicePlaying(false);
        const handlePause = () => setIsVoicePlaying(false);
        node.addEventListener("ended", handleEnded);
        node.addEventListener("pause", handlePause);
        return () => {
            node.removeEventListener("ended", handleEnded);
            node.removeEventListener("pause", handlePause);
            node.pause();
        };
    }, []);

    useEffect(() => {
        if (!result?.voiceAsset?.url && audioRef.current) {
            audioRef.current.pause();
            setIsVoicePlaying(false);
        }
    }, [result?.voiceAsset?.url]);

    const clearActiveInsight = () => {
        setActiveInsightKey(null);
    };

    useEffect(() => {
        setTypedLoreLength(0);
        setActiveInsight(null);
        setActiveInsightTerm(null);
    }, [result?.loreText]);

    useEffect(() => {
        if (phase !== "ready" || !result?.loreText) {
            return;
        }

        let cancelled = false;
        let frameHandle = 0;
        const startedAt = performance.now();
        const charactersPerSecond = 48;

        const tick = (now: number) => {
            if (cancelled) {
                return;
            }
            const elapsedSeconds = (now - startedAt) / 1000;
            const nextLength = Math.min(result.loreText.length, Math.floor(elapsedSeconds * charactersPerSecond));
            setTypedLoreLength((current) => (current === nextLength ? current : nextLength));
            if (nextLength < result.loreText.length) {
                frameHandle = window.requestAnimationFrame(tick);
            }
        };

        frameHandle = window.requestAnimationFrame(tick);
        return () => {
            cancelled = true;
            window.cancelAnimationFrame(frameHandle);
        };
    }, [phase, result?.loreText]);

    useEffect(() => {
        if (heroVariantParam === "john" || heroVariantParam === "jane") {
            const nextIdentity = buildDemoHeroIdentity(heroVariantParam);
            setHeroIdentity((current) => current.variant === nextIdentity.variant ? current : nextIdentity);
            return;
        }

        const variant = pickRandomDemoHeroVariant();
        const nextIdentity = buildDemoHeroIdentity(variant);
        setHeroIdentity(nextIdentity);
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            next.set("hero", variant);
            return next;
        }, { replace: true });
    }, [heroVariantParam, setSearchParams]);

    useEffect(() => {
        setPlanetAsset({
            textureUrl: planetTexture,
            title: planetTitle,
        });
        setPlanetView(
            planetTexture
                ? phase === "ready"
                    ? "stepTwoReady"
                    : "stepTwoIntro"
                : "hidden",
        );
    }, [phase, planetTexture, planetTitle, setPlanetAsset, setPlanetView]);

    useEffect(() => {
        let cancelled = false;

        const bootstrap = async () => {
            setError(null);
            setPersistError(null);
            setWeaponError(null);
            setVoiceError(null);
            setIllustrationError(null);
            setInsightError(null);
            setResult(null);
            setCurrentJobId(null);
            setPhase("resolvingContext");

            try {
                const worldContext = await resolveStepOneContext(waitForJob, stepOneJobId, selectionJobId, planetTitle);
                if (cancelled) return;

                const persisted = await loadPersistedStepTwoArtifact(stepOneJobId, heroIdentity.variant);
                if (cancelled) return;
                if (persisted) {
                    const baseCharacter = buildDemoHeroCharacter(
                        heroIdentity,
                        persisted.draft,
                        persisted.loreText,
                        persisted.portraitUrl ?? undefined,
                        persisted.worldId ?? resolvedWorldId,
                    );
                    let character = persisted.weaponArtifact
                        ? applyGeneratedWeapon(baseCharacter, persisted.weaponArtifact)
                        : baseCharacter;
                    if (!character.resolvedProgression || !character.equipped?.mainHand) {
                        try {
                            character = await resolveCombatReadyCharacter(character);
                            await persistDemoStepTwoCharacter(
                                character,
                                character.worldId ?? persisted.worldId ?? resolvedWorldId,
                                persisted.worldContext.worldTitle,
                            );
                        } catch {
                            // Keep the demo step usable even if silent combat normalization fails.
                        }
                    }
                    if (character.worldId ?? resolvedWorldId) {
                        setActiveWorldId(character.worldId ?? resolvedWorldId);
                    }
                    setResult({
                        draft: persisted.draft,
                        loreText: persisted.loreText,
                        portraitUrl: persisted.portraitUrl ?? undefined,
                        worldContext: persisted.worldContext,
                        character,
                        weaponArtifact: persisted.weaponArtifact ?? null,
                        voiceAsset: persisted.voiceAsset ?? null,
                        loreIllustrations: persisted.loreIllustrations ?? [],
                        loreInsights: persisted.loreInsights ?? [],
                    });
                    setPhase("ready");
                    return;
                }

                setPhase("generatingCharacter");
                const characterAccepted = await launchTrackedJob<{ jobId: string }, ReturnType<typeof buildDemoHeroGenerationRequest>>({
                    url: "/api/characters/generate",
                    request: buildDemoHeroGenerationRequest(heroIdentity, worldContext),
                    restore: {
                        route: DEMO_STEP_TWO_ROUTE,
                        payload: {
                            stepOneJobId,
                            selectionJobId,
                            planetTexture,
                            planetTitle: worldContext.worldTitle,
                            hero: heroIdentity.variant,
                        },
                    },
                    metadata: {
                        demoStep: 2,
                        worldId: resolvedWorldId,
                        worldTitle: worldContext.worldTitle,
                        heroName: heroIdentity.name,
                    },
                    optimisticJob: {
                        kind: "characters.generate",
                        title: "Generate Demo Hero",
                        tool: "character-builder",
                        status: "queued",
                        currentStage: "Queued",
                    },
                });
                setCurrentJobId(characterAccepted.jobId);
                const characterDetail = await waitForJob(characterAccepted.jobId);
                if (cancelled) return;
                const rawJson = String((characterDetail.result as { rawJson?: string } | undefined)?.rawJson || "");
                const [draft] = parseGeneratedCharacterDrafts(rawJson, heroIdentity);
                if (!draft) {
                    throw new Error("Character builder generation did not return a usable character.");
                }

                setPhase("generatingLore");
                const storyAccepted = await launchTrackedJob<{ jobId: string }, ReturnType<typeof buildDemoHeroStoryRequest>>({
                    url: "/api/ai/character-story",
                    request: buildDemoHeroStoryRequest(heroIdentity, draft, worldContext),
                    restore: {
                        route: DEMO_STEP_TWO_ROUTE,
                        payload: {
                            stepOneJobId,
                            selectionJobId,
                            planetTexture,
                            planetTitle: worldContext.worldTitle,
                            hero: heroIdentity.variant,
                        },
                    },
                    metadata: {
                        demoStep: 2,
                        worldId: resolvedWorldId,
                        heroName: heroIdentity.name,
                    },
                    optimisticJob: {
                        kind: "characters.story",
                        title: "Write Demo Hero Lore",
                        tool: "character-builder",
                        status: "queued",
                        currentStage: "Queued",
                    },
                });
                setCurrentJobId(storyAccepted.jobId);
                const storyDetail = await waitForJob(storyAccepted.jobId);
                if (cancelled) return;
                const loreText = String((storyDetail.result as { story?: string } | undefined)?.story || "").trim();
                if (!loreText) {
                    throw new Error("Character lore generation did not return story text.");
                }

                setPhase("generatingPortrait");
                const portraitAccepted = await launchTrackedJob<{ jobId: string }, { prompt: string }>({
                    url: "/api/gm/generate-character-portrait",
                    request: {
                        prompt: buildDemoHeroPortraitPrompt(heroIdentity, draft, loreText, worldContext),
                    },
                    restore: {
                        route: DEMO_STEP_TWO_ROUTE,
                        payload: {
                            stepOneJobId,
                            selectionJobId,
                            planetTexture,
                            planetTitle: worldContext.worldTitle,
                            hero: heroIdentity.variant,
                        },
                    },
                    metadata: {
                        demoStep: 2,
                        worldId: resolvedWorldId,
                        heroName: heroIdentity.name,
                    },
                    optimisticJob: {
                        kind: "gm.generate-character-portrait",
                        title: "Render Demo Hero Portrait",
                        tool: "game-master",
                        status: "queued",
                        currentStage: "Queued",
                    },
                });
                setCurrentJobId(portraitAccepted.jobId);
                const portraitDetail = await waitForJob(portraitAccepted.jobId);
                if (cancelled) return;
                const portraitUrl = String((portraitDetail.result as { dataUrl?: string } | undefined)?.dataUrl || "") || undefined;

                const draftCharacter = buildDemoHeroCharacter(heroIdentity, draft, loreText, portraitUrl, resolvedWorldId);
                const character = await resolveCombatReadyCharacter(draftCharacter);
                let persistedCharacter = character;
                try {
                    persistedCharacter = await persistDemoStepTwoCharacter(character, resolvedWorldId, worldContext.worldTitle);
                    if (cancelled) return;
                    if (persistedCharacter.worldId ?? resolvedWorldId) {
                        setActiveWorldId(persistedCharacter.worldId ?? resolvedWorldId);
                    }
                } catch (persistNextError) {
                    if (!cancelled) {
                        setPersistError(
                            persistNextError instanceof Error
                                ? persistNextError.message
                                : "Failed to persist the generated hero.",
                        );
                    }
                }
                const compactPortraitUrl = persistedCharacter.portraitUrl && !persistedCharacter.portraitUrl.startsWith("data:")
                    ? persistedCharacter.portraitUrl
                    : undefined;
                try {
                    await persistStepTwoArtifact(stepOneJobId, {
                        heroVariant: heroIdentity.variant,
                        heroName: heroIdentity.name,
                        worldId: persistedCharacter.worldId ?? resolvedWorldId,
                        draft,
                        loreText,
                        portraitUrl: compactPortraitUrl,
                        worldContext,
                        weaponArtifact: null,
                        voiceAsset: null,
                        loreIllustrations: [],
                        loreInsights: [],
                    });
                } catch (artifactNextError) {
                    if (!cancelled) {
                        setPersistError(
                            artifactNextError instanceof Error
                                ? artifactNextError.message
                                : "Failed to persist the demo step 2 artifact.",
                        );
                    }
                }
                if (cancelled) return;
                setResult({
                    draft,
                    loreText,
                    portraitUrl: compactPortraitUrl,
                    worldContext,
                    character: persistedCharacter,
                    weaponArtifact: null,
                    voiceAsset: null,
                    loreIllustrations: [],
                    loreInsights: [],
                });
                setPhase("ready");
            } catch (nextError) {
                if (cancelled) return;
                setError(nextError instanceof Error ? nextError.message : "Failed to build the demo hero.");
                setPhase("error");
            }
        };

        void bootstrap();

        return () => {
            cancelled = true;
        };
    }, [
        attemptKey,
        launchTrackedJob,
        planetTexture,
        planetTitle,
        resolvedWorldId,
        selectionJobId,
        stepOneJobId,
        heroIdentity,
        waitForJob,
    ]);

    const retry = () => {
        setCurrentJobId(null);
        setAttemptKey((current) => current + 1);
    };

    const generateWeapon = async () => {
        if (!result || isGeneratingWeapon) {
            return;
        }

        setWeaponError(null);
        setIsGeneratingWeapon(true);

        try {
            const accepted = await launchTrackedJob<{ jobId: string }, Record<string, unknown>>({
                url: "/api/demo/step-2/weapon/jobs",
                request: {
                    stepOneJobId,
                    heroVariant: heroIdentity.variant,
                    heroName: heroIdentity.name,
                    worldId: result.character.worldId ?? resolvedWorldId,
                    worldTitle: result.worldContext.worldTitle,
                    worldLore: result.worldContext.worldLore,
                    occupationName: result.draft.occupationName,
                    characterLore: result.loreText,
                },
                restore: {
                    route: DEMO_STEP_TWO_ROUTE,
                    payload: {
                        stepOneJobId,
                        selectionJobId,
                        planetTexture,
                        planetTitle: result.worldContext.worldTitle,
                        hero: heroIdentity.variant,
                    },
                },
                metadata: {
                    demoStep: 2,
                    worldId: result.character.worldId ?? resolvedWorldId,
                    worldTitle: result.worldContext.worldTitle,
                    heroName: heroIdentity.name,
                },
                optimisticJob: {
                    kind: "demo.step2.weapon.v1",
                    title: "Generate Demo Weapon",
                    tool: "demo.step2.weapon",
                    status: "queued",
                    currentStage: "Queued",
                },
            });

            setCurrentJobId(accepted.jobId);
            const detail = await waitForJob(accepted.jobId);
            const artifact = (detail.result as { artifact?: DemoStepTwoGeneratedWeaponArtifact } | undefined)?.artifact;
            if (!artifact?.weapon?.id || !artifact.image?.url) {
                throw new Error("Weapon generation did not return a usable artifact.");
            }

            try {
                await postJson("/api/data/items", buildWeaponItem(artifact));
                await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
            } catch (itemPersistError) {
                setPersistError(
                    itemPersistError instanceof Error
                        ? itemPersistError.message
                        : "Failed to persist the generated weapon item.",
                );
            }

            const nextCharacter = await resolveCombatReadyCharacter(
                applyGeneratedWeapon(result.character, artifact),
            );
            let persistedCharacter = nextCharacter;
            try {
                persistedCharacter = await persistDemoStepTwoCharacter(
                    nextCharacter,
                    nextCharacter.worldId ?? resolvedWorldId,
                    result.worldContext.worldTitle,
                );
            } catch (persistNextError) {
                setPersistError(
                    persistNextError instanceof Error
                        ? persistNextError.message
                        : "Failed to persist the generated weapon.",
                );
            }

            const compactPortraitUrl = persistedCharacter.portraitUrl && !persistedCharacter.portraitUrl.startsWith("data:")
                ? persistedCharacter.portraitUrl
                : result.portraitUrl;

            try {
                await persistStepTwoArtifact(stepOneJobId, {
                    heroVariant: heroIdentity.variant,
                    heroName: heroIdentity.name,
                    worldId: persistedCharacter.worldId ?? resolvedWorldId,
                    draft: result.draft,
                    loreText: result.loreText,
                    portraitUrl: compactPortraitUrl,
                    worldContext: result.worldContext,
                    weaponArtifact: artifact,
                    voiceAsset: result.voiceAsset ?? null,
                    loreIllustrations: result.loreIllustrations,
                    loreInsights: result.loreInsights,
                });
            } catch (persistArtifactError) {
                setPersistError(
                    persistArtifactError instanceof Error
                        ? persistArtifactError.message
                        : "Failed to persist the demo weapon artifact.",
                );
            }

            setResult({
                ...result,
                portraitUrl: compactPortraitUrl,
                character: persistedCharacter,
                weaponArtifact: artifact,
            });
        } catch (nextError) {
            setWeaponError(nextError instanceof Error ? nextError.message : "Failed to generate the equipment package.");
        } finally {
            setIsGeneratingWeapon(false);
        }
    };

    const playVoiceUrl = async (url: string) => {
        if (!audioRef.current) {
            return;
        }

        try {
            audioRef.current.src = url;
            audioRef.current.currentTime = 0;
            await audioRef.current.play();
            setIsVoicePlaying(true);
        } catch (nextError) {
            setVoiceError(nextError instanceof Error ? nextError.message : "Unable to play the generated voice.");
        }
    };

    const toggleVoicePlayback = async () => {
        if (!result?.voiceAsset?.url || !audioRef.current) {
            return;
        }

        if (isVoicePlaying) {
            audioRef.current.pause();
            setIsVoicePlaying(false);
            return;
        }

        try {
            await playVoiceUrl(result.voiceAsset.url);
        } catch (nextError) {
            setVoiceError(nextError instanceof Error ? nextError.message : "Unable to play the generated voice.");
        }
    };

    const generateVoice = async () => {
        if (!result || isGeneratingVoice) {
            return;
        }

        if (result.voiceAsset?.url) {
            await toggleVoicePlayback();
            return;
        }

        setVoiceError(null);
        setIsGeneratingVoice(true);

        try {
            const accepted = await launchTrackedJob<{ jobId: string }, Record<string, unknown>>({
                url: "/api/demo/step-2/voice/jobs",
                request: {
                    stepOneJobId,
                    heroVariant: heroIdentity.variant,
                    heroName: heroIdentity.name,
                    worldId: result.character.worldId ?? resolvedWorldId,
                    loreText: result.loreText,
                },
                restore: {
                    route: DEMO_STEP_TWO_ROUTE,
                    payload: {
                        stepOneJobId,
                        selectionJobId,
                        planetTexture,
                        planetTitle: result.worldContext.worldTitle,
                        hero: heroIdentity.variant,
                    },
                },
                metadata: {
                    demoStep: 2,
                    worldId: result.character.worldId ?? resolvedWorldId,
                    worldTitle: result.worldContext.worldTitle,
                    heroName: heroIdentity.name,
                },
                optimisticJob: {
                    kind: "demo.step2.voice.v1",
                    title: "Generate Demo Voice",
                    tool: "demo.step2.voice",
                    status: "queued",
                    currentStage: "Queued",
                },
            });

            setCurrentJobId(accepted.jobId);
            const detail = await waitForJob(accepted.jobId);
            const voice = (detail.result as { voice?: { url: string; mimeType?: string } } | undefined)?.voice;
            if (!voice?.url) {
                throw new Error("Voice generation did not return a usable audio asset.");
            }

            try {
                await persistStepTwoArtifact(stepOneJobId, {
                    heroVariant: heroIdentity.variant,
                    heroName: heroIdentity.name,
                    worldId: result.character.worldId ?? resolvedWorldId,
                    draft: result.draft,
                    loreText: result.loreText,
                    portraitUrl: result.portraitUrl ?? null,
                    worldContext: result.worldContext,
                    weaponArtifact: result.weaponArtifact ?? null,
                    voiceAsset: voice,
                    loreIllustrations: result.loreIllustrations,
                    loreInsights: result.loreInsights,
                });
            } catch (persistArtifactError) {
                setPersistError(
                    persistArtifactError instanceof Error
                        ? persistArtifactError.message
                        : "Failed to persist the demo voice artifact.",
                );
            }

            const nextResult = {
                ...result,
                voiceAsset: voice,
            };
            setResult(nextResult);
            await playVoiceUrl(voice.url);
        } catch (nextError) {
            setVoiceError(nextError instanceof Error ? nextError.message : "Failed to generate the voice package.");
        } finally {
            setIsGeneratingVoice(false);
        }
    };

    const generateLoreIllustrations = async (current: DemoStepTwoGeneratedState) => {
        if (isGeneratingIllustrations || current.loreIllustrations.length > 0) {
            return;
        }

        setIllustrationError(null);
        setIsGeneratingIllustrations(true);

        try {
            const accepted = await launchTrackedJob<{ jobId: string }, Record<string, unknown>>({
                url: "/api/demo/step-2/lore-illustrations/jobs",
                request: {
                    stepOneJobId,
                    heroVariant: heroIdentity.variant,
                    heroName: heroIdentity.name,
                    worldTitle: current.worldContext.worldTitle,
                    worldLore: current.worldContext.worldLore,
                    loreText: current.loreText,
                },
                restore: {
                    route: DEMO_STEP_TWO_ROUTE,
                    payload: {
                        stepOneJobId,
                        selectionJobId,
                        planetTexture,
                        planetTitle: current.worldContext.worldTitle,
                        hero: heroIdentity.variant,
                    },
                },
                metadata: {
                    demoStep: 2,
                    worldId: current.character.worldId ?? resolvedWorldId,
                    worldTitle: current.worldContext.worldTitle,
                    heroName: heroIdentity.name,
                },
                optimisticJob: {
                    kind: "demo.step2.lore-illustrations.v1",
                    title: "Generate Demo Lore Illustrations",
                    tool: "demo.step2.lore-illustrations",
                    status: "queued",
                    currentStage: "Queued",
                },
            });

            setCurrentJobId(accepted.jobId);
            const detail = await waitForJob(accepted.jobId);
            const illustrations = (detail.result as { illustrations?: DemoStepTwoLoreIllustrationAsset[] } | undefined)?.illustrations ?? [];
            if (!Array.isArray(illustrations)) {
                throw new Error("Lore illustration generation did not return a usable payload.");
            }

            await persistStepTwoArtifact(stepOneJobId, {
                heroVariant: heroIdentity.variant,
                heroName: heroIdentity.name,
                worldId: current.character.worldId ?? resolvedWorldId,
                draft: current.draft,
                loreText: current.loreText,
                portraitUrl: current.portraitUrl ?? null,
                worldContext: current.worldContext,
                weaponArtifact: current.weaponArtifact ?? null,
                voiceAsset: current.voiceAsset ?? null,
                loreIllustrations: illustrations,
                loreInsights: current.loreInsights,
            });

            setResult((previous) => previous ? { ...previous, loreIllustrations: illustrations } : previous);
        } catch (nextError) {
            setIllustrationError(nextError instanceof Error ? nextError.message : "Failed to generate lore illustrations.");
        } finally {
            setIsGeneratingIllustrations(false);
        }
    };

    useEffect(() => {
        if (
            phase !== "ready"
            || !result
            || result.loreIllustrations.length > 0
            || isGeneratingIllustrations
            || Boolean(illustrationError)
        ) {
            return;
        }

        void generateLoreIllustrations(result);
    }, [phase, result, isGeneratingIllustrations, illustrationError]);

    const activateLoreInsight = async (term: string, key: string) => {
        const normalizedTerm = normalizeLoreInsightTerm(term);
        if (!normalizedTerm) {
            return;
        }
        setActiveInsightKey(key);
        setActiveInsightTerm(term);
        setInsightError(null);

        const cachedInsight = result?.loreInsights.find(
            (entry) => normalizeLoreInsightTerm(entry.term) === normalizedTerm,
        );
        if (cachedInsight) {
            setActiveInsight(cachedInsight);
            return;
        }
        if (!result || isGeneratingInsight) {
            return;
        }

        setActiveInsight(null);
        setIsGeneratingInsight(true);

        try {
            const accepted = await launchTrackedJob<{ jobId: string }, Record<string, unknown>>({
                url: "/api/demo/step-2/lore-insight/jobs",
                request: {
                    stepOneJobId,
                    heroVariant: heroIdentity.variant,
                    heroName: heroIdentity.name,
                    worldTitle: result.worldContext.worldTitle,
                    worldLore: result.worldContext.worldLore,
                    loreText: result.loreText,
                    term,
                },
                restore: {
                    route: DEMO_STEP_TWO_ROUTE,
                    payload: {
                        stepOneJobId,
                        selectionJobId,
                        planetTexture,
                        planetTitle: result.worldContext.worldTitle,
                        hero: heroIdentity.variant,
                    },
                },
                metadata: {
                    demoStep: 2,
                    worldId: result.character.worldId ?? resolvedWorldId,
                    worldTitle: result.worldContext.worldTitle,
                    heroName: heroIdentity.name,
                    loreTerm: term,
                },
                optimisticJob: {
                    kind: "demo.step2.lore-insight.v1",
                    title: "Generate Lore Insight",
                    tool: "demo.step2.lore-insight",
                    status: "queued",
                    currentStage: "Queued",
                },
            });

            setCurrentJobId(accepted.jobId);
            const detail = await waitForJob(accepted.jobId);
            const artifact = (
                detail.result as { artifact?: DemoStepTwoLoreInsightArtifact } | undefined
            )?.artifact;
            if (!artifact?.term || !artifact?.explanation || !artifact.image?.url) {
                throw new Error("Lore insight generation did not return a usable payload.");
            }

            const nextInsights = dedupeLoreInsights([...(result.loreInsights ?? []), artifact]);
            try {
                await persistStepTwoArtifact(stepOneJobId, {
                    heroVariant: heroIdentity.variant,
                    heroName: heroIdentity.name,
                    worldId: result.character.worldId ?? resolvedWorldId,
                    draft: result.draft,
                    loreText: result.loreText,
                    portraitUrl: result.portraitUrl ?? null,
                    worldContext: result.worldContext,
                    weaponArtifact: result.weaponArtifact ?? null,
                    voiceAsset: result.voiceAsset ?? null,
                    loreIllustrations: result.loreIllustrations,
                    loreInsights: nextInsights,
                });
            } catch (persistArtifactError) {
                setPersistError(
                    persistArtifactError instanceof Error
                        ? persistArtifactError.message
                        : "Failed to persist the lore insight artifact.",
                );
            }

            setResult((previous) => previous ? { ...previous, loreInsights: nextInsights } : previous);
            setActiveInsight(artifact);
        } catch (nextError) {
            setInsightError(nextError instanceof Error ? nextError.message : "Failed to generate the lore insight.");
        } finally {
            setIsGeneratingInsight(false);
        }
    };

    const stageLabel = useMemo(() => {
        switch (phase) {
            case "resolvingContext":
                return "Loading World Context";
            case "generatingCharacter":
                return activeJob?.currentStage || "Generating Character";
            case "generatingLore":
                return activeJob?.currentStage || "Writing Lore";
            case "generatingPortrait":
                return activeJob?.currentStage || "Rendering Portrait";
            case "error":
                return "Generation Failed";
            default:
                return "Preparing";
        }
    }, [activeJob?.currentStage, phase]);

    const typedLoreText = useMemo(
        () => result?.loreText.slice(0, typedLoreLength) ?? "",
        [result?.loreText, typedLoreLength],
    );
    const loreParagraphs = useMemo(
        () => typedLoreText.split(/\n+/).filter(Boolean),
        [typedLoreText],
    );
    const illustrationMap = useMemo(() => {
        const map = new Map<number, DemoStepTwoLoreIllustrationAsset[]>();
        for (const illustration of result?.loreIllustrations ?? []) {
            const existing = map.get(illustration.paragraphIndex) ?? [];
            existing.push(illustration);
            map.set(illustration.paragraphIndex, existing);
        }
        return map;
    }, [result?.loreIllustrations]);
    const interactiveTerms = useMemo(
        () => result
            ? collectInteractiveLoreTerms(
                result.loreText,
                result.worldContext.worldTitle,
                heroIdentity.name,
                result.worldContext.selectedDirectionTitle,
            )
            : [],
        [heroIdentity.name, result],
    );

    const handleNext = () => {
        const next = new URLSearchParams(searchParams);
        next.set("hero", heroIdentity.variant);
        if (stepOneJobId) {
            next.set("stepOneJobId", stepOneJobId);
        }
        if (selectionJobId) {
            next.set("selectionJobId", selectionJobId);
        }
        if (planetTexture) {
            next.set("planetTexture", planetTexture);
        }
        if (planetTitle) {
            next.set("planetTitle", planetTitle);
        }
        window.location.assign(`${DEMO_STEP_THREE_ROUTE}?${next.toString()}`);
    };

    return (
        <ScreenShell variant="technical">
            <style>{`
                @keyframes demo-step-ping-bar {
                    0% {
                        transform: translateX(0%);
                        opacity: 0.55;
                    }
                    100% {
                        transform: translateX(calc(100% - 3.5rem));
                        opacity: 1;
                    }
                }
            `}</style>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(246,211,122,0.08),_transparent_28%),radial-gradient(circle_at_72%_24%,rgba(96,165,250,0.10),transparent_24%),linear-gradient(180deg,#04070b_0%,#0a1118_48%,#03050a_100%)]" />
            <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_18%_16%,rgba(255,255,255,0.9)_0,rgba(255,255,255,0.9)_1px,transparent_1.5px),radial-gradient(circle_at_74%_22%,rgba(255,255,255,0.72)_0,rgba(255,255,255,0.72)_1px,transparent_1.5px),radial-gradient(circle_at_58%_64%,rgba(255,255,255,0.74)_0,rgba(255,255,255,0.74)_1px,transparent_1.5px)] [background-size:320px_320px,420px_420px,520px_520px]" />

            {phase !== "ready" && (
                <div className="relative z-10 flex h-full w-full items-center justify-center overflow-hidden px-6 py-10">
                    <div className="pointer-events-none absolute inset-0">
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_42%_46%,rgba(17,24,39,0.18),rgba(0,0,0,0)_44%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_50%,rgba(97,171,255,0.12),transparent_30%)] blur-3xl" />
                    </div>

                    <div className="animate-demo-panel-settle relative w-full max-w-4xl">
                        <div className="rounded-[32px] border border-white/10 bg-black/30 px-8 py-10 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-md md:px-12 md:py-12">
                            <div className="text-center">
                                <div className="mx-auto mt-5 max-w-[18ch] text-balance text-3xl font-semibold tracking-[0.08em] text-white md:text-5xl">
                                    Forging The Protagonist
                                </div>                                
                                <div className="mx-auto mt-8 max-w-3xl rounded-[24px] border border-white/8 bg-white/[0.03] px-6 py-6 text-left shadow-inner shadow-black/10 md:px-8 md:py-7">
                                    <div className="space-y-5 text-base leading-8 tracking-[0.02em] text-slate-100 md:text-lg">
                                        {DEMO_STEP_TWO_INTRO_LINES.map((line) => (
                                            <p key={line}>{line}</p>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 flex flex-col items-center gap-4 text-center">
                                <div className="text-[11px] font-black uppercase tracking-[0.34em] text-cyan-200">
                                    {stageLabel}
                                </div>
                                <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
                                    <div className="relative h-full w-full">
                                        <div className="absolute inset-0 rounded-full bg-cyan-200/10" />
                                        <div
                                            className="absolute left-0 top-0 h-full w-14 rounded-full bg-gradient-to-r from-transparent via-white to-cyan-200 shadow-[0_0_18px_rgba(165,243,252,0.55)]"
                                            style={{ animation: "demo-step-ping-bar 1.15s ease-in-out infinite alternate" }}
                                        />
                                    </div>
                                </div>
                                {error && (
                                    <div className="mt-3 flex flex-col items-center gap-4">
                                        <div className="max-w-xl text-sm leading-relaxed text-red-200">{error}</div>
                                        <Button
                                            size="lg"
                                            variant="glass"
                                            onClick={retry}
                                            className="group relative min-w-[240px] overflow-hidden rounded px-0 py-6 text-sm font-black tracking-[0.8em] transition-all duration-450 bg-white/[0.03] hover:bg-white/[0.08]"
                                        >
                                            <span className="relative z-10 flex translate-x-[0.4em] items-center justify-center drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all duration-1000 group-hover:scale-105 group-hover:text-white">
                                                RETRY
                                            </span>
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {phase === "ready" && result && (
                <div className="relative z-10 grid h-full w-full items-stretch gap-6 px-6 py-8 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:px-8 xl:px-12">
                    <div className="min-h-0 overflow-hidden">
                        <div className="animate-demo-panel-settle flex h-full flex-col rounded-[28px] border border-[#f1c765]/15 bg-black/12 px-6 py-8 backdrop-blur-[2px] md:px-8">
                            <div className="mb-5 flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <h2 className="mt-1 text-[2rem] font-black uppercase tracking-[0.14em] text-[#f6d37a] drop-shadow-[0_0_14px_rgba(246,211,122,0.16)] md:text-[2.35rem]">
                                        {heroIdentity.name}
                                    </h2>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { void generateVoice(); }}
                                    disabled={isGeneratingVoice}
                                    aria-label={isGeneratingVoice ? "Generating voice" : isVoicePlaying ? "Pause voice" : result.voiceAsset?.url ? "Play voice" : "Generate voice"}
                                    className="group relative mt-1 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#f1c765]/20 bg-[#f1c765]/[0.08] text-[#f6d37a] transition-colors hover:bg-[#f1c765]/[0.16] disabled:opacity-60"
                                >
                                    <Headphones
                                        className={`h-5 w-5 transition-transform group-hover:scale-105 ${isGeneratingVoice ? "animate-pulse" : ""}`}
                                        strokeWidth={2.2}
                                        aria-hidden="true"
                                    />
                                    <span className="absolute -right-1 -bottom-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#f1c765]/25 bg-[#120b04] text-[#f6d37a] shadow-[0_0_14px_rgba(0,0,0,0.35)]">
                                        {isGeneratingVoice ? (
                                            <LoaderCircle className="h-3 w-3 animate-spin" strokeWidth={2.4} aria-hidden="true" />
                                        ) : isVoicePlaying ? (
                                            <Pause className="h-3 w-3 fill-current" strokeWidth={2.6} aria-hidden="true" />
                                        ) : (
                                            <Play className="ml-[1px] h-3 w-3 fill-current" strokeWidth={2.6} aria-hidden="true" />
                                        )}
                                    </span>
                                </button>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                <div className="space-y-6 text-[0.92rem] font-medium leading-[1.82] tracking-[0.012em] text-[#f6d37a] drop-shadow-[0_0_10px_rgba(246,211,122,0.12)] md:text-[1rem]">
                                    {loreParagraphs.map((paragraph, index) => (
                                        <div key={`${index}-${paragraph.slice(0, 24)}`} className="space-y-5">
                                            <p>
                                                {renderInteractiveLoreParagraph(
                                                    paragraph,
                                                    interactiveTerms,
                                                    activeInsightKey,
                                                    activeInsightTerm,
                                                    activeInsight,
                                                    isGeneratingInsight,
                                                    insightError,
                                                    (term, key) => { void activateLoreInsight(term, key); },
                                                    clearActiveInsight,
                                                )}
                                            </p>
                                            {(illustrationMap.get(index) ?? []).map((illustration) => (
                                                <div
                                                    key={`${illustration.paragraphIndex}-${illustration.image.url}`}
                                                    className="overflow-hidden rounded-[24px] border border-[#f1c765]/10 bg-black/20"
                                                >
                                                    <img
                                                        src={illustration.image.url}
                                                        alt={`Lore illustration ${illustration.paragraphIndex + 1}`}
                                                        className="aspect-[1.12/1] w-full object-cover"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                    {isGeneratingIllustrations && (
                                        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                                            <div className="relative h-full w-full">
                                                <div className="absolute inset-0 rounded-full bg-cyan-200/10" />
                                                <div
                                                    className="absolute left-0 top-0 h-full w-14 rounded-full bg-gradient-to-r from-transparent via-white to-cyan-200 shadow-[0_0_18px_rgba(165,243,252,0.55)]"
                                                    style={{ animation: "demo-step-ping-bar 1.15s ease-in-out infinite alternate" }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {persistError && (
                                <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm leading-relaxed text-amber-100">
                                    {persistError}
                                </div>
                            )}
                            {voiceError && (
                                <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-sm leading-relaxed text-red-100">
                                    {voiceError}
                                </div>
                            )}
                            {illustrationError && (
                                <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-sm leading-relaxed text-red-100">
                                    {illustrationError}
                                </div>
                            )}
                            {insightError && (
                                <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-4 text-sm leading-relaxed text-red-100">
                                    {insightError}
                                </div>
                            )}
                            <audio
                                ref={audioRef}
                                src={result.voiceAsset?.url || undefined}
                                preload="metadata"
                                className="hidden"
                            />
                        </div>
                    </div>

                    <div className="min-h-0 h-full overflow-hidden">
                        <div className="relative h-full">
                            <CharacterSheetPanel
                                character={result.character}
                                className="h-full"
                                generatedWeapon={result.weaponArtifact ?? null}
                                footerOverlay={(
                                    <Button
                                        size="lg"
                                        variant="glass"
                                        onClick={handleNext}
                                        className="group relative min-w-[220px] overflow-hidden rounded px-0 py-6 text-sm font-black tracking-[0.52em] transition-all duration-500 bg-white/[0.03] hover:bg-white/[0.08]"
                                    >
                                        <span className="relative z-10 flex translate-x-[0.26em] items-center justify-center drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all duration-700 group-hover:scale-105 group-hover:text-white">
                                            NEXT
                                        </span>
                                    </Button>
                                )}
                            />
                        </div>
                    </div>
                </div>
            )}
        </ScreenShell>
    );
}
