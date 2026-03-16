import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LoaderCircle, Headphones, Play, Pause } from "lucide-react";
import type { QuestRunRecord } from "@ashtrail/core";
import { CombatSimulator } from "../gameplay-engine/combat/CombatSimulator";
import { useActiveWorld } from "../hooks/useActiveWorld";

interface DemoQuestPlayerProps {
    worldId: string;
    runId: string;
    onComplete?: () => void;
}

function buildWorldCharacterLookupIds(worldId: string, characterId: string): string[] {
    const candidates = new Set<string>();
    const trimmedId = characterId.trim();
    const shortWorldId = worldId.split("-")[1]?.trim();
    const characterPrefix = trimmedId.split("-").slice(0, 3).join("-");
    if (characterPrefix && shortWorldId) {
        candidates.add(`${characterPrefix}-${shortWorldId}`);
    }
    if (trimmedId) {
        candidates.add(trimmedId);
    }

    return Array.from(candidates);
}

async function fetchWorldCharacter(worldId: string, characterId: string) {
    for (const lookupId of buildWorldCharacterLookupIds(worldId, characterId)) {
        try {
            const response = await fetch(`/api/world/${worldId}/character/${lookupId}`);
            if (!response.ok) {
                continue;
            }

            const character = await response.json();
            return { lookupId, character };
        } catch (_error) {
            // Try the next fallback ID.
        }
    }

    return null;
}

