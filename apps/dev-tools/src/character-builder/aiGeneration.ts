import {
    DEFAULT_CHARACTER_CREDITS,
    GameRegistry,
    sanitizeSkillLoadout,
    type Character,
    type CharacterType,
    type Item,
    type Occupation,
    type Stats,
    type Trait,
} from "@ashtrail/core";

export const DEMO_STEP_TWO_CHARACTER_TYPE: CharacterType = "Human";
export type DemoHeroVariant = "john" | "jane";

export interface DemoHeroIdentity {
    variant: DemoHeroVariant;
    name: "John Gemini" | "Jane Gemini";
    sex: "Male" | "Female";
}

export interface BuilderCharacterGenerateRequest {
    count: number;
    prompt: string;
    worldLore?: string;
    faction?: string;
    location?: string;
    characterType: CharacterType;
    variance: {
        sex: "Male" | "Female" | "Any";
        minLevel: number;
        maxLevel: number;
    };
}

export interface BuilderGeneratedCharacterDraft {
    name: string;
    age: number;
    gender: string;
    level: number;
    stats: Stats;
    history: string;
    backstory: string;
    traitNames: string[];
    occupationName: string;
}

export interface BuilderCharacterStoryRequest {
    name: string;
    age: number;
    gender: string;
    occupation: string;
    draft: string;
    relationships: never[];
    worldLore?: string;
}

export interface DemoHeroWorldContext {
    worldTitle: string;
    worldLore: string;
    selectedDirectionTitle?: string | null;
}

export function buildDemoHeroIdentity(variant?: string | null): DemoHeroIdentity {
    if (variant === "jane") {
        return {
            variant: "jane",
            name: "Jane Gemini",
            sex: "Female",
        };
    }
    return {
        variant: "john",
        name: "John Gemini",
        sex: "Male",
    };
}

export function pickRandomDemoHeroVariant(): DemoHeroVariant {
    return Math.random() < 0.5 ? "john" : "jane";
}

function cleanJsonEnvelope(raw: string) {
    let text = raw.trim();
    if (text.startsWith("```json")) {
        text = text.slice("```json".length).trim();
    } else if (text.startsWith("```")) {
        text = text.slice(3).trim();
    }
    if (text.endsWith("```")) {
        text = text.slice(0, -3).trim();
    }
    return text;
}

function clampStat(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(1, Math.min(20, Math.round(value)));
    }
    return 3;
}

function normalizeStats(candidate: unknown): Stats {
    const source = candidate && typeof candidate === "object"
        ? candidate as Record<string, unknown>
        : {};
    return {
        strength: clampStat(source.strength),
        agility: clampStat(source.agility),
        intelligence: clampStat(source.intelligence),
        wisdom: clampStat(source.wisdom),
        endurance: clampStat(source.endurance),
        charisma: clampStat(source.charisma),
    };
}

export function buildDemoHeroGenerationRequest(
    hero: DemoHeroIdentity,
    context: DemoHeroWorldContext,
): BuilderCharacterGenerateRequest {
    return {
        count: 1,
        prompt: [
            `Create exactly one hero for Ashtrail named ${hero.name}.`,
            "This character is the playable flagship protagonist for the demo.",
            "Make the character feel grounded in the selected world canon and visually memorable.",
            "Favor strong stats spread, vivid occupation framing, and a backstory that can expand into a dramatic lore panel.",
            context.selectedDirectionTitle
                ? `Anchor the hero to the selected world direction: ${context.selectedDirectionTitle}.`
                : null,
            context.worldTitle ? `World name: ${context.worldTitle}.` : null,
        ].filter(Boolean).join(" "),
        worldLore: context.worldLore,
        characterType: DEMO_STEP_TWO_CHARACTER_TYPE,
        variance: {
            sex: hero.sex,
            minLevel: 5,
            maxLevel: 8,
        },
    };
}

