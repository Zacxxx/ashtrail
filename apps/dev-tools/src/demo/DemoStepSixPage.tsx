import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useDemoFlow } from "./DemoFlowContext";
import { useActiveWorld } from "../hooks/useActiveWorld";

export function DemoStepSixPage() {
    const { setPlanetView } = useDemoFlow();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { setActiveWorldId } = useActiveWorld();
    
    const worldId = searchParams.get("worldId");

    useEffect(() => {
        setPlanetView("stepThreeIntro");
    }, [setPlanetView]);

    const handleExploreDevTools = () => {
        if (worldId) {
            // Set the active world so it's pre-selected in dev-tools
            setActiveWorldId(worldId);
        }
        navigate("/devtools");
    };

    return (
        <div className="relative z-10 flex h-full w-full items-center justify-center px-6 py-8 overflow-y-auto">
            <div className="w-full max-w-[900px] rounded-[28px] border border-emerald-500/20 bg-[linear-gradient(160deg,rgba(9,13,21,0.92),rgba(4,7,13,0.88))] px-10 py-12 shadow-[0_32px_100px_rgba(0,0,0,0.45)] backdrop-blur-3xl my-8">
                <div className="space-y-8">
                    {/* Header */}
                    <div className="text-center space-y-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-400/80">
                            Thank You, Google
                        </div>
                        <h1 className="text-4xl font-black text-white leading-tight">
                            Ashtrail: A Vision for AI-Driven Worldbuilding
                        </h1>
                    </div>

                    {/* Content */}
                    <div className="space-y-6 text-gray-200 leading-relaxed">
                        <p className="text-lg">
                            Ashtrail demonstrates how AI can transform game development by enabling developers to build 
                            coherent, expansive game worlds through intelligent tooling. Every aspect of this demo—from 
                            planetary generation to quest narratives to this victory video—was created using Google's Gemini SDK.
                        </p>

                        <p className="text-lg">
                            We believe AI should enhance creativity, not replace it. Ashtrail's dev-tools ecosystem empowers 
                            developers to focus on creative direction while AI handles content generation, always maintaining 
                            coherence with established world canon.
                        </p>

                        <p className="text-lg font-semibold text-emerald-300">
                            Everything you just experienced—the planet, character, locations, quest, and this video—is fully 
                            editable in our dev-tools. We encourage you to explore, modify, and experiment with the world 
                            you've created!
                        </p>
                    </div>

                    {/* Explore Button */}
                    <div className="pt-6">
                        <button
                            type="button"
                            onClick={handleExploreDevTools}
                            className="w-full rounded-2xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/20 via-cyan-600/15 to-cyan-700/20 px-8 py-5 text-center font-black uppercase tracking-widest text-cyan-100 transition-all hover:bg-cyan-500/30 hover:border-cyan-400/50 hover:shadow-[0_12px_48px_rgba(6,182,212,0.25)]"
                        >
                            Explore Dev-Tools
                        </button>
                    </div>

                    {/* Footer */}
                    <div className="pt-8 border-t border-white/10 text-center space-y-4">
                        <p className="text-sm text-gray-400">
                            Built with Bun, React, Tailwind, and Rust • Powered by Gemini
                        </p>
                        <p className="text-lg font-semibold text-emerald-300">
                            Thank you for experiencing Ashtrail.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
