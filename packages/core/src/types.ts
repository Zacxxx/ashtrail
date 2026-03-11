
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

export type CharacterType = string;

export type SpriteActorType = "animal" | "monster" | "human" | "mutant" | "construct";
export type SpriteDirection = "north" | "south" | "east" | "west";

export interface DirectionalSpriteBinding {
  batchId: string;
  spriteId: string;
  actorType: SpriteActorType;
  previewUrl: string;
  directions: Record<SpriteDirection, string>;
}

export type BuilderTab = "IDENTITY" | "LORE" | "TRAITS" | "STATS" | "OCCUPATION" | "SKILLS" | "EQUIPEMENT" | "CHARACTER_SHEET" | "INVENTORY" | "SAVE";

export interface CustomBaseType {
  id: string;
  name: string;
  description: string;
  allowedTabs: BuilderTab[];
  innateStatsBonus: Partial<Stats>;
  hasFamily: boolean;
  canHaveOccupation: boolean;
}

export interface WorldSettings {
  worldId: string;
  baseTypes: CustomBaseType[];
}

export type EffectType =
  | 'STAT_MODIFIER'
  | 'COMBAT_BONUS'
  | 'RESOURCE_MODIFIER'
  | 'EXPLORATION_BONUS'
  | 'DAMAGE_OVER_TIME'
  | 'HEAL_OVER_TIME'
  | 'STATUS_IMMUNITY'
  | 'ACTION_MODIFIER'
  | 'WEAPON_DAMAGE_REPLACEMENT'
  | 'PROTECTION_STANCE'
  | 'STEALTH'
  | 'ANALYZED'
  | 'LORE_EFFECT';

export interface GameplayEffect {
  id?: string;
  name?: string;
  description?: string;
  type: EffectType;
  target?: string; // e.g. 'maxHp', 'strength', 'evasion', 'food', 'fire_damage'
  value: number;
  isPercentage?: boolean;
  duration?: number; // 0 or undefined for permanent/passive
  trigger?: 'passive' | 'on_hit' | 'on_turn_start' | 'on_turn_end' | 'on_defend' | 'on_kill';
  icon?: string;
}

export interface Trait {
  id: string;
  name: string;
  description: string;
  cost: number; // Positive costs points, negative gives points (negative cost)
  type: 'positive' | 'negative' | 'neutral';
  impact?: string;
  effects?: GameplayEffect[];
  icon?: string;           // Emoji or gallery path
}

export type OccupationCategory = 'SECURITY' | 'TECHNICAL' | 'CRAFT' | 'ADMIN' | 'SOCIAL' | 'FIELD';

export interface Occupation {
  id: string;
  name: string;
  category: OccupationCategory;
  description: string;
  shortDescription: string;
  effects?: GameplayEffect[];
  perks?: string[];
  icon?: string;           // Emoji or gallery path
}

export type ItemCategory = "weapon" | "consumable" | "resource" | "junk" | "armor";

export type ItemRarity = "salvaged" | "reinforced" | "pre-ash" | "specialized" | "relic" | "ashmarked";

export type EquipSlot = "head" | "chest" | "gloves" | "waist" | "legs" | "boots" | "mainHand" | "offHand";

export interface Item {
  id: string;
  name: string;
  category: ItemCategory;
  rarity: ItemRarity;
  description: string;
  cost: number;
  bagIndex?: number;
  slotIndex?: number;
  equipSlot?: EquipSlot;   // Which equipment slot this item belongs to
  effects?: GameplayEffect[];
  icon?: string;           // Emoji or gallery path
}

export type SkillTargetType = 'enemy' | 'ally' | 'self' | 'cell';
export type SkillAreaType = 'single' | 'cross' | 'circle' | 'line';

export type SkillCategory = 'occupation' | 'base' | 'unique' | 'equipment';

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
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
  effects?: GameplayEffect[];
}

export type RelationshipType =
  // Blood family
  | 'father' | 'mother' | 'son' | 'daughter' | 'brother' | 'sister'
  | 'grandfather' | 'grandmother' | 'grandson' | 'granddaughter'
  | 'uncle' | 'aunt' | 'nephew' | 'niece' | 'cousin'
  // Chosen family / social
  | 'spouse' | 'partner' | 'fiancé'
  | 'adoptive_parent' | 'adoptive_child' | 'step_parent' | 'step_child' | 'step_sibling'
  // Social bonds
  | 'friend' | 'best_friend' | 'ally' | 'mentor' | 'protégé' | 'companion'
  // Adversarial
  | 'enemy' | 'rival' | 'nemesis'
  // Other
  | 'lover' | 'ex' | 'ward' | 'guardian' | 'servant' | 'master' | 'liege' | 'vassal';

