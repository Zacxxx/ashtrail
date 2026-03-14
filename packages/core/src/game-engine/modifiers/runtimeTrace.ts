import type { GameplayEffect } from '../../types';
import type { ModifierDefinition, ModifierRuntimeTrace } from './canonical';

export function buildModifierRuntimeTrace(
  effect: GameplayEffect,
  definition: ModifierDefinition,
  rulesUsed: string[] = [],
  warnings: string[] = [],
): ModifierRuntimeTrace {
  return {
    legacy: {
      effectType: effect.type,
      target: effect.target,
      value: Number(effect.value || 0),
      duration: effect.duration,
      trigger: effect.trigger,
      scope: effect.scope,
    },
    canonical: {
      kind: definition.kind,
      scope: definition.scope,
      runtimeStatus: definition.runtimeStatus,
      target: definition.kind === 'stat' ? definition.target : undefined,
      phase: definition.kind === 'proc' ? definition.phase : undefined,
      stackGroup: definition.stacking?.group,
      stackMode: definition.stacking?.mode,
      tags: definition.kind === 'state' ? definition.state.tags : undefined,
    },
    rulesUsed,
    warnings,
  };
}
