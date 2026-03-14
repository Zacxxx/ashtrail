import type { EffectScope, EffectType, GameplayEffect } from '../../types';

export type RuntimeStatus = 'implemented' | 'planned' | 'deprecated';
export type ModifierKind = 'stat' | 'state' | 'proc';
export type ModifierScope = 'combat' | 'world' | 'economy' | 'narrative';
export type StackMode = 'stack' | 'replace' | 'refreshDuration' | 'maxValue' | 'minValue';
export type StatOp = 'addFlat' | 'addPercent' | 'mul' | 'override' | 'clampMin' | 'clampMax';
export type Phase =
  | 'onApply'
  | 'startTurn'
  | 'beforeAction'
  | 'onHit'
  | 'onDamaged'
  | 'beforeDamage'
  | 'afterDamage'
  | 'endTurn'
  | 'onRemove';

export interface ModifierSourceRef {
  sourceEntityId?: string;
  applierId?: string;
  skillId?: string;
  itemId?: string;
  instanceId?: string;
}

export interface ModifierVisibility {
  label?: string;
  icon?: string;
  showInUI?: boolean;
  showDuration?: boolean;
  showStacks?: boolean;
  isBuff?: boolean;
  isDebuff?: boolean;
}

export interface ModifierDuration {
  turns?: number;
  tickTiming?: 'startTurn' | 'endTurn';
}

export interface ModifierStacking {
  group?: string;
  mode?: StackMode;
  maxStacks?: number;
  priority?: number;
}

export interface ModifierDispel {
  dispellable?: boolean;
  dispelPriority?: number;
  dispelGroup?: string;
}

export interface LegacyModifierMetadata {
  effectType: EffectType;
  scope?: EffectScope;
  originalTarget?: string;
  warnings?: string[];
}

export interface ModifierDefinitionBase {
  id: string;
  name: string;
  description?: string;
  kind: ModifierKind;
  scope: ModifierScope;
  runtimeStatus: RuntimeStatus;
  source?: ModifierSourceRef;
  visibility?: ModifierVisibility;
  duration?: ModifierDuration;
  stacking?: ModifierStacking;
  dispel?: ModifierDispel;
  legacy?: LegacyModifierMetadata;
}

export interface StateBlockRule {
  kind: 'stateTag' | 'effectType' | 'action';
  id: string;
}

export interface WeaponDamageReplacementProcData {
  weaponSlot: 'mainHand';
  baseTarget: 'skillBaseDamage';
  damageTargetsAccepted: string[];
  supportsRangedFixedDamage: boolean;
}

export interface ProtectionRedirectProcData {
  redirectMode: 'protectorIntercept';
  protectorSource: 'applier';
  usesRules: Array<
    | 'defendFailReduction'
    | 'defendPartialReduction'
    | 'defendPartialThreshold'
    | 'defendSuccessReduction'
    | 'defendSuccessThreshold'
  >;
  breaksStealthOnProtectorDamage: boolean;
}

export interface StealthStateData {
  tags: string[];
  breakOnDamageTaken: boolean;
  trackLastKnownPosition: boolean;
  durationFromRules: {
    base: 'stealthBaseDuration';
    scale: 'stealthScaleFactor';
    stat: 'wisdom';
  };
}

export interface AnalyzedStateData {
  tags: string[];
  critBonusFromRules: {
    base: 'analyzeBaseCrit';
    scale: 'analyzeIntelScale';
    stat: 'intelligence';
  };
}

export interface DotEffectData {
  damageType: string;
  tickValue: number;
  tickTiming: 'startTurn' | 'endTurn';
  scaling?: string;
  stackMode?: StackMode;
  maxStacks?: number;
  tags: string[];
}

export interface HotEffectData {
  healValue: number;
  tickTiming: 'startTurn' | 'endTurn';
  scaling?: string;
  stackMode?: StackMode;
  maxStacks?: number;
  tags: string[];
}

export interface StatusImmunityStateData {
  tags: string[];
  blocks?: StateBlockRule[];
  legacyTargetModifiers?: string[];
}

export interface StateModifierDefinition extends ModifierDefinitionBase {
  kind: 'state';
  state: {
    tags: string[];
    blocks?: StateBlockRule[];
    params?: Record<string, unknown>;
  };
}

export interface StatModifierDefinition extends ModifierDefinitionBase {
  kind: 'stat';
  target: string;
  op: StatOp;
  value: number;
}

export interface ProcModifierDefinition extends ModifierDefinitionBase {
  kind: 'proc';
  phase: Phase;
  proc: {
    type: string;
    params: Record<string, unknown>;
  };
}

export type ModifierDefinition =
  | StatModifierDefinition
  | StateModifierDefinition
  | ProcModifierDefinition;

export interface ModifierRuntimeTrace {
  legacy: {
    effectType: EffectType;
    target?: string;
    value: number;
    duration?: number;
    trigger?: GameplayEffect['trigger'];
    scope?: EffectScope;
  };
  canonical: {
    kind: ModifierKind;
    scope: ModifierScope;
    runtimeStatus: RuntimeStatus;
    target?: string;
    phase?: Phase;
    stackGroup?: string;
    stackMode?: StackMode;
    tags?: string[];
  };
  rulesUsed: string[];
  warnings: string[];
}

export interface ActiveModifierInstance {
  instanceId: string;
  definitionId: string;
  definition: ModifierDefinition;
  source?: ModifierSourceRef;
  remainingDuration?: number;
  currentStacks: number;
  justApplied?: boolean;
  appliedTurn?: number;
  lastKnownPosition?: { row: number; col: number };
  protectorId?: string;
}
