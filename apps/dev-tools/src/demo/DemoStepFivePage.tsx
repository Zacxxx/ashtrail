import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useDemoFlow } from "./DemoFlowContext";

export function DemoStepFivePage() {
    const [searchParams] = useSearchParams();
    const { setPlanetView } = useDemoFlow();

    useEffect(() => {
        setPlanetView("hidden");
    }, [setPlanetView]);

    return (
        <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
            <div className="w-full max-w-[720px] rounded-[28px] border border-emerald-500/20 bg-[linear-gradient(160deg,rgba(9,13,21,0.92),rgba(4,7,13,0.88))] px-8 py-10 shadow-[0_32px_100px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
                <div className="text-center space-y-6">
                    <div className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-400/80">
                        Quest Complete
                    </div>
                    <h1 className="text-4xl font-black text-white">
                        Your Journey Continues
                    </h1>
                    <p className="text-lg text-gray-300 leading-relaxed">
                        You've completed this chapter of your adventure. The story continues...
                    </p>
                </div>
            </div>
        </div>
    );
}
