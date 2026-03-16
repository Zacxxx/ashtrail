import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { useDemoFlow } from "./DemoFlowContext";
import { useHomepageAudio } from "./useHomepageAudio";
import { useSceneAudio } from "./useSceneAudio";
import { useTrackedJobLauncher } from "../jobs/useTrackedJobLauncher";
import { useJobs } from "../jobs/useJobs";
import { DemoQuestPlayer } from "./DemoQuestPlayer";

interface QuestArtifact {
    heroVariant: string;
    heroName: string;
    worldId?: string | null;
    worldTitle: string;
    locationId: string;
    locationTitle: string;
    questTitle: string;
    questDescription: string;
    questObjectives: string[];
    questRewards: string[];
    questRunId?: string | null; // Add quest run ID to artifact
}

function buildDemoCharacterId(heroVariant?: string | null, stepOneJobId?: string | null) {
    const normalizedHero = (heroVariant || "john").trim() || "john";
    const normalizedRunId = (stepOneJobId || "live").trim() || "live";
    return `demo-char-${normalizedHero}-${normalizedRunId.slice(0, 8)}`;
}

export function DemoStepFourPage() {
    useHomepageAudio(false);
    const { setPlanetAsset, setPlanetView } = useDemoFlow();
    const launchTrackedJob = useTrackedJobLauncher();
    const { waitForJob } = useJobs();
    const [searchParams] = useSearchParams();
    const [isLoading, setIsLoading] = useState(true);
    const [displayedText, setDisplayedText] = useState("");
    const [questArtifact, setQuestArtifact] = useState<QuestArtifact | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [questAccepted, setQuestAccepted] = useState(false);
    const [generationProgress, setGenerationProgress] = useState<string>("");
    const [questPhase, setQuestPhase] = useState<"intro" | "generating" | "playing">("intro");
    
    const stepOneJobId = searchParams.get("stepOneJobId");
    const heroVariant = searchParams.get("hero");
    const locationId = searchParams.get("locationId");
    const locationTitle = searchParams.get("locationTitle");
    const planetTitle = searchParams.get("planetTitle");
    const planetTexture = searchParams.get("planetTexture");
    const soundtrackUrl = searchParams.get("soundtrack");

    useSceneAudio(soundtrackUrl, !error && Boolean(soundtrackUrl));

    // Setup planet asset and view
    useEffect(() => {
        setPlanetAsset({
            textureUrl: planetTexture,
            title: planetTitle,
        });
        
        if (error) {
            setPlanetView("hidden");
        } else if (isLoading) {
            setPlanetView("stepThreeIntro"); // Use same view as step 3 for consistency
        } else {
            setPlanetView("stepThreeIntro"); // Keep planet orbiting during quest screen
        }
    }, [planetTexture, planetTitle, error, isLoading, setPlanetAsset, setPlanetView]);

    useEffect(() => {
        const loadOrInitializeQuest = async () => {
            if (!locationId || !locationTitle || !planetTitle || !heroVariant) {
                setError("Missing required parameters");
                setIsLoading(false);
                return;
            }

            try {
                // Try to load existing artifact
                const params = new URLSearchParams();
                if (stepOneJobId) {
                    params.set("stepOneJobId", stepOneJobId);
                }
                params.set("hero", heroVariant);
                params.set("locationId", locationId);

                let artifact: QuestArtifact;
                const loadResponse = await fetch(`/api/demo/step-4/artifact?${params.toString()}`);
                
                if (loadResponse.ok) {
                    artifact = await loadResponse.json();
                    console.log("✓ Loaded persisted quest artifact");
                } else if (loadResponse.status === 404) {
                    // Initialize new artifact
                    console.log("Initializing new quest artifact...");
                    const initResponse = await fetch(`/api/demo/step-4/artifact`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            stepOneJobId,
                            heroVariant,
                            locationId,
                            locationTitle,
                            worldTitle: planetTitle,
                        }),
                    });

                    if (!initResponse.ok) {
                        const errorText = await initResponse.text().catch(() => "Unknown error");
                        console.error("Quest initialization failed:", initResponse.status, errorText);
                        throw new Error(`Failed to initialize quest: ${initResponse.status} - ${errorText}`);
                    }

                    artifact = await initResponse.json();
                    console.log("✓ Created new quest artifact");
                } else {
                    throw new Error(`Failed to load quest: ${loadResponse.status}`);
                }

                setQuestArtifact(artifact);
                
                // Check if quest is already generated and set phase accordingly
                if (artifact.questRunId) {
                    console.log("✓ Quest already exists, moving to playing phase");
                    setQuestPhase("playing");
                } else {
                    setQuestPhase("intro");
                }
            } catch (err) {
                console.error("Quest initialization error:", err);
                setError(err instanceof Error ? err.message : "Failed to load quest");
            } finally {
                setIsLoading(false);
            }
        };

        void loadOrInitializeQuest();
    }, [stepOneJobId, heroVariant, locationId, locationTitle, planetTitle]);

    const introText = questArtifact
        ? `To tell a story, you must have a quest.\n\nEvery journey needs purpose. Every wanderer needs direction. On ${questArtifact.worldTitle}, survival is not enough—you need a reason to push forward through the unknown.\n\nYour directive awaits at ${questArtifact.locationTitle}.`
        : "";

    useEffect(() => {
        if (isLoading || !questArtifact) return;
        
        let i = 0;
        const interval = setInterval(() => {
            setDisplayedText(introText.slice(0, i));
            i++;
            if (i > introText.length) clearInterval(interval);
        }, 20);
        return () => clearInterval(interval);
    }, [isLoading, questArtifact, introText]);

    const handleAcceptDirective = async () => {
        if (!questArtifact) return;
        
        setQuestAccepted(true);
        setQuestPhase("generating");
        
        try {
            // Check if quest already exists in the artifact
            if (questArtifact.questRunId) {
                console.log("✓ Quest already generated, moving to playing phase");
                setQuestPhase("playing");
                return;
            }

            setGenerationProgress("Loading context from previous steps...");
            console.log("🎯 Starting quest generation for:", questArtifact.locationTitle);
            
            // Load step 3 context for richer quest generation
            const params = new URLSearchParams();
            if (stepOneJobId) {
                params.set("stepOneJobId", stepOneJobId);
            }
            params.set("hero", heroVariant || "john");
            params.set("nodeId", locationId || "");

            let step3Context = null;
            try {
                const step3Response = await fetch(`/api/demo/step-3/artifact?${params.toString()}`);
                if (step3Response.ok) {
                    step3Context = await step3Response.json();
                    console.log("✓ Loaded step 3 context:", step3Context.locationTitle);
                }
            } catch (err) {
                console.warn("Could not load step 3 context:", err);
            }

            // Create a demo character for the party
            setGenerationProgress("Loading character from step 2...");
            console.log("👤 Loading character from step 2");
            
            let demoCharacter = null;
            
            // Try to load the character from step 2
            try {
                const step2Params = new URLSearchParams();
                if (stepOneJobId) {
                    step2Params.set("stepOneJobId", stepOneJobId);
                }
                step2Params.set("hero", heroVariant || "john");
                
                const step2Response = await fetch(`/api/demo/step-2/artifact?${step2Params.toString()}`);
                if (step2Response.ok) {
                    const step2Data = await step2Response.json();
                    console.log("✓ Loaded step 2 data:", step2Data);
                    
                    // Build character from step 2 data
                    demoCharacter = {
                        id: buildDemoCharacterId(step2Data.heroVariant, stepOneJobId),
                        name: step2Data.heroName || questArtifact.heroName,
                        occupation: step2Data.draft?.occupationName || "Explorer",
                        level: 1,
                        hp: 100,
                        maxHp: 100,
                        stats: step2Data.draft?.stats || {
                            strength: 10,
                            agility: 10,
                            endurance: 10,
                            intelligence: 10,
                            charisma: 10,
                        },
                        skills: step2Data.draft?.skills || [],
                        traits: step2Data.draft?.traits || [],
                        appearance: step2Data.draft?.appearance,
                        backstory: step2Data.loreText,
                    };
                    console.log("✓ Built character from step 2:", demoCharacter.name);
                }
            } catch (err) {
                console.warn("⚠️ Could not load step 2 character, using fallback:", err);
            }
            
            // Fallback character if step 2 data not available
            if (!demoCharacter) {
                console.log("⚠️ Using fallback character");
                demoCharacter = {
                    id: buildDemoCharacterId(heroVariant, stepOneJobId),
                    name: questArtifact.heroName,
                    occupation: step3Context?.draft?.occupationName || "Explorer",
                    level: 1,
                    hp: 100,
                    maxHp: 100,
                    stats: {
                        strength: 10,
                        agility: 10,
                        endurance: 10,
                        intelligence: 10,
                        charisma: 10,
                    },
                    skills: [],
                    traits: [],
                    backstory: step3Context?.characterLore,
                };
            }

            // Build enriched quest seed with context from all previous steps
            const questSeed = {
                premise: step3Context?.briefText || questArtifact.questDescription,
                objective: questArtifact.questObjectives[0] || `Explore ${questArtifact.locationTitle}`,
                stakes: `Understanding ${questArtifact.locationTitle} could be crucial to your survival on ${questArtifact.worldTitle}`,
                tone: "mysterious",
                difficulty: "medium",
                runLength: "short",
                openness: "balanced",
                targetEndingCount: 2,
                factionAnchorIds: [],
                locationAnchorIds: [],
                ecologyAnchorIds: [],
                notes: [
                    `Demo quest for ${questArtifact.locationTitle}`,
                    step3Context?.briefText ? `Location context: ${step3Context.briefText}` : "",
                    step3Context?.characterLore ? `Hero background: ${step3Context.characterLore}` : "",
                    step3Context?.worldContext?.worldLore ? `World lore: ${step3Context.worldContext.worldLore}` : "",
                ].filter(Boolean).join("\n\n"),
            };

            setGenerationProgress("Generating quest...");
            console.log("🚀 Generating quest with seed:", questSeed);

            // Use demo-specific world ID based on step one job ID
            const worldId = questArtifact.worldId || `demo-${stepOneJobId || "world"}`;
            console.log("🌍 Using world ID:", worldId);
            
            // Use direct API call - party must be an array, not an object
            const response = await fetch("/api/quests/generate-run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    worldId,
                    seed: questSeed,
                    partyCharacterIds: [demoCharacter.id],
                    party: [demoCharacter], // Must be an array for the backend
                    gmContext: {
                        worldTitle: questArtifact.worldTitle,
                        locationTitle: questArtifact.locationTitle,
                        heroName: questArtifact.heroName,
                        locationBrief: step3Context?.briefText,
                        characterLore: step3Context?.characterLore,
                        worldLore: step3Context?.worldContext?.worldLore,
                    },
                    factions: {},
                    locations: {},
                    ecology: {},
                    historyCharacters: {},
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Quest generation failed: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log("✓ Quest generated:", result);

            let runId = null;
            
            // Check if it's a job reference (async mode)
            if (result?.jobId && result?.kind === "generate-run") {
                console.log("📊 Quest generation is async, waiting for job:", result.jobId);
                setGenerationProgress("Waiting for quest generation to complete...");
                
                // Wait for the job to complete
                const jobDetail = await waitForJob(result.jobId, (job) => {
                    if (job.currentStage) {
                        setGenerationProgress(job.currentStage);
                        console.log("📊 Progress:", job.currentStage);
                    }
                });
                
                console.log("✓ Job completed:", jobDetail);
                
                // Check if job failed
                if (jobDetail.status === "failed") {
                    throw new Error(`Quest generation failed: ${jobDetail.error || "Unknown error"}`);
                }
                
                // Extract run ID from job result - the result contains the full quest run
                if (jobDetail.result?.id) {
                    runId = jobDetail.result.id;
                } else if (jobDetail.result?.run?.id) {
                    runId = jobDetail.result.run.id;
                }
            } else if (result?.run?.id) {
                runId = result.run.id;
            } else if (result?.id) {
                runId = result.id;
            }

            if (!runId) {
                console.error("❌ Could not find run ID in any result");
                console.error("Full result:", result);
                throw new Error("Quest generation did not return a run ID. Check console for details.");
            }

            // Save the quest run ID to the artifact
            setGenerationProgress("Saving quest reference...");
            console.log("💾 Saving quest run ID to artifact:", runId);
            
            try {
                await fetch(`/api/demo/step-4/artifact`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        stepOneJobId,
                        heroVariant: questArtifact.heroVariant,
                        locationId: questArtifact.locationId,
                        locationTitle: questArtifact.locationTitle,
                        worldTitle: questArtifact.worldTitle,
                        questRunId: runId,
                    }),
                });
                console.log("✓ Quest reference saved");
            } catch (saveErr) {
                console.warn("⚠️ Could not save quest reference:", saveErr);
            }

            console.log("🎮 Navigating to quest player");
            setQuestPhase("playing");
        } catch (err) {
            console.error("❌ Failed to generate quest:", err);
            setError(err instanceof Error ? err.message : "Failed to generate quest");
            setQuestAccepted(false);
            setQuestPhase("intro");
            setGenerationProgress("");
        }
    };

    const handleQuestComplete = () => {
        console.log("Quest completed!");
        // TODO: Navigate to next step or show completion screen
        // For now, just show a completion message
        setQuestPhase("intro");
    };

    // Show quest player if quest is generated
    if (questPhase === "playing" && questArtifact?.questRunId && questArtifact?.worldId) {
        return (
            <DemoQuestPlayer
                worldId={questArtifact.worldId}
                runId={questArtifact.questRunId}
                onComplete={handleQuestComplete}
            />
        );
    }

    if (error) {
        return (
            <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
                <div className="w-full max-w-[720px] rounded-[28px] border border-red-400/15 bg-[linear-gradient(160deg,rgba(18,10,12,0.94),rgba(7,4,6,0.92))] px-8 py-10 shadow-[0_32px_100px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
                    <div className="text-[10px] font-black uppercase tracking-[0.28em] text-red-200/60">Quest Error</div>
                    <div className="mt-4 text-sm leading-6 text-red-50">{error}</div>
                </div>
            </div>
        );
    }

    if (isLoading || !questArtifact) {
        return (
            <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
                <div className="w-full max-w-[720px] rounded-[28px] border border-white/10 bg-[linear-gradient(160deg,rgba(9,13,21,0.92),rgba(4,7,13,0.88))] px-8 py-10 shadow-[0_32px_100px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
                    <div className="flex items-center gap-4 text-[#d7eaf4]">
                        <LoaderCircle className="h-5 w-5 animate-spin text-[#B3EBF2]" />
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-[#B3EBF2]/60">Quest Initialization</div>
                            <div className="mt-1 text-sm text-slate-200">Preparing your directive at {locationTitle}...</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Show generating state while quest is being created
    if (questPhase === "generating") {
        return (
            <div className="relative z-10 flex h-full w-full items-center justify-center px-6">
                <div className="w-full max-w-[720px] rounded-[28px] border border-white/10 bg-[linear-gradient(160deg,rgba(9,13,21,0.92),rgba(4,7,13,0.88))] px-8 py-10 shadow-[0_32px_100px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
                    <div className="space-y-4">
                        <div className="flex items-center gap-4 text-[#d7eaf4]">
                            <LoaderCircle className="h-5 w-5 animate-spin text-emerald-400" />
                            <div>
                                <div className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-400/80">Generating Quest</div>
                                <div className="mt-1 text-sm text-slate-200">Creating your personalized quest experience...</div>
                            </div>
                        </div>
                        {generationProgress && (
                            <div className="rounded-[16px] border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
                                <div className="text-xs text-emerald-300">{generationProgress}</div>
                            </div>
                        )}
                        <div className="text-xs text-slate-500">
                            Check the browser console for detailed progress logs
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative z-10 h-full w-full flex items-center justify-center px-8">
            {/* Background gradient accent */}
            <div className="absolute inset-0 opacity-10 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-b from-amber-900/20 to-transparent" />
            </div>

            {/* Main content */}
            <div className="z-10 max-w-5xl w-full grid grid-cols-[1.3fr_0.7fr] gap-12 items-start">
                {/* Left: Intro text */}
                <div className="space-y-10">
                    <div className="space-y-3">
                        <div className="h-px w-12 bg-amber-500" />
                        <h2 className="text-[10px] font-black uppercase tracking-[0.5em] text-amber-400/80">Quest Directive</h2>
                    </div>

                    <div className="min-h-[180px]">
                        <p className="text-slate-200 text-[15px] leading-relaxed whitespace-pre-wrap font-light">
                            {displayedText}
                            {displayedText.length < introText.length && (
                                <span className="inline-block w-[2px] h-5 bg-amber-400 ml-1 animate-pulse" />
                            )}
                        </p>
                    </div>

                    <div className="flex justify-start pt-6 animate-in fade-in slide-in-from-left-4 duration-1000 delay-1000">
                        <button
                            type="button"
                            onClick={handleAcceptDirective}
                            disabled={questAccepted}
                            className={`inline-flex items-center rounded-full border px-8 py-3.5 text-[11px] font-black uppercase tracking-[0.26em] transition-all ${
                                questAccepted
                                    ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300 cursor-default"
                                    : "border-amber-400/30 bg-amber-500/15 text-amber-100 hover:border-amber-400/50 hover:bg-amber-500/25 hover:shadow-[0_0_30px_rgba(251,191,36,0.15)]"
                            }`}
                        >
                            {questAccepted ? (
                                <>
                                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Directive Accepted
                                </>
                            ) : (
                                "Accept Directive"
                            )}
                        </button>
                    </div>
                </div>

                {/* Right: Quest preview card */}
                <div className="animate-in fade-in slide-in-from-right-4 duration-1000 delay-500">
                    <div className="rounded-[20px] border border-white/10 bg-[linear-gradient(160deg,rgba(9,13,21,0.94),rgba(4,7,13,0.92))] px-6 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
                        <div className="space-y-5">
                            <div className="flex items-start justify-between gap-3">
                                <div className="space-y-2 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.2em] ${
                                            questAccepted
                                                ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-300"
                                                : "border-amber-400/30 bg-amber-500/15 text-amber-300"
                                        }`}>
                                            {questAccepted ? "Accepted" : "Active"}
                                        </span>
                                        <span className="text-[8px] text-slate-500 uppercase tracking-wider">Priority Directive</span>
                                    </div>
                                    <h3 className="font-black uppercase text-white text-sm tracking-wide">{questArtifact.questTitle}</h3>
                                </div>
                            </div>

                            <p className="text-xs text-slate-300 leading-relaxed">
                                {questArtifact.questDescription}
                            </p>

                            <div className="pt-3 border-t border-white/5 space-y-2">
                                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Rewards</div>
                                <div className="flex flex-wrap gap-2">
                                    {questArtifact.questRewards.map((reward, index) => (
                                        <span
                                            key={index}
                                            className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800/50 px-2.5 py-1 text-[9px] uppercase tracking-wider text-slate-300"
                                        >
                                            {reward}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-3 space-y-2">
                                <div className="text-[9px] text-slate-500 uppercase tracking-wider">Objectives</div>
                                <div className="space-y-2">
                                    {questArtifact.questObjectives.map((objective, index) => (
                                        <div key={index} className="flex items-center gap-2 text-[10px] text-slate-400">
                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                                            <span>{objective}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
