import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@ashtrail/ui";
import { useTrackedJobLauncher } from "../jobs/useTrackedJobLauncher";
import { useJobs } from "../jobs/useJobs";
import {
    isDemoStepOneResult,
    isDemoStepOneSelectionResult,
    type DemoStepOneResult,
    type DemoStepOneSelectionResult,
    type DemoStepOneStoryOption,
} from "../media/generatedMediaAudio";
import {
    DEMO_STEP_ONE_DEFAULT_REQUEST,
    DEMO_STEP_ONE_DIRECTION_PROMPT,
    DEMO_STEP_ONE_INTRO_LINES,
    type DemoStepOneSelectionRequest,
} from "./demoStepOne";
import { useHomepageAudio } from "./useHomepageAudio";
import { useSceneAudio } from "./useSceneAudio";
import { DEMO_STEP_ONE_ROUTE, DEMO_STEP_TWO_ROUTE } from "../lib/routes";
import { useDemoFlow } from "./DemoFlowContext";

type DemoStepOnePhase = "intro" | "launching" | "running" | "choose" | "error";
type DemoStepOneSelectionPhase = "idle" | "launching" | "running" | "ready" | "error";
type TransitionDocument = Document & {
    startViewTransition?: (update: () => void | Promise<void>) => unknown;
};

let pendingDemoStepOneLaunch: Promise<{ jobId: string }> | null = null;

