import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, ScreenShell } from "@ashtrail/ui";
import { DEFAULT_CHARACTER_CREDITS, GameRegistry, type Character, type Item, type Skill } from "@ashtrail/core";
import { CharacterSheetPanel } from "../components/CharacterSheetPanel";
import { useHomepageAudio } from "./useHomepageAudio";
import { useTrackedJobLauncher } from "../jobs/useTrackedJobLauncher";
import { useJobs } from "../jobs/useJobs";
import { useGenerationHistory } from "../hooks/useGenerationHistory";
import { useActiveWorld } from "../hooks/useActiveWorld";
import {
    buildCharacterBuilderRoute,
    buildHistoryRoute,
    DEMO_STEP_TWO_ROUTE,
} from "../lib/routes";
import {
    isDemoStepTwoResult,
    type DemoStepTwoCharacterPackage,
    type DemoStepTwoResult,
    type DemoStepTwoSkill,
    type DemoStepTwoWeapon,
} from "../media/generatedMediaAudio";
import { DEMO_STEP_TWO_INTRO_LINES } from "./demoStepTwo";

type DemoStepTwoPhase = "intro" | "launching" | "running" | "ready" | "error";

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

let pendingDemoStepTwoLaunch: Promise<{ jobId: string }> | null = null;

function buildWeaponItem(weapon: DemoStepTwoWeapon): Item {
    return {
        id: weapon.id,
        name: weapon.name,
        category: "weapon",
        rarity: normalizeItemRarity(weapon.rarity),
        description: weapon.description,
        cost: 0,
        equipSlot: "mainHand",
        weaponType: weapon.weaponType === "ranged" ? "ranged" : "melee",
        weaponRange: Math.max(1, weapon.weaponRange),
        effects: [
            {
                id: `${weapon.id}-damage`,
                type: "WEAPON_DAMAGE_REPLACEMENT",
                target: "damage",
                value: weapon.baseDamage,
                scope: "combat",
                description: weapon.description,
            },
        ],
    };
}

function buildUniqueSkill(skill: DemoStepTwoSkill): Skill {
    return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        category: "unique",
        apCost: skill.apCost,
        minRange: skill.minRange,
        maxRange: skill.maxRange,
        areaType: "single",
        areaSize: 0,
        targetType: skill.effectType === "support" ? "ally" : "enemy",
        cooldown: skill.cooldown,
        effectType: skill.effectType === "support" ? "support" : "physical",
        damage: skill.effectType === "support" ? undefined : 8,
        healing: skill.effectType === "support" ? 6 : undefined,
    };
}

function buildCoreCharacter(
    pkg: DemoStepTwoCharacterPackage,
    portraitUrl: string | undefined,
    worldId: string | null,
): Character {
    const weapon = buildWeaponItem(pkg.weapon);
    const uniqueSkills = pkg.uniqueSkills.map(buildUniqueSkill);
    const baseSkills = GameRegistry.getAllSkills().filter((skill) => skill.category === "base");
    const hp = 10 + pkg.stats.endurance * 5;

    return {
        id: pkg.id,
        isNPC: false,
        type: "Human",
        worldId: worldId || undefined,
        name: pkg.name,
        age: pkg.age,
        gender: pkg.gender,
        history: pkg.loreText,
        appearancePrompt: pkg.appearancePrompt,
        portraitUrl,
        portraitName: pkg.name,
        stats: pkg.stats,
        traits: [],
        skills: [...baseSkills, ...uniqueSkills],
        occupation: {
            id: slugify(pkg.occupationName),
            name: pkg.occupationName,
            category: "FIELD",
            description: `${pkg.occupationName} generated for demo step 2.`,
            shortDescription: pkg.occupationName,
        },
        hp,
        maxHp: hp,
        xp: 0,
        level: pkg.level,
        credits: { ...DEFAULT_CHARACTER_CREDITS },
        inventory: [weapon],
        equipped: {
            mainHand: weapon,
        },
        title: pkg.title,
        faction: pkg.faction,
        backstory: pkg.loreText,
        origin: {
            system: "builder",
            worldId: worldId || undefined,
        },
    };
}

function buildHistoryCharacter(pkg: DemoStepTwoCharacterPackage): HistoryCharacterRecord {
    return {
        id: pkg.id,
        name: pkg.name,
        role: "Leader",
        status: "Alive",
        location: pkg.location,
        affiliation: pkg.faction,
        lore: pkg.loreText,
        relationships: "Central Ashtrail demo protagonist.",
    };
}

function normalizeItemRarity(rarity: string): Item["rarity"] {
    switch (rarity) {
        case "salvaged":
        case "reinforced":
        case "pre-ash":
        case "specialized":
        case "relic":
        case "ashmarked":
            return rarity;
        default:
            return "relic";
    }
}