export interface CharacterRelationship {
  targetId: string;
  type: RelationshipType;
  note?: string; // e.g. "Childhood friends" or "Betrayed them"
}

export interface CharacterOrigin {
  system: 'builder' | 'history' | 'quest';
  sourceId?: string;
  worldId?: string;
}

export interface Character {
  id: string;
  isNPC?: boolean;
  type?: CharacterType;
  isFamily?: boolean;
  familyId?: string;
  worldId?: string;
  name: string;
  age: number;
  gender: string;
  history: string;
  appearancePrompt: string;
  portraitUrl?: string;
  explorationSprite?: DirectionalSpriteBinding;
  stats: Stats;
  traits: Trait[];
  skills?: Skill[];
  occupation?: Occupation;
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
  inventory: Item[];
  equipped?: Record<string, Item | null>;
  title?: string;
  badge?: string;
  faction?: string;
  alignment?: string;
  backstory?: string;
  currentStory?: string;
  origin?: CharacterOrigin;
  parents?: { father: string | null; mother: string | null }; // legacy
  relationships?: CharacterRelationship[];
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

export interface QuestSeedConfig {
  premise: string;
  objective: string;
  stakes: string;
  tone: string;
  difficulty: 'low' | 'medium' | 'high' | 'deadly';
  runLength: 'short' | 'medium' | 'long';
  openness: 'guided' | 'balanced' | 'open';
  targetEndingCount: number;
  factionAnchorIds: string[];
  locationAnchorIds: string[];
  ecologyAnchorIds: string[];
  notes?: string;
}

export interface QuestNodeChoice {
  id: string;
  label: string;
  intent?: string;
  risk?: 'low' | 'medium' | 'high';
  tags?: string[];
}

export interface PendingQuestCombat {
  enemyIds: string[];
  encounterLabel: string;
  stakes: string;
}

export interface QuestNodeActor {
  id: string;
  name: string;
  role?: string;
  isHostile?: boolean;
  sourceType?: 'builder' | 'history' | 'quest';
  sourceId?: string;
}

export interface QuestNodeContextRef {
  kind: 'faction' | 'location' | 'ecology' | 'history' | 'character';
  id: string;
  label: string;
}

export interface QuestNode {
  id: string;
  act: 1 | 2 | 3;
  index: number;
  kind: 'scene' | 'dialogue' | 'decision' | 'combat' | 'ending';
  title: string;
  text: string;
  choices: QuestNodeChoice[];
  npcs: QuestNodeActor[];
  contextRefs: QuestNodeContextRef[];
  flags?: string[];
  pendingCombat?: PendingQuestCombat | null;
  endingId?: string;
}

export interface QuestArc {
  title: string;
  premise: string;
  acts: string[];
  recurringTensions: string[];
  endingTracks: Array<{
    id: string;
    title: string;
    description: string;
  }>;
  likelyNpcRoles: string[];
}

export interface QuestLogEntry {
  id: string;
  timestamp: number;
  nodeId?: string;
  kind: 'system' | 'node' | 'choice' | 'outcome' | 'combat' | 'ending';
  title: string;
  text: string;
  effects?: string[];
}

export interface CombatResolutionSummary {
  outcome: 'victory' | 'defeat' | 'cancelled';
  survivingPlayerIds: string[];
  defeatedEnemyIds: string[];
  playerSnapshots: Array<{
    id: string;
    hp: number;
    maxHp: number;
  }>;
  enemySnapshots: Array<{
    id: string;
    hp: number;
    maxHp: number;
  }>;
  turnCount?: number;
}

export interface QuestRunRecord {
  id: string;
  worldId: string;
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  title: string;
  summary: string;
  partyCharacterIds: string[];
  seed: QuestSeedConfig;
  arc: QuestArc;
  currentNode: QuestNode | null;
  nodeCount: number;
  maxNodeCount: number;
  flags: string[];
  endingReached?: string;
  log: QuestLogEntry[];
  currentEffects?: string[];
  pendingCombat?: PendingQuestCombat | null;
  lastOutcomeText?: string;
  selectedInfluences?: QuestNodeContextRef[];
}

export interface QuestRunSummary {
  id: string;
  worldId: string;
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  title: string;
  summary: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  partyCharacterIds: string[];
  nodeCount: number;
  endingReached?: string;
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
