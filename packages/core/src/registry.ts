import traitsData from './data/traits.json';
import occupationsData from './data/occupations.json';
import itemsData from './data/items.json';
import { Trait, Occupation, Item, Character } from './types';

export class GameRegistry {
    private static traits: Map<string, Trait> = new Map();
    private static occupations: Map<string, Occupation> = new Map();
    private static items: Map<string, Item> = new Map();
    private static characters: Map<string, Character> = new Map();
    private static initialized = false;

    public static initialize() {
        if (this.initialized) return;

        // Load static JSON
        const tData = traitsData as Trait[];
        tData.forEach(t => this.traits.set(t.id, t));

        const oData = occupationsData as Occupation[];
        oData.forEach(o => this.occupations.set(o.id, o));

        const iData = itemsData as Item[];
        iData.forEach(i => this.items.set(i.id, i));

        this.initialized = true;
    }

    // Reloads data from the dev-tools backend (used in dev-tools CMS)
    public static async fetchFromBackend(backendUrl: string = 'http://127.0.0.1:8787') {
        try {
            const tRes = await fetch(`${backendUrl}/api/data/traits`);
            if (tRes.ok) {
                const tData: Trait[] = await tRes.json();
                this.traits.clear();
                tData.forEach(t => this.traits.set(t.id, t));
            }

            const oRes = await fetch(`${backendUrl}/api/data/occupations`);
            if (oRes.ok) {
                const oData: Occupation[] = await oRes.json();
                this.occupations.clear();
                oData.forEach(o => this.occupations.set(o.id, o));
            }

            const iRes = await fetch(`${backendUrl}/api/data/items`);
            if (iRes.ok) {
                const iData: Item[] = await iRes.json();
                this.items.clear();
                iData.forEach(i => this.items.set(i.id, i));
            }

            // Also load characters from generated folder
            const cRes = await fetch(`${backendUrl}/api/data/characters`);
            if (cRes.ok) {
                const cData: Character[] = await cRes.json();
                this.characters.clear();
                cData.forEach(c => this.characters.set(c.id, c));
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
}
