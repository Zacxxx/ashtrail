use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::types::{EffectScope, EffectTrigger, EffectType, GameplayEffect, GridPos};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RuntimeStatus {
    Implemented,
    Planned,
    Deprecated,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ModifierKind {
    Stat,
    State,
    Proc,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ModifierScope {
    Combat,
    World,
    Economy,
    Narrative,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum StackMode {
    Stack,
    Replace,
    RefreshDuration,
    MaxValue,
    MinValue,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum StatOp {
    AddFlat,
    AddPercent,
    Mul,
    Override,
    ClampMin,
    ClampMax,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    OnApply,
    StartTurn,
    BeforeAction,
    OnHit,
    OnDamaged,
    BeforeDamage,
    AfterDamage,
    EndTurn,
    OnRemove,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModifierDefinitionBase {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub scope: ModifierScope,
    pub runtime_status: RuntimeStatus,
    pub legacy_effect_type: EffectType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub legacy_target: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_turns: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stack_group: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stack_mode: Option<StackMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_stacks: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stack_priority: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dispellable: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dispel_priority: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dispel_group: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StatModifierDefinition {
    #[serde(flatten)]
    pub base: ModifierDefinitionBase,
    pub target: String,
    pub op: StatOp,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StateModifierDefinition {
    #[serde(flatten)]
    pub base: ModifierDefinitionBase,
    pub tags: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub blocks: Vec<StateBlockRule>,
    #[serde(default, skip_serializing_if = "Value::is_null")]
    pub params: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProcModifierDefinition {
    #[serde(flatten)]
    pub base: ModifierDefinitionBase,
    pub phase: Phase,
    pub proc_type: String,
    #[serde(default, skip_serializing_if = "Value::is_null")]
    pub params: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum ModifierDefinition {
    Stat(StatModifierDefinition),
    State(StateModifierDefinition),
    Proc(ProcModifierDefinition),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StateBlockRule {
    pub kind: String,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModifierTrace {
    pub rules_used: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedLegacyEffect {
    pub definition: ModifierDefinition,
    pub trace: ModifierTrace,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActiveModifierInstance {
    pub instance_id: String,
    pub definition: ModifierDefinition,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_entity_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub applier_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skill_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub item_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remaining_duration: Option<u32>,
    pub current_stacks: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub just_applied: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub applied_turn: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub protector_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_known_position: Option<GridPos>,
}

pub fn canonicalize_effect_target(target: Option<&str>) -> Option<String> {
    match target {
        Some("hp") => Some("maxHp".to_string()),
        Some("ap") => Some("maxAp".to_string()),
        Some("mp") => Some("maxMp".to_string()),
        Some("armor") => Some("defense".to_string()),
        Some("crit_rate") => Some("critChance".to_string()),
        Some(value) => Some(value.to_string()),
        None => None,
    }
}

fn map_scope(scope: Option<EffectScope>, effect_type: EffectType) -> ModifierScope {
    if effect_type == EffectType::LoreEffect {
        return ModifierScope::Narrative;
    }

    match scope {
        Some(EffectScope::Combat) => ModifierScope::Combat,
        Some(EffectScope::Economy) => ModifierScope::Economy,
        _ => ModifierScope::World,
    }
}

fn infer_runtime_status(effect_type: EffectType) -> RuntimeStatus {
    match effect_type {
        EffectType::LoreEffect => RuntimeStatus::Deprecated,
        _ => RuntimeStatus::Implemented,
    }
}

fn infer_stack_group(effect: &GameplayEffect) -> Option<String> {
    match effect.effect_type {
        EffectType::Stealth => Some("state:stealth".to_string()),
        EffectType::ProtectionStance => Some("state:guarded".to_string()),
        EffectType::Analyzed => Some("state:analyzed".to_string()),
        EffectType::DamageOverTime => Some(format!(
            "dot:{}",
            canonicalize_effect_target(effect.target.as_deref())
                .unwrap_or_else(|| "generic".to_string())
        )),
        EffectType::HealOverTime => Some(format!(
            "hot:{}",
            canonicalize_effect_target(effect.target.as_deref())
                .unwrap_or_else(|| "generic".to_string())
        )),
        _ => canonicalize_effect_target(effect.target.as_deref()),
    }
}

fn infer_stack_mode(effect: &GameplayEffect) -> Option<StackMode> {
    match effect.effect_type {
        EffectType::Stealth | EffectType::ProtectionStance => Some(StackMode::Replace),
        EffectType::HealOverTime => Some(StackMode::RefreshDuration),
        EffectType::DamageOverTime => Some(StackMode::Stack),
        _ => match effect.stacking {
            Some(super::types::EffectStacking::Multiplicative) => Some(StackMode::MaxValue),
            Some(super::types::EffectStacking::Additive) => Some(StackMode::Stack),
            None => None,
        },
    }
}

fn infer_max_stacks(effect: &GameplayEffect) -> Option<u32> {
    match effect.effect_type {
        EffectType::Stealth | EffectType::ProtectionStance | EffectType::Analyzed => Some(1),
        EffectType::DamageOverTime | EffectType::HealOverTime => Some(5),
        _ => None,
    }
}

fn infer_stack_priority(effect: &GameplayEffect) -> Option<i32> {
    match effect.effect_type {
        EffectType::WeaponDamageReplacement => Some(100),
        EffectType::ProtectionStance => Some(80),
        EffectType::Stealth => Some(50),
        _ => None,
    }
}

fn infer_dispellable(effect: &GameplayEffect) -> bool {
    effect
        .dispellable
        .unwrap_or(effect.trigger != Some(EffectTrigger::Passive))
}

fn infer_dispel_priority(effect: &GameplayEffect) -> Option<i32> {
    effect.dispel_priority.or(match effect.effect_type {
        EffectType::Stealth => Some(50),
        EffectType::ProtectionStance => Some(40),
        EffectType::Analyzed => Some(20),
        _ => None,
    })
}

fn infer_dispel_group(effect: &GameplayEffect) -> Option<String> {
    effect
        .dispel_group
        .clone()
        .or_else(|| infer_stack_group(effect))
}

fn infer_phase(effect: &GameplayEffect, fallback: Phase) -> Phase {
    match effect.trigger {
        Some(EffectTrigger::OnHit) => Phase::OnHit,
        Some(EffectTrigger::OnTurnStart) => Phase::StartTurn,
        Some(EffectTrigger::OnTurnEnd) => Phase::EndTurn,
        Some(EffectTrigger::OnDefend) => Phase::BeforeDamage,
        Some(EffectTrigger::OnKill) => Phase::AfterDamage,
        _ => fallback,
    }
}

fn infer_rules_used(effect_type: EffectType) -> Vec<String> {
    match effect_type {
        EffectType::WeaponDamageReplacement => vec![
            "damageVarianceMin".to_string(),
            "damageVarianceMax".to_string(),
            "strengthScalingMin".to_string(),
            "strengthScalingMax".to_string(),
            "strengthToPowerRatio".to_string(),
            "meleeScalingStat".to_string(),
            "rangedScalingStat".to_string(),
        ],
        EffectType::ProtectionStance => vec![
            "defendFailReduction".to_string(),
            "defendPartialReduction".to_string(),
            "defendPartialThreshold".to_string(),
            "defendSuccessReduction".to_string(),
            "defendSuccessThreshold".to_string(),
        ],
        EffectType::Stealth => vec![
            "stealthBaseDuration".to_string(),
            "stealthScaleFactor".to_string(),
        ],
        EffectType::Analyzed => vec![
            "analyzeBaseCrit".to_string(),
            "analyzeIntelScale".to_string(),
        ],
        _ => Vec::new(),
    }
}

pub fn normalize_legacy_effect(effect: &GameplayEffect) -> NormalizedLegacyEffect {
    let normalized_target = canonicalize_effect_target(effect.target.as_deref());
    let mut warnings = Vec::new();
    if effect.target.as_deref() != normalized_target.as_deref() {
        if let (Some(legacy), Some(canonical)) =
            (effect.target.as_deref(), normalized_target.as_deref())
        {
            warnings.push(format!(
                "legacy target \"{}\" normalized to canonical target \"{}\"",
                legacy, canonical
            ));
        }
    }

    if effect.effect_type == EffectType::StatusImmunity && normalized_target.is_some() {
        warnings.push(
            "legacy STATUS_IMMUNITY target preserved as params for backward compatibility"
                .to_string(),
        );
    }

    let base = ModifierDefinitionBase {
        id: effect.id.clone().unwrap_or_else(|| {
            format!(
                "legacy-{}-{}",
                format!("{:?}", effect.effect_type).to_lowercase(),
                effect
                    .name
                    .clone()
                    .or_else(|| normalized_target.clone())
                    .unwrap_or_else(|| "effect".to_string())
            )
        }),
        name: effect
            .name
            .clone()
            .unwrap_or_else(|| format!("{:?}", effect.effect_type)),
        description: effect.description.clone(),
        scope: map_scope(effect.scope.clone(), effect.effect_type.clone()),
        runtime_status: infer_runtime_status(effect.effect_type.clone()),
        legacy_effect_type: effect.effect_type.clone(),
        legacy_target: effect.target.clone(),
        duration_turns: effect.duration,
        stack_group: infer_stack_group(effect),
        stack_mode: infer_stack_mode(effect),
        max_stacks: infer_max_stacks(effect),
        stack_priority: infer_stack_priority(effect),
        dispellable: Some(infer_dispellable(effect)),
        dispel_priority: infer_dispel_priority(effect),
        dispel_group: infer_dispel_group(effect),
        icon: effect.icon.clone(),
    };

    let definition = match effect.effect_type {
        EffectType::WeaponDamageReplacement => ModifierDefinition::Proc(ProcModifierDefinition {
            base,
            phase: Phase::BeforeDamage,
            proc_type: "weaponDamageReplacement".to_string(),
            params: json!({
                "weaponSlot": "mainHand",
                "baseTarget": "skillBaseDamage",
                "damageTargetsAccepted": ["damage", "physical_damage"],
                "supportsRangedFixedDamage": true
            }),
        }),
        EffectType::ProtectionStance => ModifierDefinition::Proc(ProcModifierDefinition {
            base,
            phase: Phase::BeforeDamage,
            proc_type: "protectionRedirect".to_string(),
            params: json!({
                "redirectMode": "protectorIntercept",
                "protectorSource": "applier",
                "usesRules": [
                    "defendFailReduction",
                    "defendPartialReduction",
                    "defendPartialThreshold",
                    "defendSuccessReduction",
                    "defendSuccessThreshold"
                ],
                "breaksStealthOnProtectorDamage": true
            }),
        }),
        EffectType::Stealth => ModifierDefinition::State(StateModifierDefinition {
            base,
            tags: vec!["invisible".to_string(), "stealth".to_string()],
            blocks: Vec::new(),
            params: json!({
                "breakOnDamageTaken": true,
                "trackLastKnownPosition": true,
                "durationFromRules": {
                    "base": "stealthBaseDuration",
                    "scale": "stealthScaleFactor",
                    "stat": "wisdom"
                }
            }),
        }),
        EffectType::Analyzed => ModifierDefinition::State(StateModifierDefinition {
            base,
            tags: vec!["marked".to_string(), "analyzed".to_string()],
            blocks: Vec::new(),
            params: json!({
                "critBonusFromRules": {
                    "base": "analyzeBaseCrit",
                    "scale": "analyzeIntelScale",
                    "stat": "intelligence"
                }
            }),
        }),
        EffectType::DamageOverTime => ModifierDefinition::Proc(ProcModifierDefinition {
            base,
            phase: infer_phase(effect, Phase::StartTurn),
            proc_type: "damageOverTime".to_string(),
            params: json!({
                "damageType": normalized_target.clone().unwrap_or_else(|| "damage".to_string()),
                "tickValue": effect.value,
                "tickTiming": if effect.trigger == Some(EffectTrigger::OnTurnEnd) { "endTurn" } else { "startTurn" },
                "tags": ["damage-over-time"]
            }),
        }),
        EffectType::HealOverTime => ModifierDefinition::Proc(ProcModifierDefinition {
            base,
            phase: infer_phase(effect, Phase::StartTurn),
            proc_type: "healOverTime".to_string(),
            params: json!({
                "healValue": effect.value,
                "tickTiming": if effect.trigger == Some(EffectTrigger::OnTurnEnd) { "endTurn" } else { "startTurn" },
                "tags": ["heal-over-time"]
            }),
        }),
        EffectType::StatusImmunity => ModifierDefinition::State(StateModifierDefinition {
            base,
            tags: vec!["status-immunity".to_string()],
            blocks: normalized_target
                .clone()
                .map(|target| {
                    vec![StateBlockRule {
                        kind: "effectType".to_string(),
                        id: target,
                    }]
                })
                .unwrap_or_default(),
            params: json!({
                "legacyTargetModifiers": normalized_target.clone().map(|target| vec![target]).unwrap_or_default()
            }),
        }),
        EffectType::LoreEffect => ModifierDefinition::State(StateModifierDefinition {
            base,
            tags: vec!["narrative".to_string(), "legacy-lore".to_string()],
            blocks: Vec::new(),
            params: json!({ "legacyValue": effect.value }),
        }),
        _ => ModifierDefinition::Stat(StatModifierDefinition {
            base,
            target: normalized_target.unwrap_or_else(|| "unknown".to_string()),
            op: if effect.is_percentage == Some(true)
                || effect.stacking == Some(super::types::EffectStacking::Multiplicative)
            {
                StatOp::AddPercent
            } else {
                StatOp::AddFlat
            },
            value: effect.value,
        }),
    };

    NormalizedLegacyEffect {
        definition,
        trace: ModifierTrace {
            rules_used: infer_rules_used(effect.effect_type.clone()),
            warnings,
        },
    }
}

pub fn build_active_modifier_instance(
    effect: &GameplayEffect,
    effect_index: usize,
) -> ActiveModifierInstance {
    let normalized = normalize_legacy_effect(effect);
    ActiveModifierInstance {
        instance_id: effect
            .instance_id
            .clone()
            .or_else(|| effect.id.clone())
            .clone()
            .map(|id| format!("{}:{}", id, effect_index))
            .unwrap_or_else(|| format!("legacy-instance-{}", effect_index)),
        definition: normalized.definition,
        source_entity_id: effect.source_entity_id.clone(),
        applier_id: effect.applier_id.clone(),
        skill_id: effect.skill_id.clone(),
        item_id: effect.item_id.clone(),
        remaining_duration: effect.duration,
        current_stacks: effect.current_stacks.unwrap_or(1),
        just_applied: effect.just_applied,
        applied_turn: effect.applied_turn,
        protector_id: effect.protector_id.clone(),
        last_known_position: effect.last_known_position.clone(),
    }
}

fn legacy_effect_type_id(effect_type: &EffectType) -> &'static str {
    match effect_type {
        EffectType::StatModifier => "STAT_MODIFIER",
        EffectType::CombatBonus => "COMBAT_BONUS",
        EffectType::ResourceModifier => "RESOURCE_MODIFIER",
        EffectType::ExplorationBonus => "EXPLORATION_BONUS",
        EffectType::DamageOverTime => "DAMAGE_OVER_TIME",
        EffectType::HealOverTime => "HEAL_OVER_TIME",
        EffectType::StatusImmunity => "STATUS_IMMUNITY",
        EffectType::ActionModifier => "ACTION_MODIFIER",
        EffectType::WeaponDamageReplacement => "WEAPON_DAMAGE_REPLACEMENT",
        EffectType::ProtectionStance => "PROTECTION_STANCE",
        EffectType::Stealth => "STEALTH",
        EffectType::Analyzed => "ANALYZED",
        EffectType::LoreEffect => "LORE_EFFECT",
    }
}

pub fn effect_stack_group(effect: &GameplayEffect) -> Option<String> {
    normalize_legacy_effect(effect)
        .definition
        .base()
        .stack_group()
        .cloned()
}

pub fn effect_stack_mode(effect: &GameplayEffect) -> Option<StackMode> {
    normalize_legacy_effect(effect).definition.base().stack_mode
}

pub fn effect_max_stacks(effect: &GameplayEffect) -> Option<u32> {
    normalize_legacy_effect(effect).definition.base().max_stacks
}

pub fn effect_is_dispellable(effect: &GameplayEffect) -> bool {
    normalize_legacy_effect(effect)
        .definition
        .base()
        .dispellable
        .unwrap_or(true)
}

pub fn effect_dispel_group(effect: &GameplayEffect) -> Option<String> {
    normalize_legacy_effect(effect)
        .definition
        .base()
        .dispel_group
        .clone()
}

pub fn effect_tags(effect: &GameplayEffect) -> Vec<String> {
    match normalize_legacy_effect(effect).definition {
        ModifierDefinition::State(StateModifierDefinition { tags, .. }) => tags,
        ModifierDefinition::Proc(ProcModifierDefinition {
            proc_type, params, ..
        }) => {
            let mut tags = params
                .get("tags")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(Value::as_str)
                        .map(ToString::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            tags.push(proc_type);
            tags
        }
        ModifierDefinition::Stat(StatModifierDefinition { target, .. }) => vec![target],
    }
}

pub fn effect_is_buff(effect: &GameplayEffect) -> bool {
    match effect.effect_type {
        EffectType::Stealth
        | EffectType::ProtectionStance
        | EffectType::HealOverTime
        | EffectType::StatusImmunity
        | EffectType::WeaponDamageReplacement => true,
        EffectType::Analyzed | EffectType::DamageOverTime => false,
        _ => effect.value >= 0.0,
    }
}

pub fn effect_is_debuff(effect: &GameplayEffect) -> bool {
    !effect_is_buff(effect)
}

pub fn effect_blocks_action(effect: &GameplayEffect, action: &str) -> bool {
    let target = canonicalize_effect_target(effect.target.as_deref());
    matches!(
        target.as_deref(),
        Some("actionLock")
            | Some("cannotMove")
            | Some("cannotAttack")
            | Some("cannotCast")
            | Some("cannotDefend")
    ) && match action {
        "move" => matches!(target.as_deref(), Some("actionLock") | Some("cannotMove")),
        "attack" => matches!(target.as_deref(), Some("actionLock") | Some("cannotAttack")),
        "cast" => matches!(target.as_deref(), Some("actionLock") | Some("cannotCast")),
        "defend" => matches!(target.as_deref(), Some("actionLock") | Some("cannotDefend")),
        _ => false,
    }
}

pub fn status_immunity_blocks_effect(
    immunity_effect: &GameplayEffect,
    incoming: &GameplayEffect,
) -> bool {
    if immunity_effect.effect_type != EffectType::StatusImmunity {
        return false;
    }

    let normalized_immunity = normalize_legacy_effect(immunity_effect);
    let normalized_incoming = normalize_legacy_effect(incoming);

    let mut immunity_keys = Vec::new();
    if let Some(target) = canonicalize_effect_target(immunity_effect.target.as_deref()) {
        immunity_keys.push(target);
    }

    if let ModifierDefinition::State(StateModifierDefinition { blocks, params, .. }) =
        normalized_immunity.definition
    {
        immunity_keys.extend(blocks.into_iter().map(|block| block.id));
        if let Some(legacy_targets) = params
            .get("legacyTargetModifiers")
            .and_then(Value::as_array)
        {
            immunity_keys.extend(
                legacy_targets
                    .iter()
                    .filter_map(Value::as_str)
                    .map(ToString::to_string),
            );
        }
    }

    let mut incoming_keys = vec![legacy_effect_type_id(&incoming.effect_type).to_string()];
    if let Some(target) = canonicalize_effect_target(incoming.target.as_deref()) {
        incoming_keys.push(target);
    }

    match normalized_incoming.definition {
        ModifierDefinition::State(StateModifierDefinition { tags, .. }) => {
            incoming_keys.extend(tags);
        }
        ModifierDefinition::Proc(ProcModifierDefinition {
            proc_type, params, ..
        }) => {
            incoming_keys.push(proc_type);
            if let Some(damage_type) = params.get("damageType").and_then(Value::as_str) {
                incoming_keys.push(damage_type.to_string());
            }
            if let Some(tags) = params.get("tags").and_then(Value::as_array) {
                incoming_keys.extend(
                    tags.iter()
                        .filter_map(Value::as_str)
                        .map(ToString::to_string),
                );
            }
        }
        ModifierDefinition::Stat(StatModifierDefinition { target, .. }) => {
            incoming_keys.push(target);
        }
    }

    immunity_keys.iter().any(|immunity| {
        incoming_keys
            .iter()
            .any(|incoming_key| incoming_key == immunity)
    })
}

trait ModifierDefinitionExt {
    fn base(&self) -> &ModifierDefinitionBase;
}

impl ModifierDefinitionExt for ModifierDefinition {
    fn base(&self) -> &ModifierDefinitionBase {
        match self {
            ModifierDefinition::Stat(definition) => &definition.base,
            ModifierDefinition::State(definition) => &definition.base,
            ModifierDefinition::Proc(definition) => &definition.base,
        }
    }
}

trait ModifierDefinitionBaseExt {
    fn stack_group(&self) -> Option<&String>;
}

impl ModifierDefinitionBaseExt for ModifierDefinitionBase {
    fn stack_group(&self) -> Option<&String> {
        self.stack_group.as_ref()
    }
}

pub fn is_weapon_damage_replacement_effect(effect: &GameplayEffect) -> bool {
    matches!(
        normalize_legacy_effect(effect).definition,
        ModifierDefinition::Proc(ProcModifierDefinition { proc_type, .. }) if proc_type == "weaponDamageReplacement"
    )
}

pub fn is_protection_stance_effect(effect: &GameplayEffect) -> bool {
    matches!(
        normalize_legacy_effect(effect).definition,
        ModifierDefinition::Proc(ProcModifierDefinition { proc_type, .. }) if proc_type == "protectionRedirect"
    )
}

pub fn is_stealth_effect(effect: &GameplayEffect) -> bool {
    matches!(
        normalize_legacy_effect(effect).definition,
        ModifierDefinition::State(StateModifierDefinition { tags, .. }) if tags.iter().any(|tag| tag == "stealth")
    )
}

pub fn is_analyzed_effect(effect: &GameplayEffect) -> bool {
    matches!(
        normalize_legacy_effect(effect).definition,
        ModifierDefinition::State(StateModifierDefinition { tags, .. }) if tags.iter().any(|tag| tag == "analyzed")
    )
}

pub fn is_damage_over_time_effect(effect: &GameplayEffect) -> bool {
    matches!(
        normalize_legacy_effect(effect).definition,
        ModifierDefinition::Proc(ProcModifierDefinition { proc_type, .. }) if proc_type == "damageOverTime"
    )
}

pub fn is_heal_over_time_effect(effect: &GameplayEffect) -> bool {
    matches!(
        normalize_legacy_effect(effect).definition,
        ModifierDefinition::Proc(ProcModifierDefinition { proc_type, .. }) if proc_type == "healOverTime"
    )
}

pub fn tick_phase_for_effect(effect: &GameplayEffect) -> Option<Phase> {
    match normalize_legacy_effect(effect).definition {
        ModifierDefinition::Proc(ProcModifierDefinition { phase, .. }) => Some(phase),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_effect(effect_type: EffectType) -> GameplayEffect {
        GameplayEffect {
            id: Some("e1".to_string()),
            name: Some("Sample".to_string()),
            description: None,
            effect_type,
            target: Some("armor".to_string()),
            value: 12.0,
            is_percentage: None,
            duration: Some(2),
            trigger: Some(EffectTrigger::OnTurnStart),
            scope: Some(EffectScope::Combat),
            stacking: Some(super::super::types::EffectStacking::Additive),
            condition: None,
            icon: None,
            instance_id: None,
            current_stacks: None,
            applied_turn: None,
            source_entity_id: None,
            applier_id: None,
            skill_id: None,
            item_id: None,
            dispellable: None,
            dispel_priority: None,
            dispel_group: None,
            protector_id: None,
            last_known_position: None,
            just_applied: None,
        }
    }

    #[test]
    fn canonicalize_effect_target_maps_legacy_aliases() {
        assert_eq!(
            canonicalize_effect_target(Some("armor")).as_deref(),
            Some("defense")
        );
        assert_eq!(
            canonicalize_effect_target(Some("hp")).as_deref(),
            Some("maxHp")
        );
        assert_eq!(
            canonicalize_effect_target(Some("crit_rate")).as_deref(),
            Some("critChance")
        );
    }

    #[test]
    fn normalize_weapon_replacement_to_proc_definition() {
        let normalized =
            normalize_legacy_effect(&sample_effect(EffectType::WeaponDamageReplacement));
        assert!(matches!(
            normalized.definition,
            ModifierDefinition::Proc(ProcModifierDefinition { ref proc_type, .. }) if proc_type == "weaponDamageReplacement"
        ));
        assert_eq!(normalized.trace.rules_used.len(), 7);
    }

    #[test]
    fn normalize_legacy_stat_target_uses_canonical_alias() {
        let normalized = normalize_legacy_effect(&sample_effect(EffectType::StatModifier));
        assert!(matches!(
            normalized.definition,
            ModifierDefinition::Stat(StatModifierDefinition { ref target, .. }) if target == "defense"
        ));
        assert_eq!(normalized.trace.warnings.len(), 1);
    }
}
