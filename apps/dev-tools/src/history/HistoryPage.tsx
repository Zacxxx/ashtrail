import { useState } from "react";
import { Link } from "react-router-dom";
import { TabBar } from "@ashtrail/ui";

import { TimelineTab } from "./TimelineTab";
import { WorldTab } from "./WorldTab";
import { FactionsTab } from "./FactionsTab";
import { AreasTab } from "./AreasTab";
import { CharactersTab } from "./CharactersTab";
import type { GenerationHistoryItem } from "../hooks/useGenerationHistory";

export type HistoryTab = "timeline" | "world" | "factions" | "areas" | "characters";

export function HistoryPage() {
    const [activeTab, setActiveTab] = useState<HistoryTab>("timeline");
    const [selectedWorld, setSelectedWorld] = useState<GenerationHistoryItem | null>(null);

    return (
        <div className="min-h-screen bg-[#070b12] text-gray-300 font-sans p-8 flex flex-col">
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
                        tabs={["timeline", "world", "factions", "areas", "characters"]}
                        activeTab={activeTab}
                        onTabChange={(tab) => setActiveTab(tab as HistoryTab)}
                    />
                </div>
            </header>

            {/* Tab Content Area */}
            {activeTab === "timeline" && <TimelineTab />}
            {activeTab === "world" && (
                <WorldTab
                    selectedWorld={selectedWorld}
                    onSelectWorld={setSelectedWorld}
                />
            )}
            {activeTab === "factions" && <FactionsTab />}
            {activeTab === "areas" && <AreasTab />}
            {activeTab === "characters" && <CharactersTab />}

        </div>
    );
}
