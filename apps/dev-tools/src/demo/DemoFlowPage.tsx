import { useEffect, useState } from "react";
import { Navigate, useSearchParams, useParams } from "react-router-dom";
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
        default:
            return <Navigate replace to={DEMO_STEP_ONE_ROUTE} />;
    }
}
