import React, { useState } from "react";
import { Trait, Occupation } from "@ashtrail/core";
import { TabBar } from "@ashtrail/ui";

interface CharacterRulePanelProps {
    traits: Trait[];
    setTraits: React.Dispatch<React.SetStateAction<Trait[]>>;
    occupations: Occupation[];
    setOccupations: React.Dispatch<React.SetStateAction<Occupation[]>>;
}

export function CharacterRulePanel({ traits, setTraits, occupations, setOccupations }: CharacterRulePanelProps) {
    const [activeTab, setActiveTab] = useState<"traits" | "occupations">("traits");

    // Stub handlers for adding new traits
    const handleAddMockTrait = () => {
        const newTrait: Trait = {
            id: `custom-trait-${Date.now()}`,
            name: "New Custom Trait",
            description: "A dynamically added trait for testing.",
            type: "positive",
            cost: 2,
            impact: "+1 to Strength"
        };
        setTraits(prev => [newTrait, ...prev]);
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="shrink-0 flex items-center justify-center p-1 bg-[#1e1e1e]/60 border border-white/5 rounded-2xl shadow-lg backdrop-blur-md">
                <TabBar
                    tabs={["traits", "occupations"]}
                    activeTab={activeTab}
                    onTabChange={(t) => setActiveTab(t as any)}
                />
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-none pb-12">
                <div className="bg-[#1e1e1e]/60 border border-white/5 rounded-2xl shadow-lg backdrop-blur-md p-4 flex flex-col gap-4">
                    <div className="flex justify-between items-center border-b border-white/10 pb-2">
                        <h2 className="text-sm font-black tracking-widest text-white uppercase">
                            {activeTab} Settings
                        </h2>
                    </div>

                    {activeTab === "traits" && (
                        <div className="space-y-4">
                            <button
                                onClick={handleAddMockTrait}
                                className="w-full py-2 bg-orange-500/10 text-orange-500 border border-orange-500/20 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-orange-500/20 transition-all font-mono"
                            >
                                + Add Mock Trait
                            </button>
                            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                                {traits.map(t => (
                                    <div key={t.id} className="p-3 bg-black/40 border border-white/5 rounded-lg flex flex-col gap-1">
                                        <div className="flex justify-between items-center">
                                            <span className={`text-xs font-bold uppercase ${t.type === 'positive' ? 'text-blue-400' : t.type === 'negative' ? 'text-red-400' : 'text-gray-400'}`}>{t.name}</span>
                                            <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-gray-300 font-mono">Cost: {t.cost}</span>
                                        </div>
                                        <p className="text-[10px] text-gray-500 leading-snug">{t.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {activeTab === "occupations" && (
                        <div className="space-y-4">
                            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                                {occupations.map(o => (
                                    <div key={o.id} className="p-3 bg-black/40 border border-white/5 rounded-lg flex flex-col gap-1">
                                        <span className="text-xs font-bold uppercase text-orange-400">{o.name}</span>
                                        <p className="text-[10px] text-gray-500 leading-snug">{o.description}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
