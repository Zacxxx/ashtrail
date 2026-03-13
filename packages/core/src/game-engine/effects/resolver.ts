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
  resolvedTraitGrants: ResolvedTraitGrant[];
  talentTree?: TalentTree;
  unlockedNodes: TalentNode[];
  grantedTraitIds: string[];
  grantedSkillIds: string[];
}

export interface ResolvedTraitGrant {
  trait: Trait;
  sourceKind: 'trait' | 'occupation-base' | 'occupation-node' | 'legacy-occupation' | 'legacy-node';
  providerId: string;
  providerName: string;
  isSynthetic?: boolean;
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

function mergeUniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

const LEGACY_SKILL_ID_ALIASES: Record<string, string> = {
  slash: 'use-weapon',
};

const COMBAT_SKILL_PRIORITY: Record<string, number> = {
  'use-weapon': 0,
  'first-aid': 1,
};

export function canonicalizeSkillId(skillId: string): string {
  return LEGACY_SKILL_ID_ALIASES[skillId] || skillId;
}

export function sanitizeSkill(skill: Skill): Skill {
  const canonicalId = canonicalizeSkillId(skill.id);
  if (canonicalId === skill.id) {
    return skill;
  }

  return ALL_SKILLS.find((entry) => entry.id === canonicalId) || { ...skill, id: canonicalId };
}

export function prioritizeCombatSkills(skills: Skill[]): Skill[] {
  return skills
    .map((skill, index) => ({ skill, index }))
    .sort((left, right) => {
      const leftPriority = COMBAT_SKILL_PRIORITY[left.skill.id] ?? Number.MAX_SAFE_INTEGER;
      const rightPriority = COMBAT_SKILL_PRIORITY[right.skill.id] ?? Number.MAX_SAFE_INTEGER;
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return left.index - right.index;
    })
    .map(({ skill }) => skill);
}

export function sanitizeSkillLoadout(skills: Skill[]): Skill[] {
  return prioritizeCombatSkills(mergeUniqueById(skills.map(sanitizeSkill)));
}

function mergeUniqueTraitGrants(items: ResolvedTraitGrant[]): ResolvedTraitGrant[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.trait.id}:${item.sourceKind}:${item.providerId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createSyntheticTrait(config: {
  id: string;
  name: string;
  description: string;
  effects?: GameplayEffect[];
  grantsSkillIds?: string[];
  occupationId?: string;
  talentNodeId?: string;
}): Trait {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    cost: 0,
    type: 'neutral',
    effects: config.effects,
    grantsSkillIds: config.grantsSkillIds,
    source: {
      kind: 'temporary',
      occupationId: config.occupationId,
      talentNodeId: config.talentNodeId,
    },
  };
}

function resolveSkillIdsFromTraits(traits: Trait[]): string[] {
  return mergeUniqueStrings(traits.flatMap((trait) => trait.grantsSkillIds || []));
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
  const grantedTraitIds = mergeUniqueStrings(unlockedNodes.flatMap((node) => node.grantsTraitIds || []));
  const grantedTraits = grantedTraitIds
    .map((id) => getTraitByIdOrName(id))
    .filter((trait): trait is Trait => Boolean(trait));
  const grantedSkillIds = mergeUniqueStrings([
    ...unlockedNodes.flatMap((node) => node.grantsSkillIds || []),
    ...resolveSkillIdsFromTraits(grantedTraits),
  ]);

  return { tree, unlockedNodes, grantedTraitIds, grantedSkillIds };
}

export function resolveCharacterTraitGrants(source: EffectSource): {
  traits: Trait[];
  resolvedTraitGrants: ResolvedTraitGrant[];
  talentTree?: TalentTree;
  unlockedNodes: TalentNode[];
  grantedTraitIds: string[];
  grantedSkillIds: string[];
} {
  const occupationId = source.progression?.treeOccupationId || source.occupation?.id;
  const treeState = resolveOccupationTree(occupationId, source.progression?.unlockedTalentNodeIds || []);
  const resolvedTraitGrants: ResolvedTraitGrant[] = [];

  (source.traits || []).forEach((trait) => {
    resolvedTraitGrants.push({
      trait,
      sourceKind: 'trait',
      providerId: trait.id,
      providerName: trait.name,
    });
  });

  const occupationGrantedTraits = (source.occupation?.grantsTraitIds || [])
    .map((id) => getTraitByIdOrName(id))
    .filter((trait): trait is Trait => Boolean(trait));
  occupationGrantedTraits.forEach((trait) => {
    resolvedTraitGrants.push({
      trait,
      sourceKind: 'occupation-base',
      providerId: source.occupation?.id || trait.id,
      providerName: source.occupation?.name || trait.name,
    });
  });

  if (!source.occupation?.grantsTraitIds?.length && source.occupation?.effects?.length) {
    resolvedTraitGrants.push({
      trait: createSyntheticTrait({
        id: `legacy-${source.occupation.id}-baseline`,
        name: `${source.occupation.name} Baseline`,
        description: `Legacy occupation effects for ${source.occupation.name}.`,
        effects: source.occupation.effects,
        occupationId: source.occupation.id,
      }),
      sourceKind: 'legacy-occupation',
      providerId: source.occupation.id,
      providerName: source.occupation.name,
      isSynthetic: true,
    });
  }

  treeState.unlockedNodes.forEach((node) => {
    const nodeGrantedTraits = (node.grantsTraitIds || [])
      .map((id) => getTraitByIdOrName(id))
      .filter((trait): trait is Trait => Boolean(trait));
    nodeGrantedTraits.forEach((trait) => {
      resolvedTraitGrants.push({
        trait,
        sourceKind: 'occupation-node',
        providerId: node.id,
        providerName: node.name,
      });
    });

    const hasLegacyNodePayload = Boolean(node.effects?.length || node.grantsSkillIds?.length);
    if (!node.grantsTraitIds?.length && hasLegacyNodePayload) {
      resolvedTraitGrants.push({
        trait: createSyntheticTrait({
          id: `legacy-${occupationId || 'occupation'}-${node.id}`,
          name: node.name,
          description: node.description,
          effects: node.effects,
          grantsSkillIds: node.grantsSkillIds,
          occupationId,
          talentNodeId: node.id,
        }),
        sourceKind: 'legacy-node',
        providerId: node.id,
        providerName: node.name,
        isSynthetic: true,
      });
    }
  });

  const uniqueTraitGrants = mergeUniqueTraitGrants(resolvedTraitGrants);
  const traits = mergeUniqueById(uniqueTraitGrants.map((grant) => grant.trait));
  const grantedSkillIds = mergeUniqueStrings([
    treeState.grantedSkillIds,
    resolveSkillIdsFromTraits(traits),
  ].flat());

  return {
    traits,
    resolvedTraitGrants: uniqueTraitGrants,
    talentTree: treeState.tree,
    unlockedNodes: treeState.unlockedNodes,
    grantedTraitIds: treeState.grantedTraitIds,
    grantedSkillIds,
  };
}

export function resolveCharacterEffects(source: EffectSource, context: EffectResolutionContext = {}): ResolvedEffectState {
  const traitState = resolveCharacterTraitGrants(source);

  const matchedEffects: GameplayEffect[] = [];

  traitState.traits.forEach((trait) => collectPassiveEffects(trait.effects, context, matchedEffects));

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
    traits: traitState.traits,
    resolvedTraitGrants: traitState.resolvedTraitGrants,
    talentTree: traitState.talentTree,
    unlockedNodes: traitState.unlockedNodes,
    grantedTraitIds: traitState.grantedTraitIds,
    grantedSkillIds: traitState.grantedSkillIds,
  };
}

export function resolveCharacterSkills(character: Pick<Character, 'skills' | 'occupation' | 'progression' | 'traits'>): Skill[] {
  const persistedSkills = character.skills || [];
  const traitState = resolveCharacterTraitGrants({
    traits: character.traits,
    occupation: character.occupation,
    progression: character.progression,
  });
  const grantedSkills = traitState.grantedSkillIds
    .map((id) => ALL_SKILLS.find((skill) => skill.id === canonicalizeSkillId(id)))
    .filter((skill): skill is Skill => Boolean(skill));

  return sanitizeSkillLoadout([...persistedSkills, ...grantedSkills]);
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
