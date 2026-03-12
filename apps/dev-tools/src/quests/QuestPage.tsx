import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Card, Modal, TabBar } from "@ashtrail/ui";
import {
    Character,
    CombatResolutionSummary,
    GameRegistry,
    QuestChainRecord,
    QuestGlossaryEntry,
    QuestIllustrationRecord,
    QuestRunRecord,
    QuestRunSummary,
    QuestSeedConfig,
    QuestTermRef,
    Skill,
    Trait,
    type Item,
} from "@ashtrail/core";
import { useActiveWorld } from "../hooks/useActiveWorld";
import { useGenerationHistory } from "../hooks/useGenerationHistory";
import { HistoryGallery } from "../worldgeneration/HistoryGallery";
import type { Faction } from "../history/FactionsTab";
import type { Area } from "../history/LocationsTab";
import type { EcologyBundle } from "../ecology/types";
import { CombatSimulator } from "../gameplay-engine/combat/CombatSimulator";

type QuestTab = "seed" | "run" | "archive";

interface HistoryCharacterRecord {
    id: string;
    name: string;
    role: string;
    status: string;
    location: string;
    affiliation: string;
    lore: string;
    relationships: string;
}

interface EcologyOption {
    id: string;
    kind: "biome" | "climate" | "fauna" | "flora";
    label: string;
    summary: string;
}

interface QuestEngineResponse {
    run: QuestRunRecord;
    materializedCharacters?: Character[];
    restoredCharacters?: Character[];
    partyUpdates?: PartyUpdate[];
    warnings?: string[];
}

interface PartyUpdate {
    characterId: string;
    summary: string;
    statChanges: Array<{ target: string; value: number }>;
    addTraitNames: string[];
    removeTraitNames: string[];
    addItems: Array<{ name: string; category: string; rarity: string; description: string }>;
    addSkills: Array<{ name: string; description: string; category: string }>;
    relationshipChanges: Array<{ characterName: string; change: number }>;
}

const DEFAULT_SEED: QuestSeedConfig = {
    premise: "",
    objective: "",
    stakes: "",
    tone: "tense",
    difficulty: "medium",
    runLength: "medium",
    openness: "balanced",
    targetEndingCount: 3,
    factionAnchorIds: [],
    locationAnchorIds: [],
    ecologyAnchorIds: [],
    notes: "",
};

const API_BASE = "/api";

function isQuestTab(value: string | null): value is QuestTab {
    return value === "seed" || value === "run" || value === "archive";
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
        const details = await response.text().catch(() => "");
        throw new Error(details || `Request failed: ${response.status}`);
    }
    return response.json();
}

function normalizeItemCategory(category?: string): Item["category"] {
    switch ((category || "").toLowerCase()) {
        case "weapon":
        case "armor":
        case "consumable":
        case "resource":
        case "junk":
            return category.toLowerCase() as Item["category"];
        default:
            return "junk";
    }
}

function normalizeItemRarity(rarity?: string): Item["rarity"] {
    switch ((rarity || "").toLowerCase()) {
        case "salvaged":
        case "reinforced":
        case "pre-ash":
        case "specialized":
        case "relic":
        case "ashmarked":
            return rarity.toLowerCase() as Item["rarity"];
        default:
            return "salvaged";
    }
}

function normalizeSkillCategory(category?: string): Skill["category"] {
    switch ((category || "").toLowerCase()) {
        case "occupation":
        case "unique":
        case "equipment":
            return category.toLowerCase() as Skill["category"];
        default:
            return "base";
    }
}

function createQuestTrait(name: string): Trait {
    return {
        id: `quest-trait-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        name,
        description: `Quest-acquired trait: ${name}`,
        cost: 0,
        type: "neutral",
    };
}

function createQuestItem(template: { name: string; category: string; rarity: string; description: string }): Item {
    return {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: template.name,
        category: normalizeItemCategory(template.category),
        rarity: normalizeItemRarity(template.rarity),
        description: template.description || "Recovered during a quest.",
        cost: 0,
        effects: [],
    };
}

function createQuestSkill(template: { name: string; description: string; category: string }): Skill {
    return {
        id: `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: template.name,
        description: template.description || "Learned during a quest.",
        category: normalizeSkillCategory(template.category),
        apCost: 1,
        minRange: 0,
        maxRange: 1,
        areaType: "single",
        areaSize: 0,
        targetType: "self",
        cooldown: 0,
        effectType: "support",
        effects: [],
    };
}

function buildEcologyOptions(bundle: EcologyBundle | null): EcologyOption[] {
    if (!bundle) return [];
    return [
        ...(bundle.biomes || []).map((entry) => ({
            id: `biome:${entry.id}`,
            kind: "biome" as const,
            label: entry.name,
            summary: entry.description || entry.biomeType,
        })),
        ...(bundle.climates || []).map((entry) => ({
            id: `climate:${entry.id}`,
            kind: "climate" as const,
            label: entry.name,
            summary: `${entry.classification} • ${entry.temperatureSummary}`,
        })),
        ...(bundle.fauna || []).slice(0, 12).map((entry) => ({
            id: `fauna:${entry.id}`,
            kind: "fauna" as const,
            label: entry.name,
            summary: [
                entry.description,
                `${entry.bodyProfile.sizeClass} ${entry.bodyProfile.locomotion}`,
                `${entry.behaviorProfile.temperament} threat ${entry.dangerLevel}/100`,
                `skills: ${(entry.skillIds || []).slice(0, 3).join(", ") || "none"}`,
                `trainability ${entry.behaviorProfile.trainability}/100`,
            ].filter(Boolean).join(" • "),
        })),
        ...(bundle.flora || []).slice(0, 12).map((entry) => ({
            id: `flora:${entry.id}`,
            kind: "flora" as const,
            label: entry.name,
            summary: [
                entry.description,
                `${entry.bodyProfile.sizeClass} growth ${entry.bodyProfile.growthRate}/100`,
                `toxicity ${entry.hazardProfile.toxicity}/100`,
                `yield ${entry.resourceProfile.yieldPerHarvest}/100`,
                `medicinal ${entry.resourceProfile.medicinalValue}/100`,
                `rarity ${entry.resourceProfile.rarity}/100`,
            ].filter(Boolean).join(" • "),
        })),
    ];
}

function isDiscussionKind(kind?: string | null): boolean {
    return kind === "discussion" || kind === "dialogue";
}

function buildMaterializationNotice(characters?: Character[]): string | null {
    if (!characters?.length) return null;
    const names = characters
        .map((character) => character.name)
        .filter(Boolean)
        .slice(0, 3);
    const label = characters.length === 1 ? "quest NPC" : "quest NPCs";
    const suffix = characters.length > names.length ? ", ..." : "";
    const details = names.length > 0 ? `: ${names.join(", ")}${suffix}` : "";
    return `Added ${characters.length} ${label} to Character Builder${details}.`;
}

function buildQuestNotices(response: QuestEngineResponse): string[] {
    const notices = [...(response.warnings || [])];
    if (response.restoredCharacters?.length) {
        notices.unshift("Run reset to the opening state and the party was restored from the retry snapshot.");
    }
    const materializationNotice = buildMaterializationNotice(response.materializedCharacters);
    if (materializationNotice) {
        notices.unshift(materializationNotice);
    }
    return notices;
}