function slugify(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "generated";
}

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

async function persistDemoStepTwoPackage(result: DemoStepTwoResult, worldId: string | null) {
    const character = result.artifact.character;
    const portraitUrl = result.artifact.portrait?.url;
    const coreCharacter = buildCoreCharacter(character, portraitUrl ?? undefined, worldId);
    const weapon = buildWeaponItem(character.weapon);
    const uniqueSkills = character.uniqueSkills.map(buildUniqueSkill);

    await postJson("/api/data/items", weapon);
    await Promise.all(uniqueSkills.map((skill) => postJson("/api/data/skills", skill)));
    await postJson("/api/data/characters", coreCharacter);

    if (worldId) {
        const existingResponse = await fetch(`/api/planet/characters/${encodeURIComponent(worldId)}`);
        const existing = existingResponse.ok ? await existingResponse.json() as HistoryCharacterRecord[] : [];
        const next = Array.isArray(existing) ? [...existing] : [];
        const record = buildHistoryCharacter(character);
        const index = next.findIndex((entry) => entry.id === record.id);
        if (index >= 0) {
            next[index] = record;
        } else {
            next.unshift(record);
        }
        await postJson(`/api/planet/characters/${encodeURIComponent(worldId)}`, next);
    }

    await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
    return coreCharacter;
}

