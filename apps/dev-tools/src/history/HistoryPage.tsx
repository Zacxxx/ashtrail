import { useState, useEffect } from "react";
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
import { useActiveWorld } from "../hooks/useActiveWorld";

export type HistoryTab = "lore" | "regions" | "locations" | "factions" | "characters" | "timeline" | "temporality";

export function HistoryPage() {
    const [activeTab, setActiveTab] = useState<HistoryTab>("lore");
    const [selectedWorld, setSelectedWorld] = useState<GenerationHistoryItem | null>(null);
    const [showGalleryModal, setShowGalleryModal] = useState(false);
    const { history, deleteFromHistory, renameInHistory } = useGenerationHistory();
    const { activeWorldId, setActiveWorldId } = useActiveWorld();

    // Sync selectedWorld with activeWorldId
    useEffect(() => {
        if (activeWorldId && !selectedWorld) {
            const world = history.find(h => h.id === activeWorldId);
            if (world) setSelectedWorld(world);
        }
    }, [activeWorldId, history, selectedWorld]);

    // Update activeWorldId when selectedWorld changes
    const handleSelectWorld = (world: GenerationHistoryItem) => {
        setSelectedWorld(world);
        setActiveWorldId(world.id);
    };

    return (
        <div className="h-screen overflow-hidden bg-[#070b12] text-gray-300 font-sans flex flex-col">
            {/* ══ Tool-Specific Sub-Header ══ */}
            <div className="fixed top-16 left-0 right-0 z-30 bg-[#030508]/60 backdrop-blur-md border-b border-white/5 pointer-events-auto flex items-center justify-between px-6 h-12 shadow-2xl">
                <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-red-500/20 text-red-400 font-bold text-[10px] border border-red-500/30">
                        📜
                    </div>
                    <h1 className="text-[10px] font-black tracking-[0.3em] text-white uppercase">HISTORY GENERATOR</h1>
                </div>

                <div className="flex-1 max-w-2xl px-8 scale-90">
                    <TabBar
                        tabs={["lore", "regions", "locations", "factions", "characters", "timeline", "temporality"]}
                        activeTab={activeTab}
                        onTabChange={(tab) => setActiveTab(tab as HistoryTab)}
                    />
                </div>

                <div className="w-32 shrink-0" /> {/* Spacer */}
            </div>

            <div className="pt-28 flex-1 flex flex-col overflow-hidden">

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
                                handleSelectWorld(item);
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
        </div>
    );
}
