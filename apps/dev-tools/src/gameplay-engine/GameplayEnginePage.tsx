import React, { useState } from "react";
import { TabBar } from "@ashtrail/ui";
import { Link } from "react-router-dom";
import { CharacterRulePanel } from "./CharacterRulePanel";
import { TraitsView } from "./TraitsView";
import { OccupationsView } from "./OccupationsView";
import { CharactersView } from "./CharactersView";
import { ItemsView } from "./ItemsView";
import { CombatSimulator } from "./combat/CombatSimulator";
import { GameRegistry, Trait, Occupation, Character, Item } from "@ashtrail/core";

export type GameplayStep = "EXPLORATION" | "EVENTS" | "COMBAT" | "CHARACTER";

export function GameplayEnginePage() {
    const [activeStep, setActiveStep] = useState<GameplayStep>("CHARACTER");

    // Character Data State for live editing
    const [customTraits, setCustomTraits] = useState<Trait[]>([]);
    const [customOccupations, setCustomOccupations] = useState<Occupation[]>([]);
    const [customCharacters, setCustomCharacters] = useState<Character[]>([]);
    const [customItems, setCustomItems] = useState<Item[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Selection state
    const [selectedTrait, setSelectedTrait] = useState<Trait | null>(null);
    const [selectedOccupation, setSelectedOccupation] = useState<Occupation | null>(null);
    const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
    const [selectedItem, setSelectedItem] = useState<Item | null>(null);
    const [activeDetailTab, setActiveDetailTab] = useState<"traits" | "occupations" | "characters" | "items">("traits");

    React.useEffect(() => {
        async function loadRegistryData() {
            // Note: Make sure the dev-tools backend is running internally so this fetches the JSON.
            await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
            setCustomTraits(GameRegistry.getAllTraits());
            setCustomOccupations(GameRegistry.getAllOccupations());
            setCustomCharacters(GameRegistry.getAllCharacters());
            setCustomItems(GameRegistry.getAllItems());
            setIsLoading(false);
        }
        loadRegistryData();
    }, []);

    return (
        <div className="flex flex-col h-screen bg-[#1e1e1e] text-gray-300 font-sans tracking-wide overflow-hidden relative">
            <div className="absolute inset-0 z-0 pointer-events-none opacity-40 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-900/20 via-[#030508] to-[#030508]" />

            {/* ══ Header ══ */}
            <header className="absolute top-0 left-0 right-0 z-30 bg-[#030508]/90 backdrop-blur-md border-b border-white/5 pointer-events-auto">
                <div className="h-16 flex items-center justify-between px-6 w-full">
                    {/* Left: Logo */}
                    <div className="flex items-center gap-6">
                        <Link to="/" className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-all">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        </Link>
                        <h1 className="text-xs font-black tracking-[0.3em] text-white">GAMEPLAY ENGINE</h1>
                    </div>

                    {/* Center: Stage Navigation */}
                    <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center">
                        <div className="flex bg-[#1e1e1e]/60 border border-white/5 rounded-full p-1 shadow-lg backdrop-blur-md">
                            {(["EXPLORATION", "EVENTS", "COMBAT", "CHARACTER"] as GameplayStep[]).map((step) => (
                                <button
                                    key={step}
                                    onClick={() => setActiveStep(step)}
                                    className={`relative px-6 py-2 text-[10px] font-black tracking-[0.2em] rounded-full transition-all duration-300 overflow-hidden ${activeStep === step
                                        ? "text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                                        : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                                        }`}
                                >
                                    {activeStep === step && (
                                        <div className="absolute inset-0 bg-gradient-to-b from-orange-500/20 to-transparent pointer-events-none" />
                                    )}
                                    <span className="relative z-10">{step}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </header>

            {/* ══ Main Layout ══ */}
            <div className="flex-1 flex overflow-hidden relative z-10 pt-[80px] pb-12">
                {/* Left Sidebar Flow */}
                <aside className="absolute left-4 top-[80px] bottom-12 w-[480px] z-20 flex flex-col gap-4 overflow-y-auto scrollbar-none transition-transform duration-500 ease-in-out translate-x-0">
                    {activeStep === "CHARACTER" && !isLoading && (
                        <CharacterRulePanel
                            traits={customTraits}
                            setTraits={setCustomTraits}
                            occupations={customOccupations}
                            setOccupations={setCustomOccupations}
                            characters={customCharacters}
                            setCharacters={setCustomCharacters}
                            items={customItems}
                            setItems={setCustomItems}
                            selectedTrait={selectedTrait}
                            setSelectedTrait={setSelectedTrait}
                            selectedOccupation={selectedOccupation}
                            setSelectedOccupation={setSelectedOccupation}
                            selectedCharacter={selectedCharacter}
                            setSelectedCharacter={setSelectedCharacter}
                            selectedItem={selectedItem}
                            setSelectedItem={setSelectedItem}
                            activeTab={activeDetailTab}
                            setActiveTab={setActiveDetailTab}
                        />
                    )}
                    {activeStep !== "CHARACTER" && activeStep !== "COMBAT" && (
                        <div className="flex flex-col gap-4 h-full w-[480px]">
                            <div className="flex-1 bg-[#1e1e1e]/60 border border-white/5 rounded-2xl shadow-lg backdrop-blur-md p-6 flex flex-col items-center justify-center text-center">
                                <h2 className="text-orange-500 font-black tracking-widest text-lg mb-2">{activeStep}</h2>
                                <p className="text-gray-500 text-sm">Under Construction</p>
                            </div>
                        </div>
                    )}
                </aside>

                {/* Center Canvas Wrapper */}
                <div className={`flex-1 flex flex-col transition-all duration-500 ease-in-out h-full overflow-hidden ${activeStep === "CHARACTER" || activeStep === "COMBAT" ? "ml-[510px]" : "ml-0 justify-center items-center"}`}>
                    {activeStep === "CHARACTER" && (
                        <div className="w-full h-full bg-[#030508] rounded-xl border border-white/5 overflow-hidden shadow-2xl relative flex flex-col items-center justify-center p-8">
                            {/* Detail View Container */}
                            <div className="w-full h-full max-w-[1200px] flex items-center justify-center relative">
                                {activeDetailTab === "traits" && <TraitsView trait={selectedTrait} />}
                                {activeDetailTab === "occupations" && <OccupationsView occupation={selectedOccupation} />}
                                {activeDetailTab === "characters" && <CharactersView character={selectedCharacter} />}
                                {activeDetailTab === "items" && <ItemsView item={selectedItem} />}
                            </div>
                        </div>
                    )}

                    {activeStep === "COMBAT" && (
                        <CombatSimulator />
                    )}
                </div>
            </div>
        </div>
    );
}
