import React, { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CharacterRulePanel } from "./CharacterRulePanel";
import { TraitsView } from "./TraitsView";
import { OccupationsView } from "./OccupationsView";
import { CharactersView } from "./CharactersView";
import { ItemsView } from "./ItemsView";
import { CombatSimulator } from "./combat/CombatSimulator";
import { SkillBuilder } from "./SkillBuilder";
import { GameRulesView } from "./GameRulesView";
import { EventsView } from "./EventsView";
import { ExplorationView } from "./ExplorationView";
import { GameplayValidationPanel } from "./GameplayValidationPanel";
import { GameRegistry, Trait, Occupation, Character, Item } from "@ashtrail/core";

export type GameplayStep = "RULES" | "EXPLORATION" | "EVENTS" | "COMBAT" | "CHARACTER" | "SKILLS";

function isGameplayStep(value: string | null): value is GameplayStep {
    return value === "RULES" || value === "EXPLORATION" || value === "EVENTS" || value === "COMBAT" || value === "CHARACTER" || value === "SKILLS";
}

export function GameplayEnginePage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeStep, setActiveStep] = useState<GameplayStep>(isGameplayStep(searchParams.get("step")) ? searchParams.get("step") as GameplayStep : "CHARACTER");
    const [combatInitData, setCombatInitData] = useState<{ players: string[], enemies: string[] } | null>(null);
    const explorationTab = searchParams.get("explorationTab") === "world" ? "world" : "location";

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

    React.useEffect(() => {
        const step = searchParams.get("step");
        if (isGameplayStep(step) && step !== activeStep) {
            setActiveStep(step);
        }
        if (!isGameplayStep(step)) {
            setSearchParams({ step: "CHARACTER" }, { replace: true });
        }
    }, [activeStep, searchParams, setSearchParams]);

    return (
        <div className="flex flex-col h-screen bg-[#1e1e1e] text-gray-300 font-sans tracking-wide overflow-hidden relative">
            <div className="absolute inset-0 z-0 pointer-events-none opacity-40 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-900/20 via-[#030508] to-[#030508]" />

            {/* ══ Tool-Specific Sub-Header ══ */}
            <div className="fixed top-16 left-0 right-0 z-30 bg-[#030508]/60 backdrop-blur-md border-b border-white/5 pointer-events-auto flex items-center justify-between px-6 h-12 shadow-2xl">
                <div className="flex min-w-[220px] items-center gap-4">
                    <h1 className="text-[10px] font-black tracking-[0.3em] text-white uppercase">GAMEPLAY ENGINE</h1>
                </div>

                {/* Center: Stage Navigation */}
                <div className="flex items-center justify-center scale-90">
                    <div className="flex bg-[#1e1e1e]/40 border border-white/5 rounded-full p-1 shadow-lg backdrop-blur-md">
                        {(["RULES", "EXPLORATION", "EVENTS", "COMBAT", "CHARACTER", "SKILLS"] as GameplayStep[]).map((step) => (
                            <button
                                key={step}
                                onClick={() => {
                                    setActiveStep(step);
                                    setSearchParams({ step });
                                }}
                                className={`relative px-4 py-1.5 text-[9px] font-black tracking-[0.2em] rounded-full transition-all duration-300 overflow-hidden ${activeStep === step
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

                <div className="flex min-w-[220px] items-center justify-end">
                    {activeStep === "EXPLORATION" && (
                        <div className="flex bg-[#1e1e1e]/40 border border-white/5 rounded-full p-1 shadow-lg backdrop-blur-md">
                            {([
                                { id: "location", label: "LOCATION EXPLORATION" },
                                { id: "world", label: "WORLD EXPLORATION" },
                            ] as const).map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => {
                                        const next = new URLSearchParams(searchParams);
                                        next.set("step", "EXPLORATION");
                                        next.set("explorationTab", tab.id);
                                        setSearchParams(next);
                                    }}
                                    className={`relative px-3 py-1.5 text-[8px] font-black tracking-[0.18em] rounded-full transition-all duration-300 overflow-hidden ${explorationTab === tab.id
                                        ? "text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                                        : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                                        }`}
                                >
                                    {explorationTab === tab.id && (
                                        <div className="absolute inset-0 bg-gradient-to-b from-orange-500/20 to-transparent pointer-events-none" />
                                    )}
                                    <span className="relative z-10">{tab.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ══ Main Layout ══ */}
            <div className="flex-1 flex overflow-hidden relative z-10 pt-28 pb-12 px-6 gap-6">
                {/* Left Sidebar Flow */}
                {activeStep === "CHARACTER" && (
                    <aside className="w-[360px] h-full flex flex-col gap-4 shrink-0 transition-transform duration-500 ease-in-out">
                        {!isLoading && (
                            <>
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
                                <GameplayValidationPanel
                                    traits={customTraits}
                                    occupations={customOccupations}
                                />
                            </>
                        )}
                    </aside>
                )}

                {/* Center Canvas Wrapper */}
                <div className={`flex-1 min-h-0 flex flex-col transition-all duration-500 ease-in-out h-full overflow-hidden ${activeStep === "EVENTS" ? "justify-center items-center" : ""}`}>
                    {activeStep === "CHARACTER" && (
                        <div className="w-full h-full flex items-center justify-center relative">
                            {activeDetailTab === "traits" && (
                                <TraitsView
                                    trait={selectedTrait}
                                    onSave={async () => {
                                        await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
                                        setCustomTraits(GameRegistry.getAllTraits());
                                    }}
                                />
                            )}
                            {activeDetailTab === "occupations" && (
                                <OccupationsView
                                    occupation={selectedOccupation}
                                    onSave={async () => {
                                        await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
                                        setCustomTraits(GameRegistry.getAllTraits());
                                        setCustomOccupations(GameRegistry.getAllOccupations());
                                    }}
                                    onOpenTrait={(traitId) => {
                                        const trait = GameRegistry.getTrait(traitId);
                                        if (!trait) return;
                                        setSelectedTrait(trait);
                                        setActiveDetailTab("traits");
                                    }}
                                />
                            )}
                            {activeDetailTab === "characters" && <CharactersView character={selectedCharacter} />}
                            {activeDetailTab === "items" && (
                                <ItemsView
                                    item={selectedItem}
                                    onSave={async () => {
                                        await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
                                        setCustomItems(GameRegistry.getAllItems());
                                    }}
                                />
                            )}
                        </div>
                    )}

                    {activeStep === "SKILLS" && (
                        <div className="w-full h-full">
                            <SkillBuilder />
                        </div>
                    )}

                    {activeStep === "EXPLORATION" && (
                        <div className="w-full h-full min-h-0 overflow-hidden">
                            <ExplorationView />
                        </div>
                    )}

                    {activeStep === "EVENTS" && (
                        <div className="w-full h-full p-8 flex justify-center items-start overflow-y-auto">
                            <div className="w-full h-full max-w-[1200px]">
                                <EventsView
                                    characters={customCharacters}
                                    onCharacterUpdated={async () => {
                                        await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
                                        setCustomCharacters(GameRegistry.getAllCharacters());
                                    }}
                                    onCombatRedirect={(players, enemies) => {
                                        setCombatInitData({ players, enemies });
                                        setActiveStep("COMBAT");
                                        setSearchParams({ step: "COMBAT" });
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {activeStep === "RULES" && (
                        <div className="w-full h-full p-8 flex justify-center items-center">
                            <div className="w-full h-full max-w-[1000px]">
                                <GameRulesView />
                            </div>
                        </div>
                    )}

                    {activeStep === "COMBAT" && (
                        <div className="w-full h-full">
                            <CombatSimulator
                                initialPlayerIds={combatInitData?.players}
                                initialEnemyIds={combatInitData?.enemies}
                                initialCombatStarted={!!combatInitData}
                                key={combatInitData ? Object.values(combatInitData).flat().join() : "default"}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
