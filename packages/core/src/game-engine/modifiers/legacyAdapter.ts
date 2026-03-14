import type { GameplayEffect } from '../../types';
import { canonicalizeEffectTarget } from './aliases';
import type {
  ActiveModifierInstance,
  ModifierDefinition,
  ModifierKind,
  ModifierScope,
  ModifierSourceRef,
  ModifierRuntimeTrace,
  Phase,
  StackMode,
} from './canonical';
import { buildModifierRuntimeTrace } from './runtimeTrace';

export interface LegacyNormalizationResult {
  definition: ModifierDefinition;
  trace: ModifierRuntimeTrace;
}

function mapScope(scope?: GameplayEffect['scope'], effectType?: GameplayEffect['type']): ModifierScope {
  if (effectType === 'LORE_EFFECT') return 'narrative';
  switch (scope) {
    case 'combat':
      return 'combat';
    case 'economy':
      return 'economy';
    default:
      return 'world';
  }
}

function inferRuntimeStatus(effect: GameplayEffect): 'implemented' | 'planned' | 'deprecated' {
  switch (effect.type) {
    case 'DAMAGE_OVER_TIME':
    case 'HEAL_OVER_TIME':
    case 'WEAPON_DAMAGE_REPLACEMENT':
    case 'PROTECTION_STANCE':
    case 'STEALTH':
    case 'ANALYZED':
      return 'implemented';
    case 'LORE_EFFECT':
      return 'deprecated';
    default:
      return 'implemented';
  }
}

function inferStatOp(effect: GameplayEffect): 'addFlat' | 'addPercent' {
  return effect.isPercentage || effect.stacking === 'multiplicative' ? 'addPercent' : 'addFlat';
}

function inferPhase(effect: GameplayEffect, fallback: Phase = 'onApply'): Phase {
  switch (effect.trigger) {
    case 'on_hit':
      return 'onHit';
    case 'on_turn_start':
      return 'startTurn';
    case 'on_turn_end':
      return 'endTurn';
    case 'on_defend':
      return 'beforeDamage';
    case 'on_kill':
      return 'afterDamage';
    default:
      return fallback;
  }
}

function inferStackGroup(effect: GameplayEffect): string | undefined {
  switch (effect.type) {
    case 'STEALTH':
      return 'state:stealth';
    case 'PROTECTION_STANCE':
      return 'state:guarded';
    case 'ANALYZED':
      return 'state:analyzed';
    case 'DAMAGE_OVER_TIME':
      return `dot:${canonicalizeEffectTarget(effect.target) || 'generic'}`;
    case 'HEAL_OVER_TIME':
      return `hot:${canonicalizeEffectTarget(effect.target) || 'generic'}`;
    default:
      return canonicalizeEffectTarget(effect.target);
  }
}

function inferStackMode(effect: GameplayEffect): StackMode | undefined {
  switch (effect.type) {
    case 'STEALTH':
    case 'PROTECTION_STANCE':
      return 'replace';
    case 'HEAL_OVER_TIME':
      return 'refreshDuration';
    case 'DAMAGE_OVER_TIME':
      return 'stack';
    default:
      return effect.stacking === 'multiplicative' ? 'maxValue' : 'stack';
  }
}

function inferRulesUsed(effect: GameplayEffect): string[] {
  switch (effect.type) {
    case 'WEAPON_DAMAGE_REPLACEMENT':
      return [
        'damageVarianceMin',
        'damageVarianceMax',
        'strengthScalingMin',
        'strengthScalingMax',
        'strengthToPowerRatio',
        'meleeScalingStat',
        'rangedScalingStat',
      ];
    case 'PROTECTION_STANCE':
      return [
        'defendFailReduction',
        'defendPartialReduction',
        'defendPartialThreshold',
        'defendSuccessReduction',
        'defendSuccessThreshold',
      ];
    case 'STEALTH':
      return ['stealthBaseDuration', 'stealthScaleFactor'];
    case 'ANALYZED':
      return ['analyzeBaseCrit', 'analyzeIntelScale'];
    default:
      return [];
  }
}

function inferWarnings(effect: GameplayEffect, target?: string): string[] {
  const warnings: string[] = [];
  if (effect.target && target && effect.target !== target) {
    warnings.push(`legacy target "${effect.target}" normalized to canonical target "${target}"`);
  }
  if (effect.type === 'STATUS_IMMUNITY' && effect.target) {
    warnings.push('legacy STATUS_IMMUNITY target preserved as params for backward compatibility');
  }
  return warnings;
}