export function DemoPlanetScreen() {
    useHomepageAudio(false);
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { setPlanetAsset, setPlanetView } = useDemoFlow();
    const launchTrackedJob = useTrackedJobLauncher();
    const { waitForJob, jobs } = useJobs();
    const [phase, setPhase] = useState<DemoStepOnePhase>("intro");
    const [result, setResult] = useState<DemoStepOneResult | null>(null);
    const [activeJobId, setActiveJobId] = useState<string | null>(searchParams.get("jobId"));
    const [error, setError] = useState<string | null>(null);
    const [attemptKey, setAttemptKey] = useState(0);
    const [typedIntroLength, setTypedIntroLength] = useState(0);
    const [selectionPhase, setSelectionPhase] = useState<DemoStepOneSelectionPhase>("idle");
    const [selectionResult, setSelectionResult] = useState<DemoStepOneSelectionResult | null>(null);
    const [selectionError, setSelectionError] = useState<string | null>(null);
    const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
    const [selectionJobId, setSelectionJobId] = useState<string | null>(searchParams.get("selectionJobId"));
    const [typedSelectionLength, setTypedSelectionLength] = useState(0);
    const jobIdParam = searchParams.get("jobId");
    const selectionJobIdParam = searchParams.get("selectionJobId");
    const enteredFromLaunch = Boolean((location.state as { fromLaunch?: boolean } | null)?.fromLaunch);
    const activeJob = activeJobId ? jobs.find((job) => job.jobId === activeJobId) : null;
    const introBody = useMemo(() => DEMO_STEP_ONE_INTRO_LINES.join("\n\n"), []);

    useSceneAudio(result?.artifact.audio?.url ?? null, phase === "choose" && Boolean(result?.artifact.audio?.url));

    useEffect(() => {
        setTypedIntroLength(0);
    }, [attemptKey]);

    const fullExpandedLoreText = useMemo(
        () => (selectionResult?.artifact.additionalLoreParagraphs || []).join("\n\n"),
        [selectionResult],
    );

    useEffect(() => {
        setTypedSelectionLength(0);
    }, [fullExpandedLoreText]);

    useEffect(() => {
        if (phase === "choose") {
            setTypedIntroLength(introBody.length);
            return;
        }

        let cancelled = false;
        let frameHandle = 0;
        const startedAt = performance.now();
        const charactersPerSecond = 46;

        const tick = (now: number) => {
            if (cancelled) return;
            const elapsedSeconds = (now - startedAt) / 1000;
            const nextLength = Math.min(introBody.length, Math.floor(elapsedSeconds * charactersPerSecond));
            setTypedIntroLength((current) => (current === nextLength ? current : nextLength));

            if (nextLength < introBody.length) {
                frameHandle = window.requestAnimationFrame(tick);
            }
        };

        frameHandle = window.requestAnimationFrame(tick);
        return () => {
            cancelled = true;
            window.cancelAnimationFrame(frameHandle);
        };
    }, [introBody, phase]);

    useEffect(() => {
        if (selectionPhase !== "ready" || !fullExpandedLoreText) {
            return;
        }

        let cancelled = false;
        let frameHandle = 0;
        const startedAt = performance.now();
        const charactersPerSecond = 48;

        const tick = (now: number) => {
            if (cancelled) return;
            const elapsedSeconds = (now - startedAt) / 1000;
            const nextLength = Math.min(fullExpandedLoreText.length, Math.floor(elapsedSeconds * charactersPerSecond));
            setTypedSelectionLength((current) => (current === nextLength ? current : nextLength));

            if (nextLength < fullExpandedLoreText.length) {
                frameHandle = window.requestAnimationFrame(tick);
            }
        };

        frameHandle = window.requestAnimationFrame(tick);
        return () => {
            cancelled = true;
            window.cancelAnimationFrame(frameHandle);
        };
    }, [fullExpandedLoreText, selectionPhase]);

    useEffect(() => {
        let cancelled = false;

        const resolveJob = async (jobId: string) => {
            setActiveJobId(jobId);
            setPhase("running");
            const detail = await waitForJob(jobId);
            if (cancelled) return;
            if (!isDemoStepOneResult(detail.result)) {
                throw new Error(detail.error || "The demo step 1 job did not return a valid interleaved package.");
            }
            setResult(detail.result);
            setSelectionResult(null);
            setSelectionPhase("idle");
            setSelectedOptionId(null);
            setPhase("choose");

            if (selectionJobIdParam) {
                setSelectionJobId(selectionJobIdParam);
                setSelectionPhase("running");
                const selectionDetail = await waitForJob(selectionJobIdParam);
                if (cancelled) return;
                if (!isDemoStepOneSelectionResult(selectionDetail.result)) {
                    throw new Error(selectionDetail.error || "The saved world-direction expansion result was not valid.");
                }
                setSelectionResult(selectionDetail.result);
                setSelectedOptionId(selectionDetail.result.artifact.selectedOptionId);
                setSelectionPhase("ready");
            } else {
                setSelectionJobId(null);
            }
        };

        const bootstrap = async () => {
            setError(null);
            setResult(null);
            setSelectionResult(null);
            setSelectionPhase("idle");
            setSelectionError(null);
            setSelectedOptionId(null);
            setSelectionJobId(null);

            try {
                if (jobIdParam) {
                    await resolveJob(jobIdParam);
                    return;
                }

                setPhase("launching");
                const launchPromise =
                    pendingDemoStepOneLaunch
                    ?? launchTrackedJob<{ jobId: string }, Record<string, unknown>>({
                        url: "/api/demo/step-1/jobs",
                        request: DEMO_STEP_ONE_DEFAULT_REQUEST,
                        restore: {
                            route: DEMO_STEP_ONE_ROUTE,
                            payload: {},
                        },
                        metadata: {
                            demoStep: 1,
                        },
                        optimisticJob: {
                            kind: "demo.step1.interleaved.v1",
                            title: "Generate Demo Step 1",
                            tool: "demo.step1.interleaved",
                            status: "queued",
                            currentStage: "Queued",
                        },
                    });
                pendingDemoStepOneLaunch = launchPromise;

                const accepted = await launchPromise;
                pendingDemoStepOneLaunch = null;
                if (cancelled) return;
                setActiveJobId(accepted.jobId);
                setSearchParams((previous) => {
                    const next = new URLSearchParams(previous);
                    next.set("jobId", accepted.jobId);
                    return next;
                }, { replace: true });
            } catch (nextError) {
                pendingDemoStepOneLaunch = null;
                if (cancelled) return;
                setError(nextError instanceof Error ? nextError.message : "Failed to generate the demo step 1 package.");
                setPhase("error");
            }
        };

        void bootstrap();

        return () => {
            cancelled = true;
        };
    }, [attemptKey, jobIdParam, launchTrackedJob, selectionJobIdParam, setSearchParams, waitForJob]);

    const textureUrl = result?.artifact.image?.url ?? null;
    const worldLabel = result?.artifact.metadata.title || "Orbital Survey";
    const baseLoreParagraphs = (result?.artifact.loreText || "").split(/\n+/).filter(Boolean);
    const warnings = [
        ...(result?.artifact.warnings || []),
        ...(selectionResult?.artifact.warnings || []),
    ];
    const storyOptions = result?.artifact.storyOptions || [];
    const typedExpandedLoreText = fullExpandedLoreText.slice(0, typedSelectionLength);
    const hasFinishedTypingSelection = !fullExpandedLoreText || typedSelectionLength >= fullExpandedLoreText.length;

    const retryInitial = () => {
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            next.delete("jobId");
            next.delete("selectionJobId");
            next.delete("planetTexture");
            next.delete("planetTitle");
            return next;
        }, { replace: true });
        setActiveJobId(null);
        setSelectionJobId(null);
        setAttemptKey((current) => current + 1);
    };

    const launchSelection = async (option: DemoStepOneStoryOption) => {
        if (!result || !activeJobId || selectionPhase === "launching" || selectionPhase === "running") {
            return;
        }

        setSelectedOptionId(option.id);
        setSelectionError(null);
        setSelectionResult(null);
        setSelectionPhase("launching");

        try {
            const request: DemoStepOneSelectionRequest = {
                sourceJobId: activeJobId,
                worldTitle: worldLabel,
                baseLoreText: result.artifact.loreText,
                optionId: option.id,
                optionTitle: option.title,
                optionPromptSeed: option.promptSeed,
            };

            const accepted = await launchTrackedJob<{ jobId: string }, DemoStepOneSelectionRequest>({
                url: "/api/demo/step-1/selection/jobs",
                request,
                restore: {
                    route: DEMO_STEP_ONE_ROUTE,
                    payload: {
                        jobId: activeJobId,
                        selectionJobId: "latest",
                    },
                },
                metadata: {
                    demoStep: 1,
                    sourceJobId: activeJobId,
                    selectedOptionId: option.id,
                },
                optimisticJob: {
                    kind: "demo.step1.selection.v1",
                    title: "Expand Demo Step 1 World Direction",
                    tool: "demo.step1.selection",
                    status: "queued",
                    currentStage: "Queued",
                },
            });

            setSelectionJobId(accepted.jobId);
            setSearchParams((previous) => {
                const next = new URLSearchParams(previous);
                next.set("jobId", activeJobId);
                next.set("selectionJobId", accepted.jobId);
                return next;
            }, { replace: true });
            setSelectionPhase("running");
            const detail = await waitForJob(accepted.jobId);
            if (!isDemoStepOneSelectionResult(detail.result)) {
                throw new Error(detail.error || "The world-direction expansion job did not return a valid result.");
            }
            setSelectionResult(detail.result);
            setSelectionPhase("ready");
        } catch (nextError) {
            setSelectionError(nextError instanceof Error ? nextError.message : "Failed to expand the selected world direction.");
            setSelectionPhase("error");
        }
    };

    const activeDirectionTitle = selectionResult?.artifact.selectedOptionTitle
        || storyOptions.find((option) => option.id === selectedOptionId)?.title
        || null;

    useEffect(() => {
        setPlanetAsset({
            textureUrl,
            title: result?.artifact.metadata.title ?? null,
        });
        setPlanetView(phase === "choose" && textureUrl ? "stepOneShowcase" : "hidden");
    }, [phase, result?.artifact.metadata.title, setPlanetAsset, setPlanetView, textureUrl]);

    useEffect(() => {
        if (!textureUrl && !result?.artifact.metadata.title) {
            return;
        }

        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            const nextTexture = textureUrl || "";
            const nextTitle = result?.artifact.metadata.title || "";
            const currentTexture = previous.get("planetTexture") || "";
            const currentTitle = previous.get("planetTitle") || "";

            if (currentTexture === nextTexture && currentTitle === nextTitle) {
                return previous;
            }

            if (nextTexture) {
                next.set("planetTexture", nextTexture);
            } else {
                next.delete("planetTexture");
            }

            if (nextTitle) {
                next.set("planetTitle", nextTitle);
            } else {
                next.delete("planetTitle");
            }

            return next;
        }, { replace: true });
    }, [result?.artifact.metadata.title, setSearchParams, textureUrl]);

    const handleNext = () => {
        if (selectionPhase !== "ready" || !hasFinishedTypingSelection) {
            return;
        }

        setPlanetView("stepTwoIntro");

        const params = new URLSearchParams();
        if (textureUrl) {
            params.set("planetTexture", textureUrl);
        }
        if (result?.artifact.metadata.title) {
            params.set("planetTitle", result.artifact.metadata.title);
        }
        if (activeJobId) {
            params.set("stepOneJobId", activeJobId);
        }
        if (selectionJobId) {
            params.set("selectionJobId", selectionJobId);
        }

        const target = {
            pathname: DEMO_STEP_TWO_ROUTE,
            search: params.toString() ? `?${params.toString()}` : "",
        };

        try {
            const transitionApi = (document as TransitionDocument).startViewTransition;
            if (transitionApi) {
                transitionApi.call(document, () => {
                    navigate(target);
                });
                return;
            }
        } catch {
            // Fall back to standard navigation if the browser rejects invocation.
        }

        navigate(target);
    };

    return (
        <div className="relative h-screen w-full overflow-hidden bg-[#1e1e1e] text-gray-200">
            <style>{`
                @keyframes demo-step-typewriter-cursor {
                    0% { opacity: 0; }
                    50% { opacity: 1; }
                }
                @keyframes demo-step-ping-bar {
                    0% {
                        transform: translateX(-30%);
                        opacity: 0.45;
                    }
                    100% {
                        transform: translateX(175%);
                        opacity: 1;
                    }
                }
            `}</style>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_42%,rgba(110,176,255,0.08),transparent_18%),radial-gradient(circle_at_top_left,_rgba(94,234,212,0.08),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.08),_transparent_34%),linear-gradient(180deg,#02050a_0%,#07101a_46%,#03060b_100%)]" />
            <div className="absolute inset-0 opacity-70 [background-image:radial-gradient(circle_at_12%_18%,rgba(255,255,255,0.95)_0,rgba(255,255,255,0.95)_1px,transparent_1.5px),radial-gradient(circle_at_74%_26%,rgba(255,255,255,0.8)_0,rgba(255,255,255,0.8)_1px,transparent_1.5px),radial-gradient(circle_at_58%_68%,rgba(255,255,255,0.75)_0,rgba(255,255,255,0.75)_1px,transparent_1.5px),radial-gradient(circle_at_84%_82%,rgba(255,255,255,0.7)_0,rgba(255,255,255,0.7)_1px,transparent_1.5px),radial-gradient(circle_at_32%_78%,rgba(255,255,255,0.85)_0,rgba(255,255,255,0.85)_1px,transparent_1.5px)] [background-size:340px_340px,420px_420px,520px_520px,460px_460px,380px_380px]" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.05)_0%,rgba(0,0,0,0.02)_36%,rgba(0,0,0,0.18)_100%)]" />

            {phase !== "choose" && (
                <div className="relative z-10 flex h-full w-full items-center justify-center overflow-hidden px-6 py-10">
                    <div className={`relative w-full max-w-4xl ${enteredFromLaunch ? "animate-in fade-in duration-500" : ""}`}>
                        <div className="rounded-[32px] border border-white/10 bg-black/30 px-8 py-10 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-md md:px-12 md:py-12">
                            <div className="text-center">                                
                                <div className="mx-auto mt-5 max-w-[18ch] text-balance text-3xl font-semibold tracking-[0.08em] text-white md:text-5xl">
                                    Preparing Your World Introduction
                                </div>
                                <div className="mx-auto mt-8 max-w-3xl rounded-[24px] border border-white/8 bg-white/[0.03] px-6 py-6 text-left shadow-inner shadow-black/10 md:px-8 md:py-7">
                                    <p className="min-h-[11rem] whitespace-pre-line text-base leading-8 tracking-[0.02em] text-slate-100 md:min-h-[10rem] md:text-lg">
                                        {introBody.slice(0, typedIntroLength)}
                                        {typedIntroLength < introBody.length && (
                                            <span
                                                className="ml-1 inline-block h-[1.1em] w-[2px] translate-y-1 rounded-full bg-cyan-100/90 align-bottom"
                                                style={{ animation: "demo-step-typewriter-cursor 1s steps(1, end) infinite" }}
                                            />
                                        )}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-8 flex flex-col items-center gap-4 text-center">
                                <div className="text-[11px] font-black uppercase tracking-[0.34em] text-cyan-200">
                                    {phase === "launching" ? "Launching Job" : phase === "running" ? (activeJob?.currentStage || "Generating Scene Package") : "Preparing"}
                                </div>
                                <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
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
                                            onClick={retryInitial}
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

            {phase === "choose" && result && (
                <div className={`relative z-10 grid h-full w-full grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:px-10 md:py-16 xl:px-14 xl:py-20 ${enteredFromLaunch ? "animate-in fade-in duration-700" : ""}`}>
                    <div
                        className={`relative min-h-[420px] min-w-0 overflow-hidden ${enteredFromLaunch ? "animate-in fade-in slide-in-from-left-6 duration-700" : ""}`}
                    >
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_42%_46%,rgba(17,24,39,0.18),rgba(0,0,0,0)_44%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_50%,rgba(97,171,255,0.12),transparent_30%)] blur-3xl" />
                        {!textureUrl && (
                            <div className="flex h-full items-center justify-center rounded-[28px] border border-white/10 bg-black/20 px-8 text-center text-sm uppercase tracking-[0.28em] text-gray-400">
                                Planet texture unavailable
                            </div>
                        )}
                    </div>

                    <div className={`relative min-h-[420px] min-w-0 overflow-hidden ${enteredFromLaunch ? "animate-in fade-in slide-in-from-right-6 duration-500" : ""}`}>
                        <div className="relative flex h-full flex-col rounded-[28px] border border-[#f1c765]/15 bg-black/12 px-6 py-8 backdrop-blur-[2px] md:px-8">
                            <div className="mb-6 flex items-start justify-between gap-4">
                                <div>
                                    <h2 className="mt-3 text-2xl font-black uppercase tracking-[0.16em] text-[#f6d37a] drop-shadow-[0_0_14px_rgba(246,211,122,0.16)] md:text-[2rem]">
                                        {worldLabel}
                                    </h2>
                                </div>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto pr-2 text-[0.8rem] font-medium leading-[1.72] tracking-[0.015em] text-[#f6d37a] drop-shadow-[0_0_10px_rgba(246,211,122,0.12)] md:pr-4 md:text-[0.88rem]">
                                <div className="space-y-4">
                                    {baseLoreParagraphs.map((paragraph) => (
                                        <p key={paragraph}>{paragraph}</p>
                                    ))}
                                    {fullExpandedLoreText && (
                                        <p className="whitespace-pre-line">
                                            {typedExpandedLoreText}
                                            {selectionPhase === "ready" && !hasFinishedTypingSelection && (
                                                <span
                                                    className="ml-1 inline-block h-[1.05em] w-[2px] translate-y-1 rounded-full bg-cyan-100/90 align-bottom"
                                                    style={{ animation: "demo-step-typewriter-cursor 1s steps(1, end) infinite" }}
                                                />
                                            )}
                                        </p>
                                    )}
                                </div>

                                {selectionPhase === "idle" && (
                                    <div className="mt-8 space-y-4">
                                        
                                        <p className="text-sm font-medium normal-case leading-6 tracking-[0.02em] text-slate-200">
                                            {DEMO_STEP_ONE_DIRECTION_PROMPT}
                                        </p>
                                        <div className="grid gap-3">
                                            {storyOptions.map((option) => (
                                                <button
                                                    key={option.id}
                                                    type="button"
                                                    onClick={() => void launchSelection(option)}
                                                    className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4 text-left transition-colors duration-200 hover:border-cyan-200/35 hover:bg-white/[0.06]"
                                                >
                                                    <div className="text-[0.66rem] font-black uppercase tracking-[0.18em] text-[#f6d37a]">
                                                        {option.title}
                                                    </div>
                                                    <div className="mt-2 text-sm font-medium normal-case leading-6 tracking-[0.02em] text-slate-200">
                                                        {option.promptSeed}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {(selectionPhase === "launching" || selectionPhase === "running") && (
                                    <div className="mt-8 rounded-2xl border border-cyan-200/15 bg-cyan-200/[0.04] px-5 py-5">
                                        <div className="text-[10px] font-black uppercase tracking-[0.34em] text-cyan-200">
                                            Expanding Chosen Direction
                                        </div>
                                        {activeDirectionTitle && (
                                            <div className="mt-3 text-[0.8rem] font-black uppercase tracking-[0.22em] text-[#f6d37a]">
                                                {activeDirectionTitle}
                                            </div>
                                        )}
                                        <p className="mt-3 text-sm font-medium normal-case leading-6 tracking-[0.02em] text-slate-200">
                                            Ashtrail is extending this world canon into a more committed narrative direction for the next demo steps.
                                        </p>
                                        <div className="mt-4 h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
                                            <div className="relative h-full w-full">
                                                <div className="absolute inset-0 rounded-full bg-cyan-200/10" />
                                                <div
                                                    className="absolute left-0 top-0 h-full w-14 rounded-full bg-gradient-to-r from-transparent via-white to-cyan-200 shadow-[0_0_18px_rgba(165,243,252,0.55)]"
                                                    style={{ animation: "demo-step-ping-bar 1.15s ease-in-out infinite alternate" }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {selectionPhase === "error" && (
                                    <div className="mt-8 rounded-2xl border border-red-300/20 bg-red-300/10 px-5 py-5">
                                        <div className="text-sm leading-relaxed text-red-100">
                                            {selectionError || "Failed to expand the chosen world direction."}
                                        </div>
                                        {selectedOptionId && (
                                            <div className="mt-4">
                                                <Button
                                                    size="lg"
                                                    variant="glass"
                                                    onClick={() => {
                                                        const option = storyOptions.find((entry) => entry.id === selectedOptionId);
                                                        if (option) {
                                                            void launchSelection(option);
                                                        }
                                                    }}
                                                    className="group relative min-w-[220px] overflow-hidden rounded px-0 py-6 text-sm font-black tracking-[0.8em] transition-all duration-450 bg-white/[0.03] hover:bg-white/[0.08]"
                                                >
                                                    <span className="relative z-10 flex translate-x-[0.4em] items-center justify-center drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all duration-1000 group-hover:scale-105 group-hover:text-white">
                                                        RETRY
                                                    </span>
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {selectionPhase === "ready" && activeDirectionTitle && (
                                    <div className="mt-8 rounded-2xl border border-[#f1c765]/15 bg-white/[0.03] px-5 py-4">
                                        <div className="text-[10px] font-black uppercase tracking-[0.34em] text-cyan-200">
                                            Chosen Direction
                                        </div>
                                        <div className="mt-2 text-[0.84rem] font-black uppercase tracking-[0.22em] text-[#f6d37a]">
                                            {activeDirectionTitle}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {warnings.length > 0 && (
                                <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm leading-relaxed text-amber-100">
                                    {warnings.join(" ")}
                                </div>
                            )}

                            {selectionPhase === "ready" && hasFinishedTypingSelection && (
                                <div className="mt-6 flex justify-center">
                                    <Button
                                        size="lg"
                                        variant="glass"
                                        onClick={handleNext}
                                        className="group relative min-w-[220px] overflow-hidden rounded px-0 py-6 text-sm font-black tracking-[0.8em] transition-all duration-450 bg-white/[0.03] hover:bg-white/[0.08]"
                                    >
                                        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-450 group-hover:opacity-100">
                                            <div className="absolute -bottom-1/2 left-1/2 h-0 w-[140%] -translate-x-1/2 rounded-[45%] bg-white/[0.12] blur-[80px] transition-all duration-[520ms] ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:h-[200%]" />
                                        </div>
                                        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0 scale-150 rounded-full bg-white/5 opacity-0 blur-3xl transition-all duration-[460ms] ease-out group-hover:h-full group-hover:opacity-100" />
                                        <div className="absolute inset-x-0 top-0 h-px scale-x-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-420 ease-out group-hover:scale-x-100" />
                                        <span className="relative z-10 flex translate-x-[0.4em] items-center justify-center drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all duration-1000 group-hover:scale-105 group-hover:text-white">
                                            NEXT
                                        </span>
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
