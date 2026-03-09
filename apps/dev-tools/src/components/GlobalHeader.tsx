import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useActiveWorld } from "../hooks/useActiveWorld";
import { useGenerationHistory } from "../hooks/useGenerationHistory";
import { WorldPickerModal } from "./WorldPickerModal";

export function GlobalHeader() {
    const { activeWorldId } = useActiveWorld();
    const { history } = useGenerationHistory();
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const location = useLocation();

    const selectedWorld = history.find(h => h.id === activeWorldId);
    const isHub = location.pathname === "/";

    return (
        <>
            <header className="fixed top-0 left-0 right-0 z-[100] bg-[#030508]/90 backdrop-blur-md border-b border-white/5 pointer-events-auto h-16 flex items-center justify-between px-6 w-full">
                {/* Left: Logo & Back Button */}
                <div className="flex items-center gap-6">
                    {!isHub && (
                        <Link to="/" className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-all">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        </Link>
                    )}
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-teal-500" />
                            <h1 className="text-xs font-black tracking-[0.3em] text-white uppercase">
                                ASHTRAIL <span className="text-gray-500 font-normal">| DEV TOOLS</span>
                            </h1>
                        </div>
                    </div>
                </div>

                {/* Right: World Selection */}
                <div className="flex items-center gap-4">
                    {selectedWorld && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-full shrink-0">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                            <span className="text-[10px] font-bold text-cyan-300 tracking-widest uppercase truncate max-w-[200px]">
                                {(selectedWorld.name || selectedWorld.prompt || 'Unknown World').substring(0, 40)}...
                            </span>
                        </div>
                    )}

                    <button
                        onClick={() => setIsPickerOpen(true)}
                        className={`flex items-center justify-center w-9 h-9 rounded-full border transition-all shadow-lg ${isPickerOpen ? 'bg-[#E6E6FA]/20 border-[#E6E6FA]/50 text-[#E6E6FA]' : 'bg-[#1e1e1e]/60 border-white/5 text-gray-400 hover:text-white hover:bg-white/5'}`}
                        title="Generation Gallery"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                    </button>
                </div>
            </header>

            <WorldPickerModal open={isPickerOpen} onClose={() => setIsPickerOpen(false)} />
        </>
    );
}
