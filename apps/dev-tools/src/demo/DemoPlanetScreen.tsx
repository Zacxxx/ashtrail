import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@ashtrail/ui";
import { ImageGlobe } from "../components/ImageGlobe";
import { useGenerationHistory } from "../hooks/useGenerationHistory";

const FALLBACK_TEXTURE_URL = "/api/upscale/upscaled_dd2a0f74-1cc5-4267-a130-896ed4b4b483.png";
const CRAWL_DELAY_MS = 2000;
const CRAWL_DURATION_MS = 54000;

type CrawlPhase = "delay" | "running" | "reading";

export function DemoPlanetScreen() {
    const location = useLocation();
    const { history } = useGenerationHistory();
    const enteredFromLaunch = Boolean((location.state as { fromLaunch?: boolean } | null)?.fromLaunch);
    const [crawlPhase, setCrawlPhase] = useState<CrawlPhase>("delay");

    const latestWorld = history[0] ?? null;
    const textureUrl = latestWorld?.textureUrl || FALLBACK_TEXTURE_URL;
    const worldLabel = latestWorld?.name || "Orbital Survey";
    const summary = "A surveyed terrestrial world ready for narrative framing, exploration inserts, and world-state orchestration.";

    const crawlCopy = useMemo(() => [
        summary,
        "A solitary world turns under silent observation while the first story fragments assemble out of the generated terrain.",
        "Settlements, hazards, factions, and memory structures wait below the cloudline for the next demo beat to activate them.",
        "This panel is now the narrative crawl surface for the showcase sequence.",
    ], []);

    const readableCopy = useMemo(() => [
        summary,
        "A solitary world turns under silent observation while the first story fragments assemble out of the generated terrain.",
        "Settlements, hazards, factions, and memory structures wait below the cloudline for the next demo beat to activate them.",
        "This panel is now the narrative reading surface for the showcase sequence, so the audience can pause and read after the crawl completes.",
    ], []);
    const crawlStartTransform = "rotateX(16deg) translate3d(0, 28%, 0) scale(1.02)";

    useEffect(() => {
        setCrawlPhase("delay");

        const startTimeout = window.setTimeout(() => {
            setCrawlPhase("running");
        }, CRAWL_DELAY_MS);

        return () => {
            window.clearTimeout(startTimeout);
        };
    }, []);

    useEffect(() => {
        if (crawlPhase !== "running") return;

        const doneTimeout = window.setTimeout(() => {
            setCrawlPhase("reading");
        }, CRAWL_DURATION_MS);

        return () => {
            window.clearTimeout(doneTimeout);
        };
    }, [crawlPhase]);

    return (
        <div className="relative h-screen w-full overflow-hidden bg-[#1e1e1e] text-gray-200">
            <style>{`
                @keyframes demo-star-crawl {
                    0% {
                        transform: rotateX(16deg) translate3d(0, 28%, 0) scale(1.02);
                    }
                    100% {
                        transform: rotateX(16deg) translate3d(0, -138%, 0) scale(0.78);
                    }
                }
            `}</style>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_28%_42%,rgba(110,176,255,0.08),transparent_18%),radial-gradient(circle_at_top_left,_rgba(94,234,212,0.08),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.08),_transparent_34%),linear-gradient(180deg,#02050a_0%,#07101a_46%,#03060b_100%)]" />
            <div className="absolute inset-0 opacity-70 [background-image:radial-gradient(circle_at_12%_18%,rgba(255,255,255,0.95)_0,rgba(255,255,255,0.95)_1px,transparent_1.5px),radial-gradient(circle_at_74%_26%,rgba(255,255,255,0.8)_0,rgba(255,255,255,0.8)_1px,transparent_1.5px),radial-gradient(circle_at_58%_68%,rgba(255,255,255,0.75)_0,rgba(255,255,255,0.75)_1px,transparent_1.5px),radial-gradient(circle_at_84%_82%,rgba(255,255,255,0.7)_0,rgba(255,255,255,0.7)_1px,transparent_1.5px),radial-gradient(circle_at_32%_78%,rgba(255,255,255,0.85)_0,rgba(255,255,255,0.85)_1px,transparent_1.5px)] [background-size:340px_340px,420px_420px,520px_520px,460px_460px,380px_380px]" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.05)_0%,rgba(0,0,0,0.02)_36%,rgba(0,0,0,0.18)_100%)]" />
            <div className={`relative z-10 grid h-full w-full grid-cols-1 gap-8 px-6 py-12 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:px-10 md:py-16 xl:px-14 xl:py-20 ${enteredFromLaunch ? "animate-in fade-in duration-700" : ""
                }`}>
                <div className={`relative min-h-[420px] min-w-0 overflow-hidden ${enteredFromLaunch ? "animate-in fade-in slide-in-from-left-6 duration-700" : ""
                    }`}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_42%_46%,rgba(17,24,39,0.18),rgba(0,0,0,0)_44%)]" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_50%,rgba(97,171,255,0.12),transparent_30%)] blur-3xl" />
                    <ImageGlobe textureUrl={textureUrl} transparentBackground />
                </div>

                <div className={`relative min-h-[420px] min-w-0 overflow-hidden ${enteredFromLaunch ? "animate-in fade-in slide-in-from-right-6 duration-500" : ""
                    }`}>
                    <div className="relative h-full overflow-hidden [perspective:1200px]">
                        <div className={`absolute inset-0 transition-opacity duration-700 ${crawlPhase === "reading" ? "opacity-0 pointer-events-none" : "opacity-100"
                            }`}>
                            <div className="absolute inset-x-[6%] top-[30%] h-[118%] [transform-style:preserve-3d]">
                                <div
                                    className="origin-center text-center font-black uppercase tracking-[0.16em] text-[#f6d37a] drop-shadow-[0_0_14px_rgba(246,211,122,0.18)]"
                                    style={{
                                        animation: crawlPhase === "running" ? `demo-star-crawl ${CRAWL_DURATION_MS}ms linear forwards` : "none",
                                        transform: crawlPhase === "delay" ? crawlStartTransform : undefined,
                                        opacity: 1,
                                    }}
                                >
                                    <div className="mb-10 text-[0.78rem] tracking-[0.5em] text-[#f1c765]">
                                        Demo Sequence One
                                    </div>
                                    <div className="mx-auto mb-8 max-w-[12ch] text-4xl leading-none md:text-5xl">
                                        {worldLabel}
                                    </div>
                                    <div className="mx-auto max-w-[22ch] space-y-8 text-lg leading-[1.9] md:text-[1.55rem]">
                                        {crawlCopy.map((line) => (
                                            <p key={line}>{line}</p>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={`relative flex h-full flex-col rounded-[28px] border border-[#f1c765]/15 bg-black/12 px-6 py-8 backdrop-blur-[2px] transition-all duration-700 md:px-8 ${crawlPhase === "reading" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
                            }`}>
                            <div className="mb-6 flex items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-3xl font-black uppercase tracking-[0.18em] text-[#f6d37a] drop-shadow-[0_0_14px_rgba(246,211,122,0.16)] md:text-4xl">
                                        {worldLabel}
                                    </h2>
                                </div>
                                <Button
                                    size="lg"
                                    variant="glass"
                                    className="group relative shrink-0 overflow-hidden rounded px-0 py-6 text-sm font-black tracking-[0.8em] transition-all duration-450 bg-white/[0.03] hover:bg-white/[0.08] min-w-[220px]"
                                >
                                    <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-450 group-hover:opacity-100">
                                        <div className="absolute -bottom-1/2 left-1/2 h-0 w-[140%] -translate-x-1/2 rounded-[45%] bg-white/[0.12] blur-[80px] transition-all duration-[520ms] ease-[cubic-bezier(0.19,1,0.22,1)] group-hover:h-[200%]" />
                                        <div className="absolute top-1/2 left-1/4 h-32 w-32 -translate-y-24 rounded-full bg-white/20 blur-[40px] transition-all duration-[500ms] group-hover:scale-150" />
                                        <div className="absolute top-1/2 right-1/4 h-40 w-40 -translate-y-32 rounded-full bg-white/10 blur-[60px] transition-all duration-[560ms] group-hover:scale-125" />
                                    </div>
                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-0 scale-150 rounded-full bg-white/5 opacity-0 blur-3xl transition-all duration-[460ms] ease-out group-hover:h-full group-hover:opacity-100" />
                                    <div className="absolute inset-x-0 top-0 h-px scale-x-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-420 ease-out group-hover:scale-x-100" />
                                    <span className="relative z-10 flex translate-x-[0.4em] items-center justify-center drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all duration-1000 group-hover:scale-105 group-hover:text-white">
                                        NEXT
                                    </span>
                                </Button>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto pr-2 text-[0.96rem] font-semibold uppercase leading-[1.65] tracking-[0.07em] text-[#f6d37a] drop-shadow-[0_0_10px_rgba(246,211,122,0.12)] md:pr-4 md:text-[0.96rem]">
                                <div className="space-y-4">
                                    {readableCopy.map((paragraph) => (
                                        <p key={paragraph}>{paragraph}</p>
                                    ))}
                                    <p>
                                        Use this mode as the post-crawl reading state. It is intentionally slower, static, and scrollable so the audience can catch up after the cinematic intro finishes.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
