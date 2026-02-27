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

        import('./mockData').then(({ ALL_SKILLS }) => {
            ALL_SKILLS.forEach(s => this.skills.set(s.id, s));
        });

        this.initialized = true;
    }

    // Reloads data from the dev-tools backend (used in dev-tools CMS)
    public static async fetchFromBackend(backendUrl: string = 'http://127.0.0.1:8787') {
        try {
            const tRes = await fetch(`${backendUrl}/api/data/traits`);
            if (tRes.ok) {
                const tData = await tRes.json();
                const tArray = Array.isArray(tData) ? tData : (tData && typeof tData === 'object' && tData.id ? [tData] : []);
                if (tArray.length > 0 || Array.isArray(tData)) {
                    this.traits.clear();
                    tArray.forEach(t => this.traits.set(t.id, t));
                }
            }

            const oRes = await fetch(`${backendUrl}/api/data/occupations`);
            if (oRes.ok) {
                const oData = await oRes.json();
                const oArray = Array.isArray(oData) ? oData : (oData && typeof oData === 'object' && oData.id ? [oData] : []);
                if (oArray.length > 0 || Array.isArray(oData)) {
                    this.occupations.clear();
                    oArray.forEach(o => this.occupations.set(o.id, o));
                }
            }

            const iRes = await fetch(`${backendUrl}/api/data/items`);
            if (iRes.ok) {
                const iData = await iRes.json();
                const iArray = Array.isArray(iData) ? iData : (iData && typeof iData === 'object' && iData.id ? [iData] : []);
                if (iArray.length > 0 || Array.isArray(iData)) {
                    this.items.clear();
                    iArray.forEach(i => this.items.set(i.id, i));
                }
            }

            // Also load characters from generated folder
            const cRes = await fetch(`${backendUrl}/api/data/characters`);
            if (cRes.ok) {
                const cData: Character[] = await cRes.json();
                this.characters.clear();
                cData.forEach(c => this.characters.set(c.id, c));
            }

            const sRes = await fetch(`${backendUrl}/api/data/skills`);
            if (sRes.ok) {
                const sData: Skill[] = await sRes.json();
                // We keep base skills but add/override from custom ones
                sData.forEach(s => this.skills.set(s.id, s));
            }

            this.initialized = true;
        } catch (e) {
            console.warn("Could not fetch from backend CMS, falling back to static JSON", e);
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
}
