import type { GenerationProgress } from "./types";

interface ProgressOverlayProps {
    genProgress: GenerationProgress;
}

export function ProgressOverlay({ genProgress }: ProgressOverlayProps) {
    if (!genProgress.isActive) return null;

    return (
        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none bg-black/40 backdrop-blur-sm">
            <div className="bg-[#1e1e1e]/80 backdrop-blur-2xl border border-[#E6E6FA]/40 rounded-3xl p-8 flex flex-col items-center gap-6 shadow-[0_0_50px_rgba(168,85,247,0.15)] min-w-[320px]">

                <div className="relative flex items-center justify-center">
                    <div className="absolute w-24 h-24 border border-[#E6E6FA]/20 rounded-full animate-[ping_3s_ease-in-out_infinite]" />
                    <svg className="w-20 h-20 -rotate-90 transform" viewBox="0 0 64 64">
                        <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                        <circle
                            cx="32" cy="32" r="28" fill="none"
                            stroke="#a855f7" strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray={`${genProgress.progress * 1.76} 176`}
                            className="transition-all duration-500 ease-out drop-shadow-[0_0_8px_rgba(168,85,247,0.8)]"
                        />
                    </svg>
                    <span className="absolute text-sm font-black text-white tracking-wider">
                        {genProgress.progress.toFixed(0)}<span className="text-[10px] text-[#E6E6FA] opacity-80">%</span>
                    </span>
                </div>

                <div className="flex flex-col items-center gap-2 w-full">
                    <span className="text-[11px] font-black tracking-[0.2em] text-[#E6E6FA] uppercase animate-pulse">{genProgress.stage}</span>
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden mt-2">
                        <div
                            className="h-full bg-gradient-to-r from-[#E6E6FA] via-[#E6E6FA] to-indigo-400 rounded-full transition-all duration-300"
                            style={{ width: `${genProgress.progress}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
