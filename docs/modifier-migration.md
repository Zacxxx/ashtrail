# Modifier Migration Note

## What Changed

- Added an internal canonical modifier model shared across TypeScript and Rust:
  - `StatModifier`
  - `State`
  - `ProcEffect`
- Kept legacy `GameplayEffect` and legacy `EffectType` as supported input/output formats.
- Added legacy adapters and alias normalization:
  - `hp -> maxHp`
  - `ap -> maxAp`
  - `mp -> maxMp`
  - `armor -> defense`
  - `crit_rate -> critChance`
- Added runtime metadata on active effects:
  - `instanceId`
  - `currentStacks`
  - `appliedTurn`
  - `sourceEntityId`
  - `applierId`
  - `skillId`
  - `itemId`
  - `dispellable`
  - `dispelPriority`
  - `dispelGroup`

## Source Of Truth

- Rules constants and formulas: `packages/core/src/data/game_rules.json`
- Real combat application: Rust combat runtime in `apps/dev-tools/backend/src/combat_engine`
- UI: editor, inspection and documentation only
- Canonical modifier model: internal normalization layer, not storage source of truth
- Legacy data: still accepted and persisted during migration

## Runtime Status

Implemented:

- `WEAPON_DAMAGE_REPLACEMENT`
- `PROTECTION_STANCE`
- `STEALTH`
- `ANALYZED`
- `DAMAGE_OVER_TIME`
- `HEAL_OVER_TIME`
- canonical alias normalization
- source tracking on active combat effects
- stacking modes used by current combat content:
  - `replace`
  - `refreshDuration`
  - `stack`
  - `maxValue`
  - `minValue`
- dispel helpers:
  - by buff
  - by debuff
  - by group
  - by source
  - by tag
- cautious combat-side `STATUS_IMMUNITY` blocking

Planned:

- broader action-lock driven content
- wider proc phase coverage beyond currently used combat hooks
- larger TS/Rust parity coverage for every local preview path

Deprecated:

- `LORE_EFFECT` as a combat runtime mechanic

## Definition vs Active Instance

Definition:

- static
- editable
- persistable
- canonicalized from legacy input

Active instance:

- runtime-applied
- holds duration, stacks, source and transient flags
- remains serialized through legacy-compatible `GameplayEffect` fields for the combat protocol

## Rules Integration

Critical effects still read real rules values from the existing rules source:

- `WEAPON_DAMAGE_REPLACEMENT`
  - `damageVarianceMin`
  - `damageVarianceMax`
  - `strengthScalingMin`
  - `strengthScalingMax`
  - `strengthToPowerRatio`
  - `meleeScalingStat`
  - `rangedScalingStat`
- `STEALTH`
  - `stealthBaseDuration`
  - `stealthScaleFactor`
- `PROTECTION_STANCE`
  - `defendFailReduction`
  - `defendPartialReduction`
  - `defendPartialThreshold`
  - `defendSuccessReduction`
  - `defendSuccessThreshold`
- `ANALYZED`
  - `analyzeBaseCrit`
  - `analyzeIntelScale`

## Data Flow

`data/editor -> legacy adapter -> canonical modifier -> rules lookup -> combat runtime -> active effect state -> UI/debug`

## Risks Still Worth Watching

- local UI preview paths can still drift if new combat formulas are added only in Rust
- `STATUS_IMMUNITY` remains intentionally conservative to avoid breaking non-combat legacy meanings
- canonical storage migration is intentionally postponed until runtime behavior is stable over time
