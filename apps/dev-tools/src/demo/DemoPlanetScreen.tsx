import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Button } from "@ashtrail/ui";
import { ImageGlobe } from "../components/ImageGlobe";
import { useTrackedJobLauncher } from "../jobs/useTrackedJobLauncher";
import { useJobs } from "../jobs/useJobs";
import { isDemoStepOneResult, type DemoStepOneResult } from "../media/generatedMediaAudio";
import { DEMO_STEP_ONE_DEFAULT_REQUEST, DEMO_STEP_ONE_INTRO_LINES } from "./demoStepOne";
import { useHomepageAudio } from "./useHomepageAudio";
import { useSceneAudio } from "./useSceneAudio";
import { DEMO_STEP_ONE_ROUTE, DEMO_STEP_ONE_WALKTHROUGH_ROUTE } from "../lib/routes";

type DemoStepOnePhase = "intro" | "launching" | "running" | "ready" | "error";

let pendingDemoStepOneLaunch: Promise<{ jobId: string }> | null = null;

export function DemoPlanetScreen() {
    useHomepageAudio(false);
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const launchTrackedJob = useTrackedJobLauncher();
    const { waitForJob, jobs } = useJobs();
    const [phase, setPhase] = useState<DemoStepOnePhase>("intro");
    const [result, setResult] = useState<DemoStepOneResult | null>(null);
    const [activeJobId, setActiveJobId] = useState<string | null>(searchParams.get("jobId"));
    const [error, setError] = useState<string | null>(null);
    const [attemptKey, setAttemptKey] = useState(0);
    const jobIdParam = searchParams.get("jobId");
    const enteredFromLaunch = Boolean((location.state as { fromLaunch?: boolean } | null)?.fromLaunch);
    const activeJob = activeJobId ? jobs.find((job) => job.jobId === activeJobId) : null;

    useSceneAudio(result?.artifact.audio?.url ?? null, phase === "ready" && Boolean(result?.artifact.audio?.url));

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
            setPhase("ready");
        };

        const bootstrap = async () => {
            setError(null);
            setResult(null);
            const existingJobId = jobIdParam;

            try {
                if (existingJobId) {
                    await resolveJob(existingJobId);
                    return;
                }

                setPhase("launching");
                const launchPromise = pendingDemoStepOneLaunch ?? launchTrackedJob<{ jobId: string }, Record<string, unknown>>({
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
                return;
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
    }, [attemptKey, jobIdParam, launchTrackedJob, setSearchParams, waitForJob]);

    const textureUrl = result?.artifact.image?.url ?? null;
    const worldLabel = result?.artifact.metadata.title || "Orbital Survey";
    const loreText = result?.artifact.loreText || "";
    const warnings = result?.artifact.warnings || [];

    const retry = () => {
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            next.delete("jobId");
            return next;
        }, { replace: true });
        setActiveJobId(null);
        setAttemptKey((current) => current + 1);
    };

    return (
        <div className="relative h-screen w-full overflow-hidden bg-[#1e1e1e] text-gray-200">
            <style>{`
                @keyframes demo-step-intro-crawl {
                    0% {
                        transform: rotateX(17deg) translate3d(0, 12%, 0) scale(1.02);
                    }
                    100% {
                        transform: rotateX(17deg) translate3d(0, -122%, 0) scale(0.82);
                    }
                }
            `}</style>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_42%,rgba(110,176,255,0.08),transparent_18%),radial-gradient(circle_at_top_left,_rgba(94,234,212,0.08),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.08),_transparent_34%),linear-gradient(180deg,#02050a_0%,#07101a_46%,#03060b_100%)]" />
            <div className="absolute inset-0 opacity-70 [background-image:radial-gradient(circle_at_12%_18%,rgba(255,255,255,0.95)_0,rgba(255,255,255,0.95)_1px,transparent_1.5px),radial-gradient(circle_at_74%_26%,rgba(255,255,255,0.8)_0,rgba(255,255,255,0.8)_1px,transparent_1.5px),radial-gradient(circle_at_58%_68%,rgba(255,255,255,0.75)_0,rgba(255,255,255,0.75)_1px,transparent_1.5px),radial-gradient(circle_at_84%_82%,rgba(255,255,255,0.7)_0,rgba(255,255,255,0.7)_1px,transparent_1.5px),radial-gradient(circle_at_32%_78%,rgba(255,255,255,0.85)_0,rgba(255,255,255,0.85)_1px,transparent_1.5px)] [background-size:340px_340px,420px_420px,520px_520px,460px_460px,380px_380px]" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.05)_0%,rgba(0,0,0,0.02)_36%,rgba(0,0,0,0.18)_100%)]" />

            {phase !== "ready" && (
                <div className="relative z-10 flex h-full w-full items-center justify-center overflow-hidden px-6 py-10">
                    <div className={`relative h-full w-full max-w-4xl overflow-hidden [perspective:1200px] ${enteredFromLaunch ? "animate-in fade-in duration-500" : ""}`}>
                        <div className="absolute inset-x-[8%] top-[22%] h-[130%] [transform-style:preserve-3d]">
                            <div
                                className="origin-center text-center font-black uppercase tracking-[0.16em] text-[#f6d37a] drop-shadow-[0_0_14px_rgba(246,211,122,0.18)]"
                                style={{
                                    animation: "demo-step-intro-crawl 34s linear infinite",
                                }}
                            >
                                <div className="mb-8 text-[0.78rem] tracking-[0.48em] text-[#f1c765]">
                                    Ashtrail Demo Step One
                                </div>
                                <div className="mx-auto mb-8 max-w-[18ch] text-4xl leading-none md:text-5xl">
                                    Interleaved Scene Generation
                                </div>
                                <div className="mx-auto max-w-[24ch] space-y-8 text-lg leading-[1.9] md:text-[1.45rem]">
                                    {DEMO_STEP_ONE_INTRO_LINES.map((line) => (
                                        <p key={line}>{line}</p>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 pb-6 text-center">
                            <div className="text-[11px] font-black uppercase tracking-[0.34em] text-cyan-200">
                                {phase === "launching" ? "Launching Job" : phase === "running" ? (activeJob?.currentStage || "Generating Scene Package") : "Preparing"}
                            </div>
                            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
                                <div
                                    className="h-full rounded-full bg-gradient-to-r from-cyan-300 via-white to-cyan-200 transition-all duration-500"
                                    style={{ width: `${Math.max(12, Math.min(100, activeJob?.progress ?? (phase === "launching" ? 18 : 30)))}%` }}
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

            {phase === "ready" && result && (
                <div className={`relative z-10 grid h-full w-full grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:px-10 md:py-16 xl:px-14 xl:py-20 ${enteredFromLaunch ? "animate-in fade-in duration-700" : ""}`}>
                    <div className={`relative min-h-[420px] min-w-0 overflow-hidden ${enteredFromLaunch ? "animate-in fade-in slide-in-from-left-6 duration-700" : ""}`}>
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_42%_46%,rgba(17,24,39,0.18),rgba(0,0,0,0)_44%)]" />
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_50%,rgba(97,171,255,0.12),transparent_30%)] blur-3xl" />
                        {textureUrl ? (
                            <ImageGlobe textureUrl={textureUrl} transparentBackground />
                        ) : (
                            <div className="flex h-full items-center justify-center rounded-[28px] border border-white/10 bg-black/20 px-8 text-center text-sm uppercase tracking-[0.28em] text-gray-400">
                                Planet texture unavailable
                            </div>
                        )}
                    </div>

                    <div className={`relative min-h-[420px] min-w-0 overflow-hidden ${enteredFromLaunch ? "animate-in fade-in slide-in-from-right-6 duration-500" : ""}`}>
                        <div className="relative flex h-full flex-col rounded-[28px] border border-[#f1c765]/15 bg-black/12 px-6 py-8 backdrop-blur-[2px] md:px-8">
                            <div className="mb-6 flex items-center justify-between gap-4">
                                <div>
                                    <div className="text-[10px] font-black uppercase tracking-[0.34em] text-[#f1c765]">Generated World Intro</div>
                                    <h2 className="mt-3 text-3xl font-black uppercase tracking-[0.18em] text-[#f6d37a] drop-shadow-[0_0_14px_rgba(246,211,122,0.16)] md:text-4xl">
                                        {worldLabel}
                                    </h2>
                                </div>
                                <Link to={`${DEMO_STEP_ONE_WALKTHROUGH_ROUTE}?jobId=${encodeURIComponent(activeJobId || "")}`}>
                                    <Button
                                        size="lg"
                                        variant="glass"
                                        className="group relative shrink-0 overflow-hidden rounded px-0 py-6 text-sm font-black tracking-[0.8em] transition-all duration-450 bg-white/[0.03] hover:bg-white/[0.08] min-w-[220px]"
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
                                </Link>
                            </div>

                            <div className="min-h-0 flex-1 pr-2 text-[0.88rem] font-semibold uppercase leading-[1.65] tracking-[0.07em] text-[#f6d37a] drop-shadow-[0_0_10px_rgba(246,211,122,0.12)] md:pr-4 md:text-[0.96rem]">
                                <div className="space-y-4">
                                    {loreText.split(/\n+/).filter(Boolean).map((paragraph) => (
                                        <p key={paragraph}>{paragraph}</p>
                                    ))}
                                </div>
                            </div>

                            {warnings.length > 0 && (
                                <div className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm leading-relaxed text-amber-100">
                                    {warnings.join(" ")}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