export function normalizeLegacyEffect(effect: GameplayEffect): LegacyNormalizationResult {
  const target = canonicalizeEffectTarget(effect.target);
  const runtimeStatus = inferRuntimeStatus(effect);
  const scope = mapScope(effect.scope, effect.type);
  const stackGroup = inferStackGroup(effect);
  const stackMode = inferStackMode(effect);
  const warnings = inferWarnings(effect, target);
  const rulesUsed = inferRulesUsed(effect);
  const base = {
    id: effect.id || `legacy-${effect.type.toLowerCase()}-${effect.name || target || 'effect'}`,
    name: effect.name || effect.type,
    description: effect.description,
    scope,
    runtimeStatus,
    visibility: {
      label: effect.name || effect.type,
      icon: effect.icon,
      showInUI: true,
      showDuration: typeof effect.duration === 'number' && effect.duration > 0,
      showStacks: true,
      isBuff: Number(effect.value || 0) >= 0,
      isDebuff: Number(effect.value || 0) < 0,
    },
    duration: effect.duration ? {
      turns: effect.duration,
      tickTiming: effect.trigger === 'on_turn_end' ? 'endTurn' : 'startTurn',
    } : undefined,
    stacking: stackGroup || stackMode ? {
      group: stackGroup,
      mode: stackMode,
      maxStacks: effect.type === 'DAMAGE_OVER_TIME' ? 5 : undefined,
      priority: effect.type === 'WEAPON_DAMAGE_REPLACEMENT' ? 100 : undefined,
    } : undefined,
    dispel: {
      dispellable: effect.trigger !== 'passive',
      dispelPriority: effect.type === 'STEALTH' ? 50 : undefined,
      dispelGroup: stackGroup,
    },
    legacy: {
      effectType: effect.type,
      scope: effect.scope,
      originalTarget: effect.target,
      warnings,
    },
  } as const;

  let definition: ModifierDefinition;
  switch (effect.type) {
    case 'WEAPON_DAMAGE_REPLACEMENT':
      definition = {
        ...base,
        kind: 'proc',
        phase: 'beforeDamage',
        proc: {
          type: 'weaponDamageReplacement',
          params: {
            weaponSlot: 'mainHand',
            baseTarget: 'skillBaseDamage',
            damageTargetsAccepted: ['damage', 'physical_damage'],
            supportsRangedFixedDamage: true,
          },
        },
      };
      break;
    case 'PROTECTION_STANCE':
      definition = {
        ...base,
        kind: 'proc',
        phase: 'beforeDamage',
        proc: {
          type: 'protectionRedirect',
          params: {
            redirectMode: 'protectorIntercept',
            protectorSource: 'applier',
            usesRules: [
              'defendFailReduction',
              'defendPartialReduction',
              'defendPartialThreshold',
              'defendSuccessReduction',
              'defendSuccessThreshold',
            ],
            breaksStealthOnProtectorDamage: true,
          },
        },
      };
      break;
    case 'STEALTH':
      definition = {
        ...base,
        kind: 'state',
        state: {
          tags: ['invisible', 'stealth'],
          params: {
            breakOnDamageTaken: true,
            trackLastKnownPosition: true,
            durationFromRules: {
              base: 'stealthBaseDuration',
              scale: 'stealthScaleFactor',
              stat: 'wisdom',
            },
          },
        },
      };
      break;
    case 'ANALYZED':
      definition = {
        ...base,
        kind: 'state',
        state: {
          tags: ['marked', 'analyzed'],
          params: {
            critBonusFromRules: {
              base: 'analyzeBaseCrit',
              scale: 'analyzeIntelScale',
              stat: 'intelligence',
            },
          },
        },
      };
      break;
    case 'DAMAGE_OVER_TIME':
      definition = {
        ...base,
        kind: 'proc',
        phase: inferPhase(effect, 'startTurn'),
        proc: {
          type: 'damageOverTime',
          params: {
            damageType: target || 'damage',
            tickValue: Number(effect.value || 0),
            tickTiming: effect.trigger === 'on_turn_end' ? 'endTurn' : 'startTurn',
            stackMode,
            maxStacks: 5,
            tags: ['damage-over-time'],
          },
        },
      };
      break;
    case 'HEAL_OVER_TIME':
      definition = {
        ...base,
        kind: 'proc',
        phase: inferPhase(effect, 'startTurn'),
        proc: {
          type: 'healOverTime',
          params: {
            healValue: Number(effect.value || 0),
            tickTiming: effect.trigger === 'on_turn_end' ? 'endTurn' : 'startTurn',
            stackMode,
            maxStacks: 5,
            tags: ['heal-over-time'],
          },
        },
      };
      break;
    case 'STATUS_IMMUNITY':
      definition = {
        ...base,
        kind: 'state',
        state: {
          tags: ['status-immunity'],
          params: {
            legacyTargetModifiers: target ? [target] : [],
            blocks: target ? [{ kind: 'effectType', id: target }] : [],
          },
        },
      };
      break;
    case 'LORE_EFFECT':
      definition = {
        ...base,
        kind: 'state',
        scope: 'narrative',
        state: {
          tags: ['narrative', 'legacy-lore'],
          params: {
            legacyValue: effect.value,
          },
        },
      };
      break;
    default:
      definition = {
        ...base,
        kind: 'stat',
        target: target || 'unknown',
        op: inferStatOp(effect),
        value: Number(effect.value || 0),
      };
      break;
  }

  return {
    definition,
    trace: buildModifierRuntimeTrace(effect, definition, rulesUsed, warnings),
  };
}

export function buildActiveModifierInstanceFromLegacyEffect(
  effect: GameplayEffect,
  context: {
    source?: ModifierSourceRef;
    appliedTurn?: number;
    index?: number;
  } = {},
): ActiveModifierInstance {
  const { definition } = normalizeLegacyEffect(effect);
  const suffix = context.index ?? 0;
  return {
    instanceId: effect.instanceId || context.source?.instanceId || `${definition.id}:instance:${suffix}`,
    definitionId: definition.id,
    definition,
    source: {
      sourceEntityId: effect.sourceEntityId || context.source?.sourceEntityId,
      applierId: effect.applierId || context.source?.applierId,
      skillId: effect.skillId || context.source?.skillId,
      itemId: effect.itemId || context.source?.itemId,
      instanceId: effect.instanceId || context.source?.instanceId,
    },
    remainingDuration: effect.duration,
    currentStacks: effect.currentStacks || 1,
    justApplied: effect.justApplied,
    appliedTurn: effect.appliedTurn ?? context.appliedTurn,
    lastKnownPosition: effect.lastKnownPosition,
    protectorId: effect.protectorId,
  };
}

export function getModifierKindFromLegacyEffect(effect: GameplayEffect): ModifierKind {
  return normalizeLegacyEffect(effect).definition.kind;
}
