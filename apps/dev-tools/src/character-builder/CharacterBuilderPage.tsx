import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Character, Trait, Occupation, Stats, GameRegistry, OccupationCategory, Item, ItemRarity, ItemCategory, EquipSlot, Skill, SkillCategory } from "@ashtrail/core";
import { TabBar } from "@ashtrail/ui";
import { GameRulesManager } from "../gameplay-engine/rules/useGameRules";

// Map item category + name to an equipment slot
const SLOT_MAP: Record<string, EquipSlot> = {
    "Reinforced Helmet": "head",
    "Tactical Vest": "chest",
    "Scrap Plating": "chest",
    "Leather Guards": "gloves",
    "Combat Boots": "boots",
};

const EQUIPMENT_SLOT_ORDER: EquipSlot[] = [
    "head",
    "chest",
    "gloves",
    "waist",
    "legs",
    "boots",
    "mainHand",
    "offHand",
];

const EQUIPMENT_SLOT_LABELS: Record<EquipSlot, string> = {
    head: "HEAD",
    chest: "CHEST",
    gloves: "GLOVES",
    waist: "WAIST",
    legs: "LEGS",
    boots: "BOOTS",
    mainHand: "MAIN HAND",
    offHand: "OFF HAND",
};

function getEquipSlot(item: Item): EquipSlot | null {
    if (item.equipSlot) return item.equipSlot;
    if (SLOT_MAP[item.name]) return SLOT_MAP[item.name];
    if (item.category === "weapon") return "mainHand";
    return null;
}

function isEquipable(item: Item): boolean {
    return getEquipSlot(item) !== null;
}

type BuilderTab = "IDENTITY" | "LORE" | "TRAITS" | "STATS" | "OCCUPATION" | "SKILLS" | "EQUIPEMENT" | "CHARACTER_SHEET" | "INVENTORY" | "SAVE";

const DEFAULT_STATS: Stats = { strength: 3, agility: 3, intelligence: 3, wisdom: 3, endurance: 3, charisma: 3 };
const ZERO_STATS: Stats = { strength: 0, agility: 0, intelligence: 0, wisdom: 0, endurance: 0, charisma: 0 };

const RARITY_ORDER: Record<ItemRarity, number> = {
    ashmarked: 5,
    relic: 4,
    specialized: 3,
    "pre-ash": 2,
    reinforced: 1,
    salvaged: 0
};

const ASH_TRAIL_CHRONICLES = [
    { id: "ASH-0", label: "ASH-0: The Great Fog (0-3 mo)", event: "The world was blanketed by an unknown atmospheric film, sparking the first mutations and mass extinction." },
    { id: "ASH-1", label: "ASH-1: The Resource War (4 yr)", event: "Global powers collapsed in a brutal war for clean water and fuel, leaving the world as a scorched ash-waste." },
    { id: "ASH-2", label: "ASH-2: The Underground Era (10 yr)", event: "Mutations became widespread. Humanity retreated into lead-lined Vaults, surrendering the surface to the Ash." },
    { id: "ASH-3", label: "ASH-3: The Rebuilding (30 yr)", event: "Tribal cults like the Ash Trackers began to emerge, scavenging relics and learning to survive the surface fog." },
    { id: "ASH-4", label: "ASH-4: The Surface Return (50 yr)", event: "Surface re-colonization has begun. New City-States arise from scavenged tech, while the Ash continues to evolve." }
];

const ITEMS_BY_CATEGORY: Record<string, string[]> = {
    weapon: ["Stun Baton", "Vibration Blade", "Pulse Rifle", "Rusty Pipe", "Spiked Bat", "Serrated Knife"],
    consumable: ["Med Kit", "Bandage", "Stimulant", "Filtered Water", "Nutrient Bar", "Antigen"],
    resource: ["Scrap Metal", "Electronics", "Chemicals", "Fiberglass"],
    junk: ["Broken Bottle", "Rusted Nut", "Plastic Waste", "Old Tape"],
    armor: ["Tactical Vest", "Reinforced Helmet", "Scrap Plating", "Leather Guards", "Combat Boots"]
};

const ALL_TITLES = [
    "Wasteland Survivor",
    "Ash-Born",
    "Scrap Collector",
    "Exposed wanderer",
    "Old World Relic",
    "The Nameless",
    "Dust Stalker",
    "Road Warrior",
    "Steelheart",
    "Radiation Prophet"
];

const ALL_BADGES = [
    "👤", "💀", "⚔️", "🛡️", "🧬", "⚡", "🔥", "☢️", "☣️", "🪦", "🔋", "🩸"
];