function escapeRegex(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function QuestPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<QuestTab>(isQuestTab(searchParams.get("tab")) ? searchParams.get("tab") as QuestTab : "seed");
    const [showGalleryModal, setShowGalleryModal] = useState(false);
    const [builderCharacters, setBuilderCharacters] = useState<Character[]>([]);
    const [factions, setFactions] = useState<Faction[]>([]);
    const [locations, setLocations] = useState<Area[]>([]);
    const [historyCharacters, setHistoryCharacters] = useState<HistoryCharacterRecord[]>([]);
    const [gmContext, setGmContext] = useState<any | null>(null);
    const [ecologyBundle, setEcologyBundle] = useState<EcologyBundle | null>(null);
    const [questArchive, setQuestArchive] = useState<QuestRunSummary[]>([]);
    const [selectedArchiveRun, setSelectedArchiveRun] = useState<QuestRunRecord | null>(null);
    const [activeRun, setActiveRun] = useState<QuestRunRecord | null>(null);
    const [questSeed, setQuestSeed] = useState<QuestSeedConfig>(DEFAULT_SEED);
    const [selectedPartyIds, setSelectedPartyIds] = useState<string[]>([]);
    const [freeformAction, setFreeformAction] = useState("");
    const [isLoadingWorldData, setIsLoadingWorldData] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isAdvancing, setIsAdvancing] = useState(false);
    const [notices, setNotices] = useState<string[]>([]);
    const [activeChain, setActiveChain] = useState<QuestChainRecord | null>(null);
    const [glossaryEntries, setGlossaryEntries] = useState<Record<string, QuestGlossaryEntry>>({});
    const [currentIllustration, setCurrentIllustration] = useState<QuestIllustrationRecord | null>(null);
    const [generatingPortraitIds, setGeneratingPortraitIds] = useState<string[]>([]);

    const { history, deleteFromHistory, renameInHistory } = useGenerationHistory();
    const { activeWorldId, setActiveWorldId } = useActiveWorld();
    const selectedWorld = history.find((item) => item.id === activeWorldId) ?? null;

    const partyCharacters = useMemo(
        () => builderCharacters.filter((character) => selectedPartyIds.includes(character.id)),
        [builderCharacters, selectedPartyIds],
    );
    const availablePartyCharacters = useMemo(
        () => builderCharacters.filter((character) => character.worldId === activeWorldId && !character.isNPC),
        [activeWorldId, builderCharacters],
    );
    const activeRunParty = useMemo(
        () =>
            activeRun
                ? builderCharacters.filter((character) => activeRun.partyCharacterIds.includes(character.id))
                : [],
        [activeRun, builderCharacters],
    );
    const ecologyOptions = useMemo(() => buildEcologyOptions(ecologyBundle), [ecologyBundle]);
    const hasCanonicalWorldPrompt = !!gmContext?.worldPrompt?.trim();

    useEffect(() => {
        const tab = searchParams.get("tab");
        if (isQuestTab(tab) && tab !== activeTab) {
            setActiveTab(tab);
        }
        if (!isQuestTab(tab)) {
            setSearchParams({ tab: "seed" }, { replace: true });
        }
    }, [activeTab, searchParams, setSearchParams]);

    const refreshBuilderCharacters = useCallback(async () => {
        await GameRegistry.fetchFromBackend();
        setBuilderCharacters(GameRegistry.getAllCharacters());
    }, []);

    const refreshArchive = useCallback(async (worldId: string) => {
        const archive = await fetchJson<QuestRunSummary[]>(`${API_BASE}/planet/quests/${worldId}`);
        setQuestArchive(Array.isArray(archive) ? archive : []);
        return archive;
    }, []);

    const saveRun = useCallback(async (run: QuestRunRecord) => {
        await fetchJson(`${API_BASE}/planet/quests/${run.worldId}/${run.id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(run),
        });
    }, []);

    const loadRunDetail = useCallback(async (worldId: string, runId: string) => {
        const run = await fetchJson<QuestRunRecord>(`${API_BASE}/planet/quests/${worldId}/${runId}`);
        return run;
    }, []);

    const refreshChains = useCallback(async (worldId: string, preferredChainId?: string | null) => {
        const chains = await fetchJson<QuestChainRecord[]>(`${API_BASE}/planet/quests/${worldId}/chains`).catch(() => []);
        const selected = (chains || []).find((chain) => chain.id === preferredChainId)
            || (chains || []).find((chain) => chain.status === "active")
            || (chains || [])[0]
            || null;
        setActiveChain(selected);
        return selected;
    }, []);

    const loadIllustration = useCallback(async (worldId: string, illustrationId?: string | null) => {
        if (!illustrationId) {
            setCurrentIllustration(null);
            return null;
        }
        const illustration = await fetchJson<QuestIllustrationRecord>(`${API_BASE}/planet/quests/${worldId}/illustrations/${illustrationId}`).catch(() => null);
        setCurrentIllustration(illustration);
        return illustration;
    }, []);

    useEffect(() => {
        if (!activeWorldId) {
            setActiveRun(null);
            setSelectedArchiveRun(null);
            setQuestArchive([]);
            setFactions([]);
            setLocations([]);
            setHistoryCharacters([]);
            setGmContext(null);
            setEcologyBundle(null);
            setSelectedPartyIds([]);
            setActiveChain(null);
            setGlossaryEntries({});
            setCurrentIllustration(null);
            return;
        }

        let cancelled = false;
        async function loadWorldData() {
            setIsLoadingWorldData(true);
            try {
                await refreshBuilderCharacters();
                const [nextFactions, nextLocations, nextHistoryCharacters, nextGmContext, nextEcology, archive, nextChain] = await Promise.all([
                    fetchJson<Faction[]>(`${API_BASE}/planet/factions/${activeWorldId}`).catch(() => []),
                    fetchJson<Area[]>(`${API_BASE}/planet/locations/${activeWorldId}`).catch(() => []),
                    fetchJson<HistoryCharacterRecord[]>(`${API_BASE}/planet/characters/${activeWorldId}`).catch(() => []),
                    fetchJson<any>(`${API_BASE}/planet/gm-context/${activeWorldId}`).catch(() => null),
                    fetchJson<EcologyBundle>(`${API_BASE}/planet/ecology-data/${activeWorldId}`).catch(() => null),
                    refreshArchive(activeWorldId).catch(() => []),
                    refreshChains(activeWorldId).catch(() => null),
                ]);
                if (cancelled) return;
                setFactions(Array.isArray(nextFactions) ? nextFactions : []);
                setLocations(Array.isArray(nextLocations) ? nextLocations : []);
                setHistoryCharacters(Array.isArray(nextHistoryCharacters) ? nextHistoryCharacters : []);
                setGmContext(nextGmContext);
                setEcologyBundle(nextEcology);
                setActiveChain(nextChain);

                const firstActive = Array.isArray(archive)
                    ? archive.find((run) => run.status === "active")
                    : null;
                if (firstActive) {
                    const detail = await loadRunDetail(activeWorldId, firstActive.id).catch(() => null);
                    if (!cancelled && detail) setActiveRun(detail);
                } else if (!cancelled) {
                    setActiveRun(null);
                }
            } catch (error) {
                console.error("Failed to load quest world data", error);
            } finally {
                if (!cancelled) setIsLoadingWorldData(false);
            }
        }
        loadWorldData();
        return () => {
            cancelled = true;
        };
    }, [activeWorldId, loadRunDetail, refreshArchive, refreshBuilderCharacters, refreshChains]);

    useEffect(() => {
        if (availablePartyCharacters.length === 0) {
            setSelectedPartyIds([]);
            return;
        }
        setSelectedPartyIds((previous) => {
            const filtered = previous.filter((id) => availablePartyCharacters.some((character) => character.id === id));
            if (filtered.length > 0) return filtered.slice(0, 3);
            return availablePartyCharacters.slice(0, 1).map((character) => character.id);
        });
    }, [availablePartyCharacters]);

    useEffect(() => {
        if (!activeRun?.worldId || !activeRun.currentNode?.illustrationId) {
            setCurrentIllustration(null);
            return;
        }

        let cancelled = false;
        let intervalId: number | undefined;

        async function syncIllustration() {
            const illustration = await loadIllustration(activeRun.worldId, activeRun.currentNode?.illustrationId);
            if (cancelled || !illustration) return;
            if (illustration.status === "queued" || illustration.status === "generating") {
                intervalId = window.setTimeout(syncIllustration, 2500);
            }
        }

        void syncIllustration();
        return () => {
            cancelled = true;
            if (intervalId) window.clearTimeout(intervalId);
        };
    }, [activeRun?.currentNode?.illustrationId, activeRun?.worldId, loadIllustration]);

    const applyPartyUpdates = useCallback(
        async (updates: PartyUpdate[]) => {
            if (!updates.length) return;
            await refreshBuilderCharacters();
            const existingTraits = GameRegistry.getAllTraits();
            const existingSkills = GameRegistry.getAllSkills();
            const allCharacters = GameRegistry.getAllCharacters();

            for (const update of updates) {
                const current = GameRegistry.getCharacter(update.characterId);
                if (!current) continue;
                const nextCharacter: Character = {
                    ...current,
                    stats: { ...current.stats },
                    traits: [...current.traits],
                    inventory: [...(current.inventory || [])],
                    skills: [...(current.skills || [])],
                    relationships: [...(current.relationships || [])],
                };

                for (const statChange of update.statChanges || []) {
                    if (statChange.target === "hp") {
                        nextCharacter.hp = Math.max(0, Math.min(nextCharacter.maxHp, nextCharacter.hp + statChange.value));
                    } else if (statChange.target === "maxHp") {
                        nextCharacter.maxHp = Math.max(1, nextCharacter.maxHp + statChange.value);
                        nextCharacter.hp = Math.min(nextCharacter.maxHp, nextCharacter.hp);
                    } else if (statChange.target in nextCharacter.stats) {
                        const key = statChange.target as keyof Character["stats"];
                        nextCharacter.stats[key] = Math.max(0, nextCharacter.stats[key] + statChange.value);
                    }
                }

                for (const traitName of update.removeTraitNames || []) {
                    nextCharacter.traits = nextCharacter.traits.filter(
                        (trait) => trait.name.toLowerCase() !== traitName.toLowerCase(),
                    );
                }

                for (const traitName of update.addTraitNames || []) {
                    if (nextCharacter.traits.some((trait) => trait.name.toLowerCase() === traitName.toLowerCase())) continue;
                    const existingTrait = existingTraits.find((trait) => trait.name.toLowerCase() === traitName.toLowerCase());
                    nextCharacter.traits.push(existingTrait || createQuestTrait(traitName));
                }

                for (const itemTemplate of update.addItems || []) {
                    const item = createQuestItem(itemTemplate);
                    nextCharacter.inventory.push(item);
                    await fetchJson(`${API_BASE}/data/items`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(item),
                    }).catch((error) => console.warn("Failed to persist quest item", error));
                }

                for (const skillTemplate of update.addSkills || []) {
                    const existingSkill = existingSkills.find(
                        (skill) => skill.name.toLowerCase() === skillTemplate.name.toLowerCase(),
                    );
                    const skill = existingSkill || createQuestSkill(skillTemplate);
                    if (!nextCharacter.skills?.some((entry) => entry.name.toLowerCase() === skill.name.toLowerCase())) {
                        nextCharacter.skills = [...(nextCharacter.skills || []), skill];
                    }
                    if (!existingSkill) {
                        await fetchJson(`${API_BASE}/data/skills`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(skill),
                        }).catch((error) => console.warn("Failed to persist quest skill", error));
                    }
                }

                for (const relationshipChange of update.relationshipChanges || []) {
                    const target = allCharacters.find(
                        (character) =>
                            character.worldId === activeWorldId
                            && character.name.toLowerCase() === relationshipChange.characterName.toLowerCase(),
                    );
                    if (!target) continue;
                    const existing = nextCharacter.relationships?.find((relationship) => relationship.targetId === target.id);
                    if (existing) {
                        existing.type = relationshipChange.change >= 0 ? "ally" : "rival";
                        existing.note = update.summary;
                    } else {
                        nextCharacter.relationships = [
                            ...(nextCharacter.relationships || []),
                            {
                                targetId: target.id,
                                type: relationshipChange.change >= 0 ? "ally" : "rival",
                                note: update.summary,
                            },
                        ];
                    }
                }

                await fetchJson(`${API_BASE}/data/characters`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(nextCharacter),
                });
            }

            await refreshBuilderCharacters();
        },
        [activeWorldId, refreshBuilderCharacters],
    );

    const persistCharacters = useCallback(async (characters: Character[]) => {
        if (!characters.length) return;
        await Promise.all(characters.map((character) =>
            fetchJson(`${API_BASE}/data/characters`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(character),
            }),
        ));
        await refreshBuilderCharacters();
    }, [refreshBuilderCharacters]);

    const ensureGlossaryEntry = useCallback(async (termRef: QuestTermRef) => {
        if (!activeWorldId) return null;
        if (glossaryEntries[termRef.slug]) return glossaryEntries[termRef.slug];
        const entry = await fetchJson<QuestGlossaryEntry>(
            `${API_BASE}/planet/quests/${activeWorldId}/glossary?term=${encodeURIComponent(termRef.term)}`,
        ).catch(() => null);
        if (entry) {
            setGlossaryEntries((previous) => ({ ...previous, [entry.slug]: entry }));
        }
        return entry;
    }, [activeWorldId, glossaryEntries]);

    const handleGenerateNpcPortrait = useCallback(async (npcId: string) => {
        const character = builderCharacters.find((entry) => entry.id === npcId);
        if (!character || generatingPortraitIds.includes(npcId)) return;
        const prompt = [
            character.name,
            character.occupation?.name || character.title || character.type,
            character.backstory || character.history || character.currentStory || "",
            character.faction || "",
        ].filter(Boolean).join(". ");

        setGeneratingPortraitIds((previous) => [...previous, npcId]);
        try {
            const response = await fetchJson<{ dataUrl?: string | null }>(`${API_BASE}/gm/generate-character-portrait`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt }),
            });
            if (response.dataUrl) {
                await persistCharacters([{ ...character, portraitUrl: response.dataUrl }]);
                setNotices((previous) => [`Generated portrait for ${character.name}.`, ...previous]);
            }
        } catch (error) {
            console.error("Failed to generate NPC portrait", error);
            setNotices((previous) => [error instanceof Error ? error.message : "Failed to generate NPC portrait.", ...previous]);
        } finally {
            setGeneratingPortraitIds((previous) => previous.filter((id) => id !== npcId));
        }
    }, [builderCharacters, generatingPortraitIds, persistCharacters]);

    const buildQuestPayload = useCallback(() => ({
        worldId: activeWorldId,
        seed: questSeed,
        party: partyCharacters,
        gmContext,
        factions,
        locations,
        ecology: {
            options: ecologyOptions,
            updatedAt: ecologyBundle?.updatedAt,
        },
        historyCharacters,
    }), [activeWorldId, ecologyBundle?.updatedAt, ecologyOptions, factions, gmContext, historyCharacters, locations, partyCharacters, questSeed]);

    const handleGenerateQuest = useCallback(async () => {
        if (!activeWorldId || !gmContext || partyCharacters.length === 0) return;
        setIsGenerating(true);
        setNotices([]);
        try {
            const response = await fetchJson<QuestEngineResponse>(`${API_BASE}/quests/generate-run`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(buildQuestPayload()),
            });
            await saveRun(response.run);
            await refreshBuilderCharacters();
            await refreshArchive(activeWorldId);
            await refreshChains(activeWorldId, response.run.chainId);
            setActiveRun(response.run);
            setSelectedArchiveRun(response.run);
            setNotices(buildQuestNotices(response));
            setActiveTab("run");
            setSearchParams({ tab: "run" });
        } catch (error) {
            console.error("Failed to generate quest run", error);
            setNotices([error instanceof Error ? error.message : "Failed to generate quest run."]);
        } finally {
            setIsGenerating(false);
        }
    }, [activeWorldId, buildQuestPayload, gmContext, partyCharacters.length, refreshArchive, refreshBuilderCharacters, refreshChains, saveRun, setSearchParams]);

    const handleAdvanceQuest = useCallback(async (choice?: string, combatResolution?: CombatResolutionSummary, freeform?: string) => {
        if (!activeRun || !gmContext) return;
        setIsAdvancing(true);
        setNotices([]);
        try {
            const response = await fetchJson<QuestEngineResponse>(`${API_BASE}/quests/advance`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    run: activeRun,
                    party: activeRunParty,
                    gmContext,
                    factions,
                    locations,
                    ecology: {
                        options: ecologyOptions,
                        updatedAt: ecologyBundle?.updatedAt,
                    },
                    historyCharacters,
                    chosenAction: choice || undefined,
                    freeformAction: freeform || undefined,
                    combatResolution,
                }),
            });
            if (response.restoredCharacters?.length) {
                await persistCharacters(response.restoredCharacters);
            }
            if (response.partyUpdates?.length) {
                await applyPartyUpdates(response.partyUpdates);
            }
            await saveRun(response.run);
            await refreshArchive(activeRun.worldId);
            await refreshChains(activeRun.worldId, response.run.chainId);
            setActiveRun(response.run);
            setSelectedArchiveRun(response.run);
            setFreeformAction("");
            setNotices(buildQuestNotices(response));
        } catch (error) {
            console.error("Failed to advance quest", error);
            setNotices([error instanceof Error ? error.message : "Failed to advance quest."]);
        } finally {
            setIsAdvancing(false);
        }
    }, [activeRun, activeRunParty, applyPartyUpdates, ecologyBundle?.updatedAt, ecologyOptions, factions, gmContext, historyCharacters, locations, persistCharacters, refreshArchive, refreshChains, saveRun]);

    const handleResumeRun = useCallback(async (summary: QuestRunSummary) => {
        try {
            const run = await loadRunDetail(summary.worldId, summary.id);
            await refreshChains(summary.worldId, run.chainId);
            setActiveRun(run);
            setSelectedArchiveRun(run);
            setActiveTab("run");
            setSearchParams({ tab: "run" });
        } catch (error) {
            console.error("Failed to load quest run", error);
            setNotices([error instanceof Error ? error.message : "Failed to load quest run."]);
        }
    }, [loadRunDetail, refreshChains, setSearchParams]);

    const handleDeleteRun = useCallback(async (summary: QuestRunSummary) => {
        await fetch(`${API_BASE}/planet/quests/${summary.worldId}/${summary.id}`, { method: "DELETE" });
        const nextArchive = await refreshArchive(summary.worldId);
        if (activeRun?.id === summary.id) setActiveRun(null);
        if (selectedArchiveRun?.id === summary.id) {
            setSelectedArchiveRun(null);
            const nextActive = Array.isArray(nextArchive) ? nextArchive.find((run) => run.status === "active") : null;
            if (nextActive) {
                const detail = await loadRunDetail(summary.worldId, nextActive.id).catch(() => null);
                if (detail) setActiveRun(detail);
            }
        }
    }, [activeRun?.id, loadRunDetail, refreshArchive, selectedArchiveRun?.id]);

    const handleAbandonRun = useCallback(async () => {
        if (!activeRun) return;
        const abandonedRun: QuestRunRecord = {
            ...activeRun,
            status: "abandoned",
            updatedAt: Date.now(),
            completedAt: Date.now(),
        };
        await saveRun(abandonedRun);
        await refreshArchive(abandonedRun.worldId);
        setActiveRun(null);
        setSelectedArchiveRun(abandonedRun);
        setActiveTab("archive");
        setSearchParams({ tab: "archive" });
    }, [activeRun, refreshArchive, saveRun, setSearchParams]);

    const currentNode = activeRun?.currentNode;
    const hasPendingCombat = currentNode?.kind === "combat" && !!currentNode.pendingCombat?.enemyIds?.length;
    const isDiscussionNode = isDiscussionKind(currentNode?.kind);
    const currentTermRefs = useMemo(
        () => [...(currentNode?.termRefs || [])].sort((a, b) => b.term.length - a.term.length),
        [currentNode?.termRefs],
    );
    const contentContainerClass = activeTab === "run"
        ? "pt-28 px-6 pb-8 flex-1 overflow-hidden"
        : "pt-28 px-6 pb-8 flex-1 overflow-y-auto custom-scrollbar";

    const renderGlossaryText = useCallback((text: string) => {
        if (!text || currentTermRefs.length === 0) {
            return <>{text}</>;
        }

        const pattern = new RegExp(`(${currentTermRefs.map((termRef) => escapeRegex(termRef.term)).join("|")})`, "gi");
        return text.split(pattern).map((part, index) => {
            const termRef = currentTermRefs.find((candidate) => candidate.term.toLowerCase() === part.toLowerCase());
            if (!termRef) {
                return <span key={`${part}-${index}`}>{part}</span>;
            }
            const glossaryEntry = glossaryEntries[termRef.slug];
            return (
                <span
                    key={`${termRef.slug}-${index}`}
                    className="group relative inline-flex"
                    onMouseEnter={() => {
                        void ensureGlossaryEntry(termRef);
                    }}
                >
                    <span className="cursor-help rounded px-1 py-0.5 text-amber-200 underline decoration-dotted underline-offset-4">
                        {part}
                    </span>
                    <span className="pointer-events-none absolute left-0 top-full z-20 mt-2 hidden w-72 rounded-xl border border-amber-500/20 bg-[#081018] px-3 py-3 text-xs leading-relaxed text-amber-50 shadow-2xl group-hover:block">
                        {glossaryEntry?.flavorText || "Compiling local flavor text..."}
                    </span>
                </span>
            );
        });
    }, [currentTermRefs, ensureGlossaryEntry, glossaryEntries]);

    if (!activeWorldId || !selectedWorld) {
        return (
            <div className="h-screen overflow-hidden bg-[#070b12] text-gray-300 font-sans p-8 flex flex-col">
                <header className="mb-6 flex items-center gap-6 shrink-0 border-b border-white/5 pb-6">
                    <Link to="/" className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-all">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </Link>
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 text-amber-300 font-bold text-sm">🧭</div>
                    <h1 className="text-xl font-bold tracking-[0.2em] text-gray-100 uppercase">QUESTS</h1>
                </header>
                <div className="flex-1 flex items-center justify-center rounded-2xl border border-white/10 bg-[#121820]">
                    <div className="max-w-md text-center">
                        <h2 className="mb-3 text-lg font-bold tracking-widest text-gray-100 uppercase">No World Selected</h2>
                        <p className="mb-5 text-sm text-gray-500">Pick a world to generate and play persisted quest runs.</p>
                        <button
                            type="button"
                            onClick={() => setShowGalleryModal(true)}
                            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3 text-xs font-bold tracking-[0.2em] text-amber-300 transition-all hover:bg-amber-500/20"
                        >
                            PICK WORLD
                        </button>
                    </div>
                </div>
                <Modal open={showGalleryModal} onClose={() => setShowGalleryModal(false)} title="QUESTS - PICK A WORLD">
                    <div className="w-[80vw] h-[75vh] max-w-[1200px] flex flex-col relative overflow-hidden ring-1 ring-white/10 shadow-2xl bg-black rounded-b-xl">
                        <HistoryGallery
                            history={history}
                            activePlanetId={activeWorldId}
                            deleteFromHistory={deleteFromHistory}
                            onRenameWorld={renameInHistory}
                            onSelectPlanet={(item) => {
                                setActiveWorldId(item.id);
                                setShowGalleryModal(false);
                            }}
                            onSelectTexture={() => { }}
                            showExtendedTabs={false}
                        />
                    </div>
                </Modal>
            </div>
        );
    }

    return (
        <div className="h-screen overflow-hidden bg-[#070b12] text-gray-300 font-sans flex flex-col">
            <div className="fixed top-16 left-0 right-0 z-30 bg-[#030508]/60 backdrop-blur-md border-b border-white/5 pointer-events-auto flex items-center justify-between px-6 h-12 shadow-2xl">
                <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 font-bold text-[10px] border border-amber-500/30">
                        🧭
                    </div>
                    <h1 className="text-[10px] font-black tracking-[0.3em] text-white uppercase">QUESTS</h1>
                </div>

                <div className="flex-1 max-w-xl px-8 scale-90">
                    <TabBar
                        tabs={["seed", "run", "archive"]}
                        activeTab={activeTab}
                        onTabChange={(tab) => {
                            const nextTab = tab as QuestTab;
                            setActiveTab(nextTab);
                            setSearchParams({ tab: nextTab });
                        }}
                    />
                </div>

                <div className="w-[260px] flex items-center justify-end gap-3">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">
                        {selectedWorld.name || selectedWorld.prompt || "Unknown World"}
                    </span>
                    <button
                        onClick={() => setShowGalleryModal(true)}
                        className="px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] font-bold tracking-widest uppercase hover:bg-amber-500/20 transition-colors"
                    >
                        Pick World
                    </button>
                </div>
            </div>

            <div className={contentContainerClass}>
                {notices.length > 0 && (
                    <div className="max-w-6xl mx-auto mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
                        {notices.map((notice) => (
                            <div key={notice}>{notice}</div>
                        ))}
                    </div>
                )}

                {!hasCanonicalWorldPrompt && (
                    <div className="max-w-6xl mx-auto mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-4">
                        <div className="text-[10px] font-bold tracking-widest uppercase text-red-300 mb-2">Canonical World Prompt Required</div>
                        <div className="text-sm text-red-100">
                            Quests use the Game Master narrative world prompt, not the graphical world-generation seed prompt. Write it manually or generate it from canon on the Game Master page before generating quests.
                        </div>
                        <div className="mt-3">
                            <Link to="/game-master?tab=directives" className="text-[10px] font-bold tracking-widest uppercase text-red-200 hover:text-white">
                                Open Game Master Directives
                            </Link>
                        </div>
                    </div>
                )}

                {activeTab === "seed" && (
                    <div className="max-w-6xl mx-auto grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-6">
                        <Card className="bg-[#121820] border border-white/5 p-5 flex flex-col gap-5">
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <div className="text-[10px] font-bold tracking-widest uppercase text-amber-300 mb-2">Quest Seed</div>
                                    <h2 className="text-xl font-black tracking-wide text-white">Generate a New Run</h2>
                                    <p className="text-sm text-gray-500 leading-relaxed mt-3">
                                        World-scoped, party-based, multi-ending quests that draw from lore, history, ecology, and live character state.
                                    </p>
                                </div>
                                <div className="text-right text-[10px] uppercase tracking-widest text-gray-500">
                                    {isLoadingWorldData ? "Loading world data" : `${questArchive.length} saved runs`}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <label className="flex flex-col gap-2">
                                    <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Premise</span>
                                    <textarea
                                        value={questSeed.premise}
                                        onChange={(event) => setQuestSeed((previous) => ({ ...previous, premise: event.target.value }))}
                                        rows={4}
                                        className="w-full bg-[#05080c] border border-white/5 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50"
                                        placeholder="What tension or inciting problem defines this run?"
                                    />
                                </label>
                                <label className="flex flex-col gap-2">
                                    <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Objective</span>
                                    <textarea
                                        value={questSeed.objective}
                                        onChange={(event) => setQuestSeed((previous) => ({ ...previous, objective: event.target.value }))}
                                        rows={4}
                                        className="w-full bg-[#05080c] border border-white/5 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50"
                                        placeholder="What is the party trying to achieve?"
                                    />
                                </label>
                                <label className="flex flex-col gap-2">
                                    <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Stakes</span>
                                    <textarea
                                        value={questSeed.stakes}
                                        onChange={(event) => setQuestSeed((previous) => ({ ...previous, stakes: event.target.value }))}
                                        rows={3}
                                        className="w-full bg-[#05080c] border border-white/5 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50"
                                        placeholder="What will be lost or changed if the party fails?"
                                    />
                                </label>
                                <label className="flex flex-col gap-2">
                                    <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Custom Notes</span>
                                    <textarea
                                        value={questSeed.notes || ""}
                                        onChange={(event) => setQuestSeed((previous) => ({ ...previous, notes: event.target.value }))}
                                        rows={3}
                                        className="w-full bg-[#05080c] border border-white/5 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50"
                                        placeholder="Extra constraints, story motifs, or desired themes."
                                    />
                                </label>
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <label className="flex flex-col gap-2">
                                    <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Tone</span>
                                    <input
                                        value={questSeed.tone}
                                        onChange={(event) => setQuestSeed((previous) => ({ ...previous, tone: event.target.value }))}
                                        className="w-full bg-[#05080c] border border-white/5 rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50"
                                    />
                                </label>
                                <label className="flex flex-col gap-2">
                                    <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Difficulty</span>
                                    <select
                                        value={questSeed.difficulty}
                                        onChange={(event) => setQuestSeed((previous) => ({ ...previous, difficulty: event.target.value as QuestSeedConfig["difficulty"] }))}
                                        className="w-full bg-[#05080c] border border-white/5 rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50"
                                    >
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                        <option value="deadly">Deadly</option>
                                    </select>
                                </label>
                                <label className="flex flex-col gap-2">
                                    <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Run Length</span>
                                    <select
                                        value={questSeed.runLength}
                                        onChange={(event) => setQuestSeed((previous) => ({ ...previous, runLength: event.target.value as QuestSeedConfig["runLength"] }))}
                                        className="w-full bg-[#05080c] border border-white/5 rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50"
                                    >
                                        <option value="short">Short</option>
                                        <option value="medium">Medium</option>
                                        <option value="long">Long</option>
                                    </select>
                                </label>
                                <label className="flex flex-col gap-2">
                                    <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Openness</span>
                                    <select
                                        value={questSeed.openness}
                                        onChange={(event) => setQuestSeed((previous) => ({ ...previous, openness: event.target.value as QuestSeedConfig["openness"] }))}
                                        className="w-full bg-[#05080c] border border-white/5 rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50"
                                    >
                                        <option value="guided">Guided</option>
                                        <option value="balanced">Balanced</option>
                                        <option value="open">Open</option>
                                    </select>
                                </label>
                            </div>

                            <label className="flex flex-col gap-2">
                                <span className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Target Ending Count</span>
                                <input
                                    type="number"
                                    min={3}
                                    max={6}
                                    value={questSeed.targetEndingCount}
                                    onChange={(event) =>
                                        setQuestSeed((previous) => ({
                                            ...previous,
                                            targetEndingCount: Math.max(3, Math.min(6, Number(event.target.value) || 3)),
                                        }))
                                    }
                                    className="w-28 bg-[#05080c] border border-white/5 rounded-xl p-3 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50"
                                />
                            </label>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                                    <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-3">Party (1-3)</div>
                                    {availablePartyCharacters.length === 0 ? (
                                        <div className="text-sm text-gray-500">
                                            No Builder characters available for this world.
                                            <div className="mt-3">
                                                <Link to="/character-builder" className="text-amber-300 hover:text-white text-xs uppercase tracking-widest font-bold">
                                                    Open Character Builder
                                                </Link>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-2">
                                            {availablePartyCharacters.map((character) => {
                                                const selected = selectedPartyIds.includes(character.id);
                                                const atLimit = selectedPartyIds.length >= 3 && !selected;
                                                return (
                                                    <label key={character.id} className={`rounded-lg border px-3 py-2 ${selected ? "border-amber-500/40 bg-amber-500/10" : "border-white/5 bg-black/30"} ${atLimit ? "opacity-50" : ""}`}>
                                                        <div className="flex items-center gap-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={selected}
                                                                disabled={atLimit}
                                                                onChange={() =>
                                                                    setSelectedPartyIds((previous) =>
                                                                        selected
                                                                            ? previous.filter((id) => id !== character.id)
                                                                            : [...previous, character.id].slice(0, 3),
                                                                    )
                                                                }
                                                            />
                                                            <div>
                                                                <div className="text-sm font-bold text-white">{character.name}</div>
                                                                <div className="text-[10px] uppercase tracking-widest text-gray-500">
                                                                    Lvl {character.level} • {character.occupation?.name || character.type || "Wanderer"}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                                    <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-3">Faction Anchors</div>
                                    <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto custom-scrollbar pr-1">
                                        {factions.map((faction) => {
                                            const selected = questSeed.factionAnchorIds.includes(faction.id);
                                            return (
                                                <label key={faction.id} className={`rounded-lg border px-3 py-2 ${selected ? "border-cyan-500/40 bg-cyan-500/10" : "border-white/5 bg-black/30"}`}>
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selected}
                                                            onChange={() =>
                                                                setQuestSeed((previous) => ({
                                                                    ...previous,
                                                                    factionAnchorIds: selected
                                                                        ? previous.factionAnchorIds.filter((id) => id !== faction.id)
                                                                        : [...previous.factionAnchorIds, faction.id],
                                                                }))
                                                            }
                                                        />
                                                        <div>
                                                            <div className="text-sm font-bold text-white">{faction.name}</div>
                                                            <div className="text-[10px] uppercase tracking-widest text-gray-500">
                                                                {faction.type} • {faction.status}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                                    <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-3">Location & Ecology Anchors</div>
                                    <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Locations</div>
                                    <div className="flex flex-col gap-2 max-h-[110px] overflow-y-auto custom-scrollbar pr-1 mb-4">
                                        {locations.map((location) => {
                                            const selected = questSeed.locationAnchorIds.includes(location.id);
                                            return (
                                                <label key={location.id} className={`rounded-lg border px-3 py-2 ${selected ? "border-emerald-500/40 bg-emerald-500/10" : "border-white/5 bg-black/30"}`}>
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selected}
                                                            onChange={() =>
                                                                setQuestSeed((previous) => ({
                                                                    ...previous,
                                                                    locationAnchorIds: selected
                                                                        ? previous.locationAnchorIds.filter((id) => id !== location.id)
                                                                        : [...previous.locationAnchorIds, location.id],
                                                                }))
                                                            }
                                                        />
                                                        <div>
                                                            <div className="text-sm font-bold text-white">{location.name}</div>
                                                            <div className="text-[10px] uppercase tracking-widest text-gray-500">
                                                                {location.type} • {location.status}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>

                                    <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">Ecology</div>
                                    <div className="flex flex-col gap-2 max-h-[110px] overflow-y-auto custom-scrollbar pr-1">
                                        {ecologyOptions.map((option) => {
                                            const selected = questSeed.ecologyAnchorIds.includes(option.id);
                                            return (
                                                <label key={option.id} className={`rounded-lg border px-3 py-2 ${selected ? "border-violet-500/40 bg-violet-500/10" : "border-white/5 bg-black/30"}`}>
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selected}
                                                            onChange={() =>
                                                                setQuestSeed((previous) => ({
                                                                    ...previous,
                                                                    ecologyAnchorIds: selected
                                                                        ? previous.ecologyAnchorIds.filter((id) => id !== option.id)
                                                                        : [...previous.ecologyAnchorIds, option.id],
                                                                }))
                                                            }
                                                        />
                                                        <div>
                                                            <div className="text-sm font-bold text-white">{option.label}</div>
                                                            <div className="text-[10px] uppercase tracking-widest text-gray-500">{option.kind}</div>
                                                        </div>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                <div className="text-xs text-gray-500">
                                    {activeRun ? "An active run already exists. Generating a new run will create another archive entry." : "No active run loaded."}
                                </div>
                                <Button
                                    onClick={handleGenerateQuest}
                                    disabled={
                                        isGenerating
                                        || !gmContext
                                        || !hasCanonicalWorldPrompt
                                        || selectedPartyIds.length === 0
                                        || !questSeed.premise.trim()
                                        || !questSeed.objective.trim()
                                        || !questSeed.stakes.trim()
                                    }
                                    className="bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20"
                                >
                                    {isGenerating ? "Generating..." : "Generate Quest"}
                                </Button>
                            </div>
                        </Card>

                        <Card className="bg-[#121820] border border-white/5 p-5 flex flex-col gap-5">
                            <div>
                                <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-2">World Context</div>
                                <h2 className="text-lg font-black tracking-wide text-white">{gmContext?.worldName || selectedWorld.name || "Unknown World"}</h2>
                                <p className="text-sm text-gray-500 leading-relaxed mt-3">
                                    {gmContext?.worldPrompt || "No canonical world prompt written yet. Quests are blocked until the Game Master prompt is written."}
                                </p>
                                <p className="text-xs text-gray-600 leading-relaxed mt-3">
                                    Visual seed prompt: {gmContext?.worldSeedPrompt || selectedWorld.prompt || "No generation seed prompt available."}
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                {(["main", "critical", "major", "minor"] as const).map((priority) => (
                                    <div key={priority} className="rounded-xl border border-white/5 bg-black/20 p-3">
                                        <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500">{priority}</div>
                                        <div className="mt-2 text-lg font-black text-white">
                                            {gmContext?.sourceSummary?.usedLoreCounts?.[priority] ?? 0}
                                            <span className="text-xs text-gray-500"> / {gmContext?.sourceSummary?.loreCounts?.[priority] ?? 0}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                                <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-3">What This Run Will Use</div>
                                <div className="flex flex-wrap gap-2">
                                    {(gmContext?.sourceSummary?.enabledSources || []).map((source: string) => (
                                        <span key={source} className="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest text-gray-300">
                                            {source}
                                        </span>
                                    ))}
                                    {(gmContext?.sourceSummary?.enabledSources || []).length === 0 && (
                                        <span className="text-sm text-gray-500">No compiled GM sources are currently enabled.</span>
                                    )}
                                </div>
                            </div>

                            <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                                <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-3">Active Party Preview</div>
                                <div className="flex flex-col gap-3">
                                    {partyCharacters.map((character) => (
                                        <div key={character.id} className="rounded-lg border border-white/5 bg-[#05080c] px-4 py-3">
                                            <div className="text-sm font-bold text-white">{character.name}</div>
                                            <div className="text-[10px] uppercase tracking-widest text-gray-500 mt-1">
                                                Lvl {character.level} • HP {character.hp}/{character.maxHp}
                                            </div>
                                        </div>
                                    ))}
                                    {partyCharacters.length === 0 && <div className="text-sm text-gray-500">Select 1-3 characters to seed the quest.</div>}
                                </div>
                            </div>
                        </Card>
                    </div>
                )}

                {activeTab === "run" && (
                    <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-[320px_minmax(0,1fr)_320px] gap-6 h-full min-h-0">
                        <Card className="bg-[#121820] border border-white/5 p-4 flex flex-col gap-4 min-h-0 overflow-hidden">
                            <div>
                                <div className="text-[10px] font-bold tracking-widest uppercase text-amber-300 mb-2">Party</div>
                                <h2 className="text-lg font-black text-white">{activeRun?.title || "No Active Run"}</h2>
                            </div>

                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
                                {activeRunParty.length > 0 ? activeRunParty.map((character) => (
                                    <div key={character.id} className="rounded-xl border border-white/5 bg-black/20 p-4 mb-3 last:mb-0">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-sm font-bold text-white">{character.name}</div>
                                                <div className="text-[10px] uppercase tracking-widest text-gray-500">
                                                    Lvl {character.level} • {character.occupation?.name || character.type || "Wanderer"}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs font-bold text-white">{character.hp}/{character.maxHp}</div>
                                                <div className="text-[10px] uppercase tracking-widest text-gray-500">HP</div>
                                            </div>
                                        </div>
                                        <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] uppercase tracking-widest text-gray-500">
                                            <span>STR {character.stats.strength}</span>
                                            <span>AGI {character.stats.agility}</span>
                                            <span>INT {character.stats.intelligence}</span>
                                            <span>WIS {character.stats.wisdom}</span>
                                            <span>END {character.stats.endurance}</span>
                                            <span>CHA {character.stats.charisma}</span>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-sm text-gray-500">
                                        {activeRun ? "The run is loaded, but the party is not available in the builder registry." : "No active run selected."}
                                    </div>
                                )}

                                {activeRun && (
                                    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                                        <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-2">Current Effects</div>
                                        {(activeRun.currentEffects || []).length > 0 ? (
                                            <div className="flex flex-col gap-2">
                                                {(activeRun.currentEffects || []).map((effect) => (
                                                    <div key={effect} className="text-sm text-gray-300">{effect}</div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-sm text-gray-500">No active quest-side deltas.</div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </Card>

                        <div className="flex flex-col gap-6 min-w-0 min-h-0">
                            {!activeRun ? (
                                <Card className="bg-[#121820] border border-white/5 p-8 text-center">
                                    <div className="text-4xl mb-4">🧭</div>
                                    <h2 className="text-xl font-black text-white uppercase tracking-[0.2em]">No Active Run</h2>
                                    <p className="text-sm text-gray-500 mt-4 max-w-xl mx-auto">
                                        Generate a new quest from the Seed tab, or resume an archived run.
                                    </p>
                                </Card>
                            ) : hasPendingCombat && currentNode ? (
                                <Card className="bg-[#121820] border border-white/5 p-4 flex flex-col gap-4 min-w-0 min-h-0 overflow-hidden">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <div className="text-[10px] font-bold tracking-widest uppercase text-red-300 mb-2">Combat Node</div>
                                            <h2 className="text-xl font-black text-white">{currentNode.title}</h2>
                                            <div className="text-sm text-gray-400 mt-3 leading-relaxed whitespace-pre-wrap">{renderGlossaryText(currentNode.text)}</div>
                                        </div>
                                        <div className="text-right text-[10px] uppercase tracking-widest text-gray-500">
                                            {currentNode.pendingCombat?.encounterLabel || "Combat"}
                                        </div>
                                    </div>
                                    <div className="rounded-2xl border border-red-500/10 bg-black/20 min-h-[220px] overflow-hidden flex items-center justify-center">
                                        {currentIllustration?.assetPath && currentIllustration.status === "ready" ? (
                                            <img src={currentIllustration.assetPath} alt={currentNode.title} className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="text-center px-6">
                                                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-red-300">Combat Illustration</div>
                                                <div className="mt-3 text-sm text-gray-500">
                                                    {currentIllustration?.status === "failed" ? "Illustration generation failed." : "Generating a key-beat illustration..."}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <CombatSimulator
                                        initialPlayerIds={activeRun.partyCharacterIds}
                                        initialEnemyIds={currentNode.pendingCombat?.enemyIds || []}
                                        initialCombatStarted
                                        onCombatFinished={(summary) => {
                                            void handleAdvanceQuest(undefined, summary);
                                        }}
                                        onCombatCancelled={() => {
                                            void handleAdvanceQuest(undefined, {
                                                outcome: "cancelled",
                                                survivingPlayerIds: activeRun.partyCharacterIds,
                                                defeatedEnemyIds: [],
                                                playerSnapshots: [],
                                                enemySnapshots: [],
                                            });
                                        }}
                                    />
                                </Card>
                            ) : currentNode && isDiscussionNode ? (
                                <Card className="bg-[#121820] border border-white/5 p-5 flex flex-col gap-5 min-w-0 min-h-0 overflow-y-auto custom-scrollbar">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <div className="text-[10px] font-bold tracking-widest uppercase text-cyan-300 mb-2">
                                                Discussion • Act {currentNode.act} • Node {activeRun.nodeCount}/{activeRun.maxNodeCount}
                                            </div>
                                            <h2 className="text-2xl font-black text-white">{currentNode.title}</h2>
                                        </div>
                                        <div className="px-3 py-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-cyan-200 text-[10px] font-bold uppercase tracking-widest">
                                            reply
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-cyan-500/10 bg-gradient-to-br from-cyan-500/10 via-[#0b1720] to-[#05080c] p-5">
                                        {currentIllustration?.assetPath && currentIllustration.status === "ready" && (
                                            <img src={currentIllustration.assetPath} alt={currentNode.title} className="mb-4 h-52 w-full rounded-xl object-cover" />
                                        )}
                                        <div className="text-sm leading-relaxed text-gray-200 whitespace-pre-wrap">{renderGlossaryText(currentNode.text)}</div>
                                    </div>

                                    {(currentNode.npcs || []).length > 0 && (
                                        <div className="flex flex-wrap gap-3">
                                            {currentNode.npcs.map((npc) => (
                                                <div key={npc.id} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 min-w-[180px]">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <div className="text-xs font-bold uppercase tracking-widest text-white">{npc.name}</div>
                                                            <div className="mt-1 text-[10px] uppercase tracking-widest text-gray-500">
                                                                {npc.role || "speaker"} {npc.isHostile ? "• tense" : ""}
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleGenerateNpcPortrait(npc.id)}
                                                            disabled={generatingPortraitIds.includes(npc.id)}
                                                            className="text-[9px] uppercase tracking-widest text-cyan-200 hover:text-white disabled:opacity-40"
                                                        >
                                                            {generatingPortraitIds.includes(npc.id) ? "..." : "portrait"}
                                                        </button>
                                                    </div>
                                                    <div className="mt-2 text-[10px] text-gray-500">
                                                        {npc.role || "speaker"} {npc.isHostile ? "• tense" : ""}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {(currentNode.contextRefs || []).length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {currentNode.contextRefs.map((reference) => (
                                                <span key={`${reference.kind}-${reference.id}`} className="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest text-gray-300">
                                                    {reference.kind}: {reference.label}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {(currentNode.choices || []).length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {currentNode.choices.map((choice) => (
                                                <button
                                                    key={choice.id}
                                                    onClick={() => void handleAdvanceQuest(undefined, undefined, choice.label)}
                                                    disabled={isAdvancing}
                                                    className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-left text-xs font-bold tracking-wide text-cyan-100 transition-colors hover:bg-cyan-500/20 disabled:opacity-50"
                                                >
                                                    {choice.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                                        <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-2">Your Reply</div>
                                        <textarea
                                            value={freeformAction}
                                            onChange={(event) => setFreeformAction(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter" && !event.shiftKey && freeformAction.trim() && !isAdvancing) {
                                                    event.preventDefault();
                                                    void handleAdvanceQuest(undefined, undefined, freeformAction);
                                                }
                                            }}
                                            rows={2}
                                            className="w-full resize-none bg-[#05080c] border border-cyan-500/10 rounded-xl p-4 text-sm text-gray-100 focus:outline-none focus:border-cyan-500/40"
                                            placeholder="Type what your party says or asks."
                                        />
                                        <div className="mt-3 flex items-center justify-between gap-3">
                                            <div className="text-xs text-gray-500">Press Enter to send. Shift+Enter adds a new line.</div>
                                            <Button
                                                onClick={() => void handleAdvanceQuest(undefined, undefined, freeformAction)}
                                                disabled={isAdvancing || !freeformAction.trim()}
                                                className="bg-cyan-500/10 text-cyan-200 border border-cyan-500/30 hover:bg-cyan-500/20"
                                            >
                                                {isAdvancing ? "Sending..." : "Send Reply"}
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                        <div className="text-xs text-gray-500">
                                            Discussion NPCs are persisted to the Character Builder when the AI introduces them.
                                        </div>
                                        <Button
                                            onClick={() => void handleAbandonRun()}
                                            className="bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20"
                                        >
                                            Abandon Run
                                        </Button>
                                    </div>
                                </Card>
                            ) : currentNode ? (
                                <Card className="bg-[#121820] border border-white/5 p-6 flex flex-col gap-6 min-w-0 min-h-0 overflow-y-auto custom-scrollbar">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <div className="text-[10px] font-bold tracking-widest uppercase text-amber-300 mb-2">
                                                Act {currentNode.act} • Node {activeRun.nodeCount}/{activeRun.maxNodeCount}
                                            </div>
                                            <h2 className="text-2xl font-black text-white">{currentNode.title}</h2>
                                            <div className="text-sm text-gray-400 mt-4 leading-relaxed whitespace-pre-wrap">{renderGlossaryText(currentNode.text)}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Node Type</div>
                                            <div className="mt-2 px-3 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-200 text-[10px] font-bold uppercase tracking-widest">
                                                {currentNode.kind}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-amber-500/10 bg-black/20 min-h-[240px] overflow-hidden flex items-center justify-center">
                                        {currentIllustration?.assetPath && currentIllustration.status === "ready" ? (
                                            <img src={currentIllustration.assetPath} alt={currentNode.title} className="h-full w-full object-cover" />
                                        ) : (
                                            <div className="text-center px-6">
                                                <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-amber-300">Key Beat</div>
                                                <div className="mt-3 text-sm text-gray-500">
                                                    {currentIllustration?.status === "failed" ? "Illustration generation failed." : "Generating a key-beat illustration..."}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {(currentNode.contextRefs || []).map((reference) => (
                                            <span key={`${reference.kind}-${reference.id}`} className="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-widest text-gray-300">
                                                {reference.kind}: {reference.label}
                                            </span>
                                        ))}
                                        {(currentNode.contextRefs || []).length === 0 && (
                                            <span className="text-sm text-gray-500">No focused world anchors on this node.</span>
                                        )}
                                    </div>

                                    {(currentNode.npcs || []).length > 0 && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {currentNode.npcs.map((npc) => (
                                                <div key={npc.id} className="rounded-xl border border-white/5 bg-black/20 p-4">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div>
                                                            <div className="text-sm font-bold text-white">{npc.name}</div>
                                                            <div className="text-[10px] uppercase tracking-widest text-gray-500 mt-1">
                                                                {npc.role || "NPC"} {npc.isHostile ? "• hostile" : ""}
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleGenerateNpcPortrait(npc.id)}
                                                            disabled={generatingPortraitIds.includes(npc.id)}
                                                            className="text-[9px] uppercase tracking-widest text-amber-200 hover:text-white disabled:opacity-40"
                                                        >
                                                            {generatingPortraitIds.includes(npc.id) ? "..." : "portrait"}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {currentNode.kind !== "ending" && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {(currentNode.choices || []).map((choice) => (
                                                <button
                                                    key={choice.id}
                                                    onClick={() => void handleAdvanceQuest(choice.label)}
                                                    disabled={isAdvancing}
                                                    className="text-left rounded-xl border border-white/5 bg-black/20 px-4 py-4 hover:border-amber-500/30 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                                                >
                                                    <div className="text-sm font-bold text-white">{choice.label}</div>
                                                    <div className="mt-2 text-[10px] uppercase tracking-widest text-gray-500">
                                                        {choice.intent || "adaptive"} • {choice.risk || "medium"}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {currentNode.kind !== "ending" && (
                                        <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                                            <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-2">Freeform Action</div>
                                            <textarea
                                                value={freeformAction}
                                                onChange={(event) => setFreeformAction(event.target.value)}
                                                rows={3}
                                                className="w-full bg-[#05080c] border border-white/5 rounded-xl p-4 text-sm text-gray-200 focus:outline-none focus:border-amber-500/50"
                                                placeholder="Describe a custom action beyond the offered choices."
                                            />
                                            <div className="mt-3 flex justify-end">
                                                <Button
                                                    onClick={() => void handleAdvanceQuest(undefined, undefined, freeformAction)}
                                                    disabled={isAdvancing || !freeformAction.trim()}
                                                    className="bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20"
                                                >
                                                    {isAdvancing ? "Resolving..." : "Resolve Freeform Action"}
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {currentNode.kind === "ending" && (
                                        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-5">
                                            <div className="text-[10px] font-bold tracking-widest uppercase text-emerald-300 mb-2">Ending Reached</div>
                                            <div className="text-sm text-emerald-100">
                                                {activeRun.status === "failed" ? "The run has failed." : "The run has concluded."}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                                        <div className="text-xs text-gray-500">{activeRun.summary}</div>
                                        <div className="flex gap-3">
                                            <Button
                                                onClick={() => void handleAbandonRun()}
                                                className="bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20"
                                            >
                                                Abandon Run
                                            </Button>
                                        </div>
                                    </div>
                                </Card>
                            ) : (
                                <Card className="bg-[#121820] border border-white/5 p-8 text-center">
                                    <div className="text-sm text-gray-500">This run no longer has an active node. Resume it from the archive or generate a new run.</div>
                                </Card>
                            )}
                        </div>

                        <Card className="bg-[#121820] border border-white/5 p-4 flex flex-col gap-4 min-h-0 overflow-hidden">
                            <div>
                                <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-2">Run Log</div>
                                <h2 className="text-lg font-black text-white">{activeRun?.title || "Archive"}</h2>
                            </div>

                            {activeRun && (
                                <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-4">
                                    {activeChain && (
                                        <div className="rounded-xl border border-cyan-500/15 bg-cyan-500/10 p-4">
                                            <div className="text-[10px] font-bold tracking-widest uppercase text-cyan-300 mb-2">Quest Chain</div>
                                            <div className="text-sm font-bold text-white">{activeChain.title}</div>
                                            <div className="mt-2 text-xs leading-relaxed text-gray-300">{activeChain.premise}</div>
                                            <div className="mt-3 text-[10px] uppercase tracking-widest text-gray-500">
                                                {activeChain.completedRunIds.length} completed runs • {activeChain.nextQuestHooks.length} live hooks
                                            </div>
                                            {(activeChain.nextQuestHooks || []).slice(0, 4).map((hook) => (
                                                <div key={hook} className="mt-2 text-xs text-cyan-50/90">{hook}</div>
                                            ))}
                                        </div>
                                    )}

                                    {(currentTermRefs || []).length > 0 && (
                                        <div className="rounded-xl border border-amber-500/15 bg-amber-500/10 p-4">
                                            <div className="text-[10px] font-bold tracking-widest uppercase text-amber-300 mb-2">Glossary Links</div>
                                            <div className="flex flex-col gap-3">
                                                {currentTermRefs.map((termRef) => {
                                                    const entry = glossaryEntries[termRef.slug];
                                                    return (
                                                        <button
                                                            type="button"
                                                            key={termRef.slug}
                                                            onMouseEnter={() => {
                                                                void ensureGlossaryEntry(termRef);
                                                            }}
                                                            className="text-left rounded-lg border border-white/5 bg-black/20 px-3 py-3"
                                                        >
                                                            <div className="text-xs font-bold uppercase tracking-widest text-white">{termRef.term}</div>
                                                            <div className="mt-2 text-xs leading-relaxed text-gray-400">
                                                                {entry?.flavorText || "Compiling local flavor text..."}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                                        <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-2">Arc Pressure</div>
                                        <div className="flex flex-col gap-2 text-sm text-gray-300">
                                            {(activeRun.arc.recurringTensions || []).map((tension) => (
                                                <div key={tension}>{tension}</div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                                        <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-2">Ending Tracks</div>
                                        <div className="flex flex-col gap-3">
                                            {(activeRun.arc.endingTracks || []).map((ending) => (
                                                <div key={ending.id}>
                                                    <div className="text-sm font-bold text-white">{ending.title}</div>
                                                    <div className="text-xs text-gray-500 mt-1">{ending.description}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-white/5 bg-black/20 p-4 max-h-[380px] overflow-y-auto custom-scrollbar">
                                        <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-3">History</div>
                                        <div className="flex flex-col gap-3">
                                            {(activeRun.log || []).slice().reverse().map((entry) => (
                                                <div key={entry.id} className="rounded-lg border border-white/5 bg-[#05080c] p-3">
                                                    <div className="text-[10px] uppercase tracking-widest text-gray-500">{entry.kind}</div>
                                                    <div className="text-sm font-bold text-white mt-1">{entry.title}</div>
                                                    <div className="text-xs text-gray-400 mt-2 whitespace-pre-wrap">{entry.text}</div>
                                                    {(entry.effects || []).length > 0 && (
                                                        <div className="mt-2 flex flex-wrap gap-2">
                                                            {entry.effects?.map((effect) => (
                                                                <span key={effect} className="px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] uppercase tracking-widest text-amber-200">
                                                                    {effect}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </Card>
                    </div>
                )}

                {activeTab === "archive" && (
                    <div className="max-w-6xl mx-auto grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6">
                        <Card className="bg-[#121820] border border-white/5 p-4 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500">Quest Archive</div>
                                    <div className="text-lg font-black text-white mt-1">{questArchive.length} runs</div>
                                </div>
                                {activeRun && (
                                    <Button
                                        onClick={() => {
                                            setSelectedArchiveRun(activeRun);
                                            setActiveTab("run");
                                            setSearchParams({ tab: "run" });
                                        }}
                                        className="bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20"
                                    >
                                        Return to Run
                                    </Button>
                                )}
                            </div>

                            <div className="flex flex-col gap-3">
                                {questArchive.map((summary) => (
                                    <button
                                        key={summary.id}
                                        onClick={async () => {
                                            const detail = await loadRunDetail(summary.worldId, summary.id).catch(() => null);
                                            if (detail) setSelectedArchiveRun(detail);
                                        }}
                                        className={`text-left rounded-xl border px-4 py-4 transition-colors ${selectedArchiveRun?.id === summary.id ? "border-amber-500/30 bg-amber-500/10" : "border-white/5 bg-black/20 hover:border-white/15"}`}
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="text-sm font-bold text-white">{summary.title}</div>
                                            <span className="text-[10px] uppercase tracking-widest text-gray-500">{summary.status}</span>
                                        </div>
                                        <div className="text-xs text-gray-500 mt-2">{summary.summary}</div>
                                        <div className="text-[10px] uppercase tracking-widest text-gray-600 mt-3">
                                            Nodes {summary.nodeCount} {summary.endingReached ? `• ${summary.endingReached}` : ""}
                                        </div>
                                    </button>
                                ))}
                                {questArchive.length === 0 && <div className="text-sm text-gray-500">No quest runs have been saved for this world.</div>}
                            </div>
                        </Card>

                        <Card className="bg-[#121820] border border-white/5 p-5">
                            {!selectedArchiveRun ? (
                                <div className="text-sm text-gray-500">Select a run from the archive to inspect it.</div>
                            ) : (
                                <div className="flex flex-col gap-5">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <div className="text-[10px] font-bold tracking-widest uppercase text-gray-500 mb-2">Run Detail</div>
                                            <h2 className="text-2xl font-black text-white">{selectedArchiveRun.title}</h2>
                                            <p className="text-sm text-gray-500 mt-3">{selectedArchiveRun.summary}</p>
                                        </div>
                                        <div className="flex gap-3">
                                            {selectedArchiveRun.status === "active" && (
                                                <Button
                                                    onClick={() => {
                                                        setActiveRun(selectedArchiveRun);
                                                        setActiveTab("run");
                                                        setSearchParams({ tab: "run" });
                                                    }}
                                                    className="bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20"
                                                >
                                                    Resume
                                                </Button>
                                            )}
                                            <Button
                                                onClick={() => void handleDeleteRun(selectedArchiveRun)}
                                                className="bg-red-500/10 text-red-300 border border-red-500/30 hover:bg-red-500/20"
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                        <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                                            <div className="text-[10px] uppercase tracking-widest text-gray-500">Status</div>
                                            <div className="mt-2 text-lg font-black text-white">{selectedArchiveRun.status}</div>
                                        </div>
                                        <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                                            <div className="text-[10px] uppercase tracking-widest text-gray-500">Nodes</div>
                                            <div className="mt-2 text-lg font-black text-white">{selectedArchiveRun.nodeCount}</div>
                                        </div>
                                        <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                                            <div className="text-[10px] uppercase tracking-widest text-gray-500">Ending</div>
                                            <div className="mt-2 text-sm font-black text-white">{selectedArchiveRun.endingReached || "Unresolved"}</div>
                                        </div>
                                        <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                                            <div className="text-[10px] uppercase tracking-widest text-gray-500">Party Size</div>
                                            <div className="mt-2 text-lg font-black text-white">{selectedArchiveRun.partyCharacterIds.length}</div>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-white/5 bg-black/20 p-4">
                                        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-3">Run History</div>
                                        <div className="flex flex-col gap-3 max-h-[420px] overflow-y-auto custom-scrollbar">
                                            {(selectedArchiveRun.log || []).map((entry) => (
                                                <div key={entry.id} className="rounded-lg border border-white/5 bg-[#05080c] p-3">
                                                    <div className="text-[10px] uppercase tracking-widest text-gray-500">{entry.kind}</div>
                                                    <div className="text-sm font-bold text-white mt-1">{entry.title}</div>
                                                    <div className="text-xs text-gray-400 mt-2 whitespace-pre-wrap">{entry.text}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </Card>
                    </div>
                )}
            </div>

            <Modal open={showGalleryModal} onClose={() => setShowGalleryModal(false)} title="QUESTS - PICK A WORLD">
                <div className="w-[80vw] h-[75vh] max-w-[1200px] flex flex-col relative overflow-hidden ring-1 ring-white/10 shadow-2xl bg-black rounded-b-xl">
                    <HistoryGallery
                        history={history}
                        activePlanetId={activeWorldId}
                        deleteFromHistory={deleteFromHistory}
                        onRenameWorld={renameInHistory}
                        onSelectPlanet={(item) => {
                            setActiveWorldId(item.id);
                            setShowGalleryModal(false);
                        }}
                        onSelectTexture={() => { }}
                        showExtendedTabs={false}
                    />
                </div>
            </Modal>
        </div>
    );
}
