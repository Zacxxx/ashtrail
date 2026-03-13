import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { TabBar } from "@ashtrail/ui";
import { useActiveWorld } from "../hooks/useActiveWorld";
import { useGenerationHistory } from "../hooks/useGenerationHistory";
import { JobsDropdown } from "../jobs/JobsDropdown";
import { useJobs } from "../jobs/useJobs";
import { WorldPickerModal } from "./WorldPickerModal";

export function GlobalHeader() {
    const { activeWorldId } = useActiveWorld();
    const { history } = useGenerationHistory();
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const jobsRef = useRef<HTMLDivElement | null>(null);
    const { activeCount, isPanelOpen, setPanelOpen } = useJobs();

    const selectedWorld = history.find(h => h.id === activeWorldId);
    const isHub = location.pathname === "/";
    const isQuests = location.pathname === "/quests";
    const questTab = (() => {
        const tab = new URLSearchParams(location.search).get("tab");
        return tab === "run" || tab === "archive" ? tab : "seed";
    })();

    const questHeader = (
        <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/20 text-sm font-bold text-amber-300">
                🧭
            </div>
            <h1 className="text-[11px] font-black uppercase tracking-[0.3em] text-white">QUESTS</h1>
            <TabBar
                tabs={["seed", "run", "archive"]}
                activeTab={questTab}
                onTabChange={(tab) => navigate(`/quests?tab=${tab}`)}
                className="min-w-[290px]"
            />
        </div>
    );

    useEffect(() => {
        function handlePointerDown(event: MouseEvent) {
            if (!jobsRef.current?.contains(event.target as Node)) {
                setPanelOpen(false);
            }
        }
        if (!isPanelOpen) return;
        document.addEventListener("mousedown", handlePointerDown);
        return () => document.removeEventListener("mousedown", handlePointerDown);
    }, [isPanelOpen, setPanelOpen]);

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
                    {isQuests ? (
                        questHeader
                    ) : (
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-teal-500" />
                                <h1 className="text-xs font-black tracking-[0.3em] text-white uppercase">
                                    ASHTRAIL <span className="text-gray-500 font-normal">| DEV TOOLS</span>
                                </h1>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: World Selection */}
                <div className="flex items-center gap-4">
                    {selectedWorld && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-full shrink-0">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                            <span className="text-[10px] font-bold text-cyan-300 tracking-widest uppercase truncate max-w-[200px]">
                                {(() => {
                                    const label = selectedWorld.name || selectedWorld.prompt || "Unknown World";
                                    return label.length > 40 ? `${label.substring(0, 40)}...` : label;
                                })()}
                            </span>
                        </div>
                    )}

                    <div ref={jobsRef} className="relative">
                        <button
                            type="button"
                            onClick={() => setPanelOpen(!isPanelOpen)}
                            className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition-all shadow-lg ${activeCount > 0 ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-200" : "bg-[#1e1e1e]/60 border-white/5 text-gray-400 hover:text-white hover:bg-white/5"}`}
                            title="Job Center"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <rect x="7" y="7" width="10" height="10" rx="2" strokeWidth={2} />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 10.5h4v3h-4zM12 3v2M8 3v2M16 3v2M12 19v2M8 19v2M16 19v2M3 12h2M3 8h2M3 16h2M19 12h2M19 8h2M19 16h2" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10 13.5h4M12 10.5v3" />
                            </svg>
                            {activeCount > 0 && (
                                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-black text-black">
                                    {activeCount}
                                </span>
                            )}
                        </button>
                        {isPanelOpen && <JobsDropdown />}
                    </div>

                    {location.pathname !== "/worldgen" && (
                        <button
                            onClick={() => setIsPickerOpen(true)}
                            className={`flex items-center justify-center w-9 h-9 rounded-full border transition-all shadow-lg ${isPickerOpen ? 'bg-[#E6E6FA]/20 border-[#E6E6FA]/50 text-[#E6E6FA]' : 'bg-[#1e1e1e]/60 border-white/5 text-gray-400 hover:text-white hover:bg-white/5'}`}
                            title="Generation Gallery"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </button>
                    )}
                </div>
            </header>

            <WorldPickerModal open={isPickerOpen} onClose={() => setIsPickerOpen(false)} />
        </>
    );
}