export function CharacterBuilderPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [savedCharacters, setSavedCharacters] = useState<Character[]>([]);
    const [libraryItems, setLibraryItems] = useState<Item[]>([]);
    const [activeTab, setActiveTab] = useState<BuilderTab>("IDENTITY");
    const [librarySkills, setLibrarySkills] = useState<Skill[]>([]);

    // ── Character Form State ──
    const [charId, setCharId] = useState(`char-${Date.now()}`);
    const [name, setName] = useState("");
    const [age, setAge] = useState(25);
    const [gender, setGender] = useState("Male");
    const [backstory, setBackstory] = useState("");
    const [history, setHistory] = useState("");
    const [currentStory, setCurrentStory] = useState("");
    const [isNPC, setIsNPC] = useState(false);
    const [level, setLevel] = useState(1);
    const [characterTitle, setCharacterTitle] = useState("");
    const [characterBadge, setCharacterBadge] = useState("");
    const [faction, setFaction] = useState("");
    const [alignment, setAlignment] = useState("");
    const [showSelectionModal, setShowSelectionModal] = useState<"title" | "badge" | null>(null);
    const [isGeneratingStory, setIsGeneratingStory] = useState(false);

    // Traits
    const [selectedTraits, setSelectedTraits] = useState<Trait[]>([]);
    const [traitPoints, setTraitPoints] = useState(15);
    const [traitSearch, setTraitSearch] = useState("");

    // Stats
    const [stats, setStats] = useState<Stats>({ ...DEFAULT_STATS });
    const [statsPoints, setStatsPoints] = useState(18);
    const [attributePoints, setAttributePoints] = useState(0);
    const [attributeUpgrades, setAttributeUpgrades] = useState<Stats>({ ...ZERO_STATS });
    const [isRedispatching, setIsRedispatching] = useState(false);
    const [redispatchPoints, setRedispatchPoints] = useState<number | null>(null);
    const [redispatchUpgrades, setRedispatchUpgrades] = useState<Stats | null>(null);
    const [redispatchStats, setRedispatchStats] = useState<Stats | null>(null);

    // Occupation
    const [selectedOccupation, setSelectedOccupation] = useState<Occupation | null>(null);
    const [occCategory, setOccCategory] = useState<OccupationCategory | "ALL">("ALL");

    // Load character for editing
    const [editingId, setEditingId] = useState<string | null>(null);

    // Skills State
    const [selectedSkills, setSelectedSkills] = useState<Skill[]>([]);
    const [skillSearch, setSkillSearch] = useState("");
    const [skillCategoryFilter, setSkillCategoryFilter] = useState<SkillCategory | "ALL">("ALL");
    const [bookCategory, setBookCategory] = useState<SkillCategory>("base");


    // Inventory State
    const [inventory, setInventory] = useState<Item[]>([]);
    const [inventorySearch, setInventorySearch] = useState("");
    const [inventoryFilter, setInventoryFilter] = useState("ALL");
    const [activeBagIndex, setActiveBagIndex] = useState(0);
    const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, slotIndex: number | null } | null>(null);
    const [hoverInfo, setHoverInfo] = useState<{ x: number, y: number, item: Item } | null>(null);
    const [animatingSlot, setAnimatingSlot] = useState<{ index: number, type: 'destroy' | 'throw' } | null>(null);

    // Equipment State
    const [equippedItems, setEquippedItems] = useState<Record<string, Item | null>>({
        head: null, chest: null, gloves: null, waist: null, legs: null, boots: null, mainHand: null, offHand: null
    });

    const equipItem = (slotId: EquipSlot, item: Item) => {
        const existing = equippedItems[slotId];

        setEquippedItems(prev => ({ ...prev, [slotId]: item }));
        setInventory(prev => {
            const nextInventory = prev.filter(i => i.id !== item.id);
            if (!existing) return nextInventory;
            return [...nextInventory, { ...existing, bagIndex: activeBagIndex }];
        });
    };

    const unequipItem = (slotId: EquipSlot) => {
        const item = equippedItems[slotId];
        if (!item) return;

        setEquippedItems(prev => ({ ...prev, [slotId]: null }));
        setInventory(prev => {
            if (prev.some(invItem => invItem.id === item.id)) return prev;
            return [...prev, { ...item, bagIndex: activeBagIndex }];
        });
    };

    const equipFromInventory = (item: Item): EquipSlot | null => {
        const slot = getEquipSlot(item);
        if (!slot) return null;
        equipItem(slot, item);
        return slot;
    };

    const equipmentStatModifiers = useMemo(() => {
        const result = { ...ZERO_STATS };
        Object.values(equippedItems).forEach(item => {
            if (item && item.effects) {
                item.effects.forEach(eff => {
                    const target = eff.target as keyof Stats;
                    if (eff.type === 'STAT_MODIFIER' && target in result) {
                        result[target] += eff.value;
                    }
                });
            }
        });
        return result;
    }, [equippedItems]);

    const activeStats = isRedispatching ? (redispatchStats ?? { ...DEFAULT_STATS }) : stats;
    const activeAttributePoints = isRedispatching ? (redispatchPoints ?? 0) : attributePoints;
    const activeAttributeUpgrades = isRedispatching ? (redispatchUpgrades ?? { ...ZERO_STATS }) : attributeUpgrades;

    // Effective Stats calculation (Base + Level Up + Equipment Modifiers)
    const effectiveStats = useMemo(() => {
        const result = { ...activeStats };
        (Object.keys(result) as (keyof Stats)[]).forEach(stat => {
            result[stat] += activeAttributeUpgrades[stat] + equipmentStatModifiers[stat];
        });
        return result;
    }, [activeStats, activeAttributeUpgrades, equipmentStatModifiers]);

    // Derived values from effective stats
    const derivedStats = useMemo(() => {
        const s = effectiveStats;
        const rules = GameRulesManager.get();
        const hp = (rules.core.hpBase || 10) + s.endurance * (rules.core.hpPerEndurance || 5);
        const ap = (rules.core.apBase || 5) + Math.floor(s.agility / (rules.core.apAgilityDivisor || 2));

        // Calculate Armor
        const baseArmor = Math.floor(
            (rules.core.armorAgiScale || 2.5) * Math.log(s.agility + 1) +
            (rules.core.armorEnduScale || 3.5) * Math.log(s.endurance + 1)
        );

        // Add direct HP and Armor modifiers from items if any
        let directHp = 0;
        let modArmor = 0;
        Object.values(equippedItems).forEach(item => {
            if (item && item.effects) {
                item.effects.forEach(eff => {
                    if (eff.target === 'hp' || eff.target === 'maxHp') {
                        directHp += (eff.value || 0);
                    }
                    if (eff.target === 'armor' || eff.target === 'defense') {
                        modArmor += (eff.value || 0);
                    }
                });
            }
        });

        return {
            hp: hp + directHp,
            ap: ap,
            armor: baseArmor + modArmor,
            crit: `${(s.intelligence * (rules.core.critPerIntelligence || 0.02) * 100).toFixed(1)}%`,
            resist: `${(s.wisdom * (rules.core.resistPerWisdom || 0.05) * 100).toFixed(0)}%`,
            social: `${(s.charisma * (rules.core.charismaBonusPerCharisma || 0.03) * 100).toFixed(1)}%`,
            minDmg: (() => {
                const weapon = equippedItems.mainHand;
                let base = 4;
                if (weapon) {
                    const dmgEff = weapon.effects?.find(e => e.target === 'damage' || e.type === 'COMBAT_BONUS');
                    if (dmgEff) base = dmgEff.value;
                }
                return (base + s.strength * 0.2).toFixed(1);
            })(),
            maxDmg: (() => {
                const weapon = equippedItems.mainHand;
                let base = 5;
                if (weapon) {
                    const dmgEff = weapon.effects?.find(e => e.target === 'damage' || e.type === 'COMBAT_BONUS');
                    if (dmgEff) base = dmgEff.value;
                }
                return (base + s.strength * 0.4).toFixed(1);
            })()
        };
    }, [effectiveStats, equippedItems]);

    // Check if an item is currently equipped (used by context menu)
    const isItemEquipped = (item: Item): EquipSlot | null => {
        for (const [slotId, equipped] of Object.entries(equippedItems)) {
            if (equipped && equipped.id === item.id) return slotId as EquipSlot;
        }
        return null;
    };

    // List of equipable items in the current inventory
    const equipableInventoryItems = useMemo(() => {
        return inventory.filter(item => isEquipable(item));
    }, [inventory]);

    const equipableItemsBySlot = useMemo(() => {
        const bySlot: Record<EquipSlot, Item[]> = {
            head: [],
            chest: [],
            gloves: [],
            waist: [],
            legs: [],
            boots: [],
            mainHand: [],
            offHand: [],
        };

        equipableInventoryItems.forEach(item => {
            const slot = getEquipSlot(item);
            if (!slot) return;
            bySlot[slot].push(item);
        });

        return bySlot;
    }, [equipableInventoryItems]);

    const sortByRarity = () => {
        setInventory(prev => [...prev].sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity]));
    };

    const sortByValue = () => {
        setInventory(prev => [...prev].sort((a, b) => b.cost - a.cost));
    };

    const removeSlotItem = (index: number) => {
        const itemToRemove = filteredInventory[index];
        if (itemToRemove) {
            setInventory(prev => prev.filter(item => item.id !== itemToRemove.id));
        }
    };

    const filteredInventory = useMemo(() => {
        return inventory.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(inventorySearch.toLowerCase());
            const matchesFilter = inventoryFilter === "ALL" || item.category === inventoryFilter.toLowerCase();
            const matchesBag = (item.bagIndex || 0) === activeBagIndex;
            return matchesSearch && matchesFilter && matchesBag;
        });
    }, [inventory, inventorySearch, inventoryFilter, activeBagIndex]);

    // Library search state
    const [librarySearch, setLibrarySearch] = useState("");

    const allLibraryItems = useMemo(() => {
        return libraryItems.filter(item =>
            item.name.toLowerCase().includes(librarySearch.toLowerCase()) ||
            item.category.toLowerCase().includes(librarySearch.toLowerCase())
        );
    }, [libraryItems, librarySearch]);

    const addItemToInventory = (item: Item) => {
        const newItem: Item = {
            ...item,
            id: `${item.id}-${Date.now()}`,
            bagIndex: activeBagIndex,
        };
        setInventory(prev => [...prev, newItem]);
    };

    // Currency Values
    const [gold] = useState(10);
    const [silver] = useState(24);
    const [copper] = useState(0);
    const totalCredits = (gold * 100) + (silver * 10) + copper;

    useEffect(() => {
        async function load() {
            await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
            setSavedCharacters(GameRegistry.getAllCharacters());
            setLibraryItems(GameRegistry.getAllItems());
            setLibrarySkills(GameRegistry.getAllSkills());
            setIsLoading(false);
        }
        load();
    }, []);

    useEffect(() => {
        if (activeTab !== "INVENTORY" && activeTab !== "EQUIPEMENT") return;

        let isActive = true;

        async function refreshLibraryItems() {
            await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
            if (!isActive) return;
            setLibraryItems(GameRegistry.getAllItems());
        }

        refreshLibraryItems();

        return () => {
            isActive = false;
        };
    }, [activeTab]);

    const allTraits = GameRegistry.getAllTraits().filter(t => !t.id.startsWith("age-"));
    const allOccupations = GameRegistry.getAllOccupations();

    const filteredTraits = useMemo(() => {
        const s = traitSearch.toLowerCase();
        const available = allTraits.filter(t => !selectedTraits.some(st => st.id === t.id));
        return {
            positive: available.filter(t => t.type === "positive" && (t.name.toLowerCase().includes(s) || t.description.toLowerCase().includes(s))),
            negative: available.filter(t => t.type === "negative" && (t.name.toLowerCase().includes(s) || t.description.toLowerCase().includes(s))),
            neutral: available.filter(t => t.type === "neutral" && (t.name.toLowerCase().includes(s) || t.description.toLowerCase().includes(s))),
        };
    }, [traitSearch, selectedTraits, allTraits]);

    const filteredOccupations = useMemo(() => {
        return allOccupations.filter(o => occCategory === "ALL" || o.category === occCategory);
    }, [occCategory, allOccupations]);

    const toggleTrait = (trait: Trait) => {
        const isSelected = selectedTraits.find(t => t.id === trait.id);
        if (isSelected) {
            setSelectedTraits(p => p.filter(t => t.id !== trait.id));
            setTraitPoints(p => p + trait.cost);
        } else {
            if (traitPoints >= trait.cost || trait.cost < 0) {
                setSelectedTraits(p => [...p, trait]);
                setTraitPoints(p => p - trait.cost);
            }
        }
    };

    const adjustStat = (stat: keyof Stats, delta: number) => {
        if (delta > 0 && statsPoints <= 0) return;
        if (delta < 0 && stats[stat] <= 1) return;
        setStats(p => ({ ...p, [stat]: p[stat] + delta }));
        setStatsPoints(p => p - delta);
    };

    const toggleSkill = (skill: Skill) => {
        const isSelected = selectedSkills.find(s => s.id === skill.id);
        if (isSelected) {
            setSelectedSkills(p => p.filter(s => s.id !== skill.id));
        } else {
            setSelectedSkills(p => [...p, skill]);
        }
    };

    const updateLevel = (nextLevel: number, grantAttributePoint = false) => {
        const normalizedLevel = Math.max(1, nextLevel || 1);
        setLevel(prevLevel => {
            if (grantAttributePoint && normalizedLevel > prevLevel) {
                setAttributePoints(points => points + (normalizedLevel - prevLevel));
            }
            return normalizedLevel;
        });
    };

    const upgradeAttribute = (stat: keyof Stats) => {
        if (isRedispatching) {
            if ((redispatchPoints ?? 0) <= 0) return;
            // When redispatching, prioritize giving points to upgrades if base is already at initial level
            // but for simplicity, we can just put everything into upgrades during redispatch
            setRedispatchUpgrades(prev => ({ ...(prev ?? { ...ZERO_STATS }), [stat]: (prev ?? { ...ZERO_STATS })[stat] + 1 }));
            setRedispatchPoints(prev => Math.max(0, (prev ?? 0) - 1));
            return;
        }

        if (attributePoints <= 0) return;
        setAttributeUpgrades(prev => ({ ...prev, [stat]: prev[stat] + 1 }));
        setAttributePoints(prev => Math.max(0, prev - 1));
    };

    const downgradeAttribute = (stat: keyof Stats) => {
        if (isRedispatching) {
            const currentUpgrades = redispatchUpgrades ?? { ...ZERO_STATS };
            const currentBase = redispatchStats ?? stats;

            if (currentUpgrades[stat] > 0) {
                // Take back from upgrades first
                setRedispatchUpgrades(prev => ({ ...(prev ?? { ...ZERO_STATS }), [stat]: prev![stat] - 1 }));
                setRedispatchPoints(prev => (prev ?? 0) + 1);
            } else if (currentBase[stat] > 1) {
                // Then take back from base stats if > 1
                setRedispatchStats(prev => ({ ...(prev ?? { ...DEFAULT_STATS }), [stat]: prev![stat] - 1 }));
                setRedispatchPoints(prev => (prev ?? 0) + 1);
            }
            return;
        }

        if (attributeUpgrades[stat] <= 0) return;
        setAttributeUpgrades(prev => ({ ...prev, [stat]: Math.max(0, prev[stat] - 1) }));
        setAttributePoints(prev => prev + 1);
    };

    const toggleRedispatchMode = () => {
        if (!isRedispatching) {
            setRedispatchStats({ ...stats });
            setRedispatchUpgrades({ ...attributeUpgrades });
            setRedispatchPoints(attributePoints);
            setIsRedispatching(true);
            return;
        }

        setStats(redispatchStats ?? { ...DEFAULT_STATS });
        setAttributeUpgrades(redispatchUpgrades ?? { ...ZERO_STATS });
        setAttributePoints(redispatchPoints ?? 0);
        setRedispatchStats(null);
        setRedispatchUpgrades(null);
        setRedispatchPoints(null);
        setIsRedispatching(false);
    };

    const loadCharacter = (char: Character) => {
        setEditingId(char.id);
        setCharId(char.id);
        setName(char.name);
        setAge(char.age);
        setGender(char.gender);
        const loadedBackstory = char.backstory || char.appearancePrompt || "";
        setBackstory(loadedBackstory);
        // If history is identical to backstory, it shows it wasn't a real generated story
        const loadedHistory = (char.history && char.history !== loadedBackstory && char.history.length > loadedBackstory.length + 50) ? char.history : "";
        setHistory(loadedHistory);
        setIsNPC(char.isNPC || false);
        updateLevel(char.level || 1);
        setCharacterTitle(char.title || "");
        setCharacterBadge(char.badge || "");
        setFaction(char.faction || "");
        setAlignment(char.alignment || "");
        setCurrentStory(char.currentStory || "");
        setSelectedTraits(char.traits || []);
        setStats(char.stats);
        setAttributeUpgrades({ ...ZERO_STATS });
        setIsRedispatching(false);
        setRedispatchPoints(null);
        setRedispatchUpgrades(null);
        setSelectedOccupation(char.occupation || null);
        setInventory(char.inventory || []);
        setSelectedSkills(char.skills || []);
        if (char.equipped) {
            setEquippedItems(char.equipped);
        } else {
            setEquippedItems({
                head: null, chest: null, gloves: null, waist: null, legs: null, boots: null, mainHand: null, offHand: null
            });
        }
        // Recalculate points (approximate)
        const usedTraitPoints = (char.traits || []).reduce((sum, t) => sum + t.cost, 0);
        setTraitPoints(15 - usedTraitPoints);
        const usedStatPoints = Object.values(char.stats).reduce((sum, v) => (sum as number) + (v as number), 0) - 18;
        setStatsPoints(18 - usedStatPoints);
        setAttributePoints(0);
        setAttributeUpgrades({ ...ZERO_STATS });
        setIsRedispatching(false);
        setRedispatchPoints(null);
        setRedispatchUpgrades(null);
        setActiveTab("IDENTITY");
    };

    const resetForm = () => {
        setEditingId(null);
        setCharId(`char-${Date.now()}`);
        setName("");
        setAge(25);
        setGender("Male");
        setHistory("");
        setBackstory("");
        setIsNPC(false);
        updateLevel(1);
        setCharacterTitle("");
        setCharacterBadge("");
        setFaction("");
        setAlignment("");
        setCurrentStory("");
        setSelectedTraits([]);
        setTraitPoints(15);
        setStats({ ...DEFAULT_STATS });
        setStatsPoints(18);
        setAttributePoints(0);
        setAttributeUpgrades({ ...ZERO_STATS });
        setIsRedispatching(false);
        setRedispatchPoints(null);
        setRedispatchUpgrades(null);
        setSelectedOccupation(null);
        setEquippedItems({
            head: null, chest: null, gloves: null, waist: null, legs: null, boots: null, mainHand: null, offHand: null
        });
        setSelectedSkills([]);
        setActiveTab("IDENTITY");
        // Also reset inventory to fresh mock data
        const rarities: ItemRarity[] = ["salvaged", "reinforced", "pre-ash", "specialized", "relic", "ashmarked"];
        const mockInventory: Item[] = [];
        const categories = Object.keys(ITEMS_BY_CATEGORY) as (keyof typeof ITEMS_BY_CATEGORY)[];
        categories.forEach((cat) => {
            ITEMS_BY_CATEGORY[cat].forEach((name, i) => {
                mockInventory.push({
                    id: `item-reset-${cat}-${i}-${Date.now()}`,
                    name,
                    category: cat as ItemCategory,
                    rarity: rarities[Math.floor(Math.random() * rarities.length)],
                    cost: Math.floor(Math.random() * 500) + 50,
                    description: `Freshly issued ${cat}.`,
                    bagIndex: Math.floor(Math.random() * 6)
                });
            });
        });
        setInventory(mockInventory);
    };

    const handleSave = async () => {
        const finalStats = { ...stats };
        const character: Character = {
            id: charId,
            isNPC,
            name,
            age,
            gender,
            history,
            backstory,
            appearancePrompt: backstory, // Keep both in sync for legacy data/backend support
            stats: finalStats,
            traits: selectedTraits,
            occupation: selectedOccupation || undefined,
            hp: derivedStats.hp,
            maxHp: derivedStats.hp,
            xp: 0,
            level: level,
            inventory: inventory,
            skills: selectedSkills,
            equipped: equippedItems,
            title: characterTitle,
            badge: characterBadge,
            faction: faction,
            alignment: alignment,
            currentStory: currentStory,
        };

        try {
            const res = await fetch("http://127.0.0.1:8787/api/data/characters", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(character),
            });
            if (res.ok) {
                // Refresh list
                await GameRegistry.fetchFromBackend("http://127.0.0.1:8787");
                setSavedCharacters(GameRegistry.getAllCharacters());
                setEditingId(character.id);
            }
        } catch (e) {
            console.error("Failed to save character:", e);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-[#1e1e1e] text-gray-500">Loading...</div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-[#1e1e1e] text-gray-300 font-sans tracking-wide overflow-hidden relative">
            <div className="absolute inset-0 z-0 pointer-events-none opacity-40 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-[#030508] to-[#030508]" />

            {/* ══ Header ══ */}
            <header className="absolute top-0 left-0 right-0 z-30 bg-[#030508]/90 backdrop-blur-md border-b border-white/5 pointer-events-auto">
                <div className="h-16 flex items-center justify-between px-6 w-full">
                    <div className="flex items-center gap-6">
                        <Link to="/" className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-all">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                        </Link>
                        <h1 className="text-xs font-black tracking-[0.3em] text-white">CHARACTER BUILDER</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={resetForm} className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 border border-white/10 rounded-lg hover:bg-white/5 transition-all">
                            + New
                        </button>
                    </div>
                </div>
            </header>

            {/* ══ Main Layout ══ */}
            <div className="flex-1 flex overflow-hidden relative z-10 pt-[80px] pb-6 px-6 gap-6">
                <style>{`
                    @keyframes dustSweep {
                        0% { transform: translateX(-100%) skewX(-20deg); opacity: 0; }
                        20% { opacity: 0.7; }
                        80% { opacity: 0.7; }
                        100% { transform: translateX(180%) skewX(-20deg); opacity: 0; }
                    }
                    @keyframes ashSettling {
                        0% { opacity: 0; transform: scale(0.98); filter: brightness(0.2) contrast(1.2); }
                        100% { opacity: 1; transform: scale(1); filter: brightness(1) contrast(1); }
                    }
                    .animate-dust-sweep {
                        animation: dustSweep 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    }
                    .animate-ash-settling {
                        animation: ashSettling 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards;
                    }
                    @keyframes itemDestroy {
                        0% { transform: translate(0, 0) scale(1); filter: brightness(1); }
                        5% { transform: translate(1px, -1px); }
                        10% { transform: translate(-1px, 1px); filter: brightness(1.2); }
                        15% { transform: translate(1px, 1px); }
                        20% { transform: translate(-1px, -1px); clip-path: polygon(0% 0%, 50% 0%, 50% 50%, 0% 50%); }
                        25% { transform: translate(2px, 0); clip-path: polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%); }
                        30% { transform: scale(1.02); filter: contrast(1.5); }
                        100% { transform: translateY(15px) scale(0.9) rotate(2deg); opacity: 0; filter: brightness(0.2) grayscale(1); }
                    }
                    @keyframes itemThrow {
                        0% { transform: translateX(0) skewX(0); opacity: 1; filter: blur(0); }
                        20% { transform: translateX(-15px) skewX(10deg); filter: blur(1px); }
                        100% { transform: translateX(300px) skewX(-30deg); opacity: 0; filter: blur(15px) brightness(3); }
                    }
                    @keyframes dustLash {
                        0% { transform: translateX(-100%) skewX(-20deg); opacity: 0; }
                        50% { opacity: 0.8; }
                        100% { transform: translateX(200%) skewX(-20deg); opacity: 0; }
                    }
                    .animate-item-destroy {
                        animation: itemDestroy 0.5s steps(20, end) forwards;
                    }
                    .animate-item-throw {
                        animation: itemThrow 0.6s cubic-bezier(0.44, 0.05, 0.55, 0.95) forwards;
                    }
                    .animate-dust-lash {
                        animation: dustLash 0.6s ease-out forwards;
                    }

                    /* Rarity Styles (Border focused) */
                    .rarity-salvaged { border-color: #d1d5db; --rarity-color: #f3f4f6; }
                    .rarity-reinforced { border-color: #444444; --rarity-color: #222222; }
                    .rarity-pre-ash { border-color: #2563eb; --rarity-color: #1e3a8a; }
                    .rarity-specialized { border-color: #341539; --rarity-color: #4c1d95; }
                    .rarity-relic { border-color: #92400e; --rarity-color: #f59e0b; }
                    
                    @keyframes ashRipple {
                        0% { border-color: #450a0a; box-shadow: inset 0 0 5px rgba(69,10,10,0.4); }
                        50% { border-color: #991b1b; box-shadow: inset 0 0 12px rgba(153,27,27,0.6); }
                        100% { border-color: #450a0a; box-shadow: inset 0 0 5px rgba(69,10,10,0.4); }
                    }
                    .rarity-ashmarked { 
                        border-color: #450a0a; 
                        animation: ashRipple 3s ease-in-out infinite;
                        --rarity-color: #ef4444;
                    }
                    @keyframes permanentRipple {
                        0% { transform: scale(0.95); opacity: 0.1; }
                        50% { transform: scale(1.05); opacity: 0.3; }
                        100% { transform: scale(0.95); opacity: 0.1; }
                    }
                    .ashmarked-permanent-ripple {
                        background: radial-gradient(circle, #991b1b 0%, transparent 70%);
                        animation: permanentRipple 4s ease-in-out infinite;
                    }

                    /* Scrollbar customization */
                    .custom-scrollbar::-webkit-scrollbar {
                        width: 3px;
                        height: 3px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-track {
                        background: transparent;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb {
                        background: rgba(194, 65, 12, 0.1);
                        border-radius: 10px;
                    }
                    .custom-scrollbar:hover::-webkit-scrollbar-thumb {
                        background: rgba(194, 65, 12, 0.3);
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                        background: rgba(194, 65, 12, 0.6);
                    }
                `}</style>

                {/* Left: Saved Characters Sidebar */}
                {activeTab !== "INVENTORY" && activeTab !== "EQUIPEMENT" && activeTab !== "CHARACTER_SHEET" && activeTab !== "SKILLS" && (
                    <aside className="w-[260px] flex flex-col gap-4 shrink-0">
                        <div className="bg-[#1e1e1e]/60 border border-white/5 rounded-2xl shadow-lg backdrop-blur-md p-4 flex flex-col gap-3 flex-1 overflow-hidden">
                            <h3 className="text-[10px] font-black text-indigo-500/70 uppercase tracking-widest border-b border-indigo-900/30 pb-2">
                                Saved Characters ({savedCharacters.length})
                            </h3>
                            <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
                                {savedCharacters.map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => loadCharacter(c)}
                                        className={`w-full text-left p-3 border rounded-lg flex flex-col gap-1 transition-all ${editingId === c.id
                                            ? "bg-indigo-500/20 border-indigo-500"
                                            : "bg-black/40 border-white/5 hover:border-white/20"
                                            }`}
                                    >
                                        <div className="flex justify-between items-center w-full">
                                            <span className="text-[11px] font-bold uppercase text-indigo-400 line-clamp-1">{c.name}</span>
                                            {c.isNPC && <span className="text-[8px] bg-red-500/20 text-red-300 px-1 py-0.5 rounded uppercase">NPC</span>}
                                        </div>
                                        <p className="text-[10px] text-gray-500">Lvl {c.level} | {c.occupation?.name || "None"}</p>
                                    </button>
                                ))}
                                {savedCharacters.length === 0 && (
                                    <p className="text-xs text-gray-600 italic text-center py-4">No characters saved yet.</p>
                                )}
                            </div>
                        </div>
                    </aside>
                )}

                {/* Center: Builder Form */}
                <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                    {/* Tab Navigation */}
                    <div className="shrink-0 flex items-center justify-center p-1 bg-[#1e1e1e]/60 border border-white/5 rounded-2xl shadow-lg backdrop-blur-md">
                        <TabBar
                            tabs={["IDENTITY", "LORE", "TRAITS", "STATS", "OCCUPATION", "SKILLS", "EQUIPEMENT", "CHARACTER_SHEET", "INVENTORY", "SAVE"]}
                            activeTab={activeTab}
                            onTabChange={(t) => setActiveTab(t as BuilderTab)}
                        />
                    </div>

                    {/* Form Content */}
                    <div className="flex-1 bg-[#1e1e1e]/60 border border-white/5 rounded-2xl shadow-lg backdrop-blur-md p-6 overflow-y-auto custom-scrollbar">

                        {/* ═══ IDENTITY TAB ═══ */}
                        {activeTab === "IDENTITY" && (
                            <div className="space-y-6 max-w-2xl">
                                <h2 className="text-lg font-black tracking-widest text-indigo-400 uppercase">Identity</h2>

                                {/* NPC Toggle */}
                                <div className="flex items-center justify-between bg-black/40 p-4 rounded-xl border border-white/5">
                                    <div>
                                        <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Character Type</span>
                                        <p className="text-[10px] text-gray-500 mt-0.5">NPCs/Archetypes are templates used by the game engine, not playable characters.</p>
                                    </div>
                                    <button
                                        onClick={() => setIsNPC(!isNPC)}
                                        className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-lg border transition-all ${isNPC
                                            ? "bg-red-500/20 border-red-500/50 text-red-400"
                                            : "bg-indigo-500/20 border-indigo-500/50 text-indigo-400"
                                            }`}
                                    >
                                        {isNPC ? "NPC / Archetype" : "Player Character"}
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Name</label>
                                        <input value={name} onChange={e => setName(e.target.value)} placeholder="Enter name..." className="w-full bg-black/50 border border-white/10 text-white px-4 py-2.5 rounded-lg text-sm outline-none focus:border-indigo-500/50 transition-all" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Age</label>
                                            <input type="number" value={age} onChange={e => setAge(Math.max(18, parseInt(e.target.value) || 18))} min={18} className="w-full bg-black/50 border border-white/10 text-white px-4 py-2.5 rounded-lg text-sm outline-none focus:border-indigo-500/50 transition-all" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Level</label>
                                                <input type="number" value={level} onChange={e => updateLevel(Math.max(1, parseInt(e.target.value) || 1), true)} min={1} className="w-full bg-black/50 border border-white/10 text-white px-4 py-2.5 rounded-lg text-sm outline-none focus:border-indigo-500/50 transition-all" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Gender</label>
                                                <select value={gender} onChange={e => setGender(e.target.value)} className="w-full bg-black/50 border border-white/10 text-white px-4 py-2.5 rounded-lg text-sm outline-none focus:border-indigo-500/50 transition-all">
                                                    <option>Male</option>
                                                    <option>Female</option>
                                                    <option>Non-Binary</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>



                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Brief Backstory</label>
                                    <textarea value={backstory} onChange={e => setBackstory(e.target.value)} placeholder="Ex: 'I was a neurosurgeon in 20th century London'..." rows={2} className="w-full bg-black/50 border border-white/10 text-white px-4 py-2.5 rounded-lg text-sm outline-none focus:border-indigo-500/50 transition-all resize-none" />
                                </div>
                            </div>
                        )}

                        {/* ═══ LORE TAB ═══ */}
                        {activeTab === "LORE" && (
                            <div className="flex flex-col h-full relative font-mono overflow-hidden py-2 px-2 gap-4 animate-ash-settling">
                                <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar pt-2 pb-6 max-w-6xl mx-auto w-full">

                                    {!history ? (
                                        /* PHASE 1: DRAFTING & ERA SELECTION */
                                        <div className="bg-[#1a1a1a]/80 border border-orange-950/30 p-8 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] backdrop-blur-xl relative overflow-hidden">
                                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-orange-500/40 to-transparent" />

                                            <div className="flex items-center justify-between mb-8">
                                                <div className="space-y-1">
                                                    <h3 className="text-[12px] font-black text-white uppercase tracking-[0.4em] flex items-center gap-3">
                                                        <div className="w-2 h-2 bg-orange-500 shadow-[0_0_10px_#f97316]" />
                                                        LORE
                                                    </h3>
                                                    <p className="text-[8px] text-gray-500 font-bold uppercase tracking-widest italic">ASH-4: PRESENT DAY</p>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-[300px_1fr] gap-8">
                                                <div className="space-y-4">
                                                    <div className="p-5 bg-orange-500/[0.03] border border-orange-500/10 rounded-xl">
                                                        <div className="text-[8px] text-orange-500/70 font-black uppercase tracking-[0.2em] mb-3">DEBRIEFING</div>
                                                        <p className="text-[10px] text-gray-400 leading-relaxed italic font-medium">
                                                            {ASH_TRAIL_CHRONICLES.find(c => c.id === "ASH-4")?.event}
                                                        </p>
                                                    </div>
                                                    <div className="p-4 bg-black/40 border border-white/5 rounded-xl">
                                                        <div className="text-[8px] text-gray-500 font-black uppercase tracking-widest mb-2">Lore Chronology</div>
                                                        <div className="space-y-2 opacity-50">
                                                            {ASH_TRAIL_CHRONICLES.slice(0, 4).map(era => (
                                                                <div key={era.id} className="text-[8px] hover:opacity-100 transition-opacity flex gap-1.5 items-baseline">
                                                                    <span className="text-orange-500/60 font-black shrink-0">{era.id}:</span>
                                                                    <span className="text-gray-500">{era.label.split(': ')[1]}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="space-y-6">
                                                    <div className="space-y-2">
                                                        <div className="text-[9px] font-black text-orange-500/50 uppercase tracking-[0.2em] px-2">Draft Input</div>
                                                        <textarea
                                                            value={backstory}
                                                            onChange={e => setBackstory(e.target.value)}
                                                            placeholder="Ex: 'I was a neurosurgeon in 20th century London' or 'I was a simple farmer in the Midwest'..."
                                                            className="w-full h-[240px] bg-black/60 border border-white/10 text-[12px] text-gray-200 px-6 py-5 rounded-2xl outline-none focus:border-orange-500/40 transition-all font-mono leading-loose shadow-inner placeholder:text-gray-800"
                                                        />
                                                    </div>

                                                    <div className="flex justify-end pt-2">
                                                        <button
                                                            onClick={() => {
                                                                setIsGeneratingStory(true);
                                                                setTimeout(() => {
                                                                    const currentName = name || "This unit";
                                                                    const soulContext = (backstory || "").toLowerCase();
                                                                    const occupation = selectedOccupation?.name || 'Wanderer';

                                                                    // Dynamic Story Component Pools
                                                                    const isScience = soulContext.includes("doctor") || soulContext.includes("surgeon") || soulContext.includes("hospital") || soulContext.includes("lab") || soulContext.includes("medical");
                                                                    const isRural = soulContext.includes("farmer") || soulContext.includes("farm") || soulContext.includes("nature") || soulContext.includes("midwest");
                                                                    const isUrban = soulContext.includes("london") || soulContext.includes("paris") || soulContext.includes("city") || soulContext.includes("street");

                                                                    const isHeroic = soulContext.includes("save") || soulContext.includes("help") || soulContext.includes("protect") || soulContext.includes("hero") || soulContext.includes("loyalty");
                                                                    const isVillainous = soulContext.includes("kill") || soulContext.includes("bastard") || soulContext.includes("ruthless") || soulContext.includes("experiment") || soulContext.includes("betray");

                                                                    // Segment 1: The Old World Origin
                                                                    let p1 = `Before the heavens suffocated under a permanent blanket of soot, ${currentName} was defined by a different life. `;
                                                                    if (isScience) p1 += `In the sanitized, ultra-sterile halls of the world's leading medical facilities, they navigated complex biological architectures, dedicating their days to the precision of the scalpel and the hope of recovery.`;
                                                                    else if (isRural) p1 += `Existing in the quiet rhythms of the countryside, they lived through the last golden harvests, watching the horizons for seasons that would eventually cease to arrive.`;
                                                                    else if (isUrban) p1 += `They were a permanent fixture of a bustling metropolis, navigating streets of glass and steel during the final, shimmering years of a civilization that believed its progress was infinite.`;
                                                                    else p1 += `Built on the legacy of ${backstory || "a simple, long-forgotten life"}, they participated in the shimmering final years of the 20th century, before the sky darkened and the world dissolved.`;

                                                                    // Segment 2: The Fall
                                                                    let p2 = `The end did not arrive with a scream, but with the silent, creeping advance of the Great Fog. `;
                                                                    if (isVillainous) p2 += `While others succumbed to panic, ${currentName} recognized the coming chaos as a laboratory for their own ambitions. They survived the Resource Wars by discarding the moral weights that held others back, learning the cold math of survival where the life of another was merely a variable to be managed.`;
                                                                    else if (isHeroic) p2 += `As the Atmosphere turned toxic and the world ignited in the Resource Wars, ${currentName} stood as a flicker of light in the growing dark, exhaustion their only constant companion as they fought to save those who could not save themselves.`;
                                                                    else p2 += `${currentName} witnessed the terrifying transition as the horizon vanished and the sun became a pale, dying ember. They navigated the frantic desperation of the era, where the last vestiges of sovereignty were traded for drops of fuel.`;

                                                                    // Segment 3: The Vault Years
                                                                    let p3 = `When the surface finally became uninhabitable, the migration into the deep began. `;
                                                                    if (isVillainous) p3 += `${currentName} spent the long years of the Great Dark in the shadows of the lead-lined vaults, conducting clandestine operations and consolidating power while the rest of humanity shivered in fear.`;
                                                                    else if (isHeroic) p3 += `Within the claustrophobic silence of the underground vaults, ${currentName} became a cornerstone of their community, maintaining the fragile threads of order and hope while the Ash-storms reshaped the continents above.`;
                                                                    else p3 += `${currentName} lived through the agonizing silence of the underground vaults, surviving for years behind reinforced structural shells as the world they remembered slowly turned to dust.`;

                                                                    // Segment 4: The Re-Emergence
                                                                    let p4 = `Emerging from the vaults, ${currentName} found a planet that no longer recognized its masters. `;
                                                                    p4 += `They became a scavenger of the wastes, reclaiming artifacts of the past to build the foundations of a new, fractured society, proving to be a vital component in the machinery of reclamation.`;

                                                                    // Segment 5: The Present Day
                                                                    const p5 = `Today, as a specialized ${occupation}, ${currentName} has finally stabilized their position within the rising City-States. Their life is no longer about remembering the blue skies of the Old World, but about mastering the gray horizons of the Ash-Trail. Each step is a testament to a spirit for whom the Ash has finally become home.`;

                                                                    const fullHistory = `${p1}\n\n${p2}\n\n${p3}\n\n${p4}\n\n${p5}`;
                                                                    setHistory(fullHistory);

                                                                    // Refined Moral Sentiment Analysis
                                                                    const h = fullHistory.toLowerCase();
                                                                    const s = soulContext;

                                                                    // 1. Scoring System
                                                                    let moralScore = 0; // Negative = Evil, Positive = Good
                                                                    let orderScore = 0; // Negative = Chaotic, Positive = Lawful

                                                                    // GOOD signals (+pts)
                                                                    if (isHeroic) moralScore += 3;
                                                                    if (h.includes("flicker of light") || h.includes("cornerstone")) moralScore += 2;
                                                                    if (s.includes("doctor") || s.includes("help") || s.includes("save") || s.includes("protect") || s.includes("hero")) moralScore += 1;

                                                                    // EVIL signals (-pts)
                                                                    if (isVillainous) moralScore -= 3;
                                                                    if (h.includes("discarding the moral weights") || h.includes("clandestine")) moralScore -= 2;
                                                                    if (s.includes("kill") || s.includes("bastard") || s.includes("murder") || s.includes("betray") || s.includes("ruthless")) moralScore -= 1;

                                                                    // LAWFUL signals (+pts)
                                                                    if (s.includes("law") || s.includes("order") || s.includes("officer") || s.includes("solid") || s.includes("regiment") || s.includes("security")) orderScore += 3;
                                                                    if (h.includes("maintaining the fragile threads of order")) orderScore += 2;

                                                                    // CHAOTIC signals (-pts)
                                                                    if (s.includes("chaos") || s.includes("thief") || s.includes("rogue") || s.includes("freedom") || s.includes("anarchy") || s.includes("radical")) orderScore -= 3;
                                                                    if (h.includes("recognized the coming chaos as an opportunity")) orderScore -= 2;

                                                                    // MUNDANE/NEUTRAL signals (Resets scores toward 0)
                                                                    const isMundane = s.includes("student") || s.includes("average") || s.includes("normal") || s.includes("nothing special") || s.includes("random") || s.includes("simple") || s.includes("worker") || s.includes("faculty") || s.includes("faculty member");
                                                                    if (isMundane) {
                                                                        moralScore = moralScore > 0 ? Math.max(0, moralScore - 2) : Math.min(0, moralScore + 2);
                                                                        orderScore = orderScore > 0 ? Math.max(0, orderScore - 2) : Math.min(0, orderScore + 2);
                                                                    }

                                                                    // 2. Alignment Logic based on scores
                                                                    let finalAlign = "True Neutral";
                                                                    if (moralScore >= 3 && orderScore >= 3) finalAlign = "Lawful Good";
                                                                    else if (moralScore >= 3 && orderScore <= -3) finalAlign = "Chaotic Good";
                                                                    else if (moralScore >= 3) finalAlign = "Neutral Good";
                                                                    else if (moralScore <= -3 && orderScore >= 3) finalAlign = "Lawful Evil";
                                                                    else if (moralScore <= -3 && orderScore <= -3) finalAlign = "Chaotic Evil";
                                                                    else if (moralScore <= -3) finalAlign = "Neutral Evil";
                                                                    else if (orderScore >= 3) finalAlign = "Lawful Neutral";
                                                                    else if (orderScore <= -3) finalAlign = "Chaotic Neutral";
                                                                    else finalAlign = "True Neutral";

                                                                    setAlignment(finalAlign);

                                                                    setIsGeneratingStory(false);
                                                                }, 1200);
                                                            }}
                                                            disabled={!backstory || isGeneratingStory}
                                                            className={`group relative px-12 py-4 ${isGeneratingStory ? 'bg-orange-950/40' : 'bg-orange-600 hover:bg-orange-500'} text-white text-[11px] font-black uppercase tracking-[0.3em] rounded-xl transition-all shadow-[0_10px_30px_rgba(234,88,12,0.3)] disabled:opacity-50 flex items-center gap-3 overflow-hidden`}
                                                        >
                                                            {isGeneratingStory ? (
                                                                <>
                                                                    <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                                                    SYNCHRONIZING NEURAL LOG...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                                                                    GENERATE YOUR LORE
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        /* PHASE 2: FINALIZED VIEW */
                                        <div className="grid grid-cols-[1fr_320px] gap-6 items-start">
                                            {/* Integrated History (Large Container) */}
                                            <div className="bg-black/40 border border-white/5 p-8 rounded-2xl shadow-2xl relative group min-h-[600px] flex flex-col">
                                                <div className="flex items-center justify-between mb-6">
                                                    <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] flex items-center gap-3">
                                                        <div className="w-1.5 h-1.5 bg-indigo-500 shadow-[0_0_10px_#6366f1]" />
                                                        SYNCHRONIZED HISTORY
                                                    </h3>
                                                    <button onClick={() => setHistory("")} className="text-[8px] text-orange-500 hover:text-red-500 font-black uppercase tracking-widest transition-colors flex items-center gap-1.5 opacity-0 group-hover:opacity-100 italic">
                                                        <div className="w-1 h-1 bg-current rounded-full" />
                                                        RE-GENERATE FROM DRAFT ✕
                                                    </button>
                                                </div>
                                                <textarea
                                                    value={history}
                                                    onChange={e => setHistory(e.target.value)}
                                                    className="flex-1 bg-transparent border-none text-[13px] text-gray-300 font-mono leading-relaxed outline-none resize-none custom-scrollbar p-0"
                                                />
                                            </div>

                                            {/* Sidebar: Current & Alignment */}
                                            <div className="space-y-6">
                                                {/* Alignment - Dedicated Interactable Box */}
                                                <div className="bg-[#111] border border-orange-500/20 p-6 rounded-2xl shadow-xl group">
                                                    <div className="text-[8px] text-orange-500/60 font-black uppercase tracking-[0.3em] mb-4 text-center">ALIGNMENT</div>
                                                    <div className="relative">
                                                        <select
                                                            value={alignment}
                                                            onChange={e => setAlignment(e.target.value)}
                                                            className="w-full bg-black/60 border border-white/5 text-[12px] text-white font-black p-4 rounded-xl outline-none cursor-pointer hover:border-orange-500/40 transition-all text-center appearance-none shadow-inner"
                                                        >
                                                            {["Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "True Neutral", "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil"].map(a => (
                                                                <option key={a} value={a} className="bg-[#111]">{a}</option>
                                                            ))}
                                                        </select>
                                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-20">▼</div>
                                                    </div>
                                                </div>

                                                {/* Current Activities - Compact Box */}
                                                <div className="bg-[#111] border border-teal-500/10 p-6 rounded-2xl flex flex-col gap-4">
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-[9px] font-black text-teal-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                                            <div className="w-1 h-1 bg-teal-500 rounded-full animate-pulse" />
                                                            ACTIVITIES
                                                        </h3>
                                                    </div>
                                                    <textarea
                                                        value={currentStory}
                                                        onChange={e => setCurrentStory(e.target.value)}
                                                        placeholder="What is happening now..."
                                                        className="w-full h-[120px] bg-transparent border-none text-[10px] text-teal-100/40 font-mono leading-relaxed outline-none resize-none custom-scrollbar p-0 italic"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                </div>
                            </div>
                        )}

                        {/* ═══ TRAITS TAB ═══ */}
                        {activeTab === "TRAITS" && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h2 className="text-lg font-black tracking-widest text-indigo-400 uppercase">Traits</h2>
                                    <div className="flex items-center gap-4">
                                        <span className="text-xs font-mono text-gray-400">Points: <span className={traitPoints >= 0 ? "text-green-400" : "text-red-400"}>{traitPoints}</span></span>
                                        <input value={traitSearch} onChange={e => setTraitSearch(e.target.value)} placeholder="Search..." className="bg-black/50 border border-white/10 text-white px-3 py-1.5 rounded-lg text-xs outline-none w-48" />
                                    </div>
                                </div>

                                {/* Selected Traits */}
                                {selectedTraits.length > 0 && (
                                    <div className="space-y-2">
                                        <h3 className="text-[10px] font-black text-indigo-500/70 uppercase tracking-widest">Selected ({selectedTraits.length})</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedTraits.map(t => (
                                                <button key={t.id} onClick={() => toggleTrait(t)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all hover:opacity-70 ${t.type === "positive" ? "bg-blue-500/20 border-blue-500/30 text-blue-400" : t.type === "negative" ? "bg-red-500/20 border-red-500/30 text-red-400" : "bg-gray-500/20 border-gray-500/30 text-gray-400"}`}>
                                                    {t.name} ✕
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Available Traits by type */}
                                {(["positive", "negative", "neutral"] as const).map(type => {
                                    const list = filteredTraits[type];
                                    if (list.length === 0) return null;
                                    return (
                                        <div key={type} className="space-y-2">
                                            <h3 className={`text-[10px] font-black uppercase tracking-widest border-b pb-1 ${type === "positive" ? "text-blue-400 border-blue-900/30" : type === "negative" ? "text-red-400 border-red-900/30" : "text-gray-400 border-gray-800"}`}>
                                                {type} ({list.length})
                                            </h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                                {list.map(t => (
                                                    <button key={t.id} onClick={() => toggleTrait(t)} className="w-full text-left p-3 bg-black/40 border border-white/5 rounded-lg hover:border-white/20 transition-all">
                                                        <div className="flex justify-between items-center">
                                                            <span className={`text-[11px] font-bold uppercase ${type === "positive" ? "text-blue-400" : type === "negative" ? "text-red-400" : "text-gray-400"}`}>{t.name}</span>
                                                            <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-gray-300 font-mono">{t.cost}</span>
                                                        </div>
                                                        <p className="text-[10px] text-gray-500 line-clamp-2 mt-1">{t.description}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* ═══ STATS TAB ═══ */}
                        {activeTab === "STATS" && (
                            <div className="space-y-6 max-w-xl">
                                <div className="flex justify-between items-center">
                                    <h2 className="text-lg font-black tracking-widest text-indigo-400 uppercase">Stats</h2>
                                    <span className="text-xs font-mono text-gray-400">Points: <span className={statsPoints >= 0 ? "text-green-400" : "text-red-400"}>{statsPoints}</span></span>
                                </div>
                                <div className="space-y-3">
                                    {(Object.keys(stats) as (keyof Stats)[]).map(stat => (
                                        <div key={stat} className="flex items-center justify-between bg-black/40 p-4 rounded-xl border border-white/5">
                                            <span className="text-sm font-bold uppercase tracking-widest text-gray-300 w-32">{stat}</span>
                                            <div className="flex items-center gap-4">
                                                <button onClick={() => adjustStat(stat, -1)} className="w-8 h-8 bg-white/5 border border-white/10 rounded text-gray-400 hover:bg-white/10 transition-all font-bold">−</button>
                                                <span className="text-xl font-mono font-bold text-indigo-400 w-8 text-center">{stats[stat]}</span>
                                                <button onClick={() => adjustStat(stat, 1)} className="w-8 h-8 bg-white/5 border border-white/10 rounded text-gray-400 hover:bg-white/10 transition-all font-bold">+</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ═══ OCCUPATION TAB ═══ */}
                        {activeTab === "OCCUPATION" && (
                            <div className="space-y-4">
                                <h2 className="text-lg font-black tracking-widest text-indigo-400 uppercase">Occupation</h2>
                                <div className="flex gap-2 flex-wrap">
                                    {(["ALL", "SECURITY", "TECHNICAL", "CRAFT", "ADMIN", "SOCIAL", "FIELD"] as const).map(cat => (
                                        <button key={cat} onClick={() => setOccCategory(cat)} className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg border transition-all ${occCategory === cat ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-400" : "bg-black/40 border-white/10 text-gray-500 hover:text-white"}`}>
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {filteredOccupations.map(o => (
                                        <button key={o.id} onClick={() => setSelectedOccupation(o)} className={`w-full text-left p-4 border rounded-xl flex flex-col gap-2 transition-all ${selectedOccupation?.id === o.id ? "bg-indigo-500/20 border-indigo-500" : "bg-black/40 border-white/5 hover:border-white/20"}`}>
                                            <div className="flex justify-between items-center">
                                                <span className="text-sm font-bold uppercase text-indigo-400">{o.name}</span>
                                                <span className="text-[8px] bg-white/10 px-1.5 py-0.5 rounded uppercase text-gray-400">{o.category}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 line-clamp-2">{o.description}</p>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {o.perks.map((p, i) => (
                                                    <span key={i} className="text-[9px] bg-teal-500/10 text-teal-400 px-1.5 py-0.5 rounded border border-teal-500/20">{p}</span>
                                                ))}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ═══ SKILLS TAB (SKILL BOOK) ═══ */}
                        {activeTab === "SKILLS" && (
                            <div className="flex h-full relative font-mono overflow-hidden py-1 px-1 gap-6 animate-ash-settling">
                                {/* Left Sidebar: Skill Database */}
                                <aside className="w-[320px] flex flex-col gap-4 shrink-0 bg-black/40 border border-white/5 p-4 rounded-xl shadow-2xl backdrop-blur-md">
                                    <div className="flex flex-col gap-1.5 border-b border-white/5 pb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-3 bg-[#c2410c]" />
                                            <label className="text-[10px] text-white font-black uppercase tracking-[0.2em]">Database</label>
                                        </div>
                                        <input
                                            value={skillSearch}
                                            onChange={e => setSkillSearch(e.target.value)}
                                            placeholder="SEARCH PROTOCOLS..."
                                            className="w-full bg-black/40 border border-white/10 text-[10px] text-gray-400 px-3 py-2 rounded outline-none focus:border-[#c2410c]/40 transition-all font-mono italic"
                                        />
                                    </div>

                                    <div className="flex flex-wrap gap-1 mb-2">
                                        {(["ALL", "BASE", "OCCUPATION", "EQUIPMENT", "UNIQUE"] as const).map(f => (
                                            <button
                                                key={f}
                                                onClick={() => setSkillCategoryFilter(f as any)}
                                                className={`px-2 py-1 text-[8px] font-black uppercase tracking-widest transition-all border ${skillCategoryFilter === f ? "bg-[#c2410c]/20 border-[#c2410c] text-white" : "border-white/5 text-gray-600 hover:text-gray-300 hover:bg-white/5"}`}
                                            >
                                                {f}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                                        {librarySkills
                                            .filter(s => (skillCategoryFilter === "ALL" || s.category === skillCategoryFilter.toLowerCase()) &&
                                                (s.name.toLowerCase().includes(skillSearch.toLowerCase()) || s.description.toLowerCase().includes(skillSearch.toLowerCase())))
                                            .map(skill => {
                                                const isOwned = selectedSkills.some(s => s.id === skill.id);
                                                return (
                                                    <button
                                                        key={skill.id}
                                                        onClick={() => toggleSkill(skill)}
                                                        className={`w-full text-left p-3 border rounded-lg flex items-center gap-3 group transition-all relative overflow-hidden active:scale-95 ${isOwned ? "bg-[#c2410c]/10 border-[#c2410c]/40" : "bg-black/20 border-white/5 hover:border-[#c2410c]/40 hover:bg-white/[0.02]"}`}
                                                    >
                                                        <div className={`w-10 h-10 border rounded flex items-center justify-center text-lg relative z-10 ${isOwned ? "border-[#c2410c]/40 bg-[#c2410c]/20" : "bg-black/40 border-white/10"}`}>
                                                            <span>{skill.icon || "🧠"}</span>
                                                        </div>
                                                        <div className="flex flex-col gap-0.5 relative z-10 truncate">
                                                            <span className={`text-[10px] font-black uppercase tracking-wider truncate ${isOwned ? "text-orange-400" : "text-white"}`}>{skill.name}</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[8px] text-gray-500 font-bold uppercase">{skill.category}</span>
                                                                <span className="text-[8px] text-[#c2410c]/80 font-black ml-auto">{skill.apCost} AP</span>
                                                            </div>
                                                        </div>
                                                        {isOwned && <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#c2410c] rounded-full shadow-[0_0_5px_#c2410c]" />}
                                                    </button>
                                                );
                                            })}
                                    </div>
                                </aside>

                                {/* Center: Skill Book */}
                                <div className="flex-1 flex gap-2 overflow-hidden relative pr-12">
                                    <div className="flex-1 bg-black/60 border-y border-l border-white/10 rounded-l-3xl shadow-2xl relative overflow-hidden flex flex-col group">
                                        {/* Book Binding/Spine */}
                                        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-black/80 to-transparent border-r border-white/5 z-20" />

                                        {/* Parchment Page Overlay */}
                                        <div className="absolute inset-0 bg-[#1a1410] mix-blend-multiply opacity-40 z-0 pointer-events-none" />
                                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(194,65,12,0.05)_0%,transparent_70%)] z-0 pointer-events-none" />

                                        <div className="relative z-10 flex flex-col h-full pl-12 pr-6 py-8">
                                            <div className="flex items-center justify-between border-b border-[#c2410c]/20 pb-4 mb-8">
                                                <h3 className="text-sm font-black text-white uppercase tracking-[0.4em] flex items-center gap-3">
                                                    <div className="w-2 h-2 bg-[#c2410c] shadow-[0_0_10px_#c2410c]" />
                                                    Skill book
                                                </h3>
                                                <div className="flex items-center gap-4">
                                                    <div className="flex flex-col items-end">
                                                        <span className="text-[7px] text-gray-600 font-black uppercase">Buffer Page</span>
                                                        <span className="text-[10px] text-white font-mono">{selectedSkills.filter(s => s.category === bookCategory).length > 0 ? "01" : "00"}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pb-8">
                                                {selectedSkills.filter(s => s.category === bookCategory).length === 0 ? (
                                                    <div className="flex-1 flex flex-col items-center justify-center py-20 opacity-20 group-hover:opacity-30 transition-opacity">
                                                        <div className="text-4xl mb-6 grayscale brightness-50">📂</div>
                                                        <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.34em] italic text-center">no active skill</p>
                                                        <p className="text-[8px] text-[#c2410c] mt-4 uppercase tracking-[0.2em] font-bold">Inject from Database sidebar</p>
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-8 gap-y-10">
                                                        {selectedSkills.filter(s => s.category === bookCategory).map(skill => (
                                                            <div key={skill.id} className="relative group/skill">
                                                                <div className="flex gap-4">
                                                                    <div className="relative shrink-0">
                                                                        <div className="w-16 h-16 bg-black/40 border border-[#c2410c]/30 rounded flex items-center justify-center text-3xl group-hover/skill:scale-105 group-hover/skill:border-[#c2410c] transition-all relative z-10 shadow-lg">
                                                                            {skill.icon || "🧠"}
                                                                        </div>
                                                                        {/* Holographic ornament under icon */}
                                                                        <div className="absolute -inset-1 border border-[#c2410c]/10 rounded opacity-0 group-hover/skill:opacity-100 transition-opacity pointer-events-none" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center justify-between mb-1.5">
                                                                            <h4 className="text-[14px] font-black text-white uppercase tracking-wider truncate leading-tight">{skill.name}</h4>
                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); toggleSkill(skill); }}
                                                                                className="text-[9px] text-[#c2410c]/40 hover:text-red-500 font-black px-1 transition-colors uppercase italic"
                                                                            >Eject ✕</button>
                                                                        </div>
                                                                        <p className="text-[10.5px] text-gray-500 leading-relaxed italic line-clamp-2 mb-3 h-[32px]">{skill.description}</p>

                                                                        <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-2.5">
                                                                            <div className="flex flex-col">
                                                                                <span className="text-[6.5px] text-gray-600 font-black uppercase tracking-widest">AP Cost</span>
                                                                                <span className="text-[9px] text-orange-400 font-bold">{skill.apCost} Units</span>
                                                                            </div>
                                                                            <div className="flex flex-col">
                                                                                <span className="text-[6.5px] text-gray-600 font-black uppercase tracking-widest">Range</span>
                                                                                <span className="text-[9px] text-gray-400 font-bold">{skill.minRange}-{skill.maxRange}m</span>
                                                                            </div>
                                                                            <div className="flex flex-col">
                                                                                <span className="text-[6.5px] text-gray-600 font-black uppercase tracking-widest">CD</span>
                                                                                <span className="text-[9px] text-gray-400 font-bold">{skill.cooldown} T</span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="absolute -bottom-4 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#c2410c]/10 to-transparent" />
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Digital Page Number */}
                                            <div className="mt-auto pt-6 flex justify-between items-center border-t border-white/5 opacity-40">
                                                <span className="text-[8px] font-black uppercase tracking-[0.2em] text-gray-600"></span>
                                                <span className="text-[10px] font-bold text-white tracking-widest">P. 1 // {bookCategory.toUpperCase()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Book Side Tabs - WoW Style */}
                                    <div className="absolute -right-2 top-10 flex flex-col gap-2 z-30">
                                        {(["base", "occupation", "equipment", "unique"] as const).map((cat) => {
                                            const isActive = bookCategory === cat;
                                            const icons = { base: "📜", occupation: "⚔️", equipment: "🛠️", unique: "💎" };
                                            return (
                                                <button
                                                    key={cat}
                                                    onClick={() => setBookCategory(cat)}
                                                    className={`group relative flex items-center justify-center w-12 h-16 rounded-r-xl border-y border-r transition-all duration-300 ${isActive
                                                        ? "bg-[#1a1410] border-[#c2410c] w-14 -translate-x-1 shadow-[-10px_0_20px_rgba(194,65,12,0.2)] z-10"
                                                        : "bg-black/60 border-white/10 hover:bg-[#c2410c]/10 hover:border-[#c2410c]/30 hover:w-13 z-0"}`}
                                                >
                                                    <span className={`text-xl transition-transform group-hover:scale-110 ${isActive ? "opacity-100" : "opacity-40"}`}>
                                                        {icons[cat]}
                                                    </span>
                                                    <div className="absolute right-full mr-4 px-3 py-2 bg-black border border-[#c2410c]/40 text-[9px] font-black text-white uppercase tracking-widest whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-2xl z-50">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-1 h-3 bg-[#c2410c]" />
                                                            {cat.toUpperCase()}
                                                        </div>
                                                    </div>
                                                    {isActive && <div className="absolute left-0 top-1 bottom-1 w-1 bg-[#c2410c] rounded-full shadow-[0_0_10px_#c2410c]" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ═══ EQUIPEMENT TAB ═══ */}
                        {activeTab === "EQUIPEMENT" && (
                            <div className="flex flex-col h-full relative font-mono overflow-hidden py-2 px-2 gap-4 animate-ash-settling" onClick={() => setContextMenu(null)}>
                                <div className="flex-1 flex items-start justify-center overflow-y-auto custom-scrollbar pt-2 pb-6">
                                    <div className="w-full max-w-[1320px] flex items-start justify-center gap-6">

                                        {/* Equipable Items Sidebar */}
                                        <div className="w-[220px] h-[540px] shrink-0 flex flex-col bg-black/40 border border-white/5 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden">
                                            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                                                <div className="w-1.5 h-1.5 bg-teal-500 shadow-[0_0_6px_rgba(20,184,166,0.4)]" />
                                                <span className="text-[10px] text-white font-black uppercase tracking-[0.15em]">EQUIPABLE</span>
                                                <span className="ml-auto text-[8px] text-gray-600 font-bold">{equipableInventoryItems.length}</span>
                                            </div>

                                            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                                                {equipableInventoryItems.length === 0 ? (
                                                    <div className="flex items-center justify-center h-full">
                                                        <p className="text-[8px] text-gray-700 font-bold uppercase tracking-widest italic text-center px-4">No equipable items in inventory</p>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {EQUIPMENT_SLOT_ORDER.map(slot => {
                                                            const itemsForSlot = equipableItemsBySlot[slot];
                                                            if (itemsForSlot.length === 0) return null;

                                                            return (
                                                                <div key={slot} className="space-y-1">
                                                                    <div className="text-[7px] font-black text-teal-500/70 uppercase tracking-[0.2em] px-1 flex items-center gap-1.5">
                                                                        <div className="w-0.5 h-0.5 bg-teal-500/40" />
                                                                        {EQUIPMENT_SLOT_LABELS[slot]}
                                                                    </div>
                                                                    {itemsForSlot.map(item => (
                                                                        <button
                                                                            key={`${slot}-${item.id}`}
                                                                            onClick={() => equipFromInventory(item)}
                                                                            className="w-full text-left px-2 py-1.5 bg-black/30 border border-white/5 rounded flex items-center gap-2 group hover:border-teal-500/40 hover:bg-teal-500/5 transition-all"
                                                                        >
                                                                            <div className={`w-7 h-7 border flex items-center justify-center text-xs shrink-0 rarity-${item.rarity}`}>
                                                                                {item.icon || "📦"}
                                                                            </div>
                                                                            <div className="flex flex-col min-w-0 flex-1">
                                                                                <span className="text-[8px] text-white font-black uppercase tracking-wider truncate">{item.name}</span>
                                                                                <div className="flex items-center gap-1">
                                                                                    <span className="text-[6px] text-gray-600 font-bold uppercase">{EQUIPMENT_SLOT_LABELS[slot]}</span>
                                                                                    <span className="text-[6px] text-[#c2410c] font-bold">{item.rarity}</span>
                                                                                </div>
                                                                            </div>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            );
                                                        })}
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Character Block */}
                                        <div className="flex items-start gap-2">

                                            {/* Left Slots Column */}
                                            <div className="flex flex-col gap-3 shrink-0 pt-8">
                                                {[
                                                    { id: "head", label: "Head" },
                                                    { id: "chest", label: "Chest" },
                                                    { id: "gloves", label: "Gloves" },
                                                ].map(slot => {
                                                    const equipped = equippedItems[slot.id];
                                                    return (
                                                        <div key={slot.id} className="flex items-center gap-3 group">
                                                            <div
                                                                onClick={() => equipped && unequipItem(slot.id as EquipSlot)}
                                                                className={`w-14 h-14 bg-black/60 border transition-all flex items-center justify-center relative cursor-pointer shadow-lg overflow-hidden ${equipped ? `rarity-${equipped.rarity} border-2` : 'border-white/10 hover:border-[#c2410c]/50'
                                                                    }`}
                                                            >
                                                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0)_20%,rgba(0,0,0,0.4)_100%)] pointer-events-none" />
                                                                <div className="absolute top-0.5 left-0.5 w-0.5 h-0.5 bg-white/10" />
                                                                <div className="absolute bottom-0.5 right-0.5 w-0.5 h-0.5 bg-white/10" />

                                                                {equipped ? (
                                                                    <>
                                                                        {equipped.rarity === 'ashmarked' && <div className="absolute inset-0 ashmarked-permanent-ripple z-0 opacity-40" />}
                                                                        <span className="text-xl z-10 drop-shadow-md">{equipped.icon || "📦"}</span>
                                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-red-500/20 transition-colors flex items-center justify-center">
                                                                            <span className="text-[8px] text-white opacity-0 group-hover:opacity-100 font-black uppercase">Unequip</span>
                                                                        </div>
                                                                    </>
                                                                ) : (
                                                                    <div className="flex flex-col items-center justify-center gap-1 group-hover:scale-110 transition-transform">
                                                                        <span className="text-[10px] text-gray-800 font-black uppercase pointer-events-none">{slot.id.substring(0, 3)}</span>
                                                                        <div className="w-1.5 h-1.5 border border-white/10 rounded-full group-hover:border-orange-500/50 group-hover:animate-pulse transition-colors" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="w-14 flex flex-col group">
                                                                <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest transition-colors group-hover:text-gray-400">{equipped ? equipped.name : slot.label}</span>
                                                                {equipped && <span className="text-[7px] text-[#c2410c] font-bold uppercase truncate">{equipped.rarity}</span>}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Center: Character Preview & Weapons */}
                                            <div className="flex flex-col items-center gap-6 shrink-0">
                                                <div className="w-[240px] h-[420px] bg-black/20 border border-white/5 rounded-[40px] relative shadow-2xl flex items-center justify-center overflow-hidden">
                                                    {/* Gritty Grid Overlay */}
                                                    <div className="absolute inset-0 bg-[linear-gradient(rgba(194,65,12,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(194,65,12,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none opacity-40" />
                                                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#c2410c]/10 to-transparent pointer-events-none" />

                                                    {/* Background Emblem */}
                                                    <div className="absolute w-[80%] h-[80%] opacity-[0.03] flex items-center justify-center grayscale scale-125 rotate-6">
                                                        <svg viewBox="0 0 100 100" fill="currentColor"><path d="M50 0 L100 25 L100 75 L50 100 L0 75 L0 25 Z" /></svg>
                                                    </div>

                                                    {/* Silhouette */}
                                                    <div className="relative z-10 text-[120px] opacity-20 select-none grayscale animate-pulse">👤</div>

                                                    {/* Level & Name Overlay */}
                                                    <div className="absolute top-6 flex flex-col items-center">
                                                        <div className="text-[8px] text-orange-500/70 font-black tracking-[0.3em] uppercase">
                                                            {selectedOccupation?.name || "SOLDAT"} | LVL {level}
                                                        </div>
                                                        <div className="text-[10px] text-white font-black tracking-[0.2em] mt-1 uppercase text-center px-4">{name || "UNNAMED"}</div>
                                                        <div className="w-8 h-0.5 bg-[#c2410c] mt-2 shadow-[0_0_8px_rgba(194,65,12,0.4)]" />
                                                    </div>

                                                    {/* Scanlines effect */}
                                                    <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%)] bg-[size:100%_2px] z-20 opacity-5" />
                                                </div>

                                                {/* Bottom Slots (Weapons) */}
                                                <div className="flex items-start gap-6">
                                                    {[
                                                        { id: "mainHand", label: "Main Hand" },
                                                        { id: "offHand", label: "Off Hand" },
                                                    ].map(slot => {
                                                        const equipped = equippedItems[slot.id];
                                                        return (
                                                            <div key={slot.id} className="flex flex-col items-center gap-2">
                                                                <div
                                                                    onClick={() => equipped && unequipItem(slot.id as EquipSlot)}
                                                                    className={`w-16 h-16 bg-black/60 border transition-all flex items-center justify-center relative cursor-pointer shadow-lg overflow-hidden ${equipped ? `rarity-${equipped.rarity} border-2` : 'border-white/10 hover:border-[#c2410c]/50'
                                                                        }`}
                                                                >
                                                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0)_20%,rgba(0,0,0,0.4)_100%)] pointer-events-none" />
                                                                    {equipped ? (
                                                                        <>
                                                                            {equipped.rarity === 'ashmarked' && <div className="absolute inset-0 ashmarked-permanent-ripple z-0 opacity-40" />}
                                                                            <span className="text-2xl z-10 drop-shadow-md">{equipped.icon || "📦"}</span>
                                                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-red-500/20 transition-colors flex items-center justify-center">
                                                                                <span className="text-[8px] text-white opacity-0 group-hover:opacity-100 font-black">UNEQUIP</span>
                                                                            </div>
                                                                        </>
                                                                    ) : (
                                                                        <div className="flex flex-col items-center justify-center gap-1 group-hover:scale-110 transition-transform">
                                                                            <span className="text-[10px] text-gray-800 font-black uppercase pointer-events-none">WPN</span>
                                                                            <div className="w-1.5 h-1.5 border border-white/10 rounded-full group-hover:border-orange-500/50 group-hover:animate-pulse transition-colors" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <span className="text-[8px] text-gray-500 font-black uppercase tracking-widest text-center group-hover:text-gray-400 transition-colors">{equipped ? equipped.name : slot.label}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Right Slots Column */}
                                            <div className="flex flex-col gap-3 shrink-0 pt-8">
                                                <div className="flex flex-col gap-3">
                                                    {[
                                                        { id: "waist", label: "Waist" },
                                                        { id: "legs", label: "Legs" },
                                                        { id: "boots", label: "Boots" },
                                                    ].map(slot => {
                                                        const equipped = equippedItems[slot.id];
                                                        return (
                                                            <div key={slot.id} className="flex items-center gap-3 group">
                                                                <div className="w-14 flex flex-col text-right">
                                                                    <span className="text-[9px] text-gray-500 font-black uppercase tracking-widest">{equipped ? equipped.name : slot.label}</span>
                                                                    {equipped && <span className="text-[7px] text-[#c2410c] font-bold uppercase truncate">{equipped.rarity}</span>}
                                                                </div>
                                                                <div
                                                                    onClick={() => equipped && unequipItem(slot.id as EquipSlot)}
                                                                    className={`w-14 h-14 bg-black/60 border transition-all flex items-center justify-center relative cursor-pointer shadow-lg overflow-hidden ${equipped ? `rarity-${equipped.rarity} border-2` : 'border-white/10 hover:border-[#c2410c]/50'
                                                                        }`}
                                                                >
                                                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,0,0,0)_20%,rgba(0,0,0,0.4)_100%)] pointer-events-none" />
                                                                    <div className="absolute top-0.5 left-0.5 w-0.5 h-0.5 bg-white/10" />
                                                                    <div className="absolute bottom-0.5 right-0.5 w-0.5 h-0.5 bg-white/10" />

                                                                    {equipped ? (
                                                                        <>
                                                                            {equipped.rarity === 'ashmarked' && <div className="absolute inset-0 ashmarked-permanent-ripple z-0 opacity-40" />}
                                                                            <span className="text-xl z-10 drop-shadow-md">{equipped.icon || "📦"}</span>
                                                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-red-500/20 transition-colors flex items-center justify-center">
                                                                                <span className="text-[8px] text-white opacity-0 group-hover:opacity-100 font-black">UNEQUIP</span>
                                                                            </div>
                                                                        </>
                                                                    ) : (
                                                                        <div className="flex flex-col items-center justify-center gap-1 group-hover:scale-110 transition-transform">
                                                                            <span className="text-[10px] text-gray-800 font-black uppercase pointer-events-none">{slot.id.substring(0, 3)}</span>
                                                                            <div className="w-1.5 h-1.5 border border-white/10 rounded-full group-hover:border-orange-500/50 group-hover:animate-pulse transition-colors" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {/* Stats Panel Column */}
                                            <div className="w-[200px] h-[420px] bg-black/40 border border-[#c2410c]/20 p-4 rounded-xl shadow-2xl backdrop-blur-md relative overflow-hidden flex flex-col">
                                                <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-1.5 h-1.5 bg-[#c2410c] shadow-[0_0_8px_#c2410c]" />
                                                        <span className="text-[10px] text-white font-black uppercase tracking-[0.2em]">STATS</span>
                                                    </div>
                                                </div>

                                                <div className="flex-1 space-y-2.5 overflow-y-auto custom-scrollbar pr-1 min-h-0">
                                                    {/* CHARACTER SECTION */}
                                                    <div className="space-y-1">
                                                        <div className="text-[7px] font-black text-[#c2410c] uppercase tracking-[0.2em] mb-1 opacity-80 flex items-center gap-1.5">
                                                            <div className="w-0.5 h-0.5 bg-[#c2410c]/40" />
                                                            CHARACTER
                                                        </div>
                                                        {[
                                                            { label: "HP", value: derivedStats.hp },
                                                            { label: "AP", value: derivedStats.ap },
                                                            { label: "Armor", value: derivedStats.armor },
                                                            { label: "Crit", value: derivedStats.crit },
                                                            { label: "Resist", value: derivedStats.resist },
                                                            { label: "Social", value: derivedStats.social },
                                                        ].map(item => (
                                                            <div key={item.label} className="flex justify-between items-center group/row border-b border-white/[0.02] pb-0.5">
                                                                <span className="text-[8px] text-gray-500 font-black uppercase tracking-wider group-hover/row:text-orange-400 transition-colors">{item.label}</span>
                                                                <span className="text-[9px] text-white font-black font-mono tracking-widest">{item.value}</span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* COMBAT SECTION */}
                                                    <div className="space-y-1 pt-0.5">
                                                        <div className="text-[7px] font-black text-[#c2410c] uppercase tracking-[0.2em] mb-1 opacity-80 flex items-center gap-1.5">
                                                            <div className="w-0.5 h-0.5 bg-[#c2410c]/40" />
                                                            COMBAT
                                                        </div>
                                                        {[
                                                            { label: "Strength", value: effectiveStats.strength },
                                                            { label: "Min dmg", value: derivedStats.minDmg },
                                                            { label: "Max dmg", value: derivedStats.maxDmg },
                                                        ].map(item => (
                                                            <div key={item.label} className="flex justify-between items-center group/row border-b border-white/[0.02] pb-0.5">
                                                                <span className="text-[8px] text-gray-500 font-black uppercase tracking-wider group-hover/row:text-orange-400 transition-colors">{item.label}</span>
                                                                <span className="text-[9px] text-white font-black font-mono tracking-widest">{item.value}</span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* EQUIPMENT EFFECTS SECTION */}
                                                    <div className="space-y-1 pt-0.5">
                                                        <div className="text-[7px] font-black text-[#c2410c] uppercase tracking-[0.2em] mb-1 opacity-80 flex items-center gap-1.5">
                                                            <div className="w-0.5 h-0.5 bg-[#c2410c]/40" />
                                                            EQUIPMENT EFFECTS
                                                        </div>
                                                        <div className="bg-white/[0.02] px-2 py-2 rounded border border-white/5 flex items-center justify-center italic">
                                                            <span className="text-[7px] text-gray-600 font-bold uppercase tracking-[0.2em]">no set effect active</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            </div>
                        )}


                        {/* ═══ CHARACTER SHEET TAB ═══ */}
                        {false && activeTab === "CHARACTER_SHEET" &&
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-ash-settling">
                                {/* Column 1: Profile & Stats */}
                                <div className="space-y-6">
                                    <div className="bg-black/40 p-5 border border-white/5 rounded-xl shadow-xl flex gap-6 items-start">
                                        <div className="w-24 h-24 bg-black/60 border border-white/10 flex items-center justify-center text-3xl opacity-50 relative overflow-hidden group">
                                            👤
                                            <div className="absolute inset-0 bg-indigo-500/5 group-hover:bg-indigo-500/10 transition-colors" />
                                        </div>
                                        <div className="space-y-2 flex-1">
                                            <h3 className="text-xl font-black italic tracking-widest text-white uppercase">{name || "UNNAMED UNIT"}</h3>
                                            <div className="flex flex-wrap gap-2">
                                                <div className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/30 rounded text-[9px] font-bold text-indigo-400 uppercase tracking-widest">
                                                    {age} YEARS
                                                </div>
                                                <div className="px-2 py-0.5 bg-gray-500/10 border border-white/10 rounded text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                                                    {gender}
                                                </div>
                                                <div className="px-2 py-0.5 bg-red-500/10 border border-red-500/30 rounded text-[9px] font-bold text-red-400 uppercase tracking-widest">
                                                    HP: {derivedStats.hp}
                                                </div>
                                                {selectedOccupation && (
                                                    <div className="px-2 py-0.5 bg-[#c2410c]/10 border border-[#c2410c]/30 rounded text-[9px] font-bold text-[#c2410c] uppercase tracking-widest">
                                                        {selectedOccupation.name}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-black/40 p-5 border border-white/5 rounded-xl shadow-xl">
                                        <h4 className="text-[9px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 bg-indigo-500" />
                                            Neural Attributes (Effective)
                                        </h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            {(Object.entries(effectiveStats) as [keyof Stats, number][]).map(([stat, val]) => (
                                                <div key={stat} className="space-y-1.5">
                                                    <div className="flex justify-between text-[8px] uppercase tracking-widest text-gray-500 font-bold px-1">
                                                        <span>{stat}</span>
                                                        <span className="text-white">{val}</span>
                                                    </div>
                                                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                                        <div
                                                            className="h-full bg-indigo-500/60 shadow-[0_0_8px_rgba(99,102,241,0.3)]"
                                                            style={{ width: `${(val / 10) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Column 2: Traits & Inventory */}
                                <div className="space-y-6">
                                    <div className="bg-black/40 p-5 border border-white/5 rounded-xl shadow-xl">
                                        <h4 className="text-[9px] font-black text-[#c2410c] uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 bg-[#c2410c]" />
                                            Biological Data & Records
                                        </h4>
                                        <div className="space-y-4">
                                            {history ? (
                                                <p className="text-[10px] text-gray-400 italic leading-relaxed border-l-2 border-[#c2410c]/20 pl-4 py-1">
                                                    {history}
                                                </p>
                                            ) : (
                                                <div className="text-[9px] text-gray-600 italic py-2">No historical records available for this unit.</div>
                                            )}

                                            <div className="pt-2">
                                                <div className="text-[8px] text-gray-500 font-black uppercase tracking-widest mb-2">Neural Signatures</div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {selectedTraits.length > 0 ? selectedTraits.map(t => (
                                                        <div
                                                            key={t.id}
                                                            className={`px-2 py-0.5 border rounded text-[8px] font-bold uppercase tracking-wider ${t.type === "positive" ? "bg-blue-900/10 border-blue-500/30 text-blue-400" :
                                                                t.type === "negative" ? "bg-red-900/10 border-red-500/30 text-red-400" :
                                                                    "bg-gray-900/10 border-white/10 text-gray-400"
                                                                }`}
                                                        >
                                                            {t.name}
                                                        </div>
                                                    )) : (
                                                        <div className="text-[8px] text-gray-700 italic">No neural traits active.</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-black/40 p-5 border border-white/5 rounded-xl shadow-xl">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-[9px] font-black text-gray-500 uppercase tracking-[0.2em] flex items-center gap-2">
                                                <div className="w-1.5 h-1.5 bg-gray-500" />
                                                Equipment & Loadout
                                            </h4>
                                            <span className="text-[7px] text-gray-600 font-black uppercase tracking-widest">{inventory.length} items total</span>
                                        </div>

                                        <div className="space-y-4">
                                            {/* Equipped Summary */}
                                            <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2.5">
                                                <div className="text-[7px] text-gray-600 font-black uppercase tracking-[0.2em] mb-2 px-1">Active Loadout</div>
                                                <div className="grid grid-cols-4 gap-1.5">
                                                    {Object.entries(equippedItems).map(([slot, item]) => (
                                                        <div key={slot} className={`aspect-square border flex flex-col items-center justify-center gap-0.5 rounded ${item ? `bg-white/5 border-white/20` : 'bg-black/40 border-white/5 opacity-30'}`}>
                                                            <span className="text-xs">{item?.icon || "◌"}</span>
                                                            <span className="text-[5px] text-gray-500 uppercase font-black">{slot.substring(0, 4)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-3 gap-2">
                                                {[0, 1, 2].map(bagIdx => {
                                                    const bagItems = inventory.filter(i => (i.bagIndex || 0) === bagIdx);
                                                    return (
                                                        <div key={bagIdx} className="p-2 border border-white/5 bg-black/40 rounded flex flex-col items-center gap-1">
                                                            <div className="text-[6px] text-gray-600 font-bold uppercase tracking-widest">BAG {bagIdx + 1}</div>
                                                            <div className="text-[8px] text-white font-black">{bagItems.length}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        }

                        {/* ═══ INVENTORY TAB ═══ */}
                        {activeTab === "CHARACTER_SHEET" &&
                            <div className="animate-ash-settling px-0 py-1">
                                <div className="mx-auto max-w-[860px] border border-white/5 bg-black/30 p-2.5 shadow-2xl backdrop-blur-md">
                                    <div className="mb-2 flex items-center gap-2 border-b border-white/5 pb-2">
                                        <div className="w-1.5 h-3 bg-[#c2410c]" />
                                        <span className="text-[9px] text-white font-bold uppercase tracking-[0.22em]">Character Sheet</span>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.05fr_0.95fr]">
                                            <section className="border border-white/5 bg-black/40 p-3 shadow-2xl">
                                                <div className="space-y-3 font-mono">
                                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[112px_minmax(0,1fr)] md:items-start">
                                                        <div className="relative h-28 w-full overflow-hidden border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(0,0,0,0.2))] shadow-lg md:w-28">
                                                            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:18px_18px] opacity-30" />
                                                            <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/30 to-transparent" />
                                                            <div className="absolute inset-0 flex items-center justify-center">
                                                                <svg
                                                                    viewBox="0 0 64 64"
                                                                    className="h-16 w-16 text-[#1f1f1f] opacity-80 animate-pulse"
                                                                    fill="currentColor"
                                                                    aria-hidden="true"
                                                                >
                                                                    <circle cx="32" cy="21" r="11" />
                                                                    <path d="M14 56c1-11 8-19 18-19s17 8 18 19H14z" />
                                                                </svg>
                                                            </div>
                                                            <div className="absolute inset-0 bg-black/35" />
                                                        </div>

                                                        <div className="min-w-0 space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <div className="h-1.5 w-1.5 bg-[#c2410c] shadow-[0_0_8px_rgba(194,65,12,0.45)]" />
                                                                <span className="text-[8px] font-bold uppercase tracking-[0.24em] text-gray-500">Identification</span>
                                                            </div>
                                                            <div className="space-y-1 border-b border-white/5 pb-2">
                                                                <div className="flex items-center gap-2">
                                                                    <h3 className="text-[18px] leading-none font-bold uppercase tracking-[0.08em] text-white">
                                                                        {characterBadge && <span className="mr-2 text-orange-500/80 drop-shadow-[0_0_8px_rgba(194,65,12,0.4)]">{characterBadge}</span>}
                                                                        {name || "Unnamed Unit"}
                                                                    </h3>
                                                                </div>
                                                                <p className="pt-0.5 text-[9px] leading-none font-medium uppercase tracking-[0.18em] text-gray-400">
                                                                    {selectedOccupation?.name || "No Occupation"}
                                                                </p>
                                                                <p className="pt-0.5 text-[9px] leading-none font-medium uppercase tracking-[0.16em] text-gray-600">
                                                                    {characterTitle || "No Title"}
                                                                </p>
                                                            </div>

                                                            <div className="grid grid-cols-[minmax(0,1fr)_108px] gap-2 pt-1">
                                                                <div className="border border-white/5 bg-black/30 px-2.5 py-2">
                                                                    <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-gray-600">
                                                                        Age / Gender
                                                                    </div>
                                                                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
                                                                        {age} / {gender}
                                                                    </div>
                                                                </div>
                                                                <div className="border border-[#c2410c]/25 bg-[#c2410c]/[0.07] px-2.5 py-2">
                                                                    <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-[#c2410c]/70">
                                                                        Level
                                                                    </div>
                                                                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
                                                                        LVL {level}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="border border-white/5 bg-black/30 px-3 py-2">
                                                        <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-gray-600">Current Location</div>
                                                        <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">No Current Location</div>
                                                    </div>

                                                    <div className="border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2">
                                                        <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-gray-600">Health Status</div>
                                                        <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-300 animate-pulse">
                                                            {derivedStats.hp > 20 ? "Stable" : derivedStats.hp > 10 ? "Wounded" : "Critical"}
                                                        </div>
                                                    </div>
                                                </div>
                                            </section>

                                            <section className="border border-white/5 bg-black/40 p-3 shadow-2xl">
                                                <div className="mb-3 flex items-center gap-2">
                                                    <div className="h-1.5 w-1.5 bg-[#c2410c] shadow-[0_0_8px_rgba(194,65,12,0.55)]" />
                                                    <h4 className="text-[9px] font-bold uppercase tracking-[0.28em] text-[#c2410c]">Story & Reputation</h4>
                                                </div>

                                                <div className="space-y-2.5">
                                                    {alignment && (
                                                        <div className="border border-white/5 bg-black/30 p-2">
                                                            <div className="text-[6px] font-black uppercase tracking-[0.22em] text-gray-600">Soul Alignment</div>
                                                            <div className="mt-1 text-[9px] font-bold text-[#c2410c] uppercase truncate">{alignment}</div>
                                                        </div>
                                                    )}
                                                    <div className="max-h-[168px] overflow-y-auto custom-scrollbar border border-white/5 bg-black/30 p-2.5">
                                                        <div className="mb-2 flex items-center justify-between">
                                                            <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-gray-500">Abridged Dossier</div>
                                                            {history.length > 165 && <div className="text-[6px] font-black uppercase text-[#c2410c]/60">Condensed</div>}
                                                        </div>
                                                        {history ? (
                                                            <p className="text-[10px] italic leading-relaxed text-gray-400">
                                                                {history.length > 165 ? history.substring(0, 165) + "..." : history}
                                                            </p>
                                                        ) : (
                                                            <p className="text-[10px] italic leading-relaxed text-gray-600">No historical records available for this unit.</p>
                                                        )}
                                                    </div>

                                                    {currentStory && (
                                                        <div className="border border-teal-500/10 bg-teal-500/[0.03] p-2.5">
                                                            <div className="mb-2 flex items-center justify-between">
                                                                <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-teal-400/70">Active Chronicle</div>
                                                                <div className="flex gap-1">
                                                                    <div className="w-1 h-1 bg-teal-500/30 rounded-full" />
                                                                    <div className="w-1 h-1 bg-teal-500/30 rounded-full" />
                                                                </div>
                                                            </div>
                                                            <p className="text-[9px] italic leading-relaxed text-teal-100/30 line-clamp-2">
                                                                {currentStory}
                                                            </p>
                                                        </div>
                                                    )}

                                                    <div className="border border-dashed border-white/10 bg-black/20 p-2.5">
                                                        <div className="text-[7px] font-bold uppercase tracking-[0.22em] text-[#c2410c]">Reputation</div>
                                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                                            {["Titles", "Badges"].map(slot => (
                                                                <button
                                                                    key={slot}
                                                                    onClick={() => setShowSelectionModal(slot === "Titles" ? "title" : "badge")}
                                                                    className="group flex h-14 flex-col items-center justify-center gap-1.5 border border-white/5 bg-black/40 p-2 text-center transition-all hover:border-[#c2410c]/40 hover:bg-white/[0.02] active:scale-95"
                                                                >
                                                                    <span className="text-[7px] font-black uppercase tracking-[0.2em] text-gray-600 group-hover:text-gray-400">{slot}</span>
                                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-white line-clamp-1">
                                                                        {slot === "Titles" ? (characterTitle || "SELECT") : (characterBadge || "SELECT")}
                                                                    </span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </section>
                                        </div>

                                        <section className="border border-white/5 bg-black/40 p-3 shadow-2xl">
                                            <div className="mb-3 flex items-start justify-between gap-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-1.5 w-1.5 bg-[#c2410c] shadow-[0_0_8px_rgba(194,65,12,0.55)]" />
                                                    <h4 className="text-[9px] font-bold uppercase tracking-[0.28em] text-[#c2410c]">Core Attributes</h4>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {activeAttributePoints > 0 && (
                                                        <div className="border border-[#c2410c]/25 bg-[#c2410c]/[0.07] px-2 py-1 text-[7px] font-bold uppercase tracking-[0.18em] text-[#c2410c] animate-pulse">
                                                            {activeAttributePoints} point{activeAttributePoints > 1 ? "s" : ""} available
                                                        </div>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={toggleRedispatchMode}
                                                        className={`border px-2 py-1 text-[7px] font-bold uppercase tracking-[0.22em] transition-all ${isRedispatching
                                                            ? "border-[#c2410c]/25 bg-[#c2410c]/[0.07] text-[#c2410c]"
                                                            : "border-white/5 bg-black/30 text-gray-500 hover:border-white/10 hover:text-gray-300"
                                                            }`}
                                                    >
                                                        {isRedispatching ? "Done" : "Redispatch"}
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                                                {(Object.entries(effectiveStats) as [keyof Stats, number][]).map(([stat, val]) => {
                                                    const baseValue = isRedispatching ? (redispatchStats?.[stat] ?? stats[stat]) : stats[stat];
                                                    const gearValue = equipmentStatModifiers[stat];

                                                    return (
                                                        <div
                                                            key={stat}
                                                            className={`border bg-black/30 p-2.5 transition-all ${(activeAttributePoints > 0 || isRedispatching)
                                                                ? "border-[#c2410c]/20 shadow-[0_0_0_1px_rgba(194,65,12,0.08)]"
                                                                : "border-white/5"
                                                                }`}
                                                        >
                                                            <div className="mb-2 flex items-start justify-between gap-2">
                                                                <div className="min-w-0 text-left">
                                                                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-gray-400">{stat}</span>
                                                                    <div className="mt-1 flex items-center gap-1.5">
                                                                        {gearValue !== 0 && (
                                                                            <span className="text-[7px] font-bold uppercase tracking-[0.16em] text-[#c2410c]">
                                                                                {gearValue > 0 ? `+${gearValue}` : gearValue} gear
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2 shrink-0">
                                                                    {isRedispatching && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => downgradeAttribute(stat)}
                                                                            className={`h-6 w-6 border text-[12px] font-bold transition-all ${(activeAttributeUpgrades[stat] > 0 || baseValue > 1)
                                                                                ? "border-white/10 bg-black/30 text-gray-300 hover:border-[#c2410c]/30 hover:text-[#c2410c]"
                                                                                : "border-white/5 bg-black/20 text-gray-700"
                                                                                }`}
                                                                        >
                                                                            -
                                                                        </button>
                                                                    )}
                                                                    {(activeAttributePoints > 0 || isRedispatching) && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => upgradeAttribute(stat)}
                                                                            className={`h-6 w-6 border text-[12px] font-bold transition-all ${activeAttributePoints > 0
                                                                                ? "border-[#c2410c]/35 bg-[#c2410c]/10 text-[#c2410c] hover:bg-[#c2410c]/20 animate-pulse"
                                                                                : "border-white/10 bg-black/30 text-gray-300 hover:border-[#c2410c]/30 hover:text-[#c2410c]"
                                                                                }`}
                                                                        >
                                                                            +
                                                                        </button>
                                                                    )}
                                                                    <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-white">{val}</span>
                                                                </div>
                                                            </div>
                                                            <div className="relative h-2 overflow-hidden border border-white/8 bg-black/50">
                                                                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:12px_100%] opacity-40" />
                                                                <div
                                                                    className="relative h-full bg-[#c2410c] shadow-[0_0_12px_rgba(194,65,12,0.28)]"
                                                                    style={{ width: `${Math.min((val / 10) * 100, 100)}%` }}
                                                                />
                                                            </div>
                                                            <div className="mt-1.5 flex items-center justify-between text-[7px] font-medium uppercase tracking-[0.18em] text-gray-600">
                                                                <span className="text-left font-bold text-gray-500">Base {baseValue} + Up {activeAttributeUpgrades[stat]}</span>
                                                                {(activeAttributePoints > 0 || isRedispatching) ? (
                                                                    <span className="text-[#c2410c] animate-pulse">Points {activeAttributePoints}</span>
                                                                ) : (
                                                                    <span>{Math.min(val, 10)}/10</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    </div>
                                </div>
                            </div>
                        }

                        {activeTab === "INVENTORY" &&
                            <div id="inventory-view-root" className="flex h-full relative font-mono overflow-hidden py-4 px-2 gap-6" onClick={() => setContextMenu(null)}>
                                {/* Left Sidebar: Item Library */}
                                <aside className="w-[300px] flex flex-col gap-4 shrink-0 bg-black/40 border border-white/5 p-4 rounded-xl shadow-2xl backdrop-blur-md">
                                    <div className="flex flex-col gap-1.5 border-b border-white/5 pb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-3 bg-[#c2410c]" />
                                            <label className="text-[10px] text-white font-black uppercase tracking-[0.2em]">Item Database</label>
                                        </div>
                                        <input
                                            value={librarySearch}
                                            onChange={e => setLibrarySearch(e.target.value)}
                                            placeholder="SEARCH DATABASE..."
                                            className="w-full bg-black/40 border border-white/10 text-[10px] text-gray-400 px-3 py-2 rounded outline-none focus:border-[#c2410c]/40 transition-all font-mono italic"
                                        />
                                    </div>

                                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                                        {allLibraryItems.length > 0 ? allLibraryItems.map(item => (
                                            <button
                                                key={item.id}
                                                onClick={() => addItemToInventory(item)}
                                                className={`w-full text-left p-3 bg-black/20 border border-white/5 rounded-lg flex items-center gap-3 group hover:border-[#c2410c]/40 hover:bg-white/[0.02] transition-all relative overflow-hidden active:scale-95`}
                                            >
                                                <div className="w-10 h-10 bg-black/40 border border-white/10 rounded flex items-center justify-center text-lg relative z-10">
                                                    {item.icon && item.icon.startsWith("/api/icons/") ? (
                                                        <img src={item.icon} className="w-full h-full object-cover p-1" />
                                                    ) : (
                                                        <span>{item.icon || "📦"}</span>
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-0.5 relative z-10 truncate">
                                                    <span className="text-[10px] font-black text-white uppercase tracking-wider truncate">{item.name}</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[8px] text-gray-500 font-bold uppercase">{item.category}</span>
                                                        {item.equipSlot && <span className="text-[8px] text-orange-500/80 font-black uppercase tracking-widest">{item.equipSlot}</span>}
                                                        <span className="text-[8px] text-[#c2410c]/80 font-black ml-auto">{item.cost} CR</span>
                                                    </div>
                                                </div>
                                                {/* Hover Glow */}
                                                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[#c2410c] scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                                            </button>
                                        )) : (
                                            <div className="text-[9px] text-gray-600 italic text-center py-10 opacity-50">No items matching your query.</div>
                                        )}
                                    </div>

                                    <div className="pt-3 border-t border-white/5">
                                        <p className="text-[8px] text-gray-600 font-bold text-center uppercase tracking-widest leading-relaxed">
                                            SELECT AN ITEM TO ADD IT TO YOUR CURRENT BAG AS AN ACTIVE UNIT
                                        </p>
                                    </div>
                                </aside>

                                <div className="flex-1 flex flex-col items-center overflow-y-auto custom-scrollbar">
                                    <div className="w-full max-w-[700px] flex flex-col gap-5">
                                        {/* Top Row: Bags & Money */}
                                        <div className="flex items-end justify-between">
                                            {/* Tactical Bag Slots */}
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-1.5 px-1">
                                                    <div className="w-1 h-2.5 bg-[#c2410c]" />
                                                    <label className="text-[9px] text-gray-500 font-black uppercase tracking-widest">INVENTORY</label>
                                                </div>
                                                <div className="flex gap-1 p-1 bg-black/60 border border-white/5 shadow-xl">
                                                    {[0, 1, 2, 3, 4, 5].map((idx) => (
                                                        <div
                                                            key={idx}
                                                            onClick={() => setActiveBagIndex(idx)}
                                                            className={`w-11 h-11 border flex items-center justify-center relative group cursor-pointer transition-all ${activeBagIndex === idx ? "bg-[#c2410c]/20 border-[#c2410c] shadow-[0_0_10px_rgba(194,65,12,0.1)]" : "bg-white/[0.01] border-white/10 hover:border-[#c2410c]/30 hover:bg-white/[0.03]"}`}
                                                        >
                                                            {idx === 5 ? (
                                                                <svg className="w-5 h-5 text-gray-500 group-hover:text-gray-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                                                </svg>
                                                            ) : (
                                                                <svg className="w-5 h-5 text-gray-600 group-hover:text-gray-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                                                </svg>
                                                            )}

                                                            <div className="absolute bottom-0.5 right-0.5 flex gap-0.5 scale-75">
                                                                <div className={`w-1 h-2.5 ${idx === 3 ? "bg-red-900/40" : "bg-[#c2410c]/40"}`} />
                                                                <div className={`w-1 h-2.5 ${idx === 3 ? "bg-red-600" : "bg-[#c2410c]"}`} />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Currency - Dossier Style */}
                                            <div className="flex flex-col items-end gap-1">
                                                <div className="flex items-center gap-2.5 bg-[#c2410c]/5 border border-[#c2410c]/20 px-3 py-1.5">
                                                    <span className="text-[8px] text-gray-600 font-black uppercase tracking-widest mr-1">CREDITS:</span>
                                                    <span className="text-sm font-black text-[#c2410c]">{totalCredits.toLocaleString()}</span>
                                                </div>
                                                <div className="flex gap-2 pr-1 scale-90">
                                                    <div className="flex items-center gap-1 opacity-50">
                                                        <span className="text-[9px] text-white font-bold">{gold.toString().padStart(2, '0')}</span>
                                                        <div className="w-2 h-2 rounded-full bg-yellow-600" />
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-50">
                                                        <span className="text-[9px] text-white font-bold">{silver.toString().padStart(2, '0')}</span>
                                                        <div className="w-2 h-2 rounded-full bg-slate-400" />
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-50">
                                                        <span className="text-[9px] text-white font-bold">{copper.toString().padStart(2, '0')}</span>
                                                        <div className="w-2 h-2 rounded-full bg-orange-700" />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Controls Module */}
                                        <div className="flex flex-col gap-3 bg-black/20 p-3 border border-white/5">
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex-1 flex items-center bg-black/60 border border-white/10 focus-within:border-[#c2410c]/30 transition-all">
                                                    <div className="pl-3 text-gray-700">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                        </svg>
                                                    </div>
                                                    <input
                                                        value={inventorySearch}
                                                        onChange={e => setInventorySearch(e.target.value)}
                                                        placeholder="SEARCH DATA..."
                                                        className="w-full bg-transparent px-3 py-2 text-[10px] text-white placeholder:text-gray-800 outline-none uppercase tracking-widest"
                                                    />
                                                </div>

                                                <div className="flex items-center bg-black/40 border border-white/10">
                                                    {(["ALL", "WEAPON", "CONSUMABLE", "RESOURCE", "JUNK", "ARMOR"] as const).map(f => (
                                                        <button
                                                            key={f}
                                                            onClick={() => setInventoryFilter(f)}
                                                            className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all ${inventoryFilter === f ? "bg-[#c2410c] text-white" : "text-gray-600 hover:text-gray-300 hover:bg-white/5"}`}
                                                        >
                                                            {f}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 scale-95 origin-left">
                                                <div className="text-[8px] text-gray-700 uppercase tracking-widest mr-1">SORT:</div>
                                                <button
                                                    onClick={sortByValue}
                                                    className="flex items-center gap-1.5 px-2 py-1 bg-white/[0.02] border border-white/5 text-[8px] text-gray-500 font-bold hover:text-white transition-all uppercase tracking-widest"
                                                >
                                                    VALUE
                                                </button>
                                                <button
                                                    onClick={sortByRarity}
                                                    className="flex items-center gap-1.5 px-2 py-1 bg-white/[0.02] border border-white/5 text-[8px] text-gray-500 font-bold hover:text-white transition-all uppercase tracking-widest"
                                                >
                                                    RARITY
                                                </button>
                                            </div>
                                        </div>

                                        {/* Main Storage Unit */}
                                        <div className="bg-black/40 border border-white/5 p-5 relative overflow-hidden group">
                                            <div className="absolute inset-0 bg-[linear-gradient(rgba(194,65,12,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(194,65,12,0.02)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

                                            {/* Bag Switch Dust Sweep Effect */}
                                            <div
                                                key={`dust-${activeBagIndex}`}
                                                className="absolute inset-0 z-30 pointer-events-none animate-dust-sweep"
                                                style={{
                                                    background: 'linear-gradient(90deg, transparent, rgba(161, 98, 7, 0.1), rgba(194, 65, 12, 0.3), rgba(75, 85, 99, 0.5), transparent)',
                                                    width: '200%',
                                                    filter: 'blur(30px) contrast(1.2)'
                                                }}
                                            />

                                            <div
                                                key={activeBagIndex}
                                                className="grid grid-cols-10 gap-2 relative z-10 animate-ash-settling"
                                            >
                                                {Array.from({ length: 40 }).map((_, idx) => {
                                                    const item = filteredInventory[idx];
                                                    const itemRarity = item?.rarity || "none";

                                                    const rarityClasses = {
                                                        salvaged: "rarity-salvaged bg-black/60",
                                                        reinforced: "rarity-reinforced bg-black/60",
                                                        "pre-ash": "rarity-pre-ash bg-black/60",
                                                        specialized: "rarity-specialized bg-black/60",
                                                        relic: "rarity-relic bg-black/60",
                                                        ashmarked: "rarity-ashmarked bg-black/60",
                                                        none: "border-white/5 hover:border-[#c2410c]/40 bg-black/60"
                                                    };

                                                    return (
                                                        <div
                                                            key={idx}
                                                            onClick={() => setSelectedSlotIndex(idx)}
                                                            onMouseEnter={(e) => {
                                                                if (item && !contextMenu) {
                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                    const root = document.getElementById('inventory-view-root');
                                                                    const rootRect = root?.getBoundingClientRect() || { left: 0, top: 0 };
                                                                    const scrollOffset = root?.scrollTop || 0;

                                                                    setHoverInfo({
                                                                        x: rect.right - rootRect.left + 8,
                                                                        y: rect.top - rootRect.top + scrollOffset,
                                                                        item
                                                                    });
                                                                }
                                                            }}
                                                            onMouseLeave={() => setHoverInfo(null)}
                                                            onContextMenu={(e) => {
                                                                e.preventDefault();
                                                                setHoverInfo(null);
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                const root = document.getElementById('inventory-view-root');
                                                                const rootRect = root?.getBoundingClientRect() || { left: 0, top: 0 };

                                                                const scrollOffset = root?.scrollTop || 0;

                                                                setContextMenu({
                                                                    x: rect.right - rootRect.left + 1,
                                                                    y: rect.top - rootRect.top + scrollOffset,
                                                                    slotIndex: idx
                                                                });
                                                                setSelectedSlotIndex(idx);
                                                            }}
                                                            className={`aspect-square border flex items-center justify-center relative group cursor-pointer transition-all 
                                                            ${selectedSlotIndex === idx ? "border-[#c2410c] shadow-[inset_0_0_8px_rgba(194,65,12,0.1)]" : rarityClasses[itemRarity as keyof typeof rarityClasses]}
                                                            ${animatingSlot?.index === idx && animatingSlot.type === 'destroy' ? 'animate-item-destroy z-50 pointer-events-none' : ''}
                                                            ${animatingSlot?.index === idx && animatingSlot.type === 'throw' ? 'animate-item-throw z-50 pointer-events-none' : ''}
                                                        `}
                                                        >
                                                            <div className="absolute top-0 left-0 w-0.5 h-0.5 bg-white/10" />
                                                            <div className="absolute bottom-0 right-0 w-0.5 h-0.5 bg-white/10" />

                                                            {selectedSlotIndex === idx && (
                                                                <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[#c2410c] z-20" />
                                                            )}

                                                            {/* Rarity Bar (Subtle) */}
                                                            {itemRarity !== "none" && (
                                                                <div className={`absolute inset-x-0 bottom-0 h-px opacity-40 z-10 
                                                                ${itemRarity === 'salvaged' ? 'bg-gray-300' :
                                                                        itemRarity === 'reinforced' ? 'bg-[#444444]' :
                                                                            itemRarity === 'pre-ash' ? 'bg-[#1e40af]' :
                                                                                itemRarity === 'specialized' ? 'bg-[#4c1d95]' :
                                                                                    itemRarity === 'relic' ? 'bg-amber-700' :
                                                                                        'bg-red-900'}`}
                                                                />
                                                            )}

                                                            {/* Ashmarked permanent ripple effect */}
                                                            {itemRarity === "ashmarked" && (
                                                                <div className="absolute inset-0 rounded-sm pointer-events-none ashmarked-permanent-ripple opacity-20" />
                                                            )}

                                                            <div className={`text-[8px] font-black transition-colors uppercase relative z-10 ${selectedSlotIndex === idx ? "text-[#c2410c]" : item ? "text-gray-300" : "text-gray-900 group-hover:text-gray-700"}`}>
                                                                {item ? item.name.substring(0, 3) : (idx < 9 ? `0${idx + 1}` : idx + 1)}
                                                            </div>

                                                            {item && (
                                                                <div className="absolute top-0 right-0 p-0.5 flex flex-col items-end gap-0.5 pointer-events-none">
                                                                    <div className="text-[6px] text-gray-600 font-mono">{(item.cost || 0)}</div>
                                                                </div>
                                                            )}

                                                            {/* Fragmentation particles for Destroy effect (Explosion) */}
                                                            {animatingSlot?.index === idx && animatingSlot.type === 'destroy' && (
                                                                <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
                                                                    <div className="absolute inset-0 bg-white/20 animate-ping duration-300" />
                                                                    <div className="w-full h-full border-4 border-[#c2410c]/40 animate-ping delay-100" />
                                                                    {/* Cracking overlays */}
                                                                    <div className="absolute inset-0 opacity-40 mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/pinstriped-suit.png')] animate-pulse" />
                                                                </div>
                                                            )}

                                                            {/* Dust Sweep overlay for Throw effect */}
                                                            {animatingSlot?.index === idx && animatingSlot.type === 'throw' && (
                                                                <div
                                                                    className="absolute inset-0 z-50 pointer-events-none animate-dust-lash overflow-hidden"
                                                                    style={{
                                                                        background: 'linear-gradient(90deg, transparent, rgba(194, 65, 12, 0.6), rgba(75, 85, 99, 0.8), transparent)',
                                                                        width: '300%',
                                                                        filter: 'blur(10px)'
                                                                    }}
                                                                />
                                                            )}

                                                            {/* Glass Shatter effect overlay */}
                                                            {animatingSlot?.index === idx && animatingSlot.type === 'destroy' && (
                                                                <div className="absolute inset-0 z-50 pointer-events-none opacity-60">
                                                                    <svg viewBox="0 0 100 100" className="w-full h-full stroke-[#c2410c] stroke-[0.5] fill-none">
                                                                        <path d="M0,0 L50,55 L100,20 M50,55 L30,100 M50,55 L100,80 M20,0 L50,55 M0,70 L50,55 M50,55 L80,0" />
                                                                        <circle cx="50" cy="55" r="1.5" className="fill-[#c2410c]" />
                                                                    </svg>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%)] bg-[size:100%_2px] z-20 opacity-10" />
                                        </div>
                                    </div>

                                    {/* Context Menu - Positioned Absolutely relative to the tab container */}
                                    {contextMenu && (() => {
                                        const contextItem = contextMenu.slotIndex !== null ? filteredInventory[contextMenu.slotIndex] : null;
                                        const equippedSlot = contextItem ? isItemEquipped(contextItem) : null;
                                        const canEquip = contextItem ? isEquipable(contextItem) : false;
                                        return (
                                            <div
                                                className="absolute z-[1000] w-36 bg-[#0d0d0d] border border-[#c2410c]/30 shadow-2xl py-0.5 animate-in fade-in zoom-in-95 duration-75 origin-top-left"
                                                style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="px-3 py-1 border-b border-white/5 mb-0.5 bg-white/[0.02]">
                                                    <span className="text-[7px] font-black text-[#c2410c] uppercase tracking-[0.2em]">SLOT {contextMenu.slotIndex! + 1}</span>
                                                </div>
                                                <button className="w-full text-left px-3 py-1.5 text-[9px] text-gray-400 font-bold hover:bg-[#c2410c] hover:text-white transition-all uppercase tracking-widest flex items-center justify-between">
                                                    USE <span>»</span>
                                                </button>
                                                {canEquip && contextItem && (
                                                    <button
                                                        onClick={() => {
                                                            if (equippedSlot) {
                                                                unequipItem(equippedSlot);
                                                            } else {
                                                                equipFromInventory(contextItem);
                                                            }
                                                            setContextMenu(null);
                                                        }}
                                                        className={`w-full text-left px-3 py-1.5 text-[9px] font-bold hover:text-white transition-all uppercase tracking-widest flex items-center justify-between ${equippedSlot ? 'text-orange-400 hover:bg-orange-500/20' : 'text-teal-400 hover:bg-teal-500/20'}`}
                                                    >
                                                        {equippedSlot ? 'UNEQUIP' : 'EQUIP'} <span>»</span>
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        if (contextMenu.slotIndex !== null) {
                                                            setAnimatingSlot({ index: contextMenu.slotIndex, type: 'throw' });
                                                            setTimeout(() => {
                                                                removeSlotItem(contextMenu.slotIndex!);
                                                                setAnimatingSlot(null);
                                                            }, 600);
                                                            setContextMenu(null);
                                                        }
                                                    }}
                                                    className="w-full text-left px-3 py-1.5 text-[9px] text-gray-400 font-bold hover:bg-white/5 hover:text-white transition-all uppercase tracking-widest flex items-center justify-between"
                                                >
                                                    THROW <span>»</span>
                                                </button>
                                                <div className="h-px bg-white/5 my-0.5" />
                                                <button
                                                    onClick={() => {
                                                        if (contextMenu.slotIndex !== null) {
                                                            setAnimatingSlot({ index: contextMenu.slotIndex, type: 'destroy' });
                                                            setTimeout(() => {
                                                                removeSlotItem(contextMenu.slotIndex!);
                                                                setAnimatingSlot(null);
                                                            }, 500);
                                                            setContextMenu(null);
                                                        }
                                                    }}
                                                    className="w-full text-left px-3 py-1.5 text-[9px] text-red-600 font-black hover:bg-red-600/20 hover:text-white transition-all uppercase tracking-widest flex items-center justify-between"
                                                >
                                                    DESTROY <span>»</span>
                                                </button>
                                            </div>
                                        );
                                    })()}

                                    {/* Hover Info Panel - Purely Informational */}
                                    {hoverInfo && !contextMenu && (
                                        <div
                                            className="absolute z-[999] w-44 bg-[#0d0d0d] border border-white/10 shadow-2xl p-3 animate-in fade-in slide-in-from-left-1 duration-200 pointer-events-none"
                                            style={{ top: `${hoverInfo.y}px`, left: `${hoverInfo.x}px` }}
                                        >
                                            <div className="flex flex-col gap-2">
                                                <div className="border-b border-white/5 pb-2">
                                                    <div className="text-[10px] font-black text-white uppercase tracking-wider leading-tight">
                                                        {hoverInfo.item.name}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        <div className={`w-1 h-1 rounded-full ${hoverInfo.item.rarity === 'ashmarked' ? 'bg-red-600 shadow-[0_0_5px_rgba(220,38,38,0.5)]' :
                                                            hoverInfo.item.rarity === 'relic' ? 'bg-amber-500' :
                                                                hoverInfo.item.rarity === 'specialized' ? 'bg-purple-600' :
                                                                    'bg-gray-500'
                                                            }`} />
                                                        <span className="text-[7px] font-bold text-gray-500 uppercase tracking-widest">
                                                            {hoverInfo.item.rarity}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-y-1.5">
                                                    <div className="text-[7px] text-gray-600 font-black uppercase tracking-widest">Type:</div>
                                                    <div className="text-[7px] text-gray-400 font-bold uppercase tracking-widest text-right">
                                                        {hoverInfo.item.category}
                                                    </div>

                                                    {hoverInfo.item.equipSlot && (
                                                        <>
                                                            <div className="text-[7px] text-gray-600 font-black uppercase tracking-widest">Slot:</div>
                                                            <div className="text-[7px] text-orange-500 font-bold uppercase tracking-widest text-right">
                                                                {hoverInfo.item.equipSlot}
                                                            </div>
                                                        </>
                                                    )}

                                                    <div className="text-[7px] text-gray-600 font-black uppercase tracking-widest">Value:</div>
                                                    <div className="text-[7px] text-[#c2410c] font-black uppercase tracking-widest text-right">
                                                        {hoverInfo.item.cost}C
                                                    </div>
                                                </div>

                                                {hoverInfo.item.description && (
                                                    <div className="mt-1 pt-2 border-t border-white/5">
                                                        <p className="text-[8px] text-gray-500 leading-relaxed italic">
                                                            {hoverInfo.item.description}
                                                        </p>
                                                    </div>
                                                )}

                                                {hoverInfo.item.effects && hoverInfo.item.effects.length > 0 && (
                                                    <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                                                        <div className="text-[6px] font-black text-orange-500/70 uppercase tracking-widest mb-1">Effects:</div>
                                                        {hoverInfo.item.effects.map((eff: any, idx: number) => {
                                                            let label = eff.target === 'damage' ? 'Weapon Damage' : eff.target;
                                                            if (eff.target === 'armor' || eff.target === 'defense') label = 'Armor';

                                                            return (
                                                                <div key={idx} className="flex justify-between items-center bg-white/[0.02] px-1.5 py-1 rounded border border-white/5">
                                                                    <span className="text-[7px] font-black text-gray-500 uppercase tracking-widest truncate max-w-[80px]">
                                                                        {label}
                                                                    </span>
                                                                    <span className={`text-[8px] font-black ${eff.value >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                                        {eff.value >= 0 ? '+' : ''}{eff.value}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        }

                        {/* ═══ SAVE TAB ═══ */}
                        {activeTab === "SAVE" &&
                            <div className="space-y-6 max-w-2xl">
                                <h2 className="text-lg font-black tracking-widest text-indigo-400 uppercase">Review & Save</h2>

                                {/* Summary */}
                                <div className="bg-black/40 p-6 rounded-xl border border-white/5 space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-2xl font-black text-white">{name || "Unnamed"}</span>
                                        <div className="flex gap-2">
                                            {isNPC && <span className="px-2 py-1 bg-red-500/20 text-red-400 text-[10px] font-black uppercase rounded border border-red-500/20">NPC</span>}
                                            <span className="px-2 py-1 bg-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase rounded border border-indigo-500/20">
                                                {selectedOccupation?.name || "No Occupation"}
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                                        Age {age} | {gender} | Level {level}
                                    </p>
                                    <div className="flex gap-4 pt-1">
                                        <div className="text-[9px] font-black text-emerald-500 uppercase">HP: {derivedStats.hp}</div>
                                        <div className="text-[9px] font-black text-blue-500 uppercase">AP: {derivedStats.ap}</div>
                                        <div className="text-[9px] font-black text-orange-500 uppercase">Armor: {derivedStats.armor}</div>
                                    </div>

                                    {/* Simple Status visualization */}
                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                                        {Object.entries(stats).map(([s, v]) => (
                                            <div key={s} className="flex justify-between items-center">
                                                <span className="text-[10px] text-gray-400 uppercase tracking-widest font-black">{s}</span>
                                                <span className="text-sm text-indigo-400 font-bold">{v}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Traits Recap */}
                                {selectedTraits.length > 0 && (
                                    <div className="bg-black/20 p-4 border border-white/5 rounded-xl">
                                        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Imprinted Traits</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedTraits.map(t => (
                                                <span key={t.id} className="px-2 py-1 bg-white/5 rounded text-[10px] text-gray-300 font-bold uppercase tracking-widest border border-white/10">
                                                    {t.icon} {t.name}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <p className="text-[10px] text-gray-500 font-mono">
                                        ID: {charId} | Will save to: generated/characters/{charId}.json
                                    </p>
                                    <button
                                        onClick={handleSave}
                                        disabled={!name}
                                        className="w-full py-4 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-30 text-white font-black uppercase tracking-[0.3em] rounded-xl transition-all text-sm"
                                    >
                                        💾 {editingId ? "Update Character" : "Save Character to Disk"}
                                    </button>
                                </div>
                            </div>
                        }
                    </div> {/* end of tab panels */}
                </div> {/* end of Center Panel */}
            </div> {/* end of Main Layout */}

            {/* Selection Modal (Titles / Badges) */}
            {
                showSelectionModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
                        <div className="w-full max-w-md border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl animate-ash-settling">
                            <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-4 w-1 bg-[#c2410c]" />
                                    <h3 className="text-sm font-black uppercase tracking-[0.3em] text-white">
                                        Select {showSelectionModal === "title" ? "Unit Title" : "Unit Badge"}
                                    </h3>
                                </div>
                                <button
                                    onClick={() => setShowSelectionModal(null)}
                                    className="text-gray-500 hover:text-white transition-colors"
                                >
                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                                {showSelectionModal === "title" ? (
                                    <>
                                        <button
                                            onClick={() => { setCharacterTitle(""); setShowSelectionModal(null); }}
                                            className="h-12 border border-dashed border-white/10 bg-black/40 text-[9px] font-bold uppercase tracking-widest text-gray-500 hover:border-white/20 hover:text-white transition-all"
                                        >
                                            Remove Title
                                        </button>
                                        {ALL_TITLES.map(t => (
                                            <button
                                                key={t}
                                                onClick={() => { setCharacterTitle(t); setShowSelectionModal(null); }}
                                                className={`h-12 border px-3 text-[9px] font-bold uppercase tracking-widest transition-all ${characterTitle === t ? "border-[#c2410c] bg-[#c2410c]/10 text-white shadow-[0_0_15px_rgba(194,65,12,0.2)]" : "border-white/5 bg-black/20 text-gray-400 hover:border-white/20 hover:text-white"}`}
                                            >
                                                {t}
                                            </button>
                                        ))}
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => { setCharacterBadge(""); setShowSelectionModal(null); }}
                                            className="h-12 border border-dashed border-white/10 bg-black/40 text-[9px] font-bold uppercase tracking-widest text-gray-500 hover:border-white/20 hover:text-white transition-all flex items-center justify-center"
                                        >
                                            Remove Badge
                                        </button>
                                        {ALL_BADGES.map(b => (
                                            <button
                                                key={b}
                                                onClick={() => { setCharacterBadge(b); setShowSelectionModal(null); }}
                                                className={`h-12 border text-xl flex items-center justify-center transition-all ${characterBadge === b ? "border-[#c2410c] bg-[#c2410c]/10 shadow-[0_0_15px_rgba(194,65,12,0.2)]" : "border-white/5 bg-black/20 hover:border-white/20"}`}
                                            >
                                                {b}
                                            </button>
                                        ))}
                                    </>
                                )}
                            </div>

                            <div className="mt-8 border-t border-white/5 pt-4 text-center">
                                <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-gray-600">
                                    Changes will be reflected immediately in the data blueprint.
                                </p>
                            </div>
                        </div>
                    </div>
                )
            }
        </div>
    );
}
