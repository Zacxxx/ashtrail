// ═══════════════════════════════════════════════════════════
// combat_engine/types.rs — All combat types, mirroring TS types exactly
// for JSON compatibility with the React frontend.
// ═══════════════════════════════════════════════════════════

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Grid Types ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GridCell {
    pub row: usize,
    pub col: usize,
    pub walkable: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub occupant_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_spawn_zone: Option<SpawnZone>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub highlight: Option<HighlightType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub texture_url: Option<String>,
}

pub type Grid = Vec<Vec<GridCell>>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SpawnZone {
    Player,
    Enemy,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum HighlightType {
    Move,
    Attack,
    Path,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct GridPos {
    pub row: usize,
    pub col: usize,
}

// ── Entity Types ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TacticalEntity {
    pub id: String,
    pub is_player: bool,
    pub name: String,
    pub hp: i32,
    pub max_hp: i32,
    pub strength: i32,
    pub agility: i32,
    pub intelligence: i32,
    pub wisdom: i32,
    pub endurance: i32,
    pub charisma: i32,
    pub crit_chance: f64,
    pub resistance: f64,
    pub social_bonus: f64,
    pub evasion: i32,
    pub defense: i32,
    pub traits: Vec<Trait>,
    pub skills: Vec<Skill>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub occupation: Option<Occupation>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub progression: Option<CharacterProgression>,
    #[serde(default)]
    pub skill_cooldowns: HashMap<String, u32>,
    pub ap: i32,
    pub max_ap: i32,
    pub mp: i32,
    pub max_mp: i32,
    pub level: i32,
    pub grid_pos: GridPos,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub equipped: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_effects: Option<Vec<GameplayEffect>>,
    pub base_stats: BaseStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaseStats {
    pub strength: i32,
    pub agility: i32,
    pub intelligence: i32,
    pub wisdom: i32,
    pub endurance: i32,
    pub charisma: i32,
    pub evasion: i32,
    pub defense: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DamagePreview {
    pub min: i32,
    pub max: i32,
    pub crit_min: i32,
    pub crit_max: i32,
    pub is_magical: bool,
    pub crit_chance: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CombatRosterEntry {
    pub roster_id: String,
    pub character_id: String,
    pub team: CombatTeam,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CombatTeam {
    Player,
    Enemy,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CombatTargetPreview {
    pub entity_id: String,
    pub preview: DamagePreview,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PreviewMode {
    None,
    Move,
    Attack,
    Skill,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CombatPreviewState {
    pub mode: PreviewMode,
    pub reachable_cells: Vec<GridPos>,
    pub path_cells: Vec<GridPos>,
    pub attackable_cells: Vec<GridPos>,
    pub blocked_cells: Vec<GridPos>,
    pub aoe_cells: Vec<GridPos>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hovered_cell: Option<GridPos>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hovered_error: Option<String>,
    pub target_previews: Vec<CombatTargetPreview>,
}

impl Default for CombatPreviewState {
    fn default() -> Self {
        Self {
            mode: PreviewMode::None,
            reachable_cells: Vec::new(),
            path_cells: Vec::new(),
            attackable_cells: Vec::new(),
            blocked_cells: Vec::new(),
            aoe_cells: Vec::new(),
            hovered_cell: None,
            hovered_error: None,
            target_previews: Vec::new(),
        }
    }
}

// ── Gameplay Effect Types ───────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum EffectType {
    StatModifier,
    CombatBonus,
    ResourceModifier,
    ExplorationBonus,
    DamageOverTime,
    HealOverTime,
    StatusImmunity,
    ActionModifier,
    WeaponDamageReplacement,
    ProtectionStance,
    Stealth,
    Analyzed,
    LoreEffect,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum EffectScope {
    Combat,
    Travel,
    Exploration,
    Camp,
    Economy,
    Social,
    Global,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum EffectStacking {
    Additive,
    Multiplicative,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectResourceCondition {
    pub r#type: String,
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectCondition {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_of_day: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hp_below_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_alone: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resource_below: Option<EffectResourceCondition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameplayEffect {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub effect_type: EffectType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
    pub value: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_percentage: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trigger: Option<EffectTrigger>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<EffectScope>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stacking: Option<EffectStacking>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub condition: Option<EffectCondition>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub protector_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_known_position: Option<GridPos>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub just_applied: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum EffectTrigger {
    Passive,
    OnHit,
    OnTurnStart,
    OnTurnEnd,
    OnDefend,
    OnKill,
}

// ── Trait ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trait {
    pub id: String,
    pub name: String,
    pub description: String,
    pub cost: i32,
    #[serde(rename = "type")]
    pub trait_type: TraitType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub impact: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effects: Option<Vec<GameplayEffect>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TraitType {
    Positive,
    Negative,
    Neutral,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Occupation {
    pub id: String,
    pub name: String,
    pub category: String,
    pub description: String,
    pub short_description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effects: Option<Vec<GameplayEffect>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterOccupationProgress {
    pub occupation_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub occupation: Option<Occupation>,
    #[serde(default)]
    pub unlocked_talent_node_ids: Vec<String>,
    #[serde(default)]
    pub spent_talent_points: i32,
    #[serde(default)]
    pub spent_pioneer_points: i32,
    #[serde(default = "default_unlock_point_cost")]
    pub unlock_point_cost: i32,
    #[serde(default)]
    pub available_talent_points: i32,
    #[serde(default = "default_occupation_level")]
    pub level: i32,
    #[serde(default)]
    pub is_primary: bool,
}

fn default_occupation_level() -> i32 {
    1
}

fn default_unlock_point_cost() -> i32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterProgression {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tree_occupation_id: Option<String>,
    #[serde(default)]
    pub unlocked_talent_node_ids: Vec<String>,
    #[serde(default)]
    pub available_talent_points: i32,
    #[serde(default)]
    pub spent_talent_points: i32,
    #[serde(default)]
    pub spent_stat_points: i32,
    #[serde(default)]
    pub spent_pioneer_occupation_points: i32,
    #[serde(default)]
    pub spent_pioneer_stat_points: i32,
    #[serde(default)]
    pub occupation_states: Vec<CharacterOccupationProgress>,
}

// ── Skill Types ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub category: SkillCategory,
    pub ap_cost: i32,
    pub min_range: i32,
    pub max_range: i32,
    pub area_type: SkillAreaType,
    pub area_size: i32,
    pub target_type: SkillTargetType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub damage: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub healing: Option<i32>,
    pub cooldown: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effect_type: Option<SkillEffectType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub push_distance: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effects: Option<Vec<GameplayEffect>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SkillCategory {
    Occupation,
    Base,
    Unique,
    Equipment,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SkillAreaType {
    Single,
    Cross,
    Circle,
    Splash,
    Line,
    Cone,
    Perpendicular,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SkillTargetType {
    Enemy,
    Ally,
    #[serde(rename = "self")]
    SelfTarget,
    Cell,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SkillEffectType {
    Physical,
    Magical,
    Support,
}

// ── Combat State ────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CombatPhase {
    Placement,
    Combat,
    Victory,
    Defeat,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PlayerAction {
    Idle,
    Moving,
    Attacking,
    #[serde(rename = "targeting_skill")]
    TargetingSkill,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombatLogMessage {
    pub id: String,
    pub message: String,
    #[serde(rename = "type")]
    pub log_type: LogType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogType {
    System,
    Damage,
    Heal,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombatConfig {
    pub grid_rows: usize,
    pub grid_cols: usize,
}

impl Default for CombatConfig {
    fn default() -> Self {
        Self {
            grid_rows: 12,
            grid_cols: 12,
        }
    }
}

// ── WebSocket Protocol ──────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillTarget {
    pub entity_id: String,
    pub damage: Option<i32>,
    pub healing: Option<i32>,
    pub is_crit: bool,
    pub is_miss: bool,
    pub new_hp: i32,
}

/// Client → Server messages
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CombatAction {
    #[serde(rename_all = "camelCase")]
    StartCombat {
        #[serde(default)]
        roster: Option<Vec<CombatRosterEntry>>,
        #[serde(default)]
        players: Option<Vec<TacticalEntity>>,
        #[serde(default)]
        enemies: Option<Vec<TacticalEntity>>,
        grid: Option<Grid>,
        config: CombatConfig,
    },
    #[serde(rename_all = "camelCase")]
    Move {
        entity_id: String,
        target_row: usize,
        target_col: usize,
    },
    #[serde(rename_all = "camelCase")]
    Attack {
        attacker_id: String,
        defender_id: String,
    },
    #[serde(rename_all = "camelCase")]
    UseSkill {
        caster_id: String,
        skill_id: String,
        target_row: usize,
        target_col: usize,
    },
    #[serde(rename_all = "camelCase")]
    PreviewMove {
        entity_id: String,
        #[serde(default)]
        hover_row: Option<usize>,
        #[serde(default)]
        hover_col: Option<usize>,
    },
    #[serde(rename_all = "camelCase")]
    PreviewBasicAttack {
        attacker_id: String,
        #[serde(default)]
        hover_row: Option<usize>,
        #[serde(default)]
        hover_col: Option<usize>,
    },
    #[serde(rename_all = "camelCase")]
    PreviewSkill {
        caster_id: String,
        skill_id: String,
        #[serde(default)]
        hover_row: Option<usize>,
        #[serde(default)]
        hover_col: Option<usize>,
    },
    ClearPreview,
    EndTurn,
}

/// Server → Client messages
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum CombatEvent {
    #[serde(rename_all = "camelCase")]
    StateSync {
        state: CombatStateSnapshot,
    },
    #[serde(rename_all = "camelCase")]
    PreviewState {
        preview: CombatPreviewState,
    },
    #[serde(rename_all = "camelCase")]
    EntityMoved {
        entity_id: String,
        from: GridPos,
        to: GridPos,
        mp_cost: i32,
        tackle_cost: i32,
    },
    #[serde(rename_all = "camelCase")]
    AttackResult {
        attacker_id: String,
        defender_id: String,
        damage: i32,
        is_crit: bool,
        is_miss: bool,
    },
    #[serde(rename_all = "camelCase")]
    SkillUsed {
        caster_id: String,
        skill_id: String,
        targets: Vec<SkillTarget>,
    },
    #[serde(rename_all = "camelCase")]
    EntityDefeated {
        entity_id: String,
    },
    #[serde(rename_all = "camelCase")]
    TurnChanged {
        active_entity_id: String,
        turn_number: u32,
    },
    #[serde(rename_all = "camelCase")]
    CombatEnded {
        result: CombatResult,
    },
    Log {
        message: CombatLogMessage,
    },
    Error {
        message: String,
    },
    #[serde(rename_all = "camelCase")]
    HighlightCells {
        cells: Vec<GridPos>,
        highlight_type: HighlightType,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CombatResult {
    Victory,
    Defeat,
}

/// Serializable snapshot of combat state sent to clients
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombatStateSnapshot {
    pub grid: Grid,
    pub entities: HashMap<String, TacticalEntity>,
    pub turn_order: Vec<String>,
    pub active_entity_id: String,
    pub phase: CombatPhase,
    pub logs: Vec<CombatLogMessage>,
    pub turn_number: u32,
}