export function DemoQuestPlayer({ worldId, runId, onComplete }: DemoQuestPlayerProps) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { setActiveWorldId } = useActiveWorld();
    const [questRun, setQuestRun] = useState<QuestRunRecord | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAdvancing, setIsAdvancing] = useState(false);
    const [freeformAction, setFreeformAction] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);
    const [ttsUrl, setTtsUrl] = useState<string | null>(null);
    const [isTTSPlaying, setIsTTSPlaying] = useState(false);
    const [illustrationUrl, setIllustrationUrl] = useState<string | null>(null);
    const [isGeneratingIllustration, setIsGeneratingIllustration] = useState(false);
    const [isFixingChoices, setIsFixingChoices] = useState(false);
    const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
    const [characterStats, setCharacterStats] = useState<any>(null);
    const [advancingStatus, setAdvancingStatus] = useState<string | null>(null);
    const [advancingProgress, setAdvancingProgress] = useState(0);
    const [isCombatActive, setIsCombatActive] = useState(false);
    const [faunaEntries, setFaunaEntries] = useState<any[]>([]);
    const [faunaLoadAttempted, setFaunaLoadAttempted] = useState(false);
    const [combatReady, setCombatReady] = useState(false);
    const generatingIllustrationsRef = useRef<Set<string>>(new Set());
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const currentNode = questRun?.currentNode;
    const hasPendingCombat = currentNode?.kind === "combat" && (
        !!currentNode.pendingCombat?.enemyIds?.length ||
        !!(currentNode.pendingCombat as { enemyNpcNames?: string[] } | undefined)?.enemyNpcNames?.length
    );
    const pendingFaunaEnemyIds = currentNode?.pendingCombat?.enemyIds?.filter((enemyId: string) =>
        enemyId.startsWith("fauna:")
    ) || [];
    const combatFaunaReady = pendingFaunaEnemyIds.length === 0
        || pendingFaunaEnemyIds.every((enemyId: string) =>
            faunaEntries.some((fauna) => `fauna:${fauna.id}` === enemyId)
        )
        || faunaLoadAttempted;

    // Load quest run
    useEffect(() => {
        let cancelled = false;

        const loadQuest = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/planet/quests/${worldId}/${runId}`);
                if (!response.ok) {
                    throw new Error(`Failed to load quest: ${response.status}`);
                }

                const run = await response.json();
                if (cancelled) return;

                setQuestRun(run);
                console.log("✓ Loaded quest run:", run.id);

                // Note: We don't add combat to the ending node anymore
                // Combat will be generated when user clicks "Proceed" on the ending node

                // Load character stats
                if (run.partyCharacterIds && run.partyCharacterIds.length > 0) {
                    console.log("📊 Loading character stats for:", run.partyCharacterIds[0]);
                    void loadCharacterStats(run.partyCharacterIds[0]);
                } else {
                    console.warn("⚠️ No party character IDs found in quest run");
                }

                // Load TTS URL if it exists for current node
                if (run.currentNode?.id) {
                    const ttsKey = `quest-tts-${runId}-${run.currentNode.id}`;
                    const savedTtsUrl = localStorage.getItem(ttsKey);
                    if (savedTtsUrl) {
                        setTtsUrl(savedTtsUrl);
                        console.log("✓ Loaded saved TTS for node:", run.currentNode.id);
                    }
                }

                // Load illustration if available
                if (run.currentNode?.illustrationId) {
                    void loadIllustration(run.currentNode.illustrationId, run.currentNode.illustrationStatus);
                }

                // Check if choices need fixing
                if (run.currentNode?.choices) {
                    const needsFixing = run.currentNode.choices.some((c: any) =>
                        c.label?.startsWith("Take option ") || !c.label
                    );
                    if (needsFixing) {
                        void fixMissingChoiceLabels(run);
                    }
                }
            } catch (err) {
                if (cancelled) return;
                console.error("Failed to load quest:", err);
                setError(err instanceof Error ? err.message : "Failed to load quest");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        void loadQuest();

        return () => {
            cancelled = true;
        };
    }, [worldId, runId]);

    // Cleanup audio on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }, []);

    // Handle audio playback state
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const handleEnded = () => setIsTTSPlaying(false);
        const handlePause = () => setIsTTSPlaying(false);
        const handlePlay = () => setIsTTSPlaying(true);

        audio.addEventListener("ended", handleEnded);
        audio.addEventListener("pause", handlePause);
        audio.addEventListener("play", handlePlay);

        return () => {
            audio.removeEventListener("ended", handleEnded);
            audio.removeEventListener("pause", handlePause);
            audio.removeEventListener("play", handlePlay);
        };
    }, []);

    const loadCharacterStats = useCallback(async (characterId: string) => {
        try {
            console.log("🔍 Attempting to load character:", characterId);
            const resolvedCharacter = await fetchWorldCharacter(worldId, characterId);
            if (resolvedCharacter) {
                setCharacterStats(resolvedCharacter.character);
                console.log("✓ Loaded character stats:", {
                    requestedId: characterId,
                    resolvedId: resolvedCharacter.lookupId,
                    name: resolvedCharacter.character?.name,
                });
                return;
            }

            console.warn("⚠️ Could not load character, using fallback data");
            // Fallback: create minimal character data from quest info
            const heroName = characterId.includes("john") ? "John Gemini" : "Jane Gemini";
            setCharacterStats({
                name: heroName,
                level: 6,
                hp: 100,
                maxHp: 100,
                occupation: { name: 'Explorer' },
            });
        } catch (err) {
            console.error("❌ Failed to load character stats:", err);
        }
    }, [worldId]);

    const loadFaunaForCombat = useCallback(async () => {
        try {
            console.log("🦎 Loading fauna catalog for combat...");
            const ecologySources = [
                `/api/planet/ecology-data/${worldId}`,
                `/api/planets/${worldId}/ecology/bundle.json`,
                `/api/planets/${worldId}/ecology/fauna.json`,
            ];

            for (const url of ecologySources) {
                const response = await fetch(url);
                if (!response.ok) {
                    continue;
                }

                const payload = await response.json();
                const fauna = Array.isArray(payload) ? payload : payload.fauna || [];
                setFaunaEntries(fauna);
                console.log("✓ Loaded fauna catalog:", fauna.length, "entries from", url);
                return;
            }

            console.warn("⚠️ Could not load fauna catalog from any source");
        } catch (err) {
            console.error("❌ Failed to load fauna:", err);
        } finally {
            setFaunaLoadAttempted(true);
        }
    }, [worldId]);

    // Load fauna when combat node is detected
    useEffect(() => {
        const currentNode = questRun?.currentNode;
        const hasCombat = currentNode?.kind === "combat" && (
            !!currentNode.pendingCombat?.enemyIds?.length ||
            !!(currentNode.pendingCombat as { enemyNpcNames?: string[] } | undefined)?.enemyNpcNames?.length
        );

        if (hasCombat && faunaEntries.length === 0) {
            void loadFaunaForCombat();
        }
    }, [questRun?.currentNode, faunaEntries.length, loadFaunaForCombat, questRun]);

    // Prepare combat: Load GameRegistry, set active world, and register demo character
    // This must run BEFORE combat becomes active to ensure the character is available
    useEffect(() => {
        if (!isCombatActive || combatReady) return;

        async function prepareCombat() {
            try {
                console.log("🎮 Preparing combat for world:", worldId);

                // Set the active world so CombatSimulator loads fauna from this world
                setActiveWorldId(worldId);
                console.log("✓ Set active world to:", worldId);

                // Import GameRegistry
                const { GameRegistry } = await import("@ashtrail/core");

                // Load registry from backend (loads game-assets characters)
                await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
                console.log("✓ Loaded GameRegistry from backend");

                // Fetch and register the demo character from the planet's characters folder
                // CRITICAL: We need to find the actual character file in the folder, not rely on the quest's character ID
                // because the quest might have been created with a different/old character ID
                try {
                    console.log("📝 Loading demo character from planet folder for world:", worldId);

                    // Extract the short world ID (first 8 chars after "demo-")
                    const shortWorldId = worldId.replace("demo-", "").slice(0, 8);

                    // Try common demo character ID patterns
                    const possibleCharIds = [
                        `demo-char-john-${shortWorldId}`,
                        `demo-char-jane-${shortWorldId}`,
                        questRun?.partyCharacterIds?.[0], // Also try the quest's stored ID
                    ].filter(Boolean);

                    console.log("🔍 Trying character IDs:", possibleCharIds);

                    let demoChar = null;
                    for (const charId of possibleCharIds) {
                        try {
                            const response = await fetch(`/api/world/${worldId}/character/${charId}`);
                            if (response.ok) {
                                const rawChar = await response.json();
                                console.log("✓ Found demo character:", rawChar.name, "with ID:", rawChar.id);

                                // Ensure the character has all required fields for combat
                                // Calculate maxHp based on endurance (using default rules: base 50 + endurance * 10)
                                const endurance = rawChar.stats?.endurance || 10;
                                const maxHp = 50 + endurance * 10;

                                demoChar = {
                                    ...rawChar,
                                    appearancePrompt: rawChar.appearancePrompt || `A ${rawChar.age || 30} year old ${rawChar.gender || 'person'} named ${rawChar.name}`,
                                    hp: rawChar.hp ?? maxHp,
                                    maxHp: rawChar.maxHp ?? maxHp,
                                    xp: rawChar.xp ?? 0,
                                    inventory: rawChar.inventory || [],
                                    equipped: rawChar.equipped || {},
                                    skills: rawChar.skills || [],
                                    traits: Array.isArray(rawChar.traits)
                                        ? rawChar.traits.map((t: any) => typeof t === 'string' ? { id: t, name: t } : t)
                                        : [],
                                };
                                break;
                            }
                        } catch (err) {
                            console.log("⏭️ Character not found with ID:", charId);
                        }
                    }

                    if (demoChar) {
                        // CRITICAL: Add to GameRegistry with the exact ID from the character file
                        // We'll add it now and also set a flag to re-add it after CombatSimulator loads
                        const charactersMap = (GameRegistry as any).characters as Map<string, any>;
                        charactersMap.set(demoChar.id, demoChar);
                        console.log("✓ Demo character registered in GameRegistry with ID:", demoChar.id);
                        console.log("✓ GameRegistry now has", charactersMap.size, "characters");

                        // Store the demo character so we can re-add it if needed
                        (window as any).__demoCharacter = demoChar;

                        // Update the quest's partyCharacterIds to use the correct ID
                        if (questRun && questRun.partyCharacterIds?.[0] !== demoChar.id) {
                            console.log("🔄 Updating quest partyCharacterIds from", questRun.partyCharacterIds?.[0], "to", demoChar.id);
                            questRun.partyCharacterIds = [demoChar.id];
                        }
                    } else {
                        console.error("❌ Could not find demo character with any known ID pattern");
                    }
                } catch (err) {
                    console.error("❌ Failed to load demo character:", err);
                }

                setCombatReady(true);
            } catch (err) {
                console.error("❌ Failed to prepare combat:", err);
                setCombatReady(true);
            }
        }

        void prepareCombat();
    }, [isCombatActive, combatReady, questRun, worldId, setActiveWorldId]);

    const generateIllustrationForCurrentNode = useCallback(async (run: QuestRunRecord) => {
        if (!run.currentNode) return;

        const nodeId = run.currentNode.id;

        // Check if we're already generating for this node
        if (generatingIllustrationsRef.current.has(nodeId)) {
            console.log("⏭️ Already generating illustration for node:", nodeId);
            return;
        }

        // Check if illustration already exists in localStorage
        const existingKey = `quest-illustration-node-${nodeId}`;
        const existingUrl = localStorage.getItem(existingKey);
        if (existingUrl) {
            console.log("✓ Using cached illustration for node:", nodeId);
            setIllustrationUrl(existingUrl);
            return;
        }

        // Mark as generating
        generatingIllustrationsRef.current.add(nodeId);

        // Create a stable illustration ID for this node
        const illustrationId = `qill-node-${nodeId}`;

        console.log("🎨 Generating illustration for node:", nodeId);
        setIsGeneratingIllustration(true);

        // Build quest context from log
        const questContext = run.log
            ?.slice(-3) // Last 3 events for context
            .map((entry: any) => entry.title || entry.text)
            .filter(Boolean)
            .join(". ") || "";

        try {
            const response = await fetch("/api/quests/generate-illustration", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    worldId: run.worldId,
                    runId: run.id,
                    illustrationId,
                    questContext,
                    previousIllustrationUrl: illustrationUrl, // Use current illustration as style reference
                }),
            });

            if (!response.ok) {
                throw new Error(`Illustration generation failed: ${response.status}`);
            }

            const data = await response.json() as { url?: string };

            if (data.url) {
                setIllustrationUrl(data.url);
                localStorage.setItem(existingKey, data.url);
                console.log("✓ Illustration generated and cached:", data.url);
            }
        } catch (err) {
            console.error("Failed to generate illustration:", err);
        } finally {
            setIsGeneratingIllustration(false);
            generatingIllustrationsRef.current.delete(nodeId);
        }
    }, [illustrationUrl]);

    const loadIllustration = useCallback(async (illustrationId: string, status: string) => {
        // Check localStorage first
        const illustrationKey = `quest-illustration-${illustrationId}`;
        const savedUrl = localStorage.getItem(illustrationKey);
        if (savedUrl) {
            setIllustrationUrl(savedUrl);
            console.log("✓ Loaded saved illustration:", illustrationId);
            return;
        }

        // If status is completed, try to fetch it
        if (status === "completed") {
            try {
                const url = `/api/quests/illustrations/${illustrationId}`;
                const response = await fetch(url, { method: "HEAD" });
                if (response.ok) {
                    setIllustrationUrl(url);
                    localStorage.setItem(illustrationKey, url);
                    console.log("✓ Loaded illustration:", illustrationId);
                    return;
                }
            } catch (err) {
                console.warn("Illustration not available:", err);
            }
        }

        // If queued or failed, try to generate
        if (status === "queued" || status === "failed") {
            void generateIllustration(illustrationId);
        }
    }, []);

    const generateIllustration = useCallback(async (illustrationId: string) => {
        if (isGeneratingIllustration) return;

        setIsGeneratingIllustration(true);
        console.log("🎨 Generating illustration:", illustrationId);

        try {
            const response = await fetch("/api/quests/generate-illustration", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    worldId,
                    runId,
                    illustrationId,
                }),
            });

            if (!response.ok) {
                throw new Error(`Illustration generation failed: ${response.status}`);
            }

            const data = await response.json() as { jobId?: string; url?: string };

            if (data.jobId) {
                // Poll for completion
                console.log("⏳ Illustration job started:", data.jobId);
                await pollForIllustration(illustrationId, data.jobId);
            } else if (data.url) {
                const illustrationKey = `quest-illustration-${illustrationId}`;
                setIllustrationUrl(data.url);
                localStorage.setItem(illustrationKey, data.url);
                console.log("✓ Illustration generated:", data.url);
            }
        } catch (err) {
            console.error("Failed to generate illustration:", err);
        } finally {
            setIsGeneratingIllustration(false);
        }
    }, [worldId, runId, isGeneratingIllustration]);

    const pollForIllustration = useCallback(async (illustrationId: string, jobId: string) => {
        const maxAttempts = 30;
        let attempts = 0;

        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            attempts++;

            try {
                const url = `/api/quests/illustrations/${illustrationId}`;
                const response = await fetch(url, { method: "HEAD" });
                if (response.ok) {
                    const illustrationKey = `quest-illustration-${illustrationId}`;
                    setIllustrationUrl(url);
                    localStorage.setItem(illustrationKey, url);
                    console.log("✓ Illustration ready:", illustrationId);
                    return;
                }
            } catch (err) {
                // Continue polling
            }
        }

        console.warn("⚠️ Illustration polling timeout");
    }, []);

    const fixMissingChoiceLabels = useCallback(async (run: QuestRunRecord) => {
        if (isFixingChoices) return;

        setIsFixingChoices(true);
        console.log("🔧 Fixing missing choice labels...");

        try {
            const response = await fetch("/api/quests/fix-choice-labels", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    worldId: run.worldId,
                    runId: run.id,
                    nodeId: run.currentNode.id,
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to fix choices: ${response.status}`);
            }

            const data = await response.json() as { jobId?: string; run?: QuestRunRecord };

            if (data.jobId) {
                console.log("⏳ Choice fix job started:", data.jobId);
                // Poll for updated quest
                await new Promise(resolve => setTimeout(resolve, 3000));
                const reloadResponse = await fetch(`/api/planet/quests/${worldId}/${runId}`);
                if (reloadResponse.ok) {
                    const updatedRun = await reloadResponse.json();
                    setQuestRun(updatedRun);
                    console.log("✓ Choices fixed!");
                }
            } else if (data.run) {
                setQuestRun(data.run);
                console.log("✓ Choices fixed!");
            }
        } catch (err) {
            console.error("Failed to fix choices:", err);
        } finally {
            setIsFixingChoices(false);
        }
    }, [worldId, runId, isFixingChoices]);

    const generateTTS = useCallback(async () => {
        if (!questRun?.currentNode?.text || isGeneratingTTS) return;

        setIsGeneratingTTS(true);
        setError(null);

        try {
            const response = await fetch("/api/tts/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: questRun.currentNode.text,
                    voiceName: "Kore",
                }),
            });

            if (!response.ok) {
                throw new Error(`TTS generation failed: ${response.status}`);
            }

            const data = await response.json() as { audioUrl: string };
            const url = data.audioUrl?.startsWith("http")
                ? data.audioUrl
                : data.audioUrl?.startsWith("/api/")
                    ? data.audioUrl
                    : `/api${data.audioUrl}`;
            setTtsUrl(url);

            // Save TTS URL to localStorage for persistence
            if (questRun.currentNode?.id) {
                const ttsKey = `quest-tts-${runId}-${questRun.currentNode.id}`;
                localStorage.setItem(ttsKey, url);
                console.log("✓ TTS generated and saved:", url);
            } else {
                console.log("✓ TTS generated:", url);
            }
        } catch (err) {
            console.error("Failed to generate TTS:", err);
            setError(err instanceof Error ? err.message : "Failed to generate narration");
        } finally {
            setIsGeneratingTTS(false);
        }
    }, [questRun?.currentNode?.text, isGeneratingTTS]);

    const toggleTTS = useCallback(async () => {
        if (!ttsUrl) {
            await generateTTS();
            return;
        }

        if (!audioRef.current) {
            audioRef.current = new Audio(ttsUrl);
            audioRef.current.onended = () => setIsTTSPlaying(false);
            await audioRef.current.play();
            setIsTTSPlaying(true);
            return;
        }

        if (isTTSPlaying) {
            audioRef.current.pause();
            setIsTTSPlaying(false);
        } else {
            audioRef.current.src = ttsUrl;
            audioRef.current.currentTime = 0;
            await audioRef.current.play();
            setIsTTSPlaying(true);
        }
    }, [ttsUrl, isTTSPlaying, generateTTS]);

    // Reset TTS and load illustration when node changes
    useEffect(() => {
        setTtsUrl(null);
        setIsTTSPlaying(false);
        setIllustrationUrl(null);
        setSelectedChoiceId(null);
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }

        // Load TTS if saved
        if (questRun?.currentNode?.id) {
            const ttsKey = `quest-tts-${runId}-${questRun.currentNode.id}`;
            const savedTtsUrl = localStorage.getItem(ttsKey);
            if (savedTtsUrl) {
                setTtsUrl(savedTtsUrl);
            }
        }

        // Load illustration
        if (questRun?.currentNode?.illustrationId) {
            void loadIllustration(questRun.currentNode.illustrationId, questRun.currentNode.illustrationStatus);
        } else if (questRun?.currentNode) {
            // If no illustration ID, generate one for this node
            console.log("⚠️ No illustration ID for node, generating...");
            void generateIllustrationForCurrentNode(questRun);
        }

        // Check if choices need fixing
        if (questRun?.currentNode?.choices) {
            const needsFixing = questRun.currentNode.choices.some((c: any) =>
                c.label?.startsWith("Take option ") || !c.label
            );
            if (needsFixing && !isFixingChoices) {
                void fixMissingChoiceLabels(questRun);
            }
        }
    }, [questRun?.currentNode?.id, runId, loadIllustration, fixMissingChoiceLabels, isFixingChoices, questRun, generateIllustrationForCurrentNode]);

    const handleAdvanceQuest = useCallback(async (choiceLabel?: string, customAction?: string) => {
        if (!questRun || isAdvancing) return;

        // If no choice/action provided, use selected choice
        const finalChoiceLabel = choiceLabel || (selectedChoiceId ? questRun.currentNode.choices?.find((c: any) => c.id === selectedChoiceId)?.label : undefined);

        if (!finalChoiceLabel) {
            setError("Please select a choice");
            return;
        }

        setIsAdvancing(true);
        setAdvancingStatus("Resolving your choice...");
        setAdvancingProgress(10);
        setError(null);

        try {
            console.log("🎮 Advancing quest with:", finalChoiceLabel);

            const response = await fetch("/api/quests/advance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    worldId: questRun.worldId,
                    runId: questRun.id,
                    run: questRun,
                    chosenAction: finalChoiceLabel,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to advance quest: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log("✓ Quest advanced:", result);
            setAdvancingProgress(30);

            // Check if it's a job (async mode)
            if (result?.jobId) {
                setAdvancingStatus("Generating next scene...");
                setAdvancingProgress(40);

                // Poll for job completion
                let attempts = 0;
                const maxAttempts = 30;

                while (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    attempts++;

                    // Update progress
                    const progress = 40 + (attempts / maxAttempts) * 40;
                    setAdvancingProgress(Math.min(progress, 80));

                    // Check if quest has been updated
                    const checkResponse = await fetch(`/api/planet/quests/${worldId}/${runId}`);
                    if (checkResponse.ok) {
                        const updatedRun = await checkResponse.json();

                        // Check if we've moved to a new node
                        if (updatedRun.currentNode?.id !== questRun.currentNode?.id) {
                            setAdvancingStatus("Loading scene...");
                            setAdvancingProgress(85);
                            setQuestRun(updatedRun);

                            // Generate illustration for new node if needed
                            if (!updatedRun.currentNode?.illustrationId) {
                                setAdvancingStatus("Creating illustration...");
                                setAdvancingProgress(90);
                                await generateIllustrationForCurrentNode(updatedRun);
                            }

                            setAdvancingProgress(100);
                            break;
                        }
                    }
                }

                if (attempts >= maxAttempts) {
                    console.warn("⚠️ Quest advancement polling timeout");
                    // Still try to reload
                    const reloadResponse = await fetch(`/api/planet/quests/${worldId}/${runId}`);
                    if (reloadResponse.ok) {
                        const updatedRun = await reloadResponse.json();
                        setQuestRun(updatedRun);
                    }
                }
            } else if (result?.run) {
                setAdvancingStatus("Loading scene...");
                setAdvancingProgress(85);
                setQuestRun(result.run);

                // Generate illustration for new node if needed
                if (result.run.currentNode && !result.run.currentNode.illustrationId) {
                    setAdvancingStatus("Creating illustration...");
                    setAdvancingProgress(90);
                    await generateIllustrationForCurrentNode(result.run);
                }

                setAdvancingProgress(100);
            }

            setSelectedChoiceId(null);

            // Check if quest is complete
            if (result?.run?.currentNode?.kind === "ending") {
                console.log("🎉 Quest completed!");
                onComplete?.();
            }
        } catch (err) {
            console.error("Failed to advance quest:", err);
            setError(err instanceof Error ? err.message : "Failed to advance quest");
        } finally {
            // Small delay to show 100% completion
            await new Promise(resolve => setTimeout(resolve, 300));
            setIsAdvancing(false);
            setAdvancingStatus(null);
            setAdvancingProgress(0);
        }
    }, [questRun, isAdvancing, worldId, runId, onComplete, selectedChoiceId, generateIllustrationForCurrentNode]);

    // Memoize ecologyBundle so CombatSimulator doesn't re-render in a loop
    // Cast to EcologyBundle — CombatSimulator only uses the fauna array
    const combatEcologyBundle = useMemo(() => ({
        fauna: faunaEntries,
        flora: [],
        biomes: [],
        baselines: [],
        archetypes: { archetypes: [] },
        biomeModelSettings: { biomes: [] },
        worldId,
        updatedAt: new Date().toISOString(),
    } as any), [faunaEntries, worldId]);

    if (isLoading) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <div className="flex items-center gap-4 text-[#d7eaf4]">
                    <LoaderCircle className="h-5 w-5 animate-spin text-emerald-400" />
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-400/80">Loading Quest</div>
                        <div className="mt-1 text-sm text-slate-200">Preparing your adventure...</div>
                    </div>
                </div>
            </div>
        );
    }

    if (error || !questRun) {
        return (
            <div className="flex h-full w-full items-center justify-center px-6">
                <div className="w-full max-w-[720px] rounded-[28px] border border-red-400/15 bg-[linear-gradient(160deg,rgba(18,10,12,0.94),rgba(7,4,6,0.92))] px-8 py-10 shadow-[0_32px_100px_rgba(0,0,0,0.45)] backdrop-blur-3xl">
                    <div className="text-[10px] font-black uppercase tracking-[0.28em] text-red-200/60">Quest Error</div>
                    <div className="mt-4 text-sm leading-6 text-red-50">{error || "Failed to load quest"}</div>
                </div>
            </div>
        );
    }

    if (!currentNode) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <div className="text-sm text-slate-500">No active quest node</div>
            </div>
        );
    }

    const isEnding = currentNode.kind === "ending";
    const borderClass = currentNode.kind === "discussion"
        ? "border-cyan-500/15"
        : currentNode.kind === "combat"
            ? "border-red-500/15"
            : isEnding
                ? "border-emerald-500/20"
                : "border-amber-500/15";


    // If combat is active, show combat view
    if (hasPendingCombat && isCombatActive) {
        if (!combatReady || !combatFaunaReady) {
            return (
                <div className="relative z-10 h-full w-full flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4">
                        <LoaderCircle className="h-12 w-12 animate-spin text-orange-400" />
                        <p className="text-sm text-gray-400">
                            {combatFaunaReady ? "Preparing combat..." : "Loading hostile fauna..."}
                        </p>
                    </div>
                </div>
            );
        }

        return (
            <div className="relative z-10 h-full w-full flex items-center justify-center">
                <div className="w-full max-w-[1400px] h-[800px] rounded-[24px] border border-red-500/20 bg-black/90 backdrop-blur-xl overflow-hidden shadow-[0_32px_100px_rgba(0,0,0,0.6)]">
                    <CombatSimulator
                        key={`combat-${questRun.id}-${currentNode.id}`}
                        initialPlayerIds={questRun.partyCharacterIds}
                        initialEnemyIds={currentNode.pendingCombat?.enemyIds || []}
                        initialCombatStarted={true}
                        ecologyBundle={combatEcologyBundle}
                        onCombatFinished={(summary) => {
                            console.log("✓ Combat finished with summary:", summary);
                            setIsCombatActive(false);
                            setCombatReady(false);
                            void handleAdvanceQuest(undefined, summary);
                        }}
                        onCombatCancelled={() => {
                            console.log("❌ Combat cancelled");
                            setIsCombatActive(false);
                            setCombatReady(false);
                        }}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="relative z-10 h-full w-full flex items-center justify-center px-4 py-3">
            <div className="flex w-full gap-3 items-stretch">
                {/* Illustration Panel */}
                {illustrationUrl && (
                    <div className="w-[600px] shrink-0 flex flex-col gap-2">
                        {/* Character Stats */}
                        {characterStats && (
                            <div className="rounded-[20px] border border-white/10 bg-[linear-gradient(160deg,rgba(9,13,21,0.85),rgba(4,7,13,0.80))] backdrop-blur-xl px-5 py-3 shadow-lg">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 rounded-full border-2 border-emerald-400/40 bg-emerald-500/20 flex items-center justify-center overflow-hidden">
                                            {characterStats.portraitUrl ? (
                                                <img
                                                    src={characterStats.portraitUrl}
                                                    alt={characterStats.name || "Character"}
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <span className="text-sm font-black text-emerald-300">
                                                    {characterStats.name?.charAt(0) || "?"}
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-white">{characterStats.name || "Traveler"}</div>
                                            <div className="text-[10px] uppercase tracking-wider text-gray-400">
                                                {characterStats.archetype || characterStats.occupation?.name || "Explorer"}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-3">
                                        {characterStats.hp !== undefined && (
                                            <div className="text-center">
                                                <div className="text-[10px] uppercase tracking-wider text-gray-400">HP</div>
                                                <div className="text-sm font-bold text-red-300">{characterStats.hp}/{characterStats.maxHp || characterStats.hp}</div>
                                            </div>
                                        )}
                                        {characterStats.level !== undefined && (
                                            <div className="text-center">
                                                <div className="text-[10px] uppercase tracking-wider text-gray-400">Level</div>
                                                <div className="text-sm font-bold text-cyan-300">{characterStats.level}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Illustration */}
                        <div className={`flex-1 rounded-[24px] border ${borderClass} overflow-hidden shadow-[0_32px_100px_rgba(0,0,0,0.45)]`}>
                            <img
                                src={illustrationUrl}
                                alt={currentNode.title}
                                className="w-full h-full object-cover"
                            />
                        </div>
                    </div>
                )}

                {/* Quest Panel */}
                <div className={`flex-1 min-w-[500px] rounded-[24px] border ${borderClass} bg-[linear-gradient(160deg,rgba(9,13,21,0.75),rgba(4,7,13,0.70))] shadow-[0_32px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl overflow-hidden`}>
                    {/* Header */}
                    <div className="border-b border-white/5 px-6 py-4">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-3 mb-4">
                                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-gray-300">
                                        Act {currentNode.act}
                                    </span>
                                    <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">
                                        {currentNode.kind === "combat" && isEnding ? "Final Combat" : `Node ${questRun.nodeCount}/${questRun.maxNodeCount}`}
                                    </span>
                                    <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${currentNode.kind === "discussion"
                                        ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-200"
                                        : currentNode.kind === "combat"
                                            ? "border-red-500/20 bg-red-500/10 text-red-200"
                                            : isEnding
                                                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                                                : "border-amber-500/20 bg-amber-500/10 text-amber-200"
                                        }`}>
                                        {currentNode.kind}
                                    </span>
                                </div>
                                <h2 className="text-3xl font-black leading-tight text-white">{currentNode.title}</h2>
                            </div>

                            {/* TTS Button */}
                            <button
                                type="button"
                                onClick={() => { void toggleTTS(); }}
                                disabled={isGeneratingTTS}
                                aria-label={isGeneratingTTS ? "Generating narration" : isTTSPlaying ? "Pause narration" : ttsUrl ? "Play narration" : "Generate narration"}
                                className="group relative mt-1 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/[0.08] text-amber-300 transition-colors hover:bg-amber-400/[0.16] disabled:opacity-60"
                            >
                                <Headphones
                                    className={`h-5 w-5 transition-transform group-hover:scale-105 ${isGeneratingTTS ? "animate-pulse" : ""}`}
                                    strokeWidth={2.2}
                                    aria-hidden="true"
                                />
                                <span className="absolute -right-1 -bottom-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-400/25 bg-[#0a0806] text-amber-300 shadow-[0_0_14px_rgba(0,0,0,0.35)]">
                                    {isGeneratingTTS ? (
                                        <LoaderCircle className="h-3 w-3 animate-spin" strokeWidth={2.4} aria-hidden="true" />
                                    ) : isTTSPlaying ? (
                                        <Pause className="h-3 w-3 fill-current" strokeWidth={2.6} aria-hidden="true" />
                                    ) : (
                                        <Play className="ml-[1px] h-3 w-3 fill-current" strokeWidth={2.6} aria-hidden="true" />
                                    )}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="px-6 py-4 max-h-[65vh] overflow-y-auto custom-scrollbar">
                        <div className="rounded-[24px] border border-white/5 bg-[linear-gradient(145deg,rgba(10,14,20,0.85),rgba(5,8,12,0.80))] backdrop-blur-xl p-6">
                            <div className="text-[15px] leading-7 text-gray-100 whitespace-pre-wrap">
                                {currentNode.text}
                            </div>

                            {isEnding && (
                                <div className="mt-6 rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5">
                                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-300">Quest Complete</div>
                                    <div className="mt-2 text-sm text-emerald-100">
                                        {questRun.status === "failed" ? "The quest has failed." : "The quest has concluded."}
                                    </div>
                                    {questRun.summary && (
                                        <div className="mt-3 text-sm text-gray-300">{questRun.summary}</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    {!isEnding && (
                        <div className="border-t border-white/5 px-6 py-4">
                            <div className="space-y-4">
                                {/* Choice buttons */}
                                {currentNode.choices && currentNode.choices.length > 0 && (
                                    <div className="flex flex-col gap-3">
                                        {currentNode.choices.map((choice) => {
                                            const isFallback = choice.label?.startsWith("Take option ") || !choice.label;
                                            const isSelected = selectedChoiceId === choice.id;
                                            return (
                                                <button
                                                    key={choice.id}
                                                    type="button"
                                                    onClick={() => setSelectedChoiceId(choice.id)}
                                                    disabled={isFallback && isFixingChoices}
                                                    className={`rounded-full border px-5 py-2.5 text-sm font-bold tracking-wide transition-all disabled:opacity-50 text-left ${isFallback
                                                        ? "border-gray-500/20 bg-gray-500/10 text-gray-400 animate-pulse"
                                                        : isSelected
                                                            ? "border-orange-400 bg-orange-500/30 text-orange-100 shadow-lg shadow-orange-500/20"
                                                            : "border-orange-500/20 bg-orange-500/10 text-orange-100 hover:bg-orange-500/20"
                                                        }`}
                                                >
                                                    {isFallback && isFixingChoices ? "Generating..." : choice.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Resolve/Fight button */}
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (currentNode.kind === "combat") {
                                                // For combat nodes, launch combat directly
                                                console.log("🥊 Fight button clicked! Launching combat...");
                                                console.log("Combat data:", { hasPendingCombat, enemyIds: currentNode.pendingCombat?.enemyIds, playerIds: questRun.partyCharacterIds, faunaCount: faunaEntries.length });
                                                setIsCombatActive(true);
                                            } else {
                                                // For other nodes, advance the quest
                                                handleAdvanceQuest();
                                            }
                                        }}
                                        disabled={isAdvancing || (currentNode.kind !== "combat" && !selectedChoiceId)}
                                        className={`group relative rounded-2xl border px-8 py-3.5 text-sm font-black uppercase tracking-widest shadow-[0_8px_32px_rgba(251,146,60,0.15)] backdrop-blur-xl transition-all disabled:cursor-not-allowed disabled:opacity-40 overflow-hidden ${currentNode.kind === "combat"
                                            ? "border-red-400/30 bg-gradient-to-br from-red-500/20 via-red-600/15 to-red-700/20 text-red-100 hover:border-red-400/50 hover:shadow-[0_12px_48px_rgba(239,68,68,0.25)] disabled:hover:border-red-400/30 disabled:hover:shadow-[0_8px_32px_rgba(239,68,68,0.15)]"
                                            : "border-orange-400/30 bg-gradient-to-br from-orange-500/20 via-orange-600/15 to-orange-700/20 text-orange-100 hover:border-orange-400/50 hover:shadow-[0_12px_48px_rgba(251,146,60,0.25)] disabled:hover:border-orange-400/30 disabled:hover:shadow-[0_8px_32px_rgba(251,146,60,0.15)]"
                                            }`}
                                    >
                                        {/* Progress bar background */}
                                        {isAdvancing && (
                                            <div
                                                className={`absolute inset-0 bg-gradient-to-r transition-all duration-300 ease-out ${currentNode.kind === "combat"
                                                    ? "from-red-500/30 to-red-600/30"
                                                    : "from-orange-500/30 to-orange-600/30"
                                                    }`}
                                                style={{ width: `${advancingProgress}%` }}
                                            />
                                        )}

                                        <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br to-transparent opacity-0 transition-opacity group-hover:opacity-100 group-disabled:opacity-0 ${currentNode.kind === "combat" ? "from-red-400/10" : "from-orange-400/10"
                                            }`} />

                                        <span className="relative flex items-center gap-2">
                                            {isAdvancing ? (
                                                <>
                                                    <LoaderCircle className="h-4 w-4 animate-spin" />
                                                    <span className="flex flex-col items-start">
                                                        <span className="text-xs leading-tight">{advancingStatus || "Resolving..."}</span>
                                                        <span className="text-[10px] opacity-70">{Math.floor(advancingProgress)}%</span>
                                                    </span>
                                                </>
                                            ) : (
                                                currentNode.kind === "combat" ? "Fight!" : "Resolve"
                                            )}
                                        </span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {isEnding && (
                        <div className="border-t border-white/5 px-6 py-4">
                            <button
                                type="button"
                                onClick={() => {
                                    console.log("🎯 Proceeding to step 5...");
                                    // Navigate to step 5 with current search params
                                    navigate(`/demo/5?${searchParams.toString()}`);
                                }}
                                className="w-full rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/20 via-emerald-600/15 to-emerald-700/20 px-6 py-4 text-center font-black uppercase tracking-widest text-emerald-100 transition-all hover:bg-emerald-500/30 hover:border-emerald-400/50 hover:shadow-[0_12px_48px_rgba(16,185,129,0.25)]"
                            >
                                Continue
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
