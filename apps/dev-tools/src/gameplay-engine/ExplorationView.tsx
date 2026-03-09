import React, { useState } from "react";
import { TabBar } from "@ashtrail/ui";
import { LocationExploration } from "./LocationExploration";
import { ExplorationSetup } from "./ExplorationSetup";
import { ExplorationMap } from "@ashtrail/core";

export function ExplorationView() {
    const [activeTab, setActiveTab] = useState<"location" | "world">("location");
    const [phase, setPhase] = useState<"setup" | "active">("setup");
    const [activeMap, setActiveMap] = useState<ExplorationMap | null>(null);
    const [selectedPawnId, setSelectedPawnId] = useState<string | null>(null);

    const handleStartExploration = (map: ExplorationMap, pawnId: string) => {
        setActiveMap(map);
        setSelectedPawnId(pawnId);
        setPhase("active");
    };

    const handleExit = () => {
        setPhase("setup");
        setActiveMap(null);
    };

    return (
        <div className="w-full h-full flex flex-col gap-6">
            {phase === "setup" && (
                <div className="flex justify-center">
                    <TabBar
                        tabs={["location", "world"]}
                        activeTab={activeTab}
                        onTabChange={(id) => setActiveTab(id as "location" | "world")}
                        formatLabel={(tab) => tab === "location" ? "LOCATION EXPLORATION" : "WORLD EXPLORATION"}
                    />
                </div>
            )}

            <div className="flex-1 min-h-0 bg-[#121212]/50 rounded-2xl border border-white/5 overflow-hidden">
                {activeTab === "location" ? (
                    phase === "setup" ? (
                        <ExplorationSetup onStart={handleStartExploration} />
                    ) : (
                        activeMap && (
                            <LocationExploration
                                initialMap={activeMap}
                                initialSelectedPawnId={selectedPawnId}
                                onExit={handleExit}
                            />
                        )
                    )
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500 font-bold tracking-widest text-[10px]">
                        WORLD EXPLORATION IS COMING SOON...
                    </div>
                )}
            </div>
        </div>
    );
}