export function DemoStepTwoPage() {
    useHomepageAudio(false);
    const [searchParams, setSearchParams] = useSearchParams();
    const launchTrackedJob = useTrackedJobLauncher();
    const { waitForJob, jobs } = useJobs();
    const { history } = useGenerationHistory();
    const { activeWorldId, setActiveWorldId } = useActiveWorld();
    const [phase, setPhase] = useState<DemoStepTwoPhase>("intro");
    const [result, setResult] = useState<DemoStepTwoResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [attemptKey, setAttemptKey] = useState(0);
    const [persistError, setPersistError] = useState<string | null>(null);
    const [persistedCharacterId, setPersistedCharacterId] = useState<string | null>(null);
    const [isVoicePlaying, setIsVoicePlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const persistedJobIdRef = useRef<string | null>(null);
    const jobIdParam = searchParams.get("jobId");
    const resolvedWorldId = activeWorldId ?? history[0]?.id ?? null;
    const activeJob = jobIdParam ? jobs.find((job) => job.jobId === jobIdParam) : null;

    useEffect(() => {
        let cancelled = false;

        const resolveJob = async (jobId: string) => {
            setPhase("running");
            const detail = await waitForJob(jobId);
            if (cancelled) return;
            if (!isDemoStepTwoResult(detail.result)) {
                throw new Error(detail.error || "The demo step 2 job did not return a valid hero package.");
            }
            setResult(detail.result);
            setPhase("ready");
        };

        const bootstrap = async () => {
            setError(null);
            setPersistError(null);
            setResult(null);

            try {
                if (jobIdParam) {
                    await resolveJob(jobIdParam);
                    return;
                }

                setPhase("launching");
                const launchPromise = pendingDemoStepTwoLaunch ?? launchTrackedJob<{ jobId: string }, Record<string, unknown>>({
                    url: "/api/demo/step-2/jobs",
                    request: {
                        worldId: resolvedWorldId,
                    },
                    restore: {
                        route: DEMO_STEP_TWO_ROUTE,
                        payload: {},
                    },
                    metadata: {
                        demoStep: 2,
                        worldId: resolvedWorldId,
                    },
                    optimisticJob: {
                        kind: "demo.step2.interleaved.v1",
                        title: "Generate Demo Step 2",
                        tool: "demo.step2.interleaved",
                        status: "queued",
                        currentStage: "Queued",
                    },
                });
                pendingDemoStepTwoLaunch = launchPromise;

                const accepted = await launchPromise;
                pendingDemoStepTwoLaunch = null;
                if (cancelled) return;
                setSearchParams((previous) => {
                    const next = new URLSearchParams(previous);
                    next.set("jobId", accepted.jobId);
                    return next;
                }, { replace: true });
            } catch (nextError) {
                pendingDemoStepTwoLaunch = null;
                if (cancelled) return;
                setError(nextError instanceof Error ? nextError.message : "Failed to generate the demo hero package.");
                setPhase("error");
            }
        };

        void bootstrap();

        return () => {
            cancelled = true;
        };
    }, [attemptKey, jobIdParam, launchTrackedJob, resolvedWorldId, setSearchParams, waitForJob]);

    useEffect(() => {
        if (!result || phase !== "ready" || !jobIdParam) return;
        if (persistedJobIdRef.current === jobIdParam) return;

        let cancelled = false;
        persistedJobIdRef.current = jobIdParam;

        void persistDemoStepTwoPackage(result, result.artifact.worldId ?? resolvedWorldId)
            .then((character) => {
                if (cancelled) return;
                setPersistedCharacterId(character.id);
                if (result.artifact.worldId ?? resolvedWorldId) {
                    setActiveWorldId(result.artifact.worldId ?? resolvedWorldId);
                }
            })
            .catch((nextError: unknown) => {
                if (cancelled) return;
                persistedJobIdRef.current = null;
                setPersistError(nextError instanceof Error ? nextError.message : "Failed to persist the generated hero.");
            });

        return () => {
            cancelled = true;
        };
    }, [jobIdParam, phase, resolvedWorldId, result, setActiveWorldId]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const onEnded = () => setIsVoicePlaying(false);
        const onPause = () => setIsVoicePlaying(false);
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("pause", onPause);
        return () => {
            audio.pause();
            audio.removeEventListener("ended", onEnded);
            audio.removeEventListener("pause", onPause);
        };
    }, [result?.artifact.voice?.url]);

    const displayedCharacter = useMemo(() => {
        if (!result) return null;
        return buildCoreCharacter(
            result.artifact.character,
            result.artifact.portrait?.url ?? undefined,
            result.artifact.worldId ?? resolvedWorldId,
        );
    }, [resolvedWorldId, result]);

    const toggleVoice = async () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) {
            await audio.play();
            setIsVoicePlaying(true);
        } else {
            audio.pause();
            setIsVoicePlaying(false);
        }
    };

    const retry = () => {
        persistedJobIdRef.current = null;
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            next.delete("jobId");
            return next;
        }, { replace: true });
        setResult(null);
        setPersistError(null);
        setPersistedCharacterId(null);
        setAttemptKey((current) => current + 1);
    };

    const builderRoute = persistedCharacterId ? buildCharacterBuilderRoute({ id: persistedCharacterId }) : null;
    const historyRoute = (result?.artifact.worldId ?? resolvedWorldId) ? buildHistoryRoute({ tab: "characters" }) : null;

    return (
        <ScreenShell variant="technical">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(246,211,122,0.08),_transparent_28%),radial-gradient(circle_at_72%_24%,rgba(96,165,250,0.10),transparent_24%),linear-gradient(180deg,#04070b_0%,#0a1118_48%,#03050a_100%)]" />
            <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(circle_at_18%_16%,rgba(255,255,255,0.9)_0,rgba(255,255,255,0.9)_1px,transparent_1.5px),radial-gradient(circle_at_74%_22%,rgba(255,255,255,0.72)_0,rgba(255,255,255,0.72)_1px,transparent_1.5px),radial-gradient(circle_at_58%_64%,rgba(255,255,255,0.74)_0,rgba(255,255,255,0.74)_1px,transparent_1.5px)] [background-size:320px_320px,420px_420px,520px_520px]" />

            {phase !== "ready" && (
                <div className="relative z-10 flex h-full w-full items-center justify-center px-6 py-10">
                    <div className="max-w-4xl text-center">
                        <div className="text-[0.78rem] font-black uppercase tracking-[0.48em] text-[#f1c765]">
                            Ashtrail Demo Step Two
                        </div>
                        <div className="mx-auto mt-8 max-w-[18ch] text-4xl font-black uppercase leading-none tracking-[0.14em] text-[#f6d37a] md:text-5xl">
                            Interleaved Hero Creation
                        </div>
                        <div className="mx-auto mt-10 max-w-[24ch] space-y-7 text-lg font-black uppercase leading-[1.9] tracking-[0.14em] text-[#f6d37a] md:text-[1.3rem]">
                            {DEMO_STEP_TWO_INTRO_LINES.map((line) => (
                                <p key={line}>{line}</p>
                            ))}
                        </div>
                        <div className="mt-12 flex flex-col items-center gap-4">
                            <div className="text-[11px] font-black uppercase tracking-[0.34em] text-cyan-200">
                                {phase === "launching" ? "Launching Job" : phase === "running" ? (activeJob?.currentStage || "Generating Hero Package") : "Preparing"}
                            </div>
                            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-white to-cyan-200 transition-all duration-500"
                                    style={{ width: `${Math.max(12, Math.min(100, activeJob?.progress ?? (phase === "launching" ? 18 : 32)))}%` }}
                                />
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
            )}

            {phase === "ready" && result && displayedCharacter && (
                <div className="relative z-10 grid h-full w-full gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:px-10 xl:px-14">
                    <div className="min-h-0 overflow-hidden">
                        <div className="h-full overflow-auto pr-1 custom-scrollbar">
                            <CharacterSheetPanel character={displayedCharacter} currentLocationLabel={result.artifact.character.location} />
                            <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                                <div className="border border-white/8 bg-black/25 p-4">
                                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f1c765]">Signature Weapon</div>
                                    <div className="mt-3 text-lg font-black uppercase tracking-[0.14em] text-white">
                                        {result.artifact.character.weapon.name}
                                    </div>
                                    <div className="mt-2 text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200">
                                        {result.artifact.character.weapon.weaponType} • Range {result.artifact.character.weapon.weaponRange} • DMG {result.artifact.character.weapon.baseDamage}
                                    </div>
                                    <p className="mt-3 text-sm leading-relaxed text-gray-300">
                                        {result.artifact.character.weapon.description}
                                    </p>
                                </div>
                                <div className="border border-white/8 bg-black/25 p-4">
                                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f1c765]">Unique Skills</div>
                                    <div className="mt-3 space-y-3">
                                        {result.artifact.character.uniqueSkills.map((skill) => (
                                            <div key={skill.id} className="border border-white/8 bg-white/[0.03] p-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white">{skill.name}</div>
                                                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200">AP {skill.apCost}</div>
                                                </div>
                                                <p className="mt-2 text-sm leading-relaxed text-gray-300">{skill.description}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="min-h-0 overflow-hidden">
                        <div className="flex h-full flex-col rounded-[28px] border border-[#f1c765]/15 bg-black/12 px-6 py-8 backdrop-blur-[2px] md:px-8">
                            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.34em] text-[#f1c765]">Generated Hero Chronicle</div>
                                    <h2 className="mt-3 text-3xl font-black uppercase tracking-[0.18em] text-[#f6d37a] drop-shadow-[0_0_14px_rgba(246,211,122,0.16)] md:text-4xl">
                                        {result.artifact.character.name}
                                    </h2>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                    <Button
                                        size="lg"
                                        variant="glass"
                                        onClick={toggleVoice}
                                        disabled={!result.artifact.voice?.url}
                                        className="group relative min-w-[220px] overflow-hidden rounded px-0 py-6 text-sm font-black tracking-[0.74em] transition-all duration-450 bg-white/[0.03] hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <span className="relative z-10 flex translate-x-[0.36em] items-center justify-center drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all duration-1000 group-hover:scale-105 group-hover:text-white">
                                            {isVoicePlaying ? "PAUSE" : "VOICE"}
                                        </span>
                                    </Button>
                                    {builderRoute && (
                                        <Link to={builderRoute}>
                                            <Button
                                                size="lg"
                                                variant="glass"
                                                className="group relative min-w-[220px] overflow-hidden rounded px-0 py-6 text-sm font-black tracking-[0.56em] transition-all duration-450 bg-white/[0.03] hover:bg-white/[0.08]"
                                            >
                                                <span className="relative z-10 flex translate-x-[0.26em] items-center justify-center drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all duration-1000 group-hover:scale-105 group-hover:text-white">
                                                    BUILDER
                                                </span>
                                            </Button>
                                        </Link>
                                    )}
                                    {historyRoute && (
                                        <Link
                                            to={historyRoute}
                                            onClick={() => {
                                                const worldId = result.artifact.worldId ?? resolvedWorldId;
                                                if (worldId) {
                                                    setActiveWorldId(worldId);
                                                }
                                            }}
                                        >
                                            <Button
                                                size="lg"
                                                variant="glass"
                                                className="group relative min-w-[220px] overflow-hidden rounded px-0 py-6 text-sm font-black tracking-[0.56em] transition-all duration-450 bg-white/[0.03] hover:bg-white/[0.08]"
                                            >
                                                <span className="relative z-10 flex translate-x-[0.26em] items-center justify-center drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all duration-1000 group-hover:scale-105 group-hover:text-white">
                                                    HISTORY
                                                </span>
                                            </Button>
                                        </Link>
                                    )}
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 overflow-auto pr-2 custom-scrollbar">
                                <div className="space-y-5 text-[0.88rem] font-semibold uppercase leading-[1.72] tracking-[0.07em] text-[#f6d37a] drop-shadow-[0_0_10px_rgba(246,211,122,0.12)] md:text-[0.96rem]">
                                    {result.artifact.character.loreText.split(/\n+/).filter(Boolean).map((paragraph) => (
                                        <p key={paragraph}>{paragraph}</p>
                                    ))}
                                </div>
                            </div>

                            {(persistError || result.artifact.warnings?.length) && (
                                <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm leading-relaxed text-amber-100">
                                    {[...(result.artifact.warnings || []), ...(persistError ? [persistError] : [])].join(" ")}
                                </div>
                            )}

                            <audio ref={audioRef} src={result.artifact.voice?.url || undefined} preload="metadata" className="hidden" />
                        </div>
                    </div>
                </div>
            )}
        </ScreenShell>
    );
}
