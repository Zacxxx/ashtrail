import React, { useState } from "react";
import { TabBar } from "@ashtrail/ui";
import { LocationExploration } from "./LocationExploration";

export function ExplorationView() {
    const [activeTab, setActiveTab] = useState<"location" | "world">("location");

    return (
        <div className="w-full h-full flex flex-col gap-6">
            <div className="flex justify-center">
                <TabBar
                    tabs={["location", "world"]}
                    activeTab={activeTab}
                    onTabChange={(id) => setActiveTab(id as "location" | "world")}
                    formatLabel={(tab) => tab === "location" ? "LOCATION EXPLORATION" : "WORLD EXPLORATION"}
                />
            </div>

            <div className="flex-1 min-h-0 bg-[#121820]/50 border border-white/5 rounded-2xl overflow-hidden backdrop-blur-sm">
                {activeTab === "location" ? (
                    <LocationExploration />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500 italic">
                        World Exploration is coming soon...
                    </div>
                )}
            </div>
        </div>
    );
}
