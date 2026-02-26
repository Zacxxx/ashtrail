
export enum ResourceType {
  FOOD = 'FOOD',
  WATER = 'WATER',
  FUEL = 'FUEL',
  PARTS = 'PARTS',
  AMMO = 'AMMO',
  MEDS = 'MEDS',
}

export interface Resources {
  [ResourceType.FOOD]: number;
  [ResourceType.WATER]: number;
  [ResourceType.FUEL]: number;
  [ResourceType.PARTS]: number;
  [ResourceType.AMMO]: number;
  [ResourceType.MEDS]: number;
}

export interface Stats {
  strength: number;
  agility: number;
  intelligence: number;
  wisdom: number;
  endurance: number;
  charisma: number;
}

export type EffectType = 'STAT_MODIFIER' | 'COMBAT_BONUS' | 'RESOURCE_MODIFIER' | 'EXPLORATION_BONUS';

export interface GameplayEffect {
  type: EffectType;
  target?: string; // e.g. 'maxHp', 'strength', 'evasion', 'food'
  value: number;
  trigger?: 'passive' | 'on_hit' | 'on_turn_start' | 'on_defend';
}

export interface Trait {
  id: string;
  name: string;
  description: string;
  cost: number; // Positive costs points, negative gives points (negative cost)
  type: 'positive' | 'negative' | 'neutral';
  impact?: string;
  effects?: GameplayEffect[];
}

export type OccupationCategory = 'SECURITY' | 'TECHNICAL' | 'CRAFT' | 'ADMIN' | 'SOCIAL' | 'FIELD';

export interface Occupation {
  id: string;
  name: string;
  category: OccupationCategory;
  description: string;
  shortDescription: string;
  perks: string[];
}

export type ItemCategory = "weapon" | "tool" | "armor" | "consumable" | "relic";

export interface Item {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  cost: number;
  effects?: GameplayEffect[];
}

export type SkillTargetType = 'enemy' | 'ally' | 'self' | 'cell';
export type SkillAreaType = 'single' | 'cross' | 'circle' | 'line';

export interface Skill {
  id: string;
  name: string;
  description: string;
  apCost: number;
  minRange: number;
  maxRange: number;
  areaType: SkillAreaType;
  areaSize: number;       // radius for circle, length for line/cross, 0 for single
  targetType: SkillTargetType;
  damage?: number;         // Base damage (scaled by strength)
  healing?: number;        // Base healing
  cooldown: number;        // Turns between uses (0 = no cooldown)
  effectType?: 'physical' | 'magical' | 'support';
  pushDistance?: number;   // Cells to push target away (Dofus-style displacement)
  icon?: string;           // Emoji icon for quick display
}

export interface Character {
  id: string;
  isNPC?: boolean;
  name: string;
  age: number;
  gender: string;
  history: string;
  appearancePrompt: string;
  portraitUrl?: string;
  stats: Stats;
  traits: Trait[];
  skills?: Skill[];
  occupation?: Occupation;
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
  inventory: Item[];
}

/** @deprecated Use `Character` instead. Kept for backward compatibility. */
export type Player = Character;

export interface CrewMember {
  id: string;
  name: string;
  role: 'driver' | 'mechanic' | 'medic' | 'scout' | 'negotiator' | 'muscle';
  traits: string[];
  morale: number;
  trust: number;
  spIndex: number;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'completed' | 'failed';
  rewards: string[];
}

export interface PointOfInterest {
  id: string;
  name: string;
  description: string;
  type: 'market' | 'ruin' | 'hazard' | 'npc' | 'landmark';
}

export interface Node {
  id: string;
  name: string;
  type: 'settlement' | 'ruins' | 'refinery' | 'tunnel' | 'outpost' | 'camp';
  faction: string;
  danger: number;
  scarcity: ResourceType[];
  abundance: ResourceType[];
  description: string;
  pois?: PointOfInterest[];
}

export type GameScreen =
  | 'MENU'
  | 'CHARACTER_CREATION'
  | 'LORE_INTRO'
  | 'WORLD_MAP'
  | 'LOCATION_MAP'
  | 'INTERACTION'
  | 'COMBAT'
  | 'CHARACTER_SHEET'
  | 'QUEST_LOG'
  | 'SETTINGS';

export interface GameState {
  screen: GameScreen;
  day: number;
  ap: number;
  maxAp: number;
  player: Character;
  resources: Resources;
  heat: number;
  location: Node;
  destination?: Node;
  crew: CrewMember[];
  quests: Quest[];
  history: Array<{
    type: 'narrative' | 'system' | 'action';
    content: string;
    timestamp: number;
  }>;
  combat?: {
    enemyName: string;
    enemyHp: number;
    enemyMaxHp: number;
    log: string[];
  };
}

export interface TalentNode {
  id: string;
  name: string;
  description: string;
  pos: { x: number; y: number };
  dependencies?: string[];
  unlocked?: boolean;
  type: 'active' | 'passive' | 'stat';
}

export interface TalentTree {
  occupationId: string;
  nodes: TalentNode[];
}
