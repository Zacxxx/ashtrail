import React, { useState } from "react";
import { Trait, Occupation, Character, Item } from "@ashtrail/core";
import { TabBar } from "@ashtrail/ui";

export type RuleTab = "traits" | "occupations" | "characters" | "items";

interface CharacterRulePanelProps {
    traits: Trait[];
    setTraits: React.Dispatch<React.SetStateAction<Trait[]>>;
    occupations: Occupation[];
    setOccupations: React.Dispatch<React.SetStateAction<Occupation[]>>;
    characters: Character[];
    setCharacters: React.Dispatch<React.SetStateAction<Character[]>>;
    items: Item[];
    setItems: React.Dispatch<React.SetStateAction<Item[]>>;
    selectedTrait: Trait | null;
    setSelectedTrait: (trait: Trait | null) => void;
    selectedOccupation: Occupation | null;
    setSelectedOccupation: (occupation: Occupation | null) => void;
    selectedCharacter: Character | null;
    setSelectedCharacter: (character: Character | null) => void;
    selectedItem: Item | null;
    setSelectedItem: (item: Item | null) => void;
    activeTab: RuleTab;
    setActiveTab: (tab: RuleTab) => void;
}

export function CharacterRulePanel({ traits, setTraits, occupations, setOccupations, characters, setCharacters, items, setItems, selectedTrait, setSelectedTrait, selectedOccupation, setSelectedOccupation, selectedCharacter, setSelectedCharacter, selectedItem, setSelectedItem, activeTab, setActiveTab }: CharacterRulePanelProps) {

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
                    tabs={["traits", "occupations", "characters", "items"]}
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
                            <div className="space-y-6 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
                                {(['positive', 'negative', 'neutral'] as const).map(type => {
                                    const typeTraits = traits.filter(t => t.type === type);
                                    if (typeTraits.length === 0) return null;
                                    return (
                                        <div key={type} className="space-y-3">
                                            <h3 className={`text-[10px] font-black uppercase tracking-widest border-b pb-1 flex items-center gap-2 ${type === 'positive' ? 'text-blue-400 border-blue-900/30' :
                                                type === 'negative' ? 'text-red-400 border-red-900/30' :
                                                    'text-gray-400 border-gray-800'
                                                }`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${type === 'positive' ? 'bg-blue-500' :
                                                    type === 'negative' ? 'bg-red-500' : 'bg-gray-500'
                                                    }`} />
                                                {type} Traits ({typeTraits.length})
                                            </h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {typeTraits.map(t => (
                                                    <button
                                                        key={t.id}
                                                        onClick={() => setSelectedTrait(t)}
                                                        className={`w-full text-left p-3 border rounded-lg flex flex-col gap-1 transition-all ${selectedTrait?.id === t.id
                                                            ? 'bg-orange-500/20 border-orange-500 shadow-[inset_0_0_10px_rgba(249,115,22,0.1)]'
                                                            : 'bg-black/40 border-white/5 hover:border-white/20'
                                                            }`}
                                                    >
                                                        <div className="flex justify-between items-center w-full">
                                                            <span className={`text-[11px] font-bold uppercase ${t.type === 'positive' ? 'text-blue-400' : t.type === 'negative' ? 'text-red-400' : 'text-gray-400'}`}>{t.name}</span>
                                                            <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-gray-300 font-mono">Cost: {t.cost}</span>
                                                        </div>
                                                        <p className="text-[10px] text-gray-500 leading-snug line-clamp-2 mt-1">{t.description}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {activeTab === "occupations" && (
                        <div className="space-y-4">
                            <div className="space-y-6 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
                                {(['SECURITY', 'TECHNICAL', 'CRAFT', 'ADMIN', 'SOCIAL', 'FIELD'] as const).map(category => {
                                    const categoryOccs = occupations.filter(o => o.category === category);
                                    if (categoryOccs.length === 0) return null;
                                    return (
                                        <div key={category} className="space-y-3">
                                            <h3 className="text-[10px] font-black text-teal-500/70 uppercase tracking-widest border-b border-teal-900/30 pb-1 flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-teal-500/50" />
                                                {category} ({categoryOccs.length})
                                            </h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {categoryOccs.map(o => (
                                                    <button
                                                        key={o.id}
                                                        onClick={() => setSelectedOccupation(o)}
                                                        className={`w-full text-left p-3 border rounded-lg flex flex-col gap-1 transition-all ${selectedOccupation?.id === o.id
                                                            ? 'bg-orange-500/20 border-orange-500 shadow-[inset_0_0_10px_rgba(249,115,22,0.1)]'
                                                            : 'bg-black/40 border-white/5 hover:border-white/20'
                                                            }`}
                                                    >
                                                        <div className="flex flex-col gap-0.5 w-full">
                                                            <span className="text-[11px] font-bold uppercase text-orange-400 line-clamp-1">{o.name}</span>
                                                        </div>
                                                        <p className="text-[10px] text-gray-500 leading-snug line-clamp-2 mt-1">{o.description}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {activeTab === "characters" && (
                        <div className="space-y-4">
                            <div className="space-y-6 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
                                <div className="space-y-3">
                                    <h3 className="text-[10px] font-black text-indigo-500/70 uppercase tracking-widest border-b border-indigo-900/30 pb-1 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/50" />
                                        Saved Characters ({characters.length})
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {characters.map(c => (
                                            <button
                                                key={c.id}
                                                onClick={() => setSelectedCharacter(c)}
                                                className={`w-full text-left p-3 border rounded-lg flex flex-col gap-1 transition-all ${selectedCharacter?.id === c.id
                                                    ? 'bg-indigo-500/20 border-indigo-500 shadow-[inset_0_0_10px_rgba(99,102,241,0.1)]'
                                                    : 'bg-black/40 border-white/5 hover:border-white/20'
                                                    }`}
                                            >
                                                <div className="flex justify-between items-center w-full">
                                                    <span className="text-[11px] font-bold uppercase text-indigo-400 line-clamp-1">{c.name}</span>
                                                    {c.isNPC && <span className="text-[8px] bg-red-500/20 text-red-300 px-1 py-0.5 rounded uppercase">NPC</span>}
                                                </div>
                                                <p className="text-[10px] text-gray-500 leading-snug line-clamp-2 mt-1">Level {c.level} | {c.occupation?.name || 'No Occupation'}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === "items" && (
                        <div className="space-y-4">
                            <div className="space-y-6 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
                                {(['weapon', 'armor', 'consumable', 'tool', 'relic'] as const).map(category => {
                                    const categoryItems = items.filter(i => i.category === category);
                                    if (categoryItems.length === 0) return null;
                                    return (
                                        <div key={category} className="space-y-3">
                                            <h3 className="text-[10px] font-black text-yellow-500/70 uppercase tracking-widest border-b border-yellow-900/30 pb-1 flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/50" />
                                                {category} ({categoryItems.length})
                                            </h3>
                                            <div className="grid grid-cols-1 gap-2">
                                                {categoryItems.map(i => (
                                                    <button
                                                        key={i.id}
                                                        onClick={() => setSelectedItem(i)}
                                                        className={`w-full text-left p-3 border rounded-lg flex flex-col gap-1 transition-all ${selectedItem?.id === i.id
                                                            ? 'bg-yellow-500/20 border-yellow-500 shadow-[inset_0_0_10px_rgba(234,179,8,0.1)]'
                                                            : 'bg-black/40 border-white/5 hover:border-white/20'
                                                            }`}
                                                    >
                                                        <div className="flex justify-between items-center w-full">
                                                            <span className="text-[11px] font-bold uppercase text-yellow-400 line-clamp-1">{i.name}</span>
                                                            <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-gray-300 font-mono">Cost: {i.cost}</span>
                                                        </div>
                                                        <p className="text-[10px] text-gray-500 leading-snug line-clamp-2 mt-1">{i.description}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
