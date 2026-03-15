import { useEffect, useState } from "react";
import { Navigate, useSearchParams, useParams } from "react-router-dom";
import { Button } from "@ashtrail/ui";
import { DemoPlanetScreen } from "./DemoPlanetScreen";
import { DemoStepTwoPage } from "./DemoStepTwoPage";
import { DEMO_STEP_ONE_ROUTE } from "../lib/routes";
import { DemoFlowContext, type DemoPlanetView } from "./DemoFlowContext";
import { DemoPlanetStage } from "./DemoPlanetStage";

export function DemoFlowPage() {
    const { step } = useParams<{ step: string }>();
    const [searchParams] = useSearchParams();
    const [planetTexture, setPlanetTexture] = useState<string | null>(searchParams.get("planetTexture"));
    const [planetView, setPlanetView] = useState<DemoPlanetView>("hidden");

    useEffect(() => {
        setPlanetTexture(searchParams.get("planetTexture"));
    }, [searchParams]);

    const contextValue = {
        setPlanetAsset: ({ textureUrl }: { textureUrl?: string | null; title?: string | null }) => {
            setPlanetTexture(textureUrl || null);
        },
        setPlanetView,
    };

    switch (step) {
        case "1":
            return (
                <DemoFlowContext.Provider value={contextValue}>
                    <div className="relative h-screen w-full overflow-hidden bg-black">
                        <style>{`
                            @keyframes demo-flow-panel-settle {
                                0% {
                                    opacity: 0;
                                    transform: translateY(26px) scale(0.985);
                                    filter: blur(10px) brightness(0.7);
                                }
                                100% {
                                    opacity: 1;
                                    transform: translateY(0) scale(1);
                                    filter: blur(0) brightness(1);
                                }
                            }
                            .animate-demo-panel-settle {
                                animation: demo-flow-panel-settle 900ms cubic-bezier(0.22, 1, 0.36, 1) both;
                            }
                        `}</style>
                        <DemoPlanetStage textureUrl={planetTexture} view={planetView} />
                        <DemoPlanetScreen />
                    </div>
                </DemoFlowContext.Provider>
            );
        case "2":
            return (
                <DemoFlowContext.Provider value={contextValue}>
                    <div className="relative h-screen w-full overflow-hidden bg-black">
                        <style>{`
                            @keyframes demo-flow-panel-settle {
                                0% {
                                    opacity: 0;
                                    transform: translateY(26px) scale(0.985);
                                    filter: blur(10px) brightness(0.7);
                                }
                                100% {
                                    opacity: 1;
                                    transform: translateY(0) scale(1);
                                    filter: blur(0) brightness(1);
                                }
                            }
                            .animate-demo-panel-settle {
                                animation: demo-flow-panel-settle 900ms cubic-bezier(0.22, 1, 0.36, 1) both;
                            }
                        `}</style>
                        <DemoPlanetStage textureUrl={planetTexture} view={planetView} />
                        <DemoStepTwoPage />
                    </div>
                </DemoFlowContext.Provider>
            );
        case "3":
            return (
                <DemoFlowContext.Provider value={contextValue}>
                    <div className="relative h-screen w-full overflow-hidden bg-black">
                        <DemoPlanetStage textureUrl={planetTexture} view={planetView} />
                        <div className="relative z-10 flex h-full items-center justify-center px-6 py-10">
                            <div className="w-full max-w-3xl rounded-[32px] border border-white/10 bg-black/35 px-8 py-12 text-center shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-md md:px-12">
                                <div className="text-[11px] font-black uppercase tracking-[0.34em] text-cyan-200">
                                    Demo Step Three
                                </div>
                                <h2 className="mt-5 text-balance text-3xl font-semibold tracking-[0.08em] text-white md:text-5xl">
                                    The next sequence is reserved for the following demo beat.
                                </h2>
                                <p className="mx-auto mt-6 max-w-2xl text-base leading-8 tracking-[0.02em] text-slate-200 md:text-lg">
                                    Step two now hands off cleanly into the continuing flow. This placeholder keeps the navigation coherent until the third scene is authored.
                                </p>
                                <div className="mt-10 flex justify-center">
                                    <Button
                                        size="lg"
                                        variant="glass"
                                        onClick={() => window.history.back()}
                                        className="group relative min-w-[240px] overflow-hidden rounded px-0 py-6 text-sm font-black tracking-[0.55em] transition-all duration-450 bg-white/[0.03] hover:bg-white/[0.08]"
                                    >
                                        <span className="relative z-10 flex translate-x-[0.28em] items-center justify-center drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-all duration-1000 group-hover:scale-105 group-hover:text-white">
                                            RETURN
                                        </span>
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                </DemoFlowContext.Provider>
            );
        default:
            return <Navigate replace to={DEMO_STEP_ONE_ROUTE} />;
    }
}
