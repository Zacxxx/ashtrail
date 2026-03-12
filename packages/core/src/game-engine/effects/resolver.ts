import { ALL_SKILLS, ALL_TRAITS, TALENT_TREE_LOOKUP } from '../../content';
import {
  Character,
  CharacterProgression,
  GameplayEffect,
  Item,
  Occupation,
  ResourceType,
  Resources,
  Skill,
  TalentNode,
  TalentTree,
  Trait,
} from '../../types';
import { isSupportedEffectTarget } from './catalog';

export interface EffectResolutionContext {
  scope?: 'combat' | 'travel' | 'exploration' | 'camp' | 'economy' | 'social' | 'global';
  timeOfDay?: 'day' | 'night';
  locationKind?: 'settlement' | 'road' | 'ruins' | 'combat';
  currentHpPct?: number;
  isAlone?: boolean;
  resources?: Partial<Resources>;
}

export interface EffectSource {
  traits?: Trait[];
  occupation?: Occupation;
  progression?: CharacterProgression;
  equipped?: Record<string, Item | null | undefined> | null;
  activeEffects?: GameplayEffect[] | null;
  skills?: Skill[];
}

export interface ResolvedModifier {
  flat: number;
  multiplier: number;
  sources: GameplayEffect[];
}

export interface ResolvedEffectState {
  modifiers: Record<string, ResolvedModifier>;
  matchedEffects: GameplayEffect[];
  traits: Trait[];
  talentTree?: TalentTree;
  unlockedNodes: TalentNode[];
  grantedTraitIds: string[];
  grantedSkillIds: string[];
}

function createModifier(): ResolvedModifier {
  return { flat: 0, multiplier: 1, sources: [] };
}

export function applyResolvedModifier(baseValue: number, modifier?: ResolvedModifier): number {
  if (!modifier) return baseValue;
  return (baseValue + modifier.flat) * modifier.multiplier;
}

function getTraitByIdOrName(idOrName: string): Trait | undefined {
  return ALL_TRAITS.find((trait) => trait.id === idOrName || trait.name.toLowerCase() === idOrName.toLowerCase());
}

function mergeUniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function matchesCondition(effect: GameplayEffect, context: EffectResolutionContext): boolean {
  const { condition } = effect;
  if (!condition) return true;
  if (condition.timeOfDay && context.timeOfDay && condition.timeOfDay !== context.timeOfDay) return false;
  if (condition.locationKind && context.locationKind && condition.locationKind !== context.locationKind) return false;
  if (typeof condition.hpBelowPct === 'number' && typeof context.currentHpPct === 'number' && context.currentHpPct >= condition.hpBelowPct) return false;
  if (typeof condition.isAlone === 'boolean' && typeof context.isAlone === 'boolean' && condition.isAlone !== context.isAlone) return false;
  if (condition.resourceBelow) {
    const currentAmount = context.resources?.[condition.resourceBelow.type] ?? Number.POSITIVE_INFINITY;
    if (currentAmount >= condition.resourceBelow.amount) return false;
  }
  return true;
}

function matchesScope(effect: GameplayEffect, context: EffectResolutionContext): boolean {
  if (!effect.scope || effect.scope === 'global') return true;
  return !context.scope || effect.scope === context.scope;
}

function collectPassiveEffects(effects: GameplayEffect[] | undefined, context: EffectResolutionContext, target: GameplayEffect[]) {
  if (!effects?.length) return;
  effects.forEach((effect) => {
    if (effect.trigger && effect.trigger !== 'passive') return;
    if (!matchesScope(effect, context) || !matchesCondition(effect, context)) return;
    target.push(effect);
  });
}

function collectTransientEffects(effects: GameplayEffect[] | undefined, context: EffectResolutionContext, target: GameplayEffect[]) {
  if (!effects?.length) return;
  effects.forEach((effect) => {
    if (!matchesScope(effect, context) || !matchesCondition(effect, context)) return;
    target.push(effect);
  });
}

