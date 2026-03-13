use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use super::types::{CharacterProgression, GameplayEffect, Occupation, Skill, Trait};
use crate::{game_rules::load_rules_from_file, progression::normalize_character_payload};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawStats {
    pub strength: i32,
    pub agility: i32,
    pub intelligence: i32,
    pub wisdom: i32,
    pub endurance: i32,
    pub charisma: i32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawCharacter {
    pub id: String,
    pub name: String,
    pub stats: RawStats,
    pub traits: Vec<Trait>,
    #[serde(default)]
    pub skills: Vec<Skill>,
    #[serde(default)]
    pub occupation: Option<Occupation>,
    #[serde(default)]
    pub progression: Option<CharacterProgression>,
    #[serde(default)]
    pub occupations: Option<Vec<super::types::CharacterOccupationProgress>>,
    #[serde(default)]
    pub equipped: Option<HashMap<String, Option<serde_json::Value>>>,
    #[serde(default)]
    pub level: i32,
    #[serde(default)]
    pub xp: i64,
    #[serde(default)]
    pub resolved_progression: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawItem {
    pub id: String,
    pub name: String,
    pub category: String,
    #[serde(default)]
    pub rarity: Option<String>,
    pub description: String,
    pub cost: i32,
    #[serde(default)]
    pub equip_slot: Option<String>,
    #[serde(default)]
    pub weapon_type: Option<String>,
    #[serde(default)]
    pub weapon_range: Option<i32>,
    #[serde(default)]
    pub weapon_area_type: Option<String>,
    #[serde(default)]
    pub weapon_area_size: Option<i32>,
    #[serde(default)]
    pub effects: Option<Vec<GameplayEffect>>,
    #[serde(default)]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawTalentTree {
    pub occupation_id: String,
    pub nodes: Vec<RawTalentNode>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawTalentNode {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub cost: Option<i32>,
    #[serde(default)]
    pub effects: Vec<GameplayEffect>,
    #[serde(default)]
    pub grants_trait_ids: Vec<String>,
    #[serde(default)]
    pub grants_skill_ids: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ContentBundle {
    pub traits: HashMap<String, Trait>,
    pub skills: HashMap<String, Skill>,
    pub items: HashMap<String, RawItem>,
    pub occupations: HashMap<String, Occupation>,
    pub talent_trees: HashMap<String, RawTalentTree>,
}

fn root_path() -> Result<PathBuf, String> {
    std::env::current_dir().map_err(|e| format!("resolve cwd: {e}"))
}

fn data_path(file_name: &str) -> Result<PathBuf, String> {
    Ok(root_path()?
        .join("../../packages/core/src/data")
        .join(file_name))
}

fn characters_dir() -> Result<PathBuf, String> {
    Ok(root_path()?.join("generated").join("characters"))
}

fn load_json<T: for<'de> Deserialize<'de>>(path: &PathBuf, label: &str) -> Result<T, String> {
    let raw =
        fs::read_to_string(path).map_err(|e| format!("read {label} at {}: {e}", path.display()))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse {label} at {}: {e}", path.display()))
}

pub fn load_content_bundle() -> Result<ContentBundle, String> {
    let traits: Vec<Trait> = load_json(&data_path("traits.json")?, "traits.json")?;
    let skills: Vec<Skill> = load_json(&data_path("skills.json")?, "skills.json")?;
    let items: Vec<RawItem> = load_json(&data_path("items.json")?, "items.json")?;
    let occupations: Vec<Occupation> =
        load_json(&data_path("occupations.json")?, "occupations.json")?;
    let talent_trees: Vec<RawTalentTree> =
        load_json(&data_path("talentTrees.json")?, "talentTrees.json")?;

    Ok(ContentBundle {
        traits: traits
            .into_iter()
            .map(|entry| (entry.id.clone(), entry))
            .collect(),
        skills: skills
            .into_iter()
            .map(|entry| (entry.id.clone(), entry))
            .collect(),
        items: items
            .into_iter()
            .map(|entry| (entry.id.clone(), entry))
            .collect(),
        occupations: occupations
            .into_iter()
            .map(|entry| (entry.id.clone(), entry))
            .collect(),
        talent_trees: talent_trees
            .into_iter()
            .map(|entry| (entry.occupation_id.clone(), entry))
            .collect(),
    })
}

pub fn load_character(character_id: &str) -> Result<RawCharacter, String> {
    let path = characters_dir()?.join(format!("{character_id}.json"));
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("read character {character_id} at {}: {e}", path.display()))?;
    let payload = serde_json::from_str::<serde_json::Value>(&raw)
        .map_err(|e| format!("parse character {character_id} at {}: {e}", path.display()))?;
    let rules = load_rules_from_file();
    let content = load_content_bundle().ok();
    let normalized = normalize_character_payload(payload, &rules, content.as_ref());
    serde_json::from_value(normalized)
        .map_err(|e| format!("decode normalized character {character_id}: {e}"))
}
