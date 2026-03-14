import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Container, ScreenShell, Stack } from "@ashtrail/ui";
import { HOME_IMAGE_URL } from "./assets";
import { useHomepageAudio } from "./useHomepageAudio";
import { DEMO_STEP_ONE_ROUTE } from "../lib/routes";

type TransitionDocument = Document & {
    startViewTransition?: (update: () => void | Promise<void>) => unknown;
};

export function DemoLandingPage() {
    useHomepageAudio(true);
    const navigate = useNavigate();
    const [phase, setPhase] = useState<"landing" | "transition">("landing");
    const navigationTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (navigationTimeoutRef.current !== null) {
                window.clearTimeout(navigationTimeoutRef.current);
            }
        };
    }, []);

    const launch = () => {
        if (phase !== "landing") return;
        setPhase("transition");

        if (navigationTimeoutRef.current !== null) {
            window.clearTimeout(navigationTimeoutRef.current);
        }

        navigationTimeoutRef.current = window.setTimeout(() => {
            const performNavigation = () => {
                navigate(DEMO_STEP_ONE_ROUTE, {
                    state: { fromLaunch: true },
                });
            };

            try {
                const transitionApi = (document as TransitionDocument).startViewTransition;
                if (transitionApi) {
                    transitionApi.call(document, performNavigation);
                    return;
                }
            } catch {
                // Fall back to standard navigation if the browser exposes the API
                // but rejects invocation semantics.
            }

            performNavigation();
        }, 420);
    };

    return (
        <ScreenShell>
            <img
                src={HOME_IMAGE_URL}
                alt=""
                loading="eager"
                decoding="async"
                className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-all duration-[520ms] ease-[cubic-bezier(0.19,1,0.22,1)] ${
                    phase === "landing" ? "scale-100 opacity-[0.88]" : "scale-[1.08] opacity-[0.3]"
                }`}
            />
            <div className={`pointer-events-none absolute inset-0 transition-opacity duration-[480ms] ${
                phase === "landing"
                    ? "opacity-100 bg-[linear-gradient(180deg,rgba(6,9,12,0.04)_0%,rgba(6,9,12,0.10)_48%,rgba(6,9,12,0.18)_100%)]"
                    : "opacity-100 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.16),_transparent_24%),linear-gradient(180deg,rgba(6,9,12,0.12)_0%,rgba(6,9,12,0.42)_48%,rgba(6,9,12,0.88)_100%)]"
            }`} />
            <div className={`pointer-events-none absolute inset-0 transition-all duration-[440ms] ${
                phase === "transition"
                    ? "opacity-100 bg-[radial-gradient(circle_at_50%_58%,rgba(255,255,255,0.14),transparent_16%),radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.08),transparent_22%),radial-gradient(circle_at_80%_28%,rgba(255,255,255,0.08),transparent_20%)]"
                    : "opacity-0"
            }`} />
            <div className={`pointer-events-none absolute inset-0 mix-blend-soft-light transition-opacity duration-[440ms] ${
                phase === "transition" ? "opacity-[0.12]" : "opacity-[0.06]"
            }`}
                style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180' viewBox='0 0 180 180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.78' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='0.85'/%3E%3C/svg%3E")`,
                    backgroundSize: "220px 220px",
                }}
            />

            <Container centered className={`relative z-10 flex flex-col items-center gap-24 text-center transition-all duration-[420ms] ${
                phase === "transition" ? "translate-y-8 opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
            }`}>
                <Stack gap={4} className="animate-in fade-in slide-in-from-top-4 duration-1000">
                    <h1 className="mono scale-y-110 text-[10vw] font-black italic uppercase leading-none tracking-tighter text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                        ASHTRAIL
                    </h1>
                </Stack>

                <Stack gap={6} className="w-[480px] animate-in fade-in slide-in-from-bottom-4 items-center duration-1000 delay-300">
                    <Button
                        size="lg"
                        variant="glass"
                        onClick={launch}
                        className={`group relative w-full overflow-hidden rounded px-0 py-12 text-3xl font-black tracking-[1.4em] transition-all duration-450 ${
                            phase === "transition"
                                ? "bg-white/[0.12] scale-[1.03] shadow-[0_0_80px_rgba(255,255,255,0.18)]"
                                : "bg-white/[0.03] hover:bg-white/[0.08]"
                        }`}
                    >
                        <div className={`pointer-events-none absolute inset-0 transition-opacity duration-450 ${
                            phase === "transition" ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        }`}>
                            <div className={`absolute -bottom-1/2 left-1/2 w-[140%] -translate-x-1/2 rounded-[45%] bg-white/[0.12] blur-[80px] transition-all duration-[520ms] ease-[cubic-bezier(0.19,1,0.22,1)] ${
                                phase === "transition" ? "h-[220%]" : "h-0 group-hover:h-[200%]"
                            }`} />
                            <div className={`absolute top-1/2 left-1/4 h-32 w-32 rounded-full bg-white/20 blur-[40px] animate-pulse transition-all duration-[500ms] ${
                                phase === "transition" ? "-translate-y-28 scale-[1.8]" : "group-hover:-translate-y-24 group-hover:scale-150"
                            }`} />
                            <div className={`absolute top-1/2 right-1/4 h-40 w-40 rounded-full bg-white/10 blur-[60px] animate-pulse delay-500 transition-all duration-[560ms] ${
                                phase === "transition" ? "-translate-y-36 scale-[1.4]" : "group-hover:-translate-y-32 group-hover:scale-125"
                            }`} />
                            <div className={`absolute top-[80%] left-[20%] h-1 w-1 rounded-full bg-white blur-[1px] transition-all duration-[440ms] ${
                                phase === "transition" ? "-translate-y-40 opacity-0" : "group-hover:-translate-y-40 group-hover:opacity-0"
                            }`} />
                            <div className={`absolute top-[90%] left-[60%] h-1.5 w-1.5 rounded-full bg-white blur-[2px] transition-all delay-200 duration-[460ms] ${
                                phase === "transition" ? "-translate-y-48 opacity-0" : "group-hover:-translate-y-48 group-hover:opacity-0"
                            }`} />
                            <div className={`absolute top-[85%] left-[80%] h-1 w-1 rounded-full bg-white blur-[1px] transition-all delay-400 duration-[420ms] ${
                                phase === "transition" ? "-translate-y-32 opacity-0" : "group-hover:-translate-y-32 group-hover:opacity-0"
                            }`} />
                        </div>

                        <div className={`pointer-events-none absolute inset-x-0 bottom-0 scale-150 rounded-full bg-white/5 blur-3xl transition-all duration-[460ms] ease-out ${
                            phase === "transition" ? "h-full opacity-100" : "h-0 opacity-0 group-hover:h-full group-hover:opacity-100"
                        }`} />
                        <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-420 ease-out ${
                            phase === "transition" ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                        }`} />

                        <span className="relative z-10 flex translate-x-[0.7em] items-center justify-center drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all duration-1000 group-hover:scale-105 group-hover:text-white">
                            LAUNCH
                        </span>
                    </Button>
                </Stack>

                <div className="mt-8 opacity-40">
                    <div className="mx-auto h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]" />
                </div>
            </Container>

            <div className={`pointer-events-none absolute inset-0 z-[15] transition-all duration-[420ms] ${
                phase === "transition" ? "opacity-100" : "opacity-0"
            }`}>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.08),_transparent_20%),linear-gradient(90deg,rgba(255,255,255,0.04)_0%,transparent_40%,transparent_60%,rgba(255,255,255,0.04)_100%)] blur-lg" />
            </div>
        </ScreenShell>
    );
}
