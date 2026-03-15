import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, ScreenShell } from "@ashtrail/ui";
import { useHomepageAudio } from "./useHomepageAudio";
import { useJobs } from "../jobs/useJobs";
import type { JobDetail } from "../jobs/types";
import { isDemoStepOneResult } from "../media/generatedMediaAudio";
import { DEMO_STEP_TWO_ROUTE, DEVTOOLS_ROUTES } from "../lib/routes";

export function DemoStepOneWalkthroughPage() {
    useHomepageAudio(false);
    const [searchParams] = useSearchParams();
    const { getJobDetail } = useJobs();
    const [detail, setDetail] = useState<JobDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const jobId = searchParams.get("jobId");

    useEffect(() => {
        if (!jobId) {
            setError("No demo step 1 job was provided.");
            return;
        }

        let cancelled = false;
        void getJobDetail(jobId)
            .then((next) => {
                if (cancelled) return;
                if (!next) {
                    setError("The demo step 1 job could not be loaded.");
                    return;
                }
                setDetail(next);
            })
            .catch((nextError: unknown) => {
                if (cancelled) return;
                setError(nextError instanceof Error ? nextError.message : "Failed to load the demo step 1 job.");
            });

        return () => {
            cancelled = true;
        };
    }, [getJobDetail, jobId]);

    const result = isDemoStepOneResult(detail?.result) ? detail.result : null;
    const stageHistory = (detail?.stageHistory ?? []).slice(0, 4);
    const imageUrl = result?.artifact.image?.url ?? null;
    const audioUrl = result?.artifact.audio?.url ?? null;

    return (
        <ScreenShell variant="technical">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(246,211,122,0.10),_transparent_30%),linear-gradient(180deg,#03060a_0%,#09111c_48%,#04070b_100%)]" />
            <div className="relative z-10 flex h-full w-full flex-col px-6 py-6 md:px-8 md:py-8 xl:px-12">
                <div className="mx-auto grid h-full w-full max-w-6xl grid-rows-[auto_auto_1fr_auto] gap-4">
                    <section className="text-center">
                        <div className="text-[11px] font-black uppercase tracking-[0.45em] text-[#f1c765]">Interleaved Walkthrough</div>
                        <h1 className="mt-3 text-3xl font-black uppercase tracking-[0.18em] text-white md:text-4xl">
                            One Job. One Scene Package.
                        </h1>
                        <p className="mx-auto mt-3 max-w-3xl text-sm leading-relaxed text-gray-300 md:text-base">
                            Ashtrail packages one planetary texture, one world-introduction text, and one song cue through a single tracked interleaved generation flow.
                        </p>
                    </section>

                    <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                        <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.34em] text-[#f1c765]">Problem Solved</div>
                            <div className="mt-4 space-y-3 text-sm leading-relaxed text-gray-200">
                                <p>Most demo pipelines split image, music, and narrative into disconnected generations that drift apart.</p>
                                <p>This step keeps those outputs synchronized inside one tracked orchestration flow, making the scene package coherent and inspectable.</p>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.26em]">
                                <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-gray-200">Image</div>
                                <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-gray-200">Lore</div>
                                <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-gray-200">Song</div>
                            </div>
                        </div>

                        <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.34em] text-[#f1c765]">Job Timeline</div>
                            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                {stageHistory.length === 0 && (
                                    <div className="text-sm text-gray-400">No stage history available.</div>
                                )}
                                {stageHistory.map((stage) => (
                                    <div key={`${stage.stage}-${stage.at}`} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="text-sm font-bold uppercase tracking-[0.18em] text-white">{stage.stage}</div>
                                            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#f1c765]">{stage.progress.toFixed(0)}%</div>
                                        </div>
                                        <div className="mt-2 text-xs uppercase tracking-[0.18em] text-gray-400">{stage.status}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="grid gap-4 lg:grid-cols-3">
                        <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f1c765]">Generated Image</div>
                            {imageUrl ? (
                                <img src={imageUrl} alt="" className="mt-3 h-32 w-full rounded-2xl object-cover" />
                            ) : (
                                <div className="mt-3 h-32 rounded-2xl border border-dashed border-white/10 bg-black/20" />
                            )}
                        </div>
                        <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f1c765]">Generated Lore</div>
                            <p className="mt-3 line-clamp-6 text-sm leading-relaxed text-gray-200">
                                {result?.artifact.loreText || detail?.error || error || "The lore output is not available yet."}
                            </p>
                        </div>
                        <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#f1c765]">Generated Song</div>
                            {audioUrl ? (
                                <audio controls className="mt-3 w-full">
                                    <source src={audioUrl} />
                                </audio>
                            ) : (
                                <div className="mt-3 text-sm text-gray-400">No audio asset is attached to this job.</div>
                            )}
                            <Link
                                to={`${DEVTOOLS_ROUTES.jobCenter}?jobId=${encodeURIComponent(jobId || "")}`}
                                className="mt-4 inline-flex text-[11px] font-black uppercase tracking-[0.24em] text-cyan-200 transition-colors hover:text-cyan-100"
                            >
                                Inspect In Job Center
                            </Link>
                        </div>
                    </section>

                <div className="flex justify-center pt-2">
                    <Link to={`${DEMO_STEP_TWO_ROUTE}${jobId ? `?jobId=${encodeURIComponent(jobId)}` : ""}`}>
                        <Button
                            size="lg"
                            variant="glass"
                            className="group relative min-w-[280px] overflow-hidden rounded px-0 py-6 text-sm font-black tracking-[0.9em] transition-all duration-450 bg-white/[0.03] hover:bg-white/[0.08]"
                        >
                            <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-450 group-hover:opacity-100">
                                <div className="absolute -bottom-1/2 left-1/2 h-0 w-[140%] -translate-x-1/2 rounded-[45%] bg-white/[0.12] blur-[80px] transition-all duration-[520ms] ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:h-[200%]" />
                            </div>
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0 scale-150 rounded-full bg-white/5 opacity-0 blur-3xl transition-all duration-[460ms] ease-out group-hover:h-full group-hover:opacity-100" />
                            <div className="absolute inset-x-0 top-0 h-px scale-x-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-420 ease-out group-hover:scale-x-100" />
                            <span className="relative z-10 flex translate-x-[0.5em] items-center justify-center drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all duration-1000 group-hover:scale-105 group-hover:text-white">
                                CONTINUE
                            </span>
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
        </ScreenShell>
    );
}