export function resolveOccupationTree(occupationId?: string, unlockedTalentNodeIds: string[] = []): {
  tree?: TalentTree;
  unlockedNodes: TalentNode[];
  grantedTraitIds: string[];
  grantedSkillIds: string[];
} {
  if (!occupationId) {
    return { unlockedNodes: [], grantedTraitIds: [], grantedSkillIds: [] };
  }

  const tree = TALENT_TREE_LOOKUP[occupationId];
  if (!tree) {
    return { unlockedNodes: [], grantedTraitIds: [], grantedSkillIds: [] };
  }

  const unlockedSet = new Set(unlockedTalentNodeIds);
  const unlockedNodes = tree.nodes.filter((node) => unlockedSet.has(node.id));
  const grantedTraitIds = unlockedNodes.flatMap((node) => node.grantsTraitIds || []);
  const grantedSkillIds = unlockedNodes.flatMap((node) => node.grantsSkillIds || []);

  return { tree, unlockedNodes, grantedTraitIds, grantedSkillIds };
}

export function resolveCharacterEffects(source: EffectSource, context: EffectResolutionContext = {}): ResolvedEffectState {
  const occupationId = source.progression?.treeOccupationId || source.occupation?.id;
  const treeState = resolveOccupationTree(occupationId, source.progression?.unlockedTalentNodeIds || []);
  const baseTraits = source.traits || [];
  const grantedTraits = treeState.grantedTraitIds
    .map((id) => getTraitByIdOrName(id))
    .filter((trait): trait is Trait => Boolean(trait));
  const resolvedTraits = mergeUniqueById([...baseTraits, ...grantedTraits]);

  const matchedEffects: GameplayEffect[] = [];

  resolvedTraits.forEach((trait) => collectPassiveEffects(trait.effects, context, matchedEffects));
  collectPassiveEffects(source.occupation?.effects, context, matchedEffects);
  treeState.unlockedNodes.forEach((node) => collectPassiveEffects(node.effects, context, matchedEffects));

  Object.values(source.equipped || {}).forEach((item) => {
    if (!item) return;
    collectPassiveEffects(item.effects, context, matchedEffects);
  });

  collectTransientEffects(source.activeEffects || undefined, context, matchedEffects);

  const modifiers: Record<string, ResolvedModifier> = {};
  matchedEffects.forEach((effect) => {
    if (!effect.target || !isSupportedEffectTarget(effect.target)) return;
    const modifier = modifiers[effect.target] || (modifiers[effect.target] = createModifier());
    const value = Number(effect.value || 0);
    if (effect.isPercentage || effect.stacking === 'multiplicative') {
      modifier.multiplier *= 1 + (value / 100);
    } else {
      modifier.flat += value;
    }
    modifier.sources.push(effect);
  });

  return {
    modifiers,
    matchedEffects,
    traits: resolvedTraits,
    talentTree: treeState.tree,
    unlockedNodes: treeState.unlockedNodes,
    grantedTraitIds: treeState.grantedTraitIds,
    grantedSkillIds: treeState.grantedSkillIds,
  };
}

export function resolveCharacterSkills(character: Pick<Character, 'skills' | 'occupation' | 'progression'>): Skill[] {
  const persistedSkills = character.skills || [];
  const treeState = resolveOccupationTree(
    character.progression?.treeOccupationId || character.occupation?.id,
    character.progression?.unlockedTalentNodeIds || [],
  );
  const grantedSkills = treeState.grantedSkillIds
    .map((id) => ALL_SKILLS.find((skill) => skill.id === id))
    .filter((skill): skill is Skill => Boolean(skill));

  return mergeUniqueById([...persistedSkills, ...grantedSkills]);
}

export function resolveCrewMemberTraits(traitIds: string[]): Trait[] {
  return mergeUniqueById(
    traitIds
      .map((id) => getTraitByIdOrName(id))
      .filter((trait): trait is Trait => Boolean(trait)),
  );
}

export function getModifierValue(
  state: ResolvedEffectState,
  target: string,
  baseValue: number = 0,
): number {
  return applyResolvedModifier(baseValue, state.modifiers[target]);
}

export function resolveMetricScalar(
  state: ResolvedEffectState,
  target: string,
  defaultScalar: number = 1,
): number {
  return applyResolvedModifier(defaultScalar, state.modifiers[target]);
}

export function getResourceAmount(resources: Partial<Resources>, type: ResourceType): number {
  return Math.max(0, Number(resources[type] || 0));
}

export function getDefaultTalentPointsForLevel(level: number): number {
  const normalizedLevel = Math.max(1, Math.floor(level || 1));
  return 2 + Math.floor(Math.max(0, normalizedLevel - 1) / 2);
}