export function parseGeneratedCharacterDrafts(
    rawJson: string,
    hero: DemoHeroIdentity,
): BuilderGeneratedCharacterDraft[] {
    const parsed = JSON.parse(cleanJsonEnvelope(rawJson));
    if (!Array.isArray(parsed)) {
        throw new Error("Character builder generation did not return a JSON array.");
    }

    return parsed
        .map((entry) => {
            const value = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
            return {
                name: hero.name,
                age: typeof value.age === "number" && Number.isFinite(value.age) ? Math.max(18, Math.round(value.age)) : 32,
                gender: hero.sex,
                level: typeof value.level === "number" && Number.isFinite(value.level) ? Math.max(1, Math.round(value.level)) : 5,
                stats: normalizeStats(value.stats),
                history: typeof value.history === "string" ? value.history.trim() : "",
                backstory: typeof value.backstory === "string" ? value.backstory.trim() : "",
                traitNames: Array.isArray(value.traitNames)
                    ? value.traitNames.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
                    : [],
                occupationName: typeof value.occupationName === "string" && value.occupationName.trim()
                    ? value.occupationName.trim()
                    : "Pathfinder",
            };
        })
        .filter((draft) => Boolean(draft.occupationName));
}

export function buildDemoHeroStoryRequest(
    hero: DemoHeroIdentity,
    draft: BuilderGeneratedCharacterDraft,
    context: DemoHeroWorldContext,
): BuilderCharacterStoryRequest {
    return {
        name: hero.name,
        age: draft.age,
        gender: hero.sex,
        occupation: draft.occupationName,
        draft: [
            draft.history,
            draft.backstory,
            `World anchor: ${context.worldTitle}.`,
            context.selectedDirectionTitle ? `Selected direction: ${context.selectedDirectionTitle}.` : "",
        ].filter(Boolean).join("\n\n"),
        relationships: [],
        worldLore: context.worldLore,
    };
}

export function buildDemoHeroPortraitPrompt(
    hero: DemoHeroIdentity,
    draft: BuilderGeneratedCharacterDraft,
    loreText: string,
    context: DemoHeroWorldContext,
) {
    return [
        `A ${hero.sex} wasteland explorer named ${hero.name}.`,
        `Occupation: ${draft.occupationName}.`,
        `World: ${context.worldTitle}.`,
        context.selectedDirectionTitle ? `Selected canon direction: ${context.selectedDirectionTitle}.` : null,
        "Create a single centered bust portrait with strong facial readability, realistic atmospheric lighting, and gritty sci-fi fantasy detail.",
        `Backstory cues: ${draft.backstory || draft.history}`.trim(),
        `Lore cues: ${loreText}`.trim(),
    ].filter(Boolean).join(" ");
}

function resolveTraits(traitNames: string[]) {
    const allTraits = GameRegistry.getAllTraits();
    const resolvedTraits: Trait[] = [];
    for (const traitName of traitNames) {
        const match = allTraits.find((trait) => trait.name.toLowerCase() === traitName.toLowerCase());
        if (match && !resolvedTraits.some((entry) => entry.id === match.id)) {
            resolvedTraits.push(match);
        }
    }
    return resolvedTraits;
}

function resolveOccupation(occupationName: string): Occupation {
    const match = GameRegistry.getAllOccupations().find(
        (occupation) => occupation.name.toLowerCase() === occupationName.toLowerCase(),
    );
    if (match) {
        return match;
    }
    return {
        id: slugify(occupationName),
        name: occupationName,
        category: "FIELD",
        description: `${occupationName} generated by the builder flow for demo step 2.`,
        shortDescription: occupationName,
    };
}

export function slugify(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "generated";
}

function demoXpForLevel(level: number) {
    const canonicalTable: Record<number, number> = {
        1: 0,
        2: 120,
        3: 642,
        4: 1712,
        5: 3433,
        6: 5890,
        7: 9155,
        8: 13293,
    };
    return canonicalTable[Math.max(1, Math.min(8, Math.round(level)))] ?? 0;
}

