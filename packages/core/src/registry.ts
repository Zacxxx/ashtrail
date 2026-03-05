import { ALL_SKILLS } from './mockData';
import traitsData from './data/traits.json';
import occupationsData from './data/occupations.json';
import itemsData from './data/items.json';
import { Trait, Occupation, Item, Character, Skill } from './types';

export class GameRegistry {
    private static traits: Map<string, Trait> = new Map();
    private static occupations: Map<string, Occupation> = new Map();
    private static items: Map<string, Item> = new Map();
    private static characters: Map<string, Character> = new Map();
    private static skills: Map<string, Skill> = new Map();
    private static initialized = false;

    private static readonly SKILLS_STORAGE_KEY = 'ashtrail_custom_skills';

    public static initialize() {
        if (this.initialized) return;

        // Load static JSON
        const tData = traitsData as any;
        const traitsArray = Array.isArray(tData) ? tData : (tData && typeof tData === 'object' && tData.id ? [tData] : []);
        traitsArray.forEach(t => this.traits.set(t.id, t));

        const oData = occupationsData as any;
        const occupationsArray = Array.isArray(oData) ? oData : (oData && typeof oData === 'object' && oData.id ? [oData] : []);
        occupationsArray.forEach(o => this.occupations.set(o.id, o));

        const iData = itemsData as any;
        const itemsArray = Array.isArray(iData) ? iData : (iData && typeof iData === 'object' && iData.id ? [iData] : []);
        itemsArray.forEach(i => this.items.set(i.id, i));

        ALL_SKILLS.forEach(s => this.skills.set(s.id, s));

        // Load from LocalStorage (overrides static, but overridden by backend)
        this.loadSkillsFromLocalStorage();

        this.initialized = true;
    }

    private static loadSkillsFromLocalStorage() {
        if (typeof window === 'undefined') return;
        const stored = localStorage.getItem(this.SKILLS_STORAGE_KEY);
        if (stored) {
            try {
                const skills: Skill[] = JSON.parse(stored);
                skills.forEach(s => this.skills.set(s.id, s));
                console.log(`[GameRegistry] Loaded ${skills.length} skills from localStorage.`);
            } catch (e) {
                console.error("[GameRegistry] Failed to parse skills from localStorage", e);
            }
        }
    }

    public static saveSkillsToLocalStorage() {
        if (typeof window === 'undefined') return;
        const skillsArray = Array.from(this.skills.values());
        localStorage.setItem(this.SKILLS_STORAGE_KEY, JSON.stringify(skillsArray));
        console.log(`[GameRegistry] Saved ${skillsArray.length} skills to localStorage.`);
    }

    // Reloads data from the dev-tools backend (used in dev-tools CMS)
    public static async fetchFromBackend(backendUrl: string = 'http://127.0.0.1:8787') {
        const urlToUse = backendUrl.replace('127.0.0.1', window.location.hostname);
        console.log(`[GameRegistry] Syncing with backend at ${urlToUse}...`);

        this.initialize();

        try {
            // Skills sync
            const sRes = await fetch(`${urlToUse}/api/data/skills`);
            if (sRes.ok) {
                const sData: Skill[] = await sRes.json();
                if (Array.isArray(sData)) {
                    console.log(`[GameRegistry] Received ${sData.length} skills from backend.`);
                    sData.forEach(s => this.skills.set(s.id, s));
                    this.saveSkillsToLocalStorage();
                } else {
                    console.error("[GameRegistry] Skills data from backend is not an array:", sData);
                }
            }
            // Other syncs (traits, occupations, items, characters)
            const tRes = await fetch(`${urlToUse}/api/data/traits`);
            if (tRes.ok) {
                const tData = await tRes.json();
                const tArray = Array.isArray(tData) ? tData : (tData && typeof tData === 'object' && tData.id ? [tData] : []);
                if (tArray.length > 0 || Array.isArray(tData)) {
                    this.traits.clear();
                    tArray.forEach(t => this.traits.set(t.id, t));
                }
            }

            const oRes = await fetch(`${urlToUse}/api/data/occupations`);
            if (oRes.ok) {
                const oData = await oRes.json();
                const oArray = Array.isArray(oData) ? oData : (oData && typeof oData === 'object' && oData.id ? [oData] : []);
                if (oArray.length > 0 || Array.isArray(oData)) {
                    this.occupations.clear();
                    oArray.forEach(o => this.occupations.set(o.id, o));
                }
            }

            const iRes = await fetch(`${urlToUse}/api/data/items`);
            if (iRes.ok) {
                const iData = await iRes.json();
                const iArray = Array.isArray(iData) ? iData : (iData && typeof iData === 'object' && iData.id ? [iData] : []);
                if (iArray.length > 0 || Array.isArray(iData)) {
                    this.items.clear();
                    iArray.forEach(i => this.items.set(i.id, i));
                }
            }

            const cRes = await fetch(`${urlToUse}/api/data/characters`);
            if (cRes.ok) {
                const cData: Character[] = await cRes.json();
                if (Array.isArray(cData)) {
                    this.characters.clear();
                    cData.forEach(c => this.characters.set(c.id, c));
                }
            }

            console.log("[GameRegistry] Sync complete.");
            this.initialized = true;
        } catch (e) {
            console.warn("[GameRegistry] Could not fetch from backend CMS, using static JSON only.", e);
            this.initialize();
        }
    }

    // --- TRAITS ---
    public static getAllTraits(): Trait[] {
        if (!this.initialized) this.initialize();
        return Array.from(this.traits.values());
    }

    public static getTrait(id: string): Trait | undefined {
        if (!this.initialized) this.initialize();
        return this.traits.get(id);
    }

    // --- OCCUPATIONS ---
    public static getAllOccupations(): Occupation[] {
        if (!this.initialized) this.initialize();
        return Array.from(this.occupations.values());
    }

    public static getOccupation(id: string): Occupation | undefined {
        if (!this.initialized) this.initialize();
        return this.occupations.get(id);
    }

    // --- ITEMS ---
    public static getAllItems(): Item[] {
        if (!this.initialized) this.initialize();
        return Array.from(this.items.values());
    }

    public static getItem(id: string): Item | undefined {
        if (!this.initialized) this.initialize();
        return this.items.get(id);
    }

    // --- CHARACTERS ---
    public static getAllCharacters(): Character[] {
        if (!this.initialized) this.initialize();
        return Array.from(this.characters.values());
    }

    public static getCharacter(id: string): Character | undefined {
        if (!this.initialized) this.initialize();
        return this.characters.get(id);
    }

    // --- SKILLS ---
    public static getAllSkills(): Skill[] {
        if (!this.initialized) this.initialize();
        return Array.from(this.skills.values());
    }

    public static getSkill(id: string): Skill | undefined {
        if (!this.initialized) this.initialize();
        return this.skills.get(id);
    }

    public static addSkill(skill: Skill) {
        this.initialize();
        this.skills.set(skill.id, skill);
        this.saveSkillsToLocalStorage();
    }

    public static removeSkill(id: string) {
        this.skills.delete(id);
        this.saveSkillsToLocalStorage();
    }
}
