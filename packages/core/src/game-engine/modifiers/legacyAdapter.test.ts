import { describe, expect, test } from 'bun:test';
import type { GameplayEffect } from '../../types';
import { buildActiveModifierInstanceFromLegacyEffect, normalizeLegacyEffect } from './legacyAdapter';

function makeEffect(effect: Partial<GameplayEffect> = {}): GameplayEffect {
  return {
    id: 'effect-1',
    name: 'Sample Effect',
    type: 'STAT_MODIFIER',
    target: 'armor',
    value: 12,
    trigger: 'passive',
    ...effect,
  };
}

describe('legacyAdapter', () => {
  test('normalizes legacy aliases to canonical stat targets', () => {
    const normalized = normalizeLegacyEffect(makeEffect());
    expect(normalized.definition.kind).toBe('stat');
    if (normalized.definition.kind !== 'stat') throw new Error('expected stat');
    expect(normalized.definition.target).toBe('defense');
    expect(normalized.trace.warnings[0]).toContain('normalized');
  });

  test('maps stealth to canonical state with tags', () => {
    const normalized = normalizeLegacyEffect(makeEffect({
      type: 'STEALTH',
      target: undefined,
      value: 0,
      duration: 2,
    }));
    expect(normalized.definition.kind).toBe('state');
    if (normalized.definition.kind !== 'state') throw new Error('expected state');
    expect(normalized.definition.state.tags).toContain('stealth');
    expect(normalized.trace.rulesUsed).toEqual(['stealthBaseDuration', 'stealthScaleFactor']);
  });

  test('builds active modifier instances with runtime source metadata', () => {
    const instance = buildActiveModifierInstanceFromLegacyEffect(makeEffect({
      type: 'ANALYZED',
      target: undefined,
      duration: 2,
      currentStacks: 3,
      instanceId: 'runtime-1',
      sourceEntityId: 'enemy-1',
      applierId: 'player-1',
      skillId: 'analyze',
      appliedTurn: 4,
    }));
    expect(instance.instanceId).toBe('runtime-1');
    expect(instance.currentStacks).toBe(3);
    expect(instance.source?.sourceEntityId).toBe('enemy-1');
    expect(instance.source?.applierId).toBe('player-1');
    expect(instance.source?.skillId).toBe('analyze');
    expect(instance.appliedTurn).toBe(4);
  });
});