function buildDemoStarterWeapon(hero: DemoHeroIdentity, draft: BuilderGeneratedCharacterDraft): Item {
    const prefersRanged = draft.stats.agility >= draft.stats.strength;
    const baseDamage = prefersRanged
        ? Math.max(7, 6 + Math.floor(draft.stats.agility / 2))
        : Math.max(7, 6 + Math.floor(draft.stats.strength / 2));
    return {
        id: slugify(`${hero.name} starter weapon`),
        name: prefersRanged ? "Gemini Service Sidearm" : "Gemini Traverse Blade",
        category: "weapon",
        rarity: "specialized",
        description: prefersRanged
            ? "A dependable sidearm carried by Ashtrail pathfinders, tuned for fast response and accurate fire."
            : "A close-quarters field blade balanced for brutal efficiency in ruined corridors and drifting dust.",
        cost: 180,
        equipSlot: "mainHand",
        weaponType: prefersRanged ? "ranged" : "melee",
        weaponRange: prefersRanged ? 5 : 1,
        weaponAreaType: "single",
        weaponAreaSize: 0,
        icon: prefersRanged ? "🔫" : "🗡️",
        effects: [
            {
                id: `${slugify(hero.name)}-starter-weapon-damage`,
                name: "Weapon Damage",
                description: "Baseline combat damage for the Ashtrail demo protagonist.",
                type: "COMBAT_BONUS",
                target: "damage",
                value: baseDamage,
                trigger: "passive",
                scope: "combat",
            },
        ],
    };
}

export function buildDemoHeroCharacter(
    hero: DemoHeroIdentity,
    draft: BuilderGeneratedCharacterDraft,
    loreText: string,
    portraitUrl: string | undefined,
    worldId: string | null,
): Character {
    const hp = 10 + draft.stats.endurance * 5;
    const occupation = resolveOccupation(draft.occupationName);
    const traitList = resolveTraits(draft.traitNames);
    const starterWeapon = buildDemoStarterWeapon(hero, draft);
    const baseSkills = GameRegistry.getAllSkills().filter((skill) => skill.category === "base");
    const xp = demoXpForLevel(draft.level);
    return {
        id: worldId ? slugify(`${hero.name}-${worldId}`) : slugify(hero.name),
        isNPC: false,
        type: DEMO_STEP_TWO_CHARACTER_TYPE,
        worldId: worldId || undefined,
        name: hero.name,
        age: draft.age,
        gender: hero.sex,
        history: loreText,
        appearancePrompt: draft.backstory || draft.history || loreText,
        portraitUrl,
        portraitName: hero.name,
        stats: draft.stats,
        traits: traitList,
        occupation,
        occupations: [
            {
                occupationId: occupation.id,
                occupation,
                unlockedTalentNodeIds: [],
                spentTalentPoints: 0,
                availableTalentPoints: 0,
                level: Math.max(1, draft.level),
                isPrimary: true,
            },
        ],
        progression: {
            treeOccupationId: occupation.id,
            unlockedTalentNodeIds: [],
            availableTalentPoints: 0,
            spentTalentPoints: 0,
            attributeUpgrades: {
                strength: 0,
                agility: 0,
                intelligence: 0,
                wisdom: 0,
                endurance: 0,
                charisma: 0,
            },
            spentStatPoints: 0,
            occupationStates: [
                {
                    occupationId: occupation.id,
                    occupation,
                    unlockedTalentNodeIds: [],
                    spentTalentPoints: 0,
                    availableTalentPoints: 0,
                    level: Math.max(1, draft.level),
                    isPrimary: true,
                },
            ],
        },
        hp,
        maxHp: hp,
        xp,
        level: Math.max(1, draft.level),
        credits: { ...DEFAULT_CHARACTER_CREDITS },
        inventory: [starterWeapon],
        skills: sanitizeSkillLoadout(baseSkills),
        equipped: {
            head: null,
            chest: null,
            gloves: null,
            waist: null,
            legs: null,
            boots: null,
            mainHand: starterWeapon,
            offHand: null,
        },
        title: "Hero of the Day",
        backstory: loreText,
        origin: {
            system: "builder",
            worldId: worldId || undefined,
        },
    };
}
