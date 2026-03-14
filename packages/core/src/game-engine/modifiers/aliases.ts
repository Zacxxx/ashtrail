export const LEGACY_EFFECT_TARGET_ALIASES: Record<string, string> = {
  hp: 'maxHp',
  ap: 'maxAp',
  mp: 'maxMp',
  armor: 'defense',
  crit_rate: 'critChance',
};

export const CANONICAL_EFFECT_TARGET_ALIASES: Record<string, string[]> = Object.entries(
  LEGACY_EFFECT_TARGET_ALIASES,
).reduce<Record<string, string[]>>((acc, [legacyTarget, canonicalTarget]) => {
  const bucket = acc[canonicalTarget] || [];
  bucket.push(legacyTarget);
  acc[canonicalTarget] = bucket;
  return acc;
}, {});

export function canonicalizeEffectTarget(target?: string | null): string | undefined {
  if (!target) return undefined;
  return LEGACY_EFFECT_TARGET_ALIASES[target] || target;
}

export function getLegacyAliasesForCanonicalTarget(target?: string | null): string[] {
  if (!target) return [];
  return CANONICAL_EFFECT_TARGET_ALIASES[target] || [];
}
