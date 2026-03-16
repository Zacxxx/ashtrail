import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { useDemoFlow } from "./DemoFlowContext";
import { useJobs } from "../jobs/useJobs";
import { useTrackedJobLauncher } from "../jobs/useTrackedJobLauncher";

interface VideoArtifact {
    videoUrl?: string;
    posterUrl?: string;
    jobId?: string;
    status: "idle" | "generating" | "ready" | "error";
}

type ScreenPhase = "loading" | "intro" | "generating" | "ready" | "error";

const INTRO_TEXT = `Your quest is complete. You've navigated treacherous terrain, made critical choices, and emerged victorious against formidable challenges.

Now, witness your triumph immortalized in a cinematic celebration of your heroic journey.`;

export function DemoStepFivePage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { setPlanetView } = useDemoFlow();
    const { waitForJob } = useJobs();
    const { launchTrackedJob } = useTrackedJobLauncher();
    
    const [screenPhase, setScreenPhase] = useState<ScreenPhase>("loading");
    const [videoArtifact, setVideoArtifact] = useState<VideoArtifact>({ status: "idle" });
    const [error, setError] = useState<string | null>(null);
    const [typedIntroLength, setTypedIntroLength] = useState(0);
    const [worldId, setWorldId] = useState<string | null>(null);
    const [questRunId, setQuestRunId] = useState<string | null>(null);

    const stepOneJobId = searchParams.get("stepOneJobId");
    const worldIdParam = searchParams.get("worldId");
    const questRunIdParam = searchParams.get("questRunId");

    useEffect(() => {
        setPlanetView("stepThreeIntro");
    }, [setPlanetView]);

    // Typing animation for intro
    useEffect(() => {
        if (screenPhase !== "intro") {
            return;
        }
        let cancelled = false;
        let frameHandle = 0;
        const startedAt = performance.now();
        const charactersPerSecond = 48;

        const tick = (now: number) => {
            if (cancelled) return;
            const elapsedSeconds = (now - startedAt) / 1000;
            const nextLength = Math.min(INTRO_TEXT.length, Math.floor(elapsedSeconds * charactersPerSecond));
            setTypedIntroLength((current) => (current === nextLength ? current : nextLength));
            if (nextLength < INTRO_TEXT.length) {
                frameHandle = window.requestAnimationFrame(tick);
            }
        };

        frameHandle = window.requestAnimationFrame(tick);
        return () => {
            cancelled = true;
            window.cancelAnimationFrame(frameHandle);
        };
    }, [screenPhase]);

    // Load context and check for existing video
    useEffect(() => {
        let cancelled = false;

        const loadContext = async () => {
            try {
                // First, try to get worldId from URL params
                let extractedWorldId = worldIdParam;
                let extractedQuestRunId = questRunIdParam;

                // If not in URL, try to load from step 4 artifact
                if (!extractedWorldId && stepOneJobId) {
                    const params = new URLSearchParams();
                    params.set("stepOneJobId", stepOneJobId);
                    
                    const step4Response = await fetch(`/api/demo/step-4/artifact?${params.toString()}`);
                    if (step4Response.ok) {
                        const step4Data = await step4Response.json();
                        extractedWorldId = step4Data.worldId;
                        extractedQuestRunId = step4Data.questRunId;
                    }
                }

                if (!extractedWorldId) {
                    throw new Error("Missing worldId - cannot proceed");
                }

                if (cancelled) return;
                setWorldId(extractedWorldId);
                setQuestRunId(extractedQuestRunId);

                // Try to load existing video artifact
                // Try with stepOneJobId first, then fallback to worldId
                const lookupKeys = [];
                if (stepOneJobId) {
                    lookupKeys.push({ key: "stepOneJobId", value: stepOneJobId });
                }
                if (extractedWorldId) {
                    lookupKeys.push({ key: "worldId", value: extractedWorldId });
                }

                for (const lookup of lookupKeys) {
                    try {
                        const params = new URLSearchParams();
                        params.set(lookup.key, lookup.value);
                        
                        const step5Response = await fetch(`/api/demo/step-5/artifact?${params.toString()}`);
                        if (step5Response.ok) {
                            const artifact = await step5Response.json();
                            if (cancelled) return;
                            console.log("✓ Found existing video artifact");
                            setVideoArtifact(artifact);
                            setScreenPhase("ready");
                            return;
                        }
                    } catch (err) {
                        // Try next lookup key
                        continue;
                    }
                }

                // No existing video, show intro
                if (!cancelled) {
                    setScreenPhase("intro");
                }
            } catch (err) {
                if (cancelled) return;
                console.error("Failed to load context:", err);
                setError(err instanceof Error ? err.message : "Failed to load context");
                setScreenPhase("error");
            }
        };

        void loadContext();

        return () => {
            cancelled = true;
        };
    }, [stepOneJobId, worldIdParam, questRunIdParam]);

    // Auto-start video generation after intro completes
    useEffect(() => {
        if (screenPhase !== "intro" || typedIntroLength < INTRO_TEXT.length) {
            return;
        }

        const timer = setTimeout(() => {
            void startVideoGeneration();
        }, 2000);

        return () => clearTimeout(timer);
    }, [screenPhase, typedIntroLength]);

    const startVideoGeneration = useCallback(async () => {
        if (!worldId) {
            setError("Missing worldId parameter");
            setScreenPhase("error");
            return;
        }

        setScreenPhase("generating");

        try {
            // Call backend to analyze planet folder and generate video instructions
            const analysisResponse = await fetch("/api/demo/step-5/analyze-and-generate-video", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    worldId,
                    stepOneJobId: stepOneJobId || undefined,
                }),
            });

            if (!analysisResponse.ok) {
                throw new Error(`Failed to analyze planet context: ${analysisResponse.status}`);
            }

            const analysisResult = await analysisResponse.json();
            
            if (analysisResult.jobId) {
                setVideoArtifact(prev => ({ ...prev, jobId: analysisResult.jobId }));

                // Wait for the video generation job to complete
                const detail = await waitForJob(analysisResult.jobId);

                if (detail.result?.artifact?.video?.url) {
                    const newArtifact = {
                        videoUrl: detail.result.artifact.video.url,
                        posterUrl: detail.result.artifact.poster?.url,
                        jobId: analysisResult.jobId,
                        status: "ready" as const,
                    };
                    setVideoArtifact(newArtifact);

                    // Save artifact with both stepOneJobId and worldId for redundancy
                    const savePromises = [];
                    
                    if (stepOneJobId) {
                        savePromises.push(
                            fetch(`/api/demo/step-5/artifact`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    stepOneJobId,
                                    ...newArtifact,
                                }),
                            })
                        );
                    }
                    
                    if (worldId) {
                        savePromises.push(
                            fetch(`/api/demo/step-5/artifact`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    worldId,
                                    ...newArtifact,
                                }),
                            })
                        );
                    }

                    await Promise.all(savePromises);
                    console.log("✓ Video artifact saved");

                    setScreenPhase("ready");
                } else {
                    setVideoArtifact({ status: "error" });
                    setError("Video generation failed");
                    setScreenPhase("error");
                }
            } else {
                throw new Error("No job ID returned from analysis");
            }
        } catch (err) {
            console.error("Failed to generate video:", err);
            setError(err instanceof Error ? err.message : "Failed to generate video");
            setVideoArtifact({ status: "error" });
            setScreenPhase("error");
        }
    }, [stepOneJobId, worldId, waitForJob]);

    const handleContinue = useCallback(() => {
        navigate(`/demo/6?${searchParams.toString()}`);
    }, [navigate, searchParams]);

    if (screenPhase === "loading") {
        return (
            <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
                <div className="w-full max-w-[720px] rounded-[28px] border border-white/10 bg-[linear-gradient(160deg,rgba(9,13,21,0.92),rgba(4,7,13,0.88))] px-8 py-10 shadow-[0_32px_100px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
                    <div className="flex items-center gap-4 text-[#d7eaf4]">
                        <LoaderCircle className="h-5 w-5 animate-spin text-emerald-400" />
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-400/80">Quest Complete</div>
                            <div className="mt-1 text-sm text-slate-200">Loading your victory celebration...</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (screenPhase === "error") {
        return (
            <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
                <div className="w-full max-w-[720px] rounded-[28px] border border-red-400/15 bg-[linear-gradient(160deg,rgba(18,10,12,0.94),rgba(7,4,6,0.92))] px-8 py-10 shadow-[0_32px_100px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
                    <div className="text-[10px] font-black uppercase tracking-[0.28em] text-red-200/60">Error</div>
                    <div className="mt-4 text-sm leading-6 text-red-50">{error || "Failed to generate victory video"}</div>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        className="mt-6 inline-flex items-center rounded-full border border-red-200/20 bg-red-200/10 px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.24em] text-red-50 transition-all hover:border-red-200/35 hover:bg-red-200/16"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    if (screenPhase === "intro") {
        return (
            <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
                <div className="w-full max-w-[820px] rounded-[32px] border border-emerald-500/20 bg-[linear-gradient(160deg,rgba(9,13,21,0.92),rgba(4,7,13,0.88))] px-8 py-8 shadow-[0_36px_120px_rgba(0,0,0,0.46)] backdrop-blur-3xl">
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-400/80">Quest Complete</div>
                    <div className="mt-3 text-[30px] font-black uppercase leading-[0.98] tracking-[0.03em] text-white">
                        Victory Achieved
                    </div>
                    <div className="mt-5 rounded-[22px] border border-white/8 bg-black/20 px-5 py-5">
                        <p className="whitespace-pre-wrap text-[14px] leading-7 text-slate-200">
                            {INTRO_TEXT.slice(0, typedIntroLength)}
                            {typedIntroLength < INTRO_TEXT.length && (
                                <span className="ml-1 inline-block h-[1.05em] w-[2px] animate-pulse bg-emerald-400/80 align-[-0.18em]" />
                            )}
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (screenPhase === "generating") {
        return (
            <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
                <div className="w-full max-w-[720px] rounded-[28px] border border-emerald-500/20 bg-[linear-gradient(160deg,rgba(9,13,21,0.92),rgba(4,7,13,0.88))] px-8 py-10 shadow-[0_32px_100px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
                    <div className="space-y-4">
                        <div className="flex items-center gap-4 text-[#d7eaf4]">
                            <LoaderCircle className="h-5 w-5 animate-spin text-emerald-400" />
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-400/80">Generating Victory Video</div>
                                <div className="mt-1 text-sm text-slate-200">Creating your personalized victory celebration...</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (screenPhase === "ready" && videoArtifact.videoUrl) {
        return (
            <div className="relative z-10 flex h-full w-full items-center justify-center px-6 py-8">
                <div className="w-full max-w-[1000px] space-y-6">
                    {/* Video Player */}
                    <div className="rounded-[24px] border border-emerald-500/20 bg-black overflow-hidden shadow-[0_32px_100px_rgba(0,0,0,0.6)]">
                        <video
                            src={videoArtifact.videoUrl}
                            poster={videoArtifact.posterUrl}
                            controls
                            autoPlay
                            loop
                            className="w-full h-auto"
                        />
                    </div>

                    {/* Continue Button */}
                    <div className="flex justify-center">
                        <button
                            type="button"
                            onClick={handleContinue}
                            className="rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/20 via-emerald-600/15 to-emerald-700/20 px-8 py-4 text-center font-black uppercase tracking-widest text-emerald-100 transition-all hover:bg-emerald-500/30 hover:border-emerald-400/50 hover:shadow-[0_12px_48px_rgba(16,185,129,0.25)]"
                        >
                            Continue
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
