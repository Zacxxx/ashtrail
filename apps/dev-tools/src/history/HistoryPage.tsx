import { useState } from "react";
import { Link } from "react-router-dom";
import { TabBar, Modal } from "@ashtrail/ui";

import { TimelineTab } from "./TimelineTab";
import { LoreTab } from "./LoreTab";
import { FactionsTab } from "./FactionsTab";
import { LocationsTab } from "./LocationsTab";
import { RegionsTab } from "./RegionsTab";
import { CharactersTab } from "./CharactersTab";
import { TemporalityTab } from "./TemporalityTab";
import { useGenerationHistory, type GenerationHistoryItem } from "../hooks/useGenerationHistory";
import { HistoryGallery } from "../worldgeneration/HistoryGallery";

export type HistoryTab = "lore" | "regions" | "locations" | "factions" | "characters" | "timeline" | "temporality";

export function HistoryPage() {
    const [activeTab, setActiveTab] = useState<HistoryTab>("lore");
    const [selectedWorld, setSelectedWorld] = useState<GenerationHistoryItem | null>(null);
    const [showGalleryModal, setShowGalleryModal] = useState(false);
    const { history, deleteFromHistory, renameInHistory } = useGenerationHistory();

    return (
        <div className="h-screen overflow-hidden bg-[#070b12] text-gray-300 font-sans p-8 flex flex-col">
            {/* Header */}
            <header className="mb-6 flex items-center gap-6 shrink-0 border-b border-white/5 pb-6">
                <div className="flex items-center gap-4">
                    <Link to="/" className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-all">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </Link>
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500 text-[#0a0f14] font-bold text-sm">
                        📜
                    </div>
                    <h1 className="text-xl font-bold tracking-[0.2em] text-gray-100 uppercase">
                        HISTORY GENERATOR
                    </h1>
                </div>

                <div className="h-8 border-l border-white/10 ml-2 pl-6 flex-1 max-w-2xl">
                    <TabBar
                        tabs={["lore", "regions", "locations", "factions", "characters", "timeline", "temporality"]}
                        activeTab={activeTab}
                        onTabChange={(tab) => setActiveTab(tab as HistoryTab)}
                    />
                </div>

                <div className="flex-1 flex justify-end items-center gap-4">
                    {/* Selected Planet Indicator */}
                    {selectedWorld && (
                        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-full shrink-0">
                            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                            <span className="text-[10px] font-bold text-cyan-300 tracking-widest uppercase truncate max-w-[200px]">{(selectedWorld.prompt || 'Unknown World').substring(0, 40)}...</span>
                        </div>
                    )}
                    {/* Gallery Toggle Button */}
                    <button
                        onClick={() => setShowGalleryModal(true)}
                        className="flex items-center justify-center w-9 h-9 rounded-full border transition-all shadow-lg bg-[#E6E6FA]/10 border-[#E6E6FA]/40 text-[#E6E6FA] hover:bg-[#E6E6FA]/20"
                        title="Pick World"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                    </button>
                </div>
            </header>

            {/* Tab Content Area */}
            {activeTab === "lore" && (
                <LoreTab
                    selectedWorld={selectedWorld}
                    onSelectWorld={setSelectedWorld}
                />
            )}
            {activeTab === "factions" && <FactionsTab selectedWorld={selectedWorld} setActiveTab={setActiveTab} />}
            {activeTab === "regions" && <RegionsTab selectedWorld={selectedWorld} />}
            {activeTab === "locations" && <LocationsTab selectedWorld={selectedWorld} setActiveTab={setActiveTab} />}
            {activeTab === "characters" && <CharactersTab selectedWorld={selectedWorld} setActiveTab={setActiveTab} />}
            {activeTab === "timeline" && <TimelineTab selectedWorld={selectedWorld} />}
            {activeTab === "temporality" && <TemporalityTab selectedWorld={selectedWorld} onSelectWorld={setSelectedWorld} />}

            {/* Gallery Modal */}
            <Modal open={showGalleryModal} onClose={() => setShowGalleryModal(false)} title="ARCHIVES - PICK A WORLD">
                <div className="w-[80vw] h-[75vh] max-w-[1200px] flex flex-col relative overflow-hidden ring-1 ring-white/10 shadow-2xl bg-black rounded-b-xl">
                    <HistoryGallery
                        history={history}
                        activePlanetId={selectedWorld?.id || null}
                        deleteFromHistory={deleteFromHistory}
                        onRenameWorld={renameInHistory}
                        onSelectPlanet={(item) => {
                            setSelectedWorld(item);
                            setShowGalleryModal(false);
                            if (activeTab === "timeline") {
                                setActiveTab("lore");
                            }
                        }}
                        onSelectTexture={() => { }}
                        showExtendedTabs={false}
                    />
                </div>
            </Modal>
        </div>
    );
}
