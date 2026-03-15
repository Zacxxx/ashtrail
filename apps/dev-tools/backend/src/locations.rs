use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use worldgen_core::cluster::{DuchyRecord, KingdomRecord, ProvinceRecord};
use worldgen_core::export::decode_id_rgb;
use worldgen_core::graph::ProvinceAdjacency;

use crate::gemini;

const PROVINCE_REGION_PREFIX: &str = "wgen_provinces_";
const BATCH_SIZE: usize = 12;
const MAX_GENERATED_LORE_SNIPPETS: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LocationCategory {
    Settlement,
    Infrastructure,
    Resource,
    Military,
    Religious,
    Ruin,
    Wild,
    Hazard,
    Landmark,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LocationStatus {
    Thriving,
    Stable,
    Struggling,
    Declining,
    Seasonal,
    Contested,
    Abandoned,
    Ruined,
    Forbidden,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LocationScale {
    Minor,
    Small,
    Medium,
    Major,
    Grand,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RecordSource {
    Manual,
    HumanityGenerated,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationHistoryHooks {
    pub founding_reason: String,
    pub current_tension: String,
    pub story_seeds: Vec<String>,
    pub linked_lore_snippet_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationRecord {
    pub id: String,
    pub name: String,
    pub category: LocationCategory,
    pub subtype: String,
    pub status: LocationStatus,
    pub scale: LocationScale,
    pub province_id: u32,
    pub province_region_id: String,
    pub province_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duchy_id: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kingdom_id: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub continent_id: Option<u32>,
    pub x: f32,
    pub y: f32,
    pub population_estimate: Option<u64>,
    pub importance: u32,
    pub habitability_score: u32,
    pub economic_score: u32,
    pub strategic_score: u32,
    pub hazard_score: u32,
    pub ruling_faction: String,
    pub tags: Vec<String>,
    pub placement_drivers: Vec<String>,
    pub history_hooks: LocationHistoryHooks,
    pub lore: String,
    #[serde(default = "default_record_source")]
    pub source: RecordSource,
    #[serde(default)]
    pub is_customized: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_humanity_job_id: Option<String>,
    #[serde(rename = "type")]
    pub type_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LocationGenerationScopeMode {
    World,
    Scoped,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LocationScopeTargetKind {
    Kingdom,
    Duchy,
    Province,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocationScopeTarget {
    pub kind: LocationScopeTargetKind,
    pub id: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationGenerationRequest {
    #[serde(default)]
    pub prompt: String,
    #[serde(default = "default_settlement_density")]
    pub settlement_density: f32,
    #[serde(default = "default_tech_level")]
    pub tech_level: f32,
    #[serde(default = "default_scope_mode")]
    pub scope_mode: LocationGenerationScopeMode,
    #[serde(default)]
    pub scope_targets: Vec<LocationScopeTarget>,
    #[serde(default = "default_redo_mode")]
    pub redo_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationGenerationConfig {
    pub prompt: String,
    pub settlement_density: f32,
    pub tech_level: f32,
    pub scope_mode: LocationGenerationScopeMode,
    pub scope_targets: Vec<LocationScopeTarget>,
    pub resolved_province_ids: Vec<u32>,
    pub generated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageSummary {
    pub total_locations: usize,
    pub settlement_count: usize,
    pub non_settlement_count: usize,
    pub viable_province_count: usize,
    pub covered_viable_province_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiDetailPassSummary {
    pub status: String,
    pub attempted_batches: usize,
    pub successful_batches: usize,
    pub refined_locations: usize,
    pub total_locations: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationGenerationMetadata {
    pub world_id: String,
    pub config: LocationGenerationConfig,
    pub coverage: CoverageSummary,
    pub counts_by_category: BTreeMap<String, usize>,
    pub counts_by_subtype: BTreeMap<String, usize>,
    pub uncovered_province_ids: Vec<u32>,
    pub deterministic_seed_hash: String,
    pub ai_detail_pass: AiDetailPassSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoreSnippetLite {
    pub id: String,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default = "default_lore_priority")]
    pub priority: String,
    #[serde(default)]
    pub date: Option<serde_json::Value>,
    #[serde(default)]
    pub location: String,
    #[serde(default)]
    pub location_id: Option<String>,
    #[serde(default)]
    pub province_region_id: Option<String>,
    #[serde(default)]
    pub content: String,
    #[serde(default = "default_record_source")]
    pub source: RecordSource,
    #[serde(default)]
    pub is_customized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BiomeProvinceSummary {
    province_id: u32,
    #[serde(default)]
    biome_primary_id: Option<String>,
    #[serde(default)]
    biome_confidence: Option<f32>,
    #[serde(default)]
    biome_candidate_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BiomeReportLite {
    #[serde(default)]
    province_summaries: Vec<BiomeProvinceSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EcologyProvinceRecordLite {
    province_id: u32,
    #[serde(default)]
    description: String,
    #[serde(default)]
    ecological_potential: f32,
    #[serde(default)]
    agriculture_potential: f32,
    #[serde(default)]
    flora_ids: Vec<String>,
    #[serde(default)]
    fauna_ids: Vec<String>,
    #[serde(default)]
    climate_profile_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CellFeaturesLite {
    cols: u32,
    rows: u32,
    #[serde(default)]
    cells: Vec<CellFeatureLite>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CellFeatureLite {
    x: u32,
    y: u32,
    #[serde(default)]
    terrain_class: String,
    #[serde(default)]
    elevation_estimate: f64,
    #[serde(default)]
    is_water: bool,
    #[serde(default)]
    is_coastal: bool,
    #[serde(default)]
    vegetation_index: f64,
    #[serde(default)]
    aridity_index: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContinentRecord {
    id: u32,
    #[serde(default)]
    kingdom_ids: Vec<u32>,
    #[serde(default)]
    duchy_ids: Vec<u32>,
    #[serde(default)]
    province_ids: Vec<u32>,
    name: String,
}

#[derive(Debug, Clone)]
struct ProvinceRasterStats {
    total_pixels: u32,
    land_pixels: u32,
    river_pixels: u32,
    coast_pixels: u32,
    steep_pixels: u32,
    sample_count: u32,
    mean_elevation: f32,
    mean_slope: f32,
    max_slope: f32,
    candidate_points: Vec<CandidatePoint>,
}

impl ProvinceRasterStats {
    fn new() -> Self {
        Self {
            total_pixels: 0,
            land_pixels: 0,
            river_pixels: 0,
            coast_pixels: 0,
            steep_pixels: 0,
            sample_count: 0,
            mean_elevation: 0.0,
            mean_slope: 0.0,
            max_slope: 0.0,
            candidate_points: Vec::new(),
        }
    }
}

#[derive(Debug, Clone)]
struct ProvinceContext {
    province: ProvinceRecord,
    duchy: Option<DuchyRecord>,
    kingdom: Option<KingdomRecord>,
    continent_id: Option<u32>,
    biome_id: String,
    ecology: Option<EcologyProvinceRecordLite>,
    adjacency: ProvinceAdjacency,
    raster: ProvinceRasterStats,
    viability: ProvinceViability,
    scores: ProvinceScores,
    is_duchy_seat: bool,
    is_kingdom_capital: bool,
}

#[derive(Debug, Clone)]
struct ProvinceViability {
    is_viable_land: bool,
    allows_maritime_location: bool,
    land_share: f32,
}

#[derive(Debug, Clone)]
struct ProvinceScores {
    habitability: u32,
    economic: u32,
    strategic: u32,
    hazard: u32,
    resource_potential: u32,
    climate_stability: u32,
}

#[derive(Debug, Clone)]
struct CandidatePoint {
    x: f32,
    y: f32,
    river: bool,
    coastal: bool,
    slope: f32,
    elevation: f32,
    score: f32,
}

#[derive(Debug, Clone)]
struct WorldContext {
    world_id: String,
    seed_hash: String,
    world_name: String,
    world_prompt: String,
    world_seed_prompt: String,
    humanity_prompt: String,
    temporality: serde_json::Value,
    main_lore: String,
    lore_snippets: Vec<LoreSnippetLite>,
}

#[derive(Debug, Clone)]
struct LocationBlueprint {
    province_id: u32,
    location: LocationRecord,
}

#[derive(Debug, Clone)]
pub struct LocationGenerationOutput {
    pub locations: Vec<LocationRecord>,
    pub lore_snippets: Vec<LoreSnippetLite>,
    pub metadata: LocationGenerationMetadata,
    pub resolved_province_ids: Vec<u32>,
    pub generated_location_count: usize,
    pub generated_lore_count: usize,
}

pub fn resolve_scope_province_ids(
    planets_dir: &Path,
    world_id: &str,
    scope_mode: &LocationGenerationScopeMode,
    scope_targets: &[LocationScopeTarget],
) -> Result<Vec<u32>, String> {
    let worldgen_dir = planets_dir.join(world_id).join("worldgen");
    let provinces: Vec<ProvinceRecord> = read_json(worldgen_dir.join("provinces.json"))?;
    let duchies: Vec<DuchyRecord> = read_json(worldgen_dir.join("duchies.json"))?;
    let kingdoms: Vec<KingdomRecord> = read_json(worldgen_dir.join("kingdoms.json"))?;
    let request = LocationGenerationRequest {
        prompt: String::new(),
        settlement_density: default_settlement_density(),
        tech_level: default_tech_level(),
        scope_mode: scope_mode.clone(),
        scope_targets: scope_targets.to_vec(),
        redo_mode: default_redo_mode(),
    };
    resolve_scope_province_ids_from_hierarchy(&request, &provinces, &duchies, &kingdoms)
}

pub fn merge_saved_locations(
    existing: &[LocationRecord],
    incoming: Vec<LocationRecord>,
) -> Vec<LocationRecord> {
    let existing_by_id = existing
        .iter()
        .map(|record| (record.id.clone(), record))
        .collect::<HashMap<_, _>>();
    incoming
        .into_iter()
        .map(|mut record| {
            if let Some(previous) = existing_by_id.get(&record.id) {
                let changed = location_edit_signature(previous) != location_edit_signature(&record);
                record.source = previous.source.clone();
                record.last_humanity_job_id = previous.last_humanity_job_id.clone();
                record.is_customized = match previous.source {
                    RecordSource::HumanityGenerated => previous.is_customized || changed,
                    RecordSource::Manual => previous.is_customized || changed,
                };
            } else {
                record.source = RecordSource::Manual;
                record.is_customized = true;
                record.last_humanity_job_id = None;
            }
            normalize_location_record(&record)
        })
        .collect()
}

pub fn adopt_existing_humanity_output(
    planets_dir: &Path,
    world_id: &str,
    scope_mode: &LocationGenerationScopeMode,
    scope_targets: &[LocationScopeTarget],
) -> Result<Vec<LocationRecord>, String> {
    let target_provinces =
        resolve_scope_province_ids(planets_dir, world_id, scope_mode, scope_targets)?
            .into_iter()
            .collect::<HashSet<_>>();
    let adopted = read_locations(planets_dir, world_id)
        .into_iter()
        .map(|mut location| {
            if target_provinces.contains(&location.province_id) && !location.is_customized {
                location.source = RecordSource::HumanityGenerated;
                location.is_customized = false;
            }
            normalize_location_record(&location)
        })
        .collect::<Vec<_>>();
    write_locations(planets_dir, world_id, &adopted)
}

fn resolve_scope_province_ids_from_hierarchy(
    request: &LocationGenerationRequest,
    provinces: &[ProvinceRecord],
    duchies: &[DuchyRecord],
    kingdoms: &[KingdomRecord],
) -> Result<Vec<u32>, String> {
    if request.scope_mode == LocationGenerationScopeMode::World {
        let mut ids = provinces
            .iter()
            .map(|province| province.id)
            .collect::<Vec<_>>();
        ids.sort_unstable();
        return Ok(ids);
    }
    if request.scope_targets.is_empty() {
        return Err(
            "Scoped Humanity runs require at least one kingdom, duchy, or province target."
                .to_string(),
        );
    }

    let duchy_provinces = duchies
        .iter()
        .map(|duchy| (duchy.id, duchy.province_ids.clone()))
        .collect::<HashMap<_, _>>();
    let kingdom_duchies = kingdoms
        .iter()
        .map(|kingdom| (kingdom.id, kingdom.duchy_ids.clone()))
        .collect::<HashMap<_, _>>();
    let province_ids = provinces
        .iter()
        .map(|province| province.id)
        .collect::<HashSet<_>>();
    let mut selected = HashSet::new();

    for target in &request.scope_targets {
        match target.kind {
            LocationScopeTargetKind::Province => {
                if !province_ids.contains(&target.id) {
                    return Err(format!("Province {} not found", target.id));
                }
                selected.insert(target.id);
            }
            LocationScopeTargetKind::Duchy => {
                let Some(duchy_ids) = duchy_provinces.get(&target.id) else {
                    return Err(format!("Duchy {} not found", target.id));
                };
                selected.extend(duchy_ids.iter().copied());
            }
            LocationScopeTargetKind::Kingdom => {
                let Some(duchy_ids) = kingdom_duchies.get(&target.id) else {
                    return Err(format!("Kingdom {} not found", target.id));
                };
                for duchy_id in duchy_ids {
                    let Some(duchy_province_ids) = duchy_provinces.get(duchy_id) else {
                        return Err(format!(
                            "Duchy {} referenced by kingdom {} not found",
                            duchy_id, target.id
                        ));
                    };
                    selected.extend(duchy_province_ids.iter().copied());
                }
            }
        }
    }

    let mut ids = selected.into_iter().collect::<Vec<_>>();
    ids.sort_unstable();
    Ok(ids)
}

fn should_replace_location(location: &LocationRecord, target_province_ids: &HashSet<u32>) -> bool {
    target_province_ids.contains(&location.province_id)
        && location.source == RecordSource::HumanityGenerated
        && !location.is_customized
}

fn should_replace_generated_lore(
    snippet: &LoreSnippetLite,
    target_province_ids: &HashSet<u32>,
) -> bool {
    if snippet.source != RecordSource::HumanityGenerated || snippet.is_customized {
        return false;
    }
    if target_province_ids.is_empty() {
        return true;
    }
    snippet
        .province_region_id
        .as_deref()
        .and_then(|value| value.strip_prefix(PROVINCE_REGION_PREFIX))
        .and_then(|value| value.parse::<u32>().ok())
        .map(|province_id| target_province_ids.contains(&province_id))
        .unwrap_or(false)
}

fn prune_removed_lore_links(
    location: &mut LocationRecord,
    removed_generated_lore_ids: &HashSet<String>,
) {
    if removed_generated_lore_ids.is_empty() {
        return;
    }
    location.history_hooks.linked_lore_snippet_ids = location
        .history_hooks
        .linked_lore_snippet_ids
        .iter()
        .filter(|id| !removed_generated_lore_ids.contains(*id))
        .cloned()
        .collect();
}

fn build_generated_lore_snippets(locations: &[LocationRecord]) -> Vec<LoreSnippetLite> {
    let mut sorted = locations.iter().collect::<Vec<_>>();
    sorted.sort_by(|a, b| {
        b.importance
            .cmp(&a.importance)
            .then_with(|| a.name.cmp(&b.name))
    });

    let mut selected = Vec::new();
    let mut selected_ids = HashSet::new();
    let mut covered_provinces = HashSet::new();

    for location in &sorted {
        if selected.len() >= MAX_GENERATED_LORE_SNIPPETS {
            break;
        }
        if covered_provinces.insert(location.province_id) {
            selected.push(*location);
            selected_ids.insert(location.id.clone());
        }
    }

    for location in &sorted {
        if selected.len() >= MAX_GENERATED_LORE_SNIPPETS {
            break;
        }
        if selected_ids.insert(location.id.clone()) {
            selected.push(*location);
        }
    }

    selected
        .into_iter()
        .map(|location| LoreSnippetLite {
            id: deterministic_uuid_like(),
            title: Some(location.name.clone()),
            priority: "minor".to_string(),
            date: None,
            location: location.name.clone(),
            location_id: Some(location.id.clone()),
            province_region_id: Some(location.province_region_id.clone()),
            content: build_generated_location_lore_content(location),
            source: RecordSource::HumanityGenerated,
            is_customized: false,
        })
        .collect()
}

fn build_generated_location_lore_content(location: &LocationRecord) -> String {
    let founding_reason = location.history_hooks.founding_reason.trim();
    let current_tension = location.history_hooks.current_tension.trim();
    let mut sentences = vec![location.lore.trim().to_string()];
    if !founding_reason.is_empty() {
        sentences.push(format!("Founding: {founding_reason}"));
    }
    if !current_tension.is_empty() {
        sentences.push(format!("Current tension: {current_tension}"));
    }
    sentences
        .into_iter()
        .filter(|entry| !entry.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn location_edit_signature(record: &LocationRecord) -> String {
    serde_json::to_string(&serde_json::json!({
        "name": record.name,
        "category": record.category,
        "subtype": record.subtype,
        "status": record.status,
        "scale": record.scale,
        "provinceId": record.province_id,
        "provinceRegionId": record.province_region_id,
        "provinceName": record.province_name,
        "duchyId": record.duchy_id,
        "kingdomId": record.kingdom_id,
        "continentId": record.continent_id,
        "x": record.x,
        "y": record.y,
        "populationEstimate": record.population_estimate,
        "importance": record.importance,
        "habitabilityScore": record.habitability_score,
        "economicScore": record.economic_score,
        "strategicScore": record.strategic_score,
        "hazardScore": record.hazard_score,
        "rulingFaction": record.ruling_faction,
        "tags": record.tags,
        "placementDrivers": record.placement_drivers,
        "historyHooks": record.history_hooks,
        "lore": record.lore,
        "type": record.type_label,
    }))
    .unwrap_or_default()
}

pub async fn simulate_locations(
    planets_dir: &Path,
    world_id: &str,
    request: &LocationGenerationRequest,
) -> Result<LocationGenerationOutput, String> {
    let worldgen_dir = planets_dir.join(world_id).join("worldgen");
    if !worldgen_dir.exists() {
        return Err("Worldgen directory not found. Run the geography pipeline first.".to_string());
    }

    let provinces: Vec<ProvinceRecord> = read_json(worldgen_dir.join("provinces.json"))?;
    let duchies: Vec<DuchyRecord> = read_json(worldgen_dir.join("duchies.json"))?;
    let kingdoms: Vec<KingdomRecord> = read_json(worldgen_dir.join("kingdoms.json"))?;
    let continents: Vec<ContinentRecord> =
        read_optional_json(worldgen_dir.join("continents.json")).unwrap_or_default();
    let adjacency: Vec<ProvinceAdjacency> = read_json(worldgen_dir.join("adjacency.json"))?;

    let biome_report: Option<BiomeReportLite> =
        read_optional_json(worldgen_dir.join("biome_report.json"));
    let ecology_records: Vec<EcologyProvinceRecordLite> = read_optional_json(
        planets_dir
            .join(world_id)
            .join("ecology")
            .join("provinces.json"),
    )
    .unwrap_or_default();
    let cell_features: Option<CellFeaturesLite> =
        read_optional_json(planets_dir.join(world_id).join("cell_features.json"));
    let existing_locations = read_locations(planets_dir, world_id);
    let existing_lore_snippets: Vec<LoreSnippetLite> =
        read_optional_json(planets_dir.join(world_id).join("lore_snippets.json"))
            .unwrap_or_default();
    let world_context = load_world_context(planets_dir, world_id, request)?;
    let requested_province_ids =
        resolve_scope_province_ids_from_hierarchy(request, &provinces, &duchies, &kingdoms)?;
    let resolved_province_ids = if request.scope_mode == LocationGenerationScopeMode::World {
        let mut ids = provinces
            .iter()
            .map(|province| province.id)
            .collect::<Vec<_>>();
        ids.sort_unstable();
        ids
    } else {
        requested_province_ids
    };
    let resolved_province_set = resolved_province_ids
        .iter()
        .copied()
        .collect::<HashSet<_>>();

    let province_id_image = image::open(worldgen_dir.join("province_id.png"))
        .map_err(|e| format!("Failed to read province_id.png: {e}"))?
        .to_rgb8();
    let landmask = read_luma_u8(worldgen_dir.join("landmask.png"))?;
    let river_mask = read_luma_u8(worldgen_dir.join("river_mask.png"))?;
    let height = read_luma_u16(worldgen_dir.join("height16.png"))?;

    let raster_stats = analyze_rasters(
        &province_id_image,
        &landmask,
        &river_mask,
        &height,
        cell_features.as_ref(),
    );
    let raster_scope_matches = resolved_province_ids
        .iter()
        .filter(|province_id| {
            raster_stats
                .get(province_id)
                .map(|stats| stats.total_pixels > 0)
                .unwrap_or(false)
        })
        .count();
    if !resolved_province_ids.is_empty() && raster_scope_matches == 0 {
        return Err(
            "Humanity input mismatch: province_id.png does not match provinces.json for the selected scope."
                .to_string(),
        );
    }

    let continent_by_province = build_continent_index(&continents);
    let duchy_map: HashMap<u32, DuchyRecord> = duchies.into_iter().map(|d| (d.id, d)).collect();
    let kingdom_map: HashMap<u32, KingdomRecord> =
        kingdoms.into_iter().map(|k| (k.id, k)).collect();
    let adjacency_map: HashMap<u32, ProvinceAdjacency> =
        adjacency.into_iter().map(|a| (a.province_id, a)).collect();
    let ecology_map: HashMap<u32, EcologyProvinceRecordLite> = ecology_records
        .into_iter()
        .map(|entry| (entry.province_id, entry))
        .collect();
    let biome_map = biome_report
        .map(|report| {
            report
                .province_summaries
                .into_iter()
                .map(|summary| (summary.province_id, summary))
                .collect::<HashMap<_, _>>()
        })
        .unwrap_or_default();

    let mut contexts = provinces
        .into_iter()
        .map(|province| {
            let raster = raster_stats
                .get(&province.id)
                .cloned()
                .unwrap_or_else(ProvinceRasterStats::new);
            let biome_id = biome_map
                .get(&province.id)
                .and_then(|entry| entry.biome_primary_id.clone())
                .or_else(|| province.biome_primary_id.clone())
                .unwrap_or_else(|| "unknown".to_string());
            let ecology = ecology_map.get(&province.id).cloned();
            let adjacency = adjacency_map
                .get(&province.id)
                .cloned()
                .unwrap_or(ProvinceAdjacency {
                    province_id: province.id,
                    neighbors: Vec::new(),
                });
            let viability = compute_viability(&biome_id, &raster, &adjacency);
            let scores = compute_scores(
                &province,
                &raster,
                ecology.as_ref(),
                &adjacency,
                &biome_id,
                request.tech_level,
            );
            ProvinceContext {
                duchy: duchy_map.get(&province.duchy_id).cloned(),
                kingdom: kingdom_map.get(&province.kingdom_id).cloned(),
                continent_id: continent_by_province.get(&province.id).copied(),
                province,
                biome_id,
                ecology,
                adjacency,
                raster,
                viability,
                scores,
                is_duchy_seat: false,
                is_kingdom_capital: false,
            }
        })
        .collect::<Vec<_>>();

    mark_seats(&mut contexts);

    let mut preserved_locations = existing_locations
        .into_iter()
        .filter(|location| !should_replace_location(location, &resolved_province_set))
        .collect::<Vec<_>>();
    let preserved_counts = preserved_locations
        .iter()
        .filter(|location| resolved_province_set.contains(&location.province_id))
        .fold(HashMap::<u32, usize>::new(), |mut counts, location| {
            *counts.entry(location.province_id).or_insert(0) += 1;
            counts
        });

    let avg_habitability = if contexts.is_empty() {
        0.0
    } else {
        contexts
            .iter()
            .map(|ctx| ctx.scores.habitability as f32)
            .sum::<f32>()
            / contexts.len() as f32
    };
    let target_settlement_ratio = (0.45
        + 0.2 * (request.settlement_density - 0.5)
        + 0.1 * ((avg_habitability - 50.0) / 50.0))
        .clamp(0.35, 0.65);

    let mut generated_locations = Vec::new();
    let area_quartile = upper_area_quartile(&contexts);
    let mut settlement_count = preserved_locations
        .iter()
        .filter(|location| location.category == LocationCategory::Settlement)
        .count();

    contexts.sort_by_key(|ctx| ctx.province.id);

    for context in &contexts {
        if !resolved_province_set.contains(&context.province.id) {
            continue;
        }
        if !context.viability.is_viable_land {
            continue;
        }

        let desired_node_count =
            compute_node_count(context, area_quartile, request.settlement_density);
        let preserved_count = preserved_counts
            .get(&context.province.id)
            .copied()
            .unwrap_or(0);
        let node_count = desired_node_count.saturating_sub(preserved_count);
        if node_count == 0 {
            continue;
        }
        let anchors = choose_anchors(context, node_count);
        let mut province_blueprints = Vec::new();

        for index in 0..node_count {
            let anchor = anchors
                .get(index)
                .cloned()
                .or_else(|| anchors.first().cloned())
                .unwrap_or_else(|| fallback_anchor(context));
            let ensure_non_settlement = index == 1
                && node_count >= 2
                && province_blueprints.iter().all(|bp: &LocationBlueprint| {
                    bp.location.category == LocationCategory::Settlement
                });
            let blueprint = build_location_blueprint(
                context,
                &world_context,
                &anchor,
                index,
                node_count,
                request,
                target_settlement_ratio,
                settlement_count,
                preserved_locations.len() + generated_locations.len() + province_blueprints.len(),
                ensure_non_settlement,
            );
            if blueprint.location.category == LocationCategory::Settlement {
                settlement_count += 1;
            }
            province_blueprints.push(blueprint);
        }

        generated_locations.extend(province_blueprints.into_iter().map(|bp| bp.location));
    }

    let generated_location_count = generated_locations.len();
    let ai_detail_pass =
        apply_ai_details(&world_context, &contexts, &mut generated_locations).await;

    let removed_generated_lore_ids = existing_lore_snippets
        .iter()
        .filter(|snippet| should_replace_generated_lore(snippet, &resolved_province_set))
        .map(|snippet| snippet.id.clone())
        .collect::<HashSet<_>>();
    let mut lore_snippets = existing_lore_snippets
        .into_iter()
        .filter(|snippet| !removed_generated_lore_ids.contains(&snippet.id))
        .collect::<Vec<_>>();

    let generated_lore_snippets = build_generated_lore_snippets(&generated_locations);
    let generated_lore_links = generated_lore_snippets.iter().fold(
        HashMap::<String, Vec<String>>::new(),
        |mut links, snippet| {
            if let Some(location_id) = &snippet.location_id {
                links
                    .entry(location_id.clone())
                    .or_default()
                    .push(snippet.id.clone());
            }
            links
        },
    );

    preserved_locations
        .iter_mut()
        .for_each(|location| prune_removed_lore_links(location, &removed_generated_lore_ids));
    generated_locations
        .iter_mut()
        .for_each(|location| prune_removed_lore_links(location, &removed_generated_lore_ids));
    generated_locations.iter_mut().for_each(|location| {
        if let Some(linked_ids) = generated_lore_links.get(&location.id) {
            location.history_hooks.linked_lore_snippet_ids = unique_strings(
                [
                    location.history_hooks.linked_lore_snippet_ids.clone(),
                    linked_ids.clone(),
                ]
                .concat(),
            );
        }
    });

    lore_snippets.extend(generated_lore_snippets.clone());

    let mut final_locations = preserved_locations;
    final_locations.extend(generated_locations);
    let metadata = build_generation_metadata(
        world_id,
        request,
        &contexts,
        &final_locations,
        &resolved_province_ids,
        &world_context.seed_hash,
        ai_detail_pass,
    );

    Ok(LocationGenerationOutput {
        locations: final_locations,
        lore_snippets,
        metadata,
        resolved_province_ids,
        generated_location_count,
        generated_lore_count: generated_lore_snippets.len(),
    })
}

pub fn read_locations(planets_dir: &Path, world_id: &str) -> Vec<LocationRecord> {
    let path = planets_dir.join(world_id).join("locations.json");
    let Some(value) = read_optional_json::<serde_json::Value>(path) else {
        return Vec::new();
    };
    normalize_locations_value(value)
}

pub fn write_locations(
    planets_dir: &Path,
    world_id: &str,
    records: &[LocationRecord],
) -> Result<Vec<LocationRecord>, String> {
    let normalized = records
        .iter()
        .map(normalize_location_record)
        .collect::<Vec<_>>();
    let path = planets_dir.join(world_id).join("locations.json");
    write_json(path, &normalized)?;
    Ok(normalized)
}

pub fn normalize_locations_value(value: serde_json::Value) -> Vec<LocationRecord> {
    match value {
        serde_json::Value::Array(items) => items
            .into_iter()
            .filter_map(normalize_location_value)
            .collect(),
        _ => Vec::new(),
    }
}

pub fn read_generation_metadata(
    planets_dir: &Path,
    world_id: &str,
) -> Option<LocationGenerationMetadata> {
    read_optional_json(planets_dir.join(world_id).join("location_generation.json"))
}

pub fn write_generation_metadata(
    planets_dir: &Path,
    world_id: &str,
    metadata: &LocationGenerationMetadata,
) -> Result<(), String> {
    write_json(
        planets_dir.join(world_id).join("location_generation.json"),
        metadata,
    )
}

fn normalize_location_record(record: &LocationRecord) -> LocationRecord {
    let mut normalized = record.clone();
    normalized.province_region_id = if normalized.province_region_id.trim().is_empty() {
        province_region_id(normalized.province_id)
    } else {
        normalized.province_region_id.clone()
    };
    normalized.type_label = if normalized.type_label.trim().is_empty() {
        title_case(&normalized.subtype)
    } else {
        normalized.type_label.clone()
    };
    normalized.ruling_faction = normalize_ruling_faction(&normalized.ruling_faction);
    normalized.tags = unique_strings(normalized.tags);
    normalized.placement_drivers = unique_strings(normalized.placement_drivers);
    normalized.history_hooks.story_seeds = unique_strings(normalized.history_hooks.story_seeds);
    normalized.history_hooks.linked_lore_snippet_ids =
        unique_strings(normalized.history_hooks.linked_lore_snippet_ids);
    normalized.x = normalized.x.clamp(0.0, 1.0);
    normalized.y = normalized.y.clamp(0.0, 1.0);
    normalized
}

fn normalize_location_value(value: serde_json::Value) -> Option<LocationRecord> {
    let object = value.as_object()?;
    let province_id = parse_province_id(object.get("provinceId"), object.get("provinceRegionId"))?;
    let province_name = string_field(object, "provinceName")
        .unwrap_or_else(|| format!("Province {}", province_id + 1));
    let subtype = string_field(object, "subtype")
        .or_else(|| string_field(object, "type"))
        .unwrap_or_else(|| "outpost".to_string());
    let category = parse_category(
        object
            .get("category")
            .and_then(|value| value.as_str())
            .or_else(|| object.get("type").and_then(|value| value.as_str())),
    );
    let status = parse_status(
        object
            .get("status")
            .and_then(|value| value.as_str())
            .unwrap_or("stable"),
    );
    let scale = parse_scale(
        object
            .get("scale")
            .and_then(|value| value.as_str())
            .unwrap_or("small"),
    );
    let population_estimate = object
        .get("populationEstimate")
        .or_else(|| object.get("population"))
        .and_then(|value| value.as_u64());
    let history_hooks = object
        .get("historyHooks")
        .and_then(|value| serde_json::from_value::<LocationHistoryHooks>(value.clone()).ok())
        .unwrap_or_else(|| LocationHistoryHooks {
            founding_reason: "Recovered from legacy location data.".to_string(),
            current_tension: "No current tension has been documented yet.".to_string(),
            story_seeds: vec!["Map the surrounding territory.".to_string()],
            linked_lore_snippet_ids: Vec::new(),
        });

    Some(normalize_location_record(&LocationRecord {
        id: string_field(object, "id").unwrap_or_else(deterministic_uuid_like),
        name: string_field(object, "name").unwrap_or_else(|| "Unnamed Location".to_string()),
        category,
        subtype: subtype.clone(),
        status,
        scale,
        province_id,
        province_region_id: string_field(object, "provinceRegionId")
            .unwrap_or_else(|| province_region_id(province_id)),
        province_name,
        duchy_id: object
            .get("duchyId")
            .and_then(|value| value.as_u64())
            .map(|value| value as u32),
        kingdom_id: object
            .get("kingdomId")
            .and_then(|value| value.as_u64())
            .map(|value| value as u32),
        continent_id: object
            .get("continentId")
            .and_then(|value| value.as_u64())
            .map(|value| value as u32),
        x: object
            .get("x")
            .and_then(|value| value.as_f64())
            .unwrap_or(0.5) as f32,
        y: object
            .get("y")
            .and_then(|value| value.as_f64())
            .unwrap_or(0.5) as f32,
        population_estimate,
        importance: object
            .get("importance")
            .and_then(|value| value.as_u64())
            .unwrap_or(40) as u32,
        habitability_score: object
            .get("habitabilityScore")
            .and_then(|value| value.as_u64())
            .unwrap_or(40) as u32,
        economic_score: object
            .get("economicScore")
            .and_then(|value| value.as_u64())
            .unwrap_or(35) as u32,
        strategic_score: object
            .get("strategicScore")
            .and_then(|value| value.as_u64())
            .unwrap_or(30) as u32,
        hazard_score: object
            .get("hazardScore")
            .and_then(|value| value.as_u64())
            .unwrap_or(30) as u32,
        ruling_faction: normalize_ruling_faction(
            object
                .get("rulingFaction")
                .and_then(|value| value.as_str())
                .unwrap_or("None"),
        ),
        tags: object
            .get("tags")
            .and_then(|value| value.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default(),
        placement_drivers: object
            .get("placementDrivers")
            .and_then(|value| value.as_array())
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default(),
        history_hooks,
        lore: string_field(object, "lore").unwrap_or_default(),
        source: parse_record_source(object.get("source").and_then(|value| value.as_str())),
        is_customized: object
            .get("isCustomized")
            .and_then(|value| value.as_bool())
            .unwrap_or(false),
        last_humanity_job_id: string_field(object, "lastHumanityJobId"),
        type_label: string_field(object, "type").unwrap_or_else(|| title_case(&subtype)),
    }))
}

fn read_luma_u8(path: PathBuf) -> Result<image::GrayImage, String> {
    image::open(path)
        .map_err(|e| format!("Failed to read raster: {e}"))
        .map(|image| image.to_luma8())
}

fn read_luma_u16(path: PathBuf) -> Result<image::ImageBuffer<image::Luma<u16>, Vec<u16>>, String> {
    image::open(path)
        .map_err(|e| format!("Failed to read height raster: {e}"))
        .map(|image| image.to_luma16())
}

fn analyze_rasters(
    province_image: &image::RgbImage,
    landmask: &image::GrayImage,
    river_mask: &image::GrayImage,
    height: &image::ImageBuffer<image::Luma<u16>, Vec<u16>>,
    cell_features: Option<&CellFeaturesLite>,
) -> HashMap<u32, ProvinceRasterStats> {
    let width = province_image.width();
    let raster_height = province_image.height();
    let mut stats: HashMap<u32, ProvinceRasterStats> = HashMap::new();
    let cell_grid = cell_features.map(|entry| {
        let map = entry
            .cells
            .iter()
            .map(|cell| ((cell.x, cell.y), cell.clone()))
            .collect::<HashMap<_, _>>();
        (entry.cols, entry.rows, map)
    });

    for y in 0..raster_height {
        for x in 0..width {
            let province_id = decode_rgb_id(province_image.get_pixel(x, y).0);
            let entry = stats
                .entry(province_id)
                .or_insert_with(ProvinceRasterStats::new);
            entry.total_pixels += 1;
            let is_land = landmask.get_pixel(x, y).0[0] > 0;
            if is_land {
                entry.land_pixels += 1;
            }
            if river_mask.get_pixel(x, y).0[0] > 0 {
                entry.river_pixels += 1;
            }
            if is_land && is_coastal_pixel(x, y, landmask) {
                entry.coast_pixels += 1;
            }

            if x % 4 == 0 && y % 4 == 0 {
                let elevation = height.get_pixel(x, y).0[0] as f32 / 65535.0;
                let slope = local_slope(height, x, y);
                entry.sample_count += 1;
                entry.mean_elevation += elevation;
                entry.mean_slope += slope;
                entry.max_slope = entry.max_slope.max(slope);
                if slope >= 0.12 {
                    entry.steep_pixels += 1;
                }
                if is_land && x % 8 == 0 && y % 8 == 0 {
                    let (cell_vegetation, cell_aridity, terrain_bonus) =
                        if let Some((cols, rows, features)) = &cell_grid {
                            let cell_x = ((x as f32 / width as f32) * *cols as f32)
                                .floor()
                                .min((*cols - 1) as f32)
                                as u32;
                            let cell_y = ((y as f32 / raster_height as f32) * *rows as f32)
                                .floor()
                                .min((*rows - 1) as f32)
                                as u32;
                            if let Some(cell) = features.get(&(cell_x, cell_y)) {
                                let terrain_bonus = match cell.terrain_class.as_str() {
                                    "plains" | "lowland" => 0.18,
                                    "plateau" => 0.1,
                                    "highland" => 0.04,
                                    _ => 0.0,
                                };
                                (
                                    cell.vegetation_index as f32,
                                    cell.aridity_index as f32,
                                    terrain_bonus,
                                )
                            } else {
                                (0.4, 0.4, 0.0)
                            }
                        } else {
                            (0.4, 0.4, 0.0)
                        };
                    let candidate_score = ((if river_mask.get_pixel(x, y).0[0] > 0 {
                        0.45
                    } else {
                        0.0
                    }) + (if is_coastal_pixel(x, y, landmask) {
                        0.3
                    } else {
                        0.0
                    }) + (1.0 - slope.clamp(0.0, 1.0)) * 0.2
                        + terrain_bonus
                        + cell_vegetation * 0.08
                        + (1.0 - cell_aridity) * 0.06)
                        .clamp(0.0, 1.0);
                    entry.candidate_points.push(CandidatePoint {
                        x: x as f32 / width as f32,
                        y: y as f32 / raster_height as f32,
                        river: river_mask.get_pixel(x, y).0[0] > 0,
                        coastal: is_coastal_pixel(x, y, landmask),
                        slope,
                        elevation,
                        score: candidate_score,
                    });
                }
            }
        }
    }

    for entry in stats.values_mut() {
        if entry.sample_count > 0 {
            entry.mean_elevation /= entry.sample_count as f32;
            entry.mean_slope /= entry.sample_count as f32;
        }
        entry.candidate_points.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        entry.candidate_points.truncate(64);
    }

    stats
}

fn build_continent_index(continents: &[ContinentRecord]) -> HashMap<u32, u32> {
    let mut map = HashMap::new();
    for continent in continents {
        for province_id in &continent.province_ids {
            map.insert(*province_id, continent.id);
        }
    }
    map
}

fn compute_viability(
    biome_id: &str,
    raster: &ProvinceRasterStats,
    adjacency: &ProvinceAdjacency,
) -> ProvinceViability {
    let land_share = if raster.total_pixels == 0 {
        0.0
    } else {
        raster.land_pixels as f32 / raster.total_pixels as f32
    };
    let oceanic = matches!(biome_id, "ocean" | "deep_ocean" | "abyssal_ocean");
    let extreme_hazard = biome_hazard_bias(biome_id) >= 0.85
        && raster.river_pixels == 0
        && adjacency.neighbors.is_empty();
    let candidate_anchorable = raster
        .candidate_points
        .iter()
        .any(|point| point.slope < 0.3 && point.elevation > 0.05);
    ProvinceViability {
        is_viable_land: !oceanic && land_share >= 0.2 && candidate_anchorable && !extreme_hazard,
        allows_maritime_location: oceanic && (raster.coast_pixels > 0 || raster.river_pixels > 0),
        land_share,
    }
}

fn compute_scores(
    province: &ProvinceRecord,
    raster: &ProvinceRasterStats,
    ecology: Option<&EcologyProvinceRecordLite>,
    adjacency: &ProvinceAdjacency,
    biome_id: &str,
    tech_level: f32,
) -> ProvinceScores {
    let land_share = if raster.total_pixels == 0 {
        0.0
    } else {
        raster.land_pixels as f32 / raster.total_pixels as f32
    };
    let water_access = ((raster.river_pixels as f32 / (raster.land_pixels.max(1) as f32)) * 55.0
        + (raster.coast_pixels as f32 / raster.land_pixels.max(1) as f32) * 45.0)
        .clamp(0.0, 1.0);
    let terrain_ease = (1.0 - (raster.mean_slope * 4.0).clamp(0.0, 1.0)) * 0.7
        + (1.0 - (raster.max_slope * 2.5).clamp(0.0, 1.0)) * 0.3;
    let biome_suitability = biome_suitability(biome_id);
    let ecology_agriculture = ecology
        .map(|entry| (entry.agriculture_potential / 100.0).clamp(0.0, 1.0))
        .unwrap_or_else(|| biome_agriculture_bias(biome_id));
    let ecology_hazard = ecology
        .map(|entry| {
            ((entry.fauna_ids.len() as f32 * 0.08) + (entry.ecological_potential / 180.0))
                .clamp(0.0, 1.0)
        })
        .unwrap_or(0.25);
    let climate_stability = (1.0 - biome_hazard_bias(biome_id) * 0.8)
        .clamp(0.0, 1.0)
        .mul_add(0.7, land_share * 0.3);

    let route_access = ((adjacency.neighbors.len() as f32 / 8.0).clamp(0.0, 1.0) * 0.55
        + water_access * 0.25
        + (1.0 - raster.mean_slope.clamp(0.0, 1.0)) * 0.2)
        .clamp(0.0, 1.0);
    let coastal_trade =
        (raster.coast_pixels as f32 / raster.land_pixels.max(1) as f32).clamp(0.0, 1.0);
    let relief_bonus = (raster.max_slope * 2.2).clamp(0.0, 1.0);
    let resource_potential = ((relief_bonus * 0.4)
        + (biome_resource_bias(biome_id) * 0.35)
        + ((ecology_hazard + coastal_trade) * 0.25))
        .clamp(0.0, 1.0);
    let defensibility = ((relief_bonus * 0.45)
        + ((adjacency
            .neighbors
            .iter()
            .filter(|edge| edge.crosses_river)
            .count() as f32
            / 6.0)
            .clamp(0.0, 1.0)
            * 0.2)
        + ((raster.mean_elevation * 1.1).clamp(0.0, 1.0) * 0.35))
        .clamp(0.0, 1.0);
    let chokepoint = if adjacency.neighbors.is_empty() {
        0.0
    } else {
        let border_total = adjacency
            .neighbors
            .iter()
            .take(4)
            .map(|edge| edge.shared_border_length)
            .sum::<u32>() as f32;
        ((1.0 - (adjacency.neighbors.len() as f32 / 10.0).clamp(0.0, 1.0)) * 0.5
            + (border_total / 8000.0).clamp(0.0, 1.0) * 0.5)
            .clamp(0.0, 1.0)
    };
    let hierarchy_centrality = ((province.area as f32 / 70000.0).clamp(0.0, 1.0) * 0.6
        + (route_access * 0.4))
        .clamp(0.0, 1.0);
    let border_control = ((adjacency.neighbors.len() as f32 / 6.0).clamp(0.0, 1.0) * 0.6
        + (defensibility * 0.4))
        .clamp(0.0, 1.0);
    let aridity_instability =
        (1.0 - ecology_agriculture).clamp(0.0, 1.0) * 0.55 + biome_hazard_bias(biome_id) * 0.45;
    let elevation_volatility = ((raster.max_slope * 3.0).clamp(0.0, 1.0) * 0.7
        + (raster.mean_elevation * 0.3))
        .clamp(0.0, 1.0);

    let habitability = (0.30 * water_access
        + 0.20 * terrain_ease
        + 0.20 * biome_suitability
        + 0.15 * ecology_agriculture
        + 0.15 * climate_stability)
        .clamp(0.0, 1.0);
    let economic = (0.35 * route_access
        + 0.25 * ecology_agriculture
        + 0.25 * resource_potential
        + 0.15 * coastal_trade)
        .clamp(0.0, 1.0);
    let strategic = (0.35 * defensibility
        + 0.25 * chokepoint
        + 0.20 * hierarchy_centrality
        + 0.20 * border_control)
        .clamp(0.0, 1.0);
    let hazard = (0.40 * biome_hazard_bias(biome_id)
        + 0.25 * aridity_instability
        + 0.20 * ecology_hazard
        + 0.15 * elevation_volatility)
        .clamp(0.0, 1.0);

    // Technology nudges infrastructure/resource viability.
    let tech_bonus = (tech_level - 0.5).max(0.0) * 12.0;

    ProvinceScores {
        habitability: (habitability * 100.0).round() as u32,
        economic: ((economic * 100.0) + tech_bonus).round().clamp(0.0, 100.0) as u32,
        strategic: (strategic * 100.0).round() as u32,
        hazard: (hazard * 100.0).round() as u32,
        resource_potential: (resource_potential * 100.0).round() as u32,
        climate_stability: (climate_stability * 100.0).round() as u32,
    }
}

fn mark_seats(contexts: &mut [ProvinceContext]) {
    let mut duchy_best: HashMap<u32, (u32, f32)> = HashMap::new();
    let mut kingdom_best: HashMap<u32, (u32, f32)> = HashMap::new();

    for context in contexts.iter() {
        let seat_score = context.scores.habitability as f32 * 0.4
            + context.scores.economic as f32 * 0.35
            + context.scores.strategic as f32 * 0.15
            + (context.province.area as f32 / 1200.0).min(25.0)
            + context.viability.land_share * 10.0;
        duchy_best
            .entry(context.province.duchy_id)
            .and_modify(|entry| {
                if seat_score > entry.1 {
                    *entry = (context.province.id, seat_score);
                }
            })
            .or_insert((context.province.id, seat_score));
        kingdom_best
            .entry(context.province.kingdom_id)
            .and_modify(|entry| {
                if seat_score > entry.1 {
                    *entry = (context.province.id, seat_score);
                }
            })
            .or_insert((context.province.id, seat_score));
    }

    for context in contexts.iter_mut() {
        context.is_duchy_seat = duchy_best
            .get(&context.province.duchy_id)
            .map(|(province_id, _)| *province_id == context.province.id)
            .unwrap_or(false);
        context.is_kingdom_capital = kingdom_best
            .get(&context.province.kingdom_id)
            .map(|(province_id, _)| *province_id == context.province.id)
            .unwrap_or(false);
    }
}

fn upper_area_quartile(contexts: &[ProvinceContext]) -> u32 {
    let mut areas = contexts
        .iter()
        .map(|ctx| ctx.province.area)
        .collect::<Vec<_>>();
    areas.sort_unstable();
    if areas.is_empty() {
        0
    } else {
        areas[(areas.len() * 3 / 4).min(areas.len() - 1)]
    }
}

fn compute_node_count(
    context: &ProvinceContext,
    area_quartile: u32,
    settlement_density: f32,
) -> usize {
    let density_bias = ((settlement_density - 0.5) * 10.0).round() as i32;
    let mut count = 1i32;
    if context.scores.habitability as i32 >= 55 - density_bias {
        count += 1;
    }
    if context.scores.economic as i32 >= 65 - density_bias {
        count += 1;
    }
    if context.scores.strategic as i32 >= 70 - density_bias {
        count += 1;
    }
    if context.province.area >= area_quartile {
        count += 1;
    }
    if context.is_duchy_seat || context.is_kingdom_capital {
        count += 1;
    }
    count.clamp(1, 6) as usize
}

fn choose_anchors(context: &ProvinceContext, node_count: usize) -> Vec<CandidatePoint> {
    if context.raster.candidate_points.is_empty() {
        return vec![fallback_anchor(context)];
    }
    let mut chosen = Vec::new();
    let min_distance = (0.01 + (context.province.area as f32 / 8_000_000.0)).clamp(0.01, 0.08);
    for candidate in &context.raster.candidate_points {
        if chosen.iter().all(|existing: &CandidatePoint| {
            distance(existing.x, existing.y, candidate.x, candidate.y) >= min_distance
        }) {
            chosen.push(candidate.clone());
        }
        if chosen.len() >= node_count {
            break;
        }
    }
    if chosen.is_empty() {
        chosen.push(fallback_anchor(context));
    }
    chosen
}

fn fallback_anchor(context: &ProvinceContext) -> CandidatePoint {
    CandidatePoint {
        x: context.province.seed_x as f32 / 4096.0,
        y: context.province.seed_y as f32 / 2048.0,
        river: false,
        coastal: false,
        slope: context.raster.mean_slope,
        elevation: context.raster.mean_elevation,
        score: 0.3,
    }
}

fn build_location_blueprint(
    context: &ProvinceContext,
    world_context: &WorldContext,
    anchor: &CandidatePoint,
    index: usize,
    node_count: usize,
    request: &LocationGenerationRequest,
    target_settlement_ratio: f32,
    current_settlement_count: usize,
    current_total_count: usize,
    ensure_non_settlement: bool,
) -> LocationBlueprint {
    let current_ratio = if current_total_count == 0 {
        0.0
    } else {
        current_settlement_count as f32 / current_total_count as f32
    };
    let preferred_settlement = current_ratio <= target_settlement_ratio;
    let classification = classify_location(
        context,
        anchor,
        index,
        node_count,
        request.tech_level,
        preferred_settlement,
        ensure_non_settlement,
    );
    let scale = classify_scale(context, &classification.subtype);
    let type_label = subtype_display_label(&classification.subtype);
    let importance = compute_importance(context, &classification.subtype, &scale, index);
    let population_estimate = estimate_population(
        &classification.category,
        &classification.subtype,
        &scale,
        context,
        request.tech_level,
    );
    let status = classify_status(&classification.category, context, &classification.subtype);
    let placement_drivers = describe_placement_drivers(context, anchor, &classification.subtype);
    let lore_links = match_lore_snippets(world_context, &classification.subtype, &context.biome_id);
    let history_hooks = build_history_hooks(
        context,
        &classification.subtype,
        &placement_drivers,
        &lore_links,
    );
    let fallback_name = fallback_location_name(
        &world_context.seed_hash,
        context,
        &classification.subtype,
        &classification.category,
    );
    let tags = build_tags(context, &classification.subtype, &classification.category);
    let lore = fallback_location_lore(context, &classification.subtype, &history_hooks);

    LocationBlueprint {
        province_id: context.province.id,
        location: LocationRecord {
            id: deterministic_location_id(context.province.id, index, &classification.subtype),
            name: fallback_name,
            category: classification.category,
            subtype: classification.subtype.clone(),
            status,
            scale,
            province_id: context.province.id,
            province_region_id: province_region_id(context.province.id),
            province_name: context.province.name.clone(),
            duchy_id: Some(context.province.duchy_id),
            kingdom_id: Some(context.province.kingdom_id),
            continent_id: context.continent_id,
            x: anchor.x,
            y: anchor.y,
            population_estimate,
            importance,
            habitability_score: context.scores.habitability,
            economic_score: context.scores.economic,
            strategic_score: context.scores.strategic,
            hazard_score: context.scores.hazard,
            ruling_faction: "None".to_string(),
            tags,
            placement_drivers,
            history_hooks,
            lore,
            source: RecordSource::HumanityGenerated,
            is_customized: false,
            last_humanity_job_id: None,
            type_label,
        },
    }
}

struct LocationClassification {
    category: LocationCategory,
    subtype: String,
}

fn classify_location(
    context: &ProvinceContext,
    anchor: &CandidatePoint,
    index: usize,
    node_count: usize,
    tech_level: f32,
    preferred_settlement: bool,
    ensure_non_settlement: bool,
) -> LocationClassification {
    let h = context.scores.habitability;
    let e = context.scores.economic;
    let s = context.scores.strategic;
    let z = context.scores.hazard;
    let resource = context.scores.resource_potential;

    if index == 0 && context.is_kingdom_capital && h >= 60 && e >= 60 {
        return LocationClassification {
            category: LocationCategory::Settlement,
            subtype: if tech_level >= 0.65 {
                "capital".to_string()
            } else {
                "major_city".to_string()
            },
        };
    }
    if index == 0 && context.is_duchy_seat && h >= 45 {
        return LocationClassification {
            category: LocationCategory::Settlement,
            subtype: if s >= 60 && h < 58 {
                "fortified_town".to_string()
            } else if e >= 58 {
                "market_town".to_string()
            } else {
                "seat".to_string()
            },
        };
    }
    if anchor.coastal && e >= 60 {
        return LocationClassification {
            category: LocationCategory::Infrastructure,
            subtype: if tech_level >= 0.6 {
                "sea_gate".to_string()
            } else if preferred_settlement && !ensure_non_settlement {
                "port".to_string()
            } else {
                "harbor".to_string()
            },
        };
    }
    if anchor.river && e >= 52 {
        return LocationClassification {
            category: if preferred_settlement && !ensure_non_settlement {
                LocationCategory::Settlement
            } else {
                LocationCategory::Infrastructure
            },
            subtype: if preferred_settlement && !ensure_non_settlement {
                "market_town".to_string()
            } else if s >= 50 {
                "bridge_crossing".to_string()
            } else {
                "caravan_post".to_string()
            },
        };
    }
    if s >= 72 && h <= 55 {
        return LocationClassification {
            category: LocationCategory::Military,
            subtype: if anchor.elevation >= 0.62 {
                "mountain_pass".to_string()
            } else if z >= 55 {
                "border_keep".to_string()
            } else if index == 0 {
                "fort".to_string()
            } else {
                "watchtower".to_string()
            },
        };
    }
    if resource >= 62 {
        return LocationClassification {
            category: LocationCategory::Resource,
            subtype: if tech_level >= 0.68 {
                "salvage_field".to_string()
            } else if context.biome_id.contains("forest") || context.biome_id.contains("rainforest")
            {
                "logging_hold".to_string()
            } else if anchor.elevation >= 0.58 {
                "mine".to_string()
            } else {
                "quarry".to_string()
            },
        };
    }
    if z >= 68 || (h < 36 && e < 36) {
        return LocationClassification {
            category: if z >= 78 {
                LocationCategory::Hazard
            } else {
                LocationCategory::Ruin
            },
            subtype: if z >= 80 {
                "forbidden_zone".to_string()
            } else if context.biome_id.contains("crater") {
                "crater_site".to_string()
            } else if anchor.coastal {
                "wreck".to_string()
            } else if context.biome_id.contains("ash") {
                "ash_field".to_string()
            } else if context.biome_id.contains("glacier") || context.biome_id.contains("ice") {
                "anomaly".to_string()
            } else {
                "ruin".to_string()
            },
        };
    }
    if context.biome_id.contains("crater")
        || context.biome_id.contains("volcan")
        || context.biome_id.contains("reef")
        || context.biome_id.contains("wetland")
    {
        return LocationClassification {
            category: LocationCategory::Landmark,
            subtype: if context.biome_id.contains("reef") {
                "reef_site".to_string()
            } else if context.biome_id.contains("crater") {
                "crater_site".to_string()
            } else {
                "observatory".to_string()
            },
        };
    }
    if context.ecology.is_some() && z <= 60 && (index + 1 == node_count || ensure_non_settlement) {
        return LocationClassification {
            category: LocationCategory::Religious,
            subtype: if context.biome_id.contains("forest")
                || context.biome_id.contains("rainforest")
            {
                "sacred_grove".to_string()
            } else if context.biome_id.contains("coast") || anchor.coastal {
                "shrine".to_string()
            } else {
                "temple".to_string()
            },
        };
    }
    if preferred_settlement && !ensure_non_settlement && h >= 48 {
        return LocationClassification {
            category: LocationCategory::Settlement,
            subtype: if h >= 72 && e >= 60 {
                "major_city".to_string()
            } else if e >= 50 {
                "market_town".to_string()
            } else {
                "hamlet".to_string()
            },
        };
    }
    if ensure_non_settlement {
        return LocationClassification {
            category: LocationCategory::Landmark,
            subtype: if context.biome_id.contains("forest") || context.biome_id.contains("steppe") {
                "beast_ground".to_string()
            } else {
                "observatory".to_string()
            },
        };
    }
    LocationClassification {
        category: LocationCategory::Wild,
        subtype: if context.biome_id.contains("forest") || context.biome_id.contains("rainforest") {
            "beast_ground".to_string()
        } else {
            "waystation".to_string()
        },
    }
}

fn classify_scale(context: &ProvinceContext, subtype: &str) -> LocationScale {
    if subtype == "capital" {
        return LocationScale::Grand;
    }
    let combined = context.scores.habitability + context.scores.economic + context.scores.strategic;
    match combined {
        230..=u32::MAX => LocationScale::Grand,
        180..=229 => LocationScale::Major,
        135..=179 => LocationScale::Medium,
        90..=134 => LocationScale::Small,
        _ => LocationScale::Minor,
    }
}

fn compute_importance(
    context: &ProvinceContext,
    subtype: &str,
    scale: &LocationScale,
    index: usize,
) -> u32 {
    let mut importance = (context.scores.habitability as f32 * 0.3
        + context.scores.economic as f32 * 0.35
        + context.scores.strategic as f32 * 0.2
        + (100 - context.scores.hazard) as f32 * 0.15)
        .round() as u32;
    if context.is_duchy_seat {
        importance += 8;
    }
    if context.is_kingdom_capital {
        importance += 14;
    }
    if matches!(subtype, "fort" | "border_keep" | "mountain_pass") {
        importance += 5;
    }
    importance = importance.saturating_sub((index as u32) * 4);
    match scale {
        LocationScale::Grand => importance.saturating_add(18).min(100),
        LocationScale::Major => importance.saturating_add(10).min(100),
        LocationScale::Medium => importance.min(100),
        LocationScale::Small => importance.saturating_sub(6).min(100),
        LocationScale::Minor => importance.saturating_sub(12).min(100),
    }
}

fn estimate_population(
    category: &LocationCategory,
    subtype: &str,
    scale: &LocationScale,
    context: &ProvinceContext,
    tech_level: f32,
) -> Option<u64> {
    let scale_base = match scale {
        LocationScale::Grand => 120_000,
        LocationScale::Major => 45_000,
        LocationScale::Medium => 12_000,
        LocationScale::Small => 3_200,
        LocationScale::Minor => 450,
    };
    let tech_multiplier = 0.75 + tech_level as f64 * 0.7;
    match category {
        LocationCategory::Settlement => Some(
            ((scale_base as f64)
                * tech_multiplier
                * (0.7 + context.scores.habitability as f64 / 100.0))
                .round()
                .max(80.0) as u64,
        ),
        LocationCategory::Infrastructure | LocationCategory::Resource => {
            let staffing = match subtype {
                "sea_gate" | "port" | "harbor" => 2_400,
                "mine" | "quarry" | "salvage_field" => 1_800,
                "bridge_crossing" | "caravan_post" | "waystation" => 600,
                _ => 320,
            };
            Some(
                ((staffing as f64)
                    * tech_multiplier
                    * (0.8 + context.scores.economic as f64 / 100.0))
                    .round()
                    .max(40.0) as u64,
            )
        }
        _ => None,
    }
}

fn classify_status(
    category: &LocationCategory,
    context: &ProvinceContext,
    subtype: &str,
) -> LocationStatus {
    match category {
        LocationCategory::Hazard => {
            if context.scores.hazard >= 82 {
                LocationStatus::Forbidden
            } else {
                LocationStatus::Contested
            }
        }
        LocationCategory::Ruin => {
            if subtype == "wreck" {
                LocationStatus::Ruined
            } else {
                LocationStatus::Abandoned
            }
        }
        LocationCategory::Military => {
            if context.scores.hazard >= 65 {
                LocationStatus::Contested
            } else {
                LocationStatus::Stable
            }
        }
        LocationCategory::Settlement => {
            if context.scores.habitability >= 74
                && context.scores.economic >= 68
                && context.scores.hazard <= 42
            {
                LocationStatus::Thriving
            } else if context.scores.hazard >= 70 {
                LocationStatus::Struggling
            } else if context.scores.strategic >= 74 && context.scores.hazard >= 55 {
                LocationStatus::Contested
            } else if context.scores.habitability <= 40 {
                LocationStatus::Declining
            } else {
                LocationStatus::Stable
            }
        }
        LocationCategory::Religious => LocationStatus::Stable,
        LocationCategory::Wild => LocationStatus::Seasonal,
        _ => {
            if context.scores.hazard >= 72 {
                LocationStatus::Struggling
            } else {
                LocationStatus::Stable
            }
        }
    }
}

fn describe_placement_drivers(
    context: &ProvinceContext,
    anchor: &CandidatePoint,
    subtype: &str,
) -> Vec<String> {
    let mut drivers = Vec::new();
    if anchor.river {
        drivers.push("river access".to_string());
    }
    if anchor.coastal {
        drivers.push("coastal approach".to_string());
    }
    if context.scores.strategic >= 65 {
        drivers.push("defensible terrain".to_string());
    }
    if context.scores.economic >= 60 {
        drivers.push("trade connectivity".to_string());
    }
    if context.scores.resource_potential >= 60 {
        drivers.push("resource extraction".to_string());
    }
    if context.scores.hazard >= 65 {
        drivers.push("hazard frontier".to_string());
    }
    if subtype == "capital" || subtype == "seat" {
        drivers.push("regional administration".to_string());
    }
    if drivers.is_empty() {
        drivers.push("territorial waypoint".to_string());
    }
    drivers
}

fn match_lore_snippets(world_context: &WorldContext, subtype: &str, biome_id: &str) -> Vec<String> {
    let search_terms = [
        subtype,
        biome_id,
        if subtype.contains("crater") {
            "crater"
        } else {
            ""
        },
        if subtype.contains("ash") { "ash" } else { "" },
        if subtype.contains("wreck") {
            "orbit"
        } else {
            ""
        },
    ];
    world_context
        .lore_snippets
        .iter()
        .filter(|snippet| {
            let haystack = format!(
                "{} {} {}",
                snippet.title.clone().unwrap_or_default(),
                snippet.location,
                snippet.content
            )
            .to_lowercase();
            search_terms
                .iter()
                .filter(|term| !term.is_empty())
                .any(|term| haystack.contains(&term.to_lowercase()))
        })
        .map(|snippet| snippet.id.clone())
        .take(3)
        .collect()
}

fn build_history_hooks(
    context: &ProvinceContext,
    subtype: &str,
    drivers: &[String],
    linked_lore_snippet_ids: &[String],
) -> LocationHistoryHooks {
    let founding_reason = if context.is_kingdom_capital {
        "It became the most sustainable seat from which to coordinate nearby provinces.".to_string()
    } else if context.is_duchy_seat {
        "It consolidated nearby routes and resources into a dependable local seat.".to_string()
    } else if drivers.iter().any(|driver| driver == "river access") {
        "It formed where reliable freshwater and movement corridors converged.".to_string()
    } else if drivers.iter().any(|driver| driver == "coastal approach") {
        "It grew at a shoreline approach that was easier to reach than the surrounding coast."
            .to_string()
    } else if matches!(subtype, "mine" | "quarry" | "salvage_field") {
        "It exists because the surrounding ground still yields something worth the risk of staying."
            .to_string()
    } else if matches!(subtype, "fort" | "border_keep" | "watchtower") {
        "It was established to hold terrain that mattered more than comfort.".to_string()
    } else {
        "It persisted because this province offered one of the few workable anchors in the region."
            .to_string()
    };
    let current_tension = if context.scores.hazard >= 72 {
        "Environmental pressure keeps the site useful but perpetually unstable.".to_string()
    } else if context.scores.strategic >= 72 {
        "Control of the site shapes movement through the wider province.".to_string()
    } else if context.scores.economic >= 68 {
        "Its value depends on keeping trade and extraction flowing despite local strain."
            .to_string()
    } else {
        "Its future depends on whether nearby powers can justify maintaining it.".to_string()
    };
    let story_seeds = vec![
        format!(
            "Determine who benefits most from {}",
            subtype_display_label(subtype)
        ),
        format!(
            "Trace what nearby threat could sever {}",
            drivers
                .first()
                .cloned()
                .unwrap_or_else(|| "its local role".to_string())
        ),
        "Identify a buried or ignored detail that would change how outsiders value the site."
            .to_string(),
    ];
    LocationHistoryHooks {
        founding_reason,
        current_tension,
        story_seeds,
        linked_lore_snippet_ids: linked_lore_snippet_ids.to_vec(),
    }
}

fn build_tags(
    context: &ProvinceContext,
    subtype: &str,
    category: &LocationCategory,
) -> Vec<String> {
    let mut tags = vec![
        title_case(&format!("{:?}", category).to_lowercase()),
        title_case(subtype),
        title_case(&context.biome_id.replace('_', " ")),
    ];
    if context.is_kingdom_capital {
        tags.push("Kingdom Seat".to_string());
    } else if context.is_duchy_seat {
        tags.push("Duchy Seat".to_string());
    }
    if context.scores.hazard >= 70 {
        tags.push("High Risk".to_string());
    }
    unique_strings(tags)
}

fn fallback_location_lore(
    context: &ProvinceContext,
    subtype: &str,
    history_hooks: &LocationHistoryHooks,
) -> String {
    let province = &context.province.name;
    let duchy = context
        .duchy
        .as_ref()
        .map(|entry| entry.name.as_str())
        .unwrap_or("its surrounding district");
    format!(
        "{} in {} persists as a {} shaped by {}. It sits within {} where habitability {}, economic leverage {}, and hazard {} continue to define daily decisions. {}",
        subtype_display_label(subtype),
        province,
        title_case(subtype).to_lowercase(),
        history_hooks
            .founding_reason
            .trim_end_matches('.')
            .to_lowercase(),
        duchy,
        score_descriptor(context.scores.habitability),
        score_descriptor(context.scores.economic),
        score_descriptor(context.scores.hazard),
        history_hooks.current_tension
    )
}

fn fallback_location_name(
    seed_hash: &str,
    context: &ProvinceContext,
    subtype: &str,
    category: &LocationCategory,
) -> String {
    let prefixes = [
        "North", "South", "East", "West", "High", "Low", "New", "Old", "Grey", "Red", "Stone",
        "Bright", "Deep", "Mist", "Iron", "Salt", "Green", "Black",
    ];
    let province_token = context
        .province
        .name
        .split_whitespace()
        .next()
        .unwrap_or("Province");
    let material = match category {
        LocationCategory::Settlement => "Hold",
        LocationCategory::Infrastructure => "Gate",
        LocationCategory::Resource => "Works",
        LocationCategory::Military => "Keep",
        LocationCategory::Religious => "Shrine",
        LocationCategory::Ruin => "Remnant",
        LocationCategory::Wild => "Reach",
        LocationCategory::Hazard => "Scar",
        LocationCategory::Landmark => "Spire",
    };
    let hash = short_hash(&format!(
        "{}:{}:{}:{}",
        seed_hash, context.province.id, subtype, province_token
    ));
    let prefix = prefixes[hash as usize % prefixes.len()];
    format!("{} {} {}", prefix, province_token, material)
}

async fn apply_ai_details(
    world_context: &WorldContext,
    contexts: &[ProvinceContext],
    locations: &mut [LocationRecord],
) -> AiDetailPassSummary {
    let Some(_) = std::env::var("GEMINI_API_KEY").ok() else {
        return AiDetailPassSummary {
            status: "disabled".to_string(),
            attempted_batches: 0,
            successful_batches: 0,
            refined_locations: 0,
            total_locations: locations.len(),
        };
    };

    let context_map = contexts
        .iter()
        .map(|context| (context.province.id, context))
        .collect::<HashMap<_, _>>();
    let mut attempted_batches = 0usize;
    let mut successful_batches = 0usize;
    let mut refined_locations = 0usize;

    for batch in locations.chunks_mut(BATCH_SIZE) {
        attempted_batches += 1;
        let prompt = build_ai_prompt(world_context, &context_map, batch);
        match gemini::generate_text(&prompt).await {
            Ok(raw) => {
                if let Some(updates) = parse_ai_response(&raw) {
                    successful_batches += 1;
                    for update in updates {
                        if let Some(location) = batch.iter_mut().find(|entry| entry.id == update.id)
                        {
                            if !update.name.trim().is_empty() {
                                location.name = update.name.trim().to_string();
                            }
                            if !update.lore.trim().is_empty() {
                                location.lore = update.lore.trim().to_string();
                            }
                            if !update.type_label.trim().is_empty() {
                                location.type_label = update.type_label.trim().to_string();
                            }
                            if !update.tags.is_empty() {
                                location.tags = unique_strings(update.tags);
                            }
                            if let Some(history_hooks) = update.history_hooks {
                                location.history_hooks = history_hooks;
                            }
                            refined_locations += 1;
                        }
                    }
                }
            }
            Err(_) => {}
        }
    }

    let status = if successful_batches == 0 {
        "fallback_all"
    } else if refined_locations < locations.len() {
        "partial"
    } else {
        "complete"
    };

    AiDetailPassSummary {
        status: status.to_string(),
        attempted_batches,
        successful_batches,
        refined_locations,
        total_locations: locations.len(),
    }
}

fn build_ai_prompt(
    world_context: &WorldContext,
    context_map: &HashMap<u32, &ProvinceContext>,
    batch: &[LocationRecord],
) -> String {
    let lore_block = world_context
        .lore_snippets
        .iter()
        .take(5)
        .map(|snippet| {
            format!(
                "- {} :: {}",
                snippet
                    .title
                    .clone()
                    .unwrap_or_else(|| snippet.location.clone()),
                snippet.content.replace('\n', " ")
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let locations_json = serde_json::to_string_pretty(
        &batch
            .iter()
            .map(|location| {
                let province_context = context_map.get(&location.province_id);
                serde_json::json!({
                    "id": location.id,
                    "provinceName": location.province_name,
                    "category": location.category,
                    "subtype": location.subtype,
                    "status": location.status,
                    "scale": location.scale,
                    "habitabilityScore": location.habitability_score,
                    "economicScore": location.economic_score,
                    "strategicScore": location.strategic_score,
                    "hazardScore": location.hazard_score,
                    "placementDrivers": location.placement_drivers,
                    "fallbackName": location.name,
                    "fallbackLore": location.lore,
                    "biome": province_context.map(|ctx| ctx.biome_id.clone()).unwrap_or_else(|| "unknown".to_string()),
                    "ecologySummary": province_context.and_then(|ctx| ctx.ecology.as_ref().map(|entry| entry.description.clone())).unwrap_or_default(),
                })
            })
            .collect::<Vec<_>>(),
    )
    .unwrap_or_else(|_| "[]".to_string());

    format!(
        "You are generating grounded worldbuilding details for a planetary location simulation tool.\n\
Do not assume any specific setting such as Ashfall, Romoan, Avalon, post-apocalypse, or Earth-like history unless it is explicitly present in the supplied world context.\n\
The main lore is the hard canon anchor. Supporting lore may elaborate on it, but must never contradict or override it.\n\
Only refine the requested fields. Do not move locations, change their category, subtype, scores, or province. Keep all output localized to the supplied scope only.\n\
\n\
World Name: {world_name}\n\
Main Lore:\n{main_lore}\n\
\n\
Canonical World Prompt:\n{world_prompt}\n\
\n\
Seed Prompt:\n{seed_prompt}\n\
\n\
Humanity Direction:\n{humanity_prompt}\n\
\n\
Supporting Lore Snippets:\n{lore_block}\n\
\n\
Temporality:\n{temporality}\n\
\n\
Return ONLY a JSON array. Each object must contain exactly:\n\
- id: string\n\
- name: string\n\
- lore: string\n\
- typeLabel: string\n\
- tags: string[]\n\
- historyHooks: {{ foundingReason: string, currentTension: string, storySeeds: string[], linkedLoreSnippetIds: string[] }}\n\
\n\
Refine these locations:\n{locations_json}",
        world_name = world_context.world_name,
        main_lore = empty_fallback(&world_context.main_lore, "No main lore recorded."),
        world_prompt = empty_fallback(&world_context.world_prompt, "No canonical world prompt recorded."),
        seed_prompt = empty_fallback(&world_context.world_seed_prompt, "No seed prompt recorded."),
        humanity_prompt = empty_fallback(&world_context.humanity_prompt, "No additional humanity direction."),
        lore_block = empty_fallback(&lore_block, "No supporting lore snippets available."),
        temporality = serde_json::to_string_pretty(&world_context.temporality)
            .unwrap_or_else(|_| "null".to_string()),
        locations_json = locations_json,
    )
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiLocationUpdate {
    id: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    lore: String,
    #[serde(default)]
    type_label: String,
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    history_hooks: Option<LocationHistoryHooks>,
}

fn parse_ai_response(raw: &str) -> Option<Vec<AiLocationUpdate>> {
    let stripped = raw
        .replace("```json", "")
        .replace("```", "")
        .trim()
        .to_string();
    serde_json::from_str::<Vec<AiLocationUpdate>>(&stripped).ok()
}

fn build_generation_metadata(
    world_id: &str,
    request: &LocationGenerationRequest,
    contexts: &[ProvinceContext],
    locations: &[LocationRecord],
    resolved_province_ids: &[u32],
    seed_hash: &str,
    ai_detail_pass: AiDetailPassSummary,
) -> LocationGenerationMetadata {
    let resolved_province_set = resolved_province_ids
        .iter()
        .copied()
        .collect::<HashSet<_>>();
    let viable_provinces = contexts
        .iter()
        .filter(|context| resolved_province_set.contains(&context.province.id))
        .filter(|context| context.viability.is_viable_land)
        .map(|context| context.province.id)
        .collect::<HashSet<_>>();
    let scoped_locations = locations
        .iter()
        .filter(|location| resolved_province_set.contains(&location.province_id))
        .collect::<Vec<_>>();
    let covered_provinces = scoped_locations
        .iter()
        .map(|location| location.province_id)
        .collect::<HashSet<_>>();
    let uncovered_province_ids = viable_provinces
        .difference(&covered_provinces)
        .copied()
        .collect::<Vec<_>>();

    let mut counts_by_category = BTreeMap::new();
    let mut counts_by_subtype = BTreeMap::new();
    let settlement_count = scoped_locations
        .iter()
        .filter(|location| location.category == LocationCategory::Settlement)
        .count();
    for location in &scoped_locations {
        *counts_by_category
            .entry(format!("{:?}", location.category).to_lowercase())
            .or_insert(0usize) += 1;
        *counts_by_subtype
            .entry(location.subtype.clone())
            .or_insert(0usize) += 1;
    }

    LocationGenerationMetadata {
        world_id: world_id.to_string(),
        config: LocationGenerationConfig {
            prompt: request.prompt.clone(),
            settlement_density: request.settlement_density,
            tech_level: request.tech_level,
            scope_mode: request.scope_mode.clone(),
            scope_targets: request.scope_targets.clone(),
            resolved_province_ids: resolved_province_ids.to_vec(),
            generated_at: now_unix_ms(),
        },
        coverage: CoverageSummary {
            total_locations: scoped_locations.len(),
            settlement_count,
            non_settlement_count: scoped_locations.len().saturating_sub(settlement_count),
            viable_province_count: viable_provinces.len(),
            covered_viable_province_count: covered_provinces
                .intersection(&viable_provinces)
                .count(),
        },
        counts_by_category,
        counts_by_subtype,
        uncovered_province_ids,
        deterministic_seed_hash: seed_hash.to_string(),
        ai_detail_pass,
    }
}

fn load_world_context(
    planets_dir: &Path,
    world_id: &str,
    request: &LocationGenerationRequest,
) -> Result<WorldContext, String> {
    let metadata =
        read_optional_json::<serde_json::Value>(planets_dir.join(world_id).join("metadata.json"))
            .unwrap_or_else(|| serde_json::json!({}));
    let gm_settings = read_optional_json::<serde_json::Value>(
        planets_dir.join(world_id).join("gm_settings.json"),
    )
    .unwrap_or_else(|| serde_json::json!({}));
    let lore_snippets: Vec<LoreSnippetLite> =
        read_optional_json(planets_dir.join(world_id).join("lore_snippets.json"))
            .unwrap_or_default();
    let temporality = read_optional_json::<serde_json::Value>(
        planets_dir.join(world_id).join("temporality.json"),
    )
    .unwrap_or(serde_json::Value::Null);

    let world_name = metadata
        .get("name")
        .and_then(|value| value.as_str())
        .unwrap_or("Unknown World")
        .to_string();
    let world_seed_prompt = metadata
        .get("prompt")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let world_prompt = gm_settings
        .get("worldPrompt")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let main_lore = lore_snippets
        .iter()
        .find(|snippet| snippet.id == "main-lore" || snippet.priority == "main")
        .map(|snippet| snippet.content.trim().to_string())
        .unwrap_or_default();
    let supporting_lore = lore_snippets
        .into_iter()
        .filter(|snippet| {
            snippet.id != "main-lore"
                && matches!(snippet.source, RecordSource::Manual)
                && matches!(snippet.priority.as_str(), "critical" | "major")
        })
        .collect::<Vec<_>>();
    let seed_hash = short_hash(&format!(
        "{}:{}:{}:{:.3}:{:.3}:{:?}",
        world_id,
        world_name,
        request.prompt,
        request.settlement_density,
        request.tech_level,
        request.scope_targets
    ))
    .to_string();

    Ok(WorldContext {
        world_id: world_id.to_string(),
        seed_hash,
        world_name,
        world_prompt,
        world_seed_prompt,
        humanity_prompt: request.prompt.clone(),
        temporality,
        main_lore,
        lore_snippets: supporting_lore,
    })
}

fn read_json<T>(path: PathBuf) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    let data = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    serde_json::from_str(&data).map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
}

fn read_optional_json<T>(path: PathBuf) -> Option<T>
where
    T: for<'de> Deserialize<'de>,
{
    let data = fs::read_to_string(path).ok()?;
    serde_json::from_str(&data).ok()
}

fn write_json<T>(path: PathBuf, value: &T) -> Result<(), String>
where
    T: Serialize,
{
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create {}: {}", parent.display(), e))?;
    }
    let content = serde_json::to_string_pretty(value)
        .map_err(|e| format!("Failed to serialize JSON: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write {}: {}", path.display(), e))
}

fn province_region_id(province_id: u32) -> String {
    format!("{PROVINCE_REGION_PREFIX}{province_id}")
}

fn parse_province_id(
    province_id_value: Option<&serde_json::Value>,
    province_region_id_value: Option<&serde_json::Value>,
) -> Option<u32> {
    province_id_value
        .and_then(|value| value.as_u64().map(|entry| entry as u32))
        .or_else(|| {
            province_id_value.and_then(|value| {
                value
                    .as_str()
                    .and_then(|entry| entry.parse::<u32>().ok())
                    .or_else(|| {
                        value
                            .as_str()
                            .and_then(|entry| entry.strip_prefix(PROVINCE_REGION_PREFIX))
                            .and_then(|entry| entry.parse::<u32>().ok())
                    })
            })
        })
        .or_else(|| {
            province_region_id_value.and_then(|value| {
                value
                    .as_str()
                    .and_then(|entry| entry.strip_prefix(PROVINCE_REGION_PREFIX))
                    .and_then(|entry| entry.parse::<u32>().ok())
            })
        })
}

fn parse_category(raw: Option<&str>) -> LocationCategory {
    match raw.unwrap_or("wild").to_lowercase().as_str() {
        "settlement" | "urban" | "rural" => LocationCategory::Settlement,
        "infrastructure" | "outpost" => LocationCategory::Infrastructure,
        "resource" => LocationCategory::Resource,
        "military" | "fortress" => LocationCategory::Military,
        "religious" | "sacred" => LocationCategory::Religious,
        "ruin" | "ruins" | "dungeon" => LocationCategory::Ruin,
        "hazard" => LocationCategory::Hazard,
        "landmark" => LocationCategory::Landmark,
        _ => LocationCategory::Wild,
    }
}

fn parse_status(raw: &str) -> LocationStatus {
    match raw.to_lowercase().as_str() {
        "thriving" => LocationStatus::Thriving,
        "stable" => LocationStatus::Stable,
        "struggling" => LocationStatus::Struggling,
        "declining" => LocationStatus::Declining,
        "seasonal" => LocationStatus::Seasonal,
        "contested" => LocationStatus::Contested,
        "abandoned" => LocationStatus::Abandoned,
        "ruined" => LocationStatus::Ruined,
        "forbidden" => LocationStatus::Forbidden,
        "rebuilding" => LocationStatus::Stable,
        _ => LocationStatus::Stable,
    }
}

fn parse_scale(raw: &str) -> LocationScale {
    match raw.to_lowercase().as_str() {
        "minor" => LocationScale::Minor,
        "small" => LocationScale::Small,
        "medium" => LocationScale::Medium,
        "major" => LocationScale::Major,
        "grand" => LocationScale::Grand,
        _ => LocationScale::Small,
    }
}

fn string_field(object: &serde_json::Map<String, serde_json::Value>, key: &str) -> Option<String> {
    object
        .get(key)
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn deterministic_uuid_like() -> String {
    let hash = short_hash(&format!("legacy-{}", now_unix_ms()));
    format!(
        "{:08x}-{:04x}-4{:03x}-a{:03x}-{:012x}",
        hash,
        hash >> 16,
        hash & 0x0fff,
        (hash >> 4) & 0x0fff,
        (hash as u64) << 12
    )
}

fn deterministic_location_id(province_id: u32, index: usize, subtype: &str) -> String {
    let hash = short_hash(&format!("{province_id}:{index}:{subtype}"));
    format!(
        "{:08x}-{:04x}-4{:03x}-a{:03x}-{:012x}",
        hash,
        hash >> 16,
        hash & 0x0fff,
        (hash >> 4) & 0x0fff,
        (hash as u64) << 12
    )
}

fn short_hash(input: &str) -> u32 {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let digest = hasher.finalize();
    u32::from_be_bytes([digest[0], digest[1], digest[2], digest[3]])
}

fn decode_rgb_id(rgb: [u8; 3]) -> u32 {
    decode_id_rgb(rgb)
}

fn is_coastal_pixel(x: u32, y: u32, landmask: &image::GrayImage) -> bool {
    let width = landmask.width();
    let height = landmask.height();
    if landmask.get_pixel(x, y).0[0] == 0 {
        return false;
    }
    for dx in -1i32..=1 {
        for dy in -1i32..=1 {
            if dx == 0 && dy == 0 {
                continue;
            }
            let nx = ((x as i32 + dx).rem_euclid(width as i32)) as u32;
            let ny = y as i32 + dy;
            if ny < 0 || ny >= height as i32 {
                continue;
            }
            if landmask.get_pixel(nx, ny as u32).0[0] == 0 {
                return true;
            }
        }
    }
    false
}

fn local_slope(height: &image::ImageBuffer<image::Luma<u16>, Vec<u16>>, x: u32, y: u32) -> f32 {
    let width = height.width();
    let height_dim = height.height();
    let left_x = if x == 0 { width - 1 } else { x - 1 };
    let right_x = if x == width - 1 { 0 } else { x + 1 };
    let up_y = if y == 0 { y } else { y - 1 };
    let down_y = if y == height_dim - 1 { y } else { y + 1 };

    let dh_dx = (height.get_pixel(right_x, y).0[0] as f32
        - height.get_pixel(left_x, y).0[0] as f32)
        / 65535.0;
    let dh_dy =
        (height.get_pixel(x, down_y).0[0] as f32 - height.get_pixel(x, up_y).0[0] as f32) / 65535.0;
    (dh_dx * dh_dx + dh_dy * dh_dy).sqrt().clamp(0.0, 1.0)
}

fn biome_suitability(biome_id: &str) -> f32 {
    match biome_id {
        "temperate_deciduous_forest" | "temperate_rainforest" | "temperate_grassland_steppe" => {
            0.82
        }
        "savanna" | "tropical_savanna" | "mediterranean" | "taiga_boreal" => 0.66,
        "wetland" | "floodplain" | "tidal_flat" => 0.56,
        "desert" | "arid_scrubland" | "ashlands" => 0.24,
        "alpine_tundra_rock" | "alpine_meadow" | "ice_sheet_polar" | "glacier" => 0.18,
        "ocean" | "deep_ocean" | "abyssal_ocean" => 0.0,
        _ => 0.48,
    }
}

fn biome_agriculture_bias(biome_id: &str) -> f32 {
    if biome_id.contains("forest") || biome_id.contains("grassland") {
        0.78
    } else if biome_id.contains("savanna") || biome_id.contains("taiga") {
        0.58
    } else if biome_id.contains("wetland") {
        0.52
    } else if biome_id.contains("desert") || biome_id.contains("ash") || biome_id.contains("ice") {
        0.18
    } else {
        0.42
    }
}

fn biome_resource_bias(biome_id: &str) -> f32 {
    if biome_id.contains("alpine") || biome_id.contains("volcan") || biome_id.contains("crater") {
        0.82
    } else if biome_id.contains("ash") || biome_id.contains("desert") {
        0.68
    } else if biome_id.contains("forest") {
        0.52
    } else if biome_id.contains("wetland") {
        0.44
    } else {
        0.38
    }
}

fn biome_hazard_bias(biome_id: &str) -> f32 {
    if biome_id.contains("abyssal") || biome_id.contains("deep_ocean") {
        0.95
    } else if biome_id.contains("ash") || biome_id.contains("volcan") {
        0.84
    } else if biome_id.contains("alpine")
        || biome_id.contains("ice")
        || biome_id.contains("glacier")
    {
        0.74
    } else if biome_id.contains("desert") {
        0.66
    } else if biome_id.contains("wetland") {
        0.48
    } else {
        0.28
    }
}

fn subtype_display_label(subtype: &str) -> String {
    match subtype {
        "major_city" => "Major City".to_string(),
        "market_town" => "Market Town".to_string(),
        "fortified_town" => "Fortified Town".to_string(),
        "bridge_crossing" => "Bridge Crossing".to_string(),
        "caravan_post" => "Caravan Post".to_string(),
        "sea_gate" => "Sea Gate".to_string(),
        "sacred_grove" => "Sacred Grove".to_string(),
        "reef_site" => "Reef Site".to_string(),
        "crater_site" => "Crater Site".to_string(),
        "beast_ground" => "Beast Ground".to_string(),
        "ash_field" => "Ash Field".to_string(),
        "border_keep" => "Border Keep".to_string(),
        "logging_hold" => "Logging Hold".to_string(),
        _ => title_case(subtype),
    }
}

fn title_case(value: &str) -> String {
    value
        .split(['_', ' '])
        .filter(|segment| !segment.is_empty())
        .map(|segment| {
            let mut chars = segment.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn normalize_ruling_faction(value: &str) -> String {
    if value.trim().is_empty() {
        "None".to_string()
    } else {
        value.trim().to_string()
    }
}

fn unique_strings(values: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .filter_map(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else if seen.insert(trimmed.to_lowercase()) {
                Some(trimmed.to_string())
            } else {
                None
            }
        })
        .collect()
}

fn score_descriptor(score: u32) -> &'static str {
    match score {
        0..=29 => "is poor",
        30..=49 => "remains thin",
        50..=69 => "is workable",
        70..=84 => "is strong",
        _ => "is exceptional",
    }
}

fn empty_fallback(value: &str, fallback: &str) -> String {
    if value.trim().is_empty() {
        fallback.to_string()
    } else {
        value.to_string()
    }
}

fn now_unix_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn distance(ax: f32, ay: f32, bx: f32, by: f32) -> f32 {
    let dx = ax - bx;
    let dy = ay - by;
    (dx * dx + dy * dy).sqrt()
}

fn default_settlement_density() -> f32 {
    0.6
}

fn default_tech_level() -> f32 {
    0.4
}

pub fn default_scope_mode() -> LocationGenerationScopeMode {
    LocationGenerationScopeMode::World
}

fn default_redo_mode() -> String {
    "replace_scope".to_string()
}

fn default_record_source() -> RecordSource {
    RecordSource::Manual
}

fn default_lore_priority() -> String {
    "minor".to_string()
}

fn parse_record_source(value: Option<&str>) -> RecordSource {
    match value.unwrap_or("manual") {
        "humanity_generated" => RecordSource::HumanityGenerated,
        _ => RecordSource::Manual,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GrayImage, ImageBuffer, Luma, Rgb, RgbImage};
    use std::env;
    use std::fs;
    use uuid::Uuid;
    use worldgen_core::graph::EdgeInfo;

    fn test_root(label: &str) -> PathBuf {
        env::temp_dir().join(format!("ashtrail-locations-{label}-{}", Uuid::new_v4()))
    }

    fn write_json<T: Serialize>(path: &Path, value: &T) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("parent dir");
        }
        fs::write(path, serde_json::to_string_pretty(value).expect("json")).expect("write json");
    }

    fn write_rgb(path: &Path, width: u32, height: u32, fill: Rgb<u8>) {
        let mut image = RgbImage::new(width, height);
        for pixel in image.pixels_mut() {
            *pixel = fill;
        }
        image.save(path).expect("save rgb");
    }

    fn write_gray(path: &Path, width: u32, height: u32, value: u8) {
        let mut image = GrayImage::new(width, height);
        for pixel in image.pixels_mut() {
            *pixel = Luma([value]);
        }
        image.save(path).expect("save gray");
    }

    fn write_height(path: &Path, width: u32, height: u32, value: u16) {
        let image: ImageBuffer<Luma<u16>, Vec<u16>> =
            ImageBuffer::from_fn(width, height, |_x, _y| Luma([value]));
        image.save(path).expect("save height");
    }

    fn make_world_fixture(root: &Path, encoded_province_id: u32) {
        let world_dir = root.join("world-1");
        let worldgen_dir = world_dir.join("worldgen");
        let ecology_dir = world_dir.join("ecology");
        fs::create_dir_all(&worldgen_dir).expect("worldgen dir");
        fs::create_dir_all(&ecology_dir).expect("ecology dir");

        let province = ProvinceRecord {
            id: 105,
            seed_x: 0,
            seed_y: 0,
            area: 16,
            duchy_id: 10,
            kingdom_id: 10,
            biome_primary: 1,
            biome_primary_id: Some("plains".to_string()),
            biome_confidence: Some(1.0),
            biome_candidate_ids: vec!["plains".to_string()],
            name: "Province 106".to_string(),
            wealth: None,
            development: None,
            population: None,
        };
        write_json(&worldgen_dir.join("provinces.json"), &vec![province]);
        write_json(
            &worldgen_dir.join("duchies.json"),
            &vec![DuchyRecord {
                id: 10,
                province_ids: vec![105],
                kingdom_id: 10,
                name: "Duchy 11".to_string(),
            }],
        );
        write_json(
            &worldgen_dir.join("kingdoms.json"),
            &vec![KingdomRecord {
                id: 10,
                duchy_ids: vec![10],
                name: "Kingdom 11".to_string(),
            }],
        );
        write_json(
            &worldgen_dir.join("adjacency.json"),
            &vec![ProvinceAdjacency {
                province_id: 105,
                neighbors: vec![EdgeInfo {
                    neighbor_id: 106,
                    shared_border_length: 5,
                    crosses_river: false,
                    mean_border_height: 0.1,
                }],
            }],
        );
        write_rgb(
            &worldgen_dir.join("province_id.png"),
            8,
            8,
            Rgb([
                (encoded_province_id & 0xFF) as u8,
                ((encoded_province_id >> 8) & 0xFF) as u8,
                ((encoded_province_id >> 16) & 0xFF) as u8,
            ]),
        );
        write_gray(&worldgen_dir.join("landmask.png"), 8, 8, 255);
        write_gray(&worldgen_dir.join("river_mask.png"), 8, 8, 0);
        write_height(&worldgen_dir.join("height16.png"), 8, 8, 50_000);
        write_json(
            &ecology_dir.join("provinces.json"),
            &Vec::<serde_json::Value>::new(),
        );
        write_json(
            &world_dir.join("metadata.json"),
            &serde_json::json!({
                "name": "Test World",
                "prompt": "A world of caravan roads."
            }),
        );
        write_json(
            &world_dir.join("gm_settings.json"),
            &serde_json::json!({
                "worldPrompt": "Grounded worldbuilding"
            }),
        );
        write_json(
            &world_dir.join("lore_snippets.json"),
            &vec![serde_json::json!({
                "id": "main-lore",
                "priority": "main",
                "location": "World",
                "content": "Canonical main lore for humanity simulation.",
                "source": "manual",
                "isCustomized": false
            })],
        );
    }

    fn scoped_request() -> LocationGenerationRequest {
        LocationGenerationRequest {
            prompt: "Build trade cities along travel routes.".to_string(),
            settlement_density: 0.6,
            tech_level: 0.4,
            scope_mode: LocationGenerationScopeMode::Scoped,
            scope_targets: vec![LocationScopeTarget {
                kind: LocationScopeTargetKind::Kingdom,
                id: 10,
            }],
            redo_mode: "replace_scope".to_string(),
        }
    }

    #[test]
    fn decode_rgb_id_matches_writer_layout() {
        assert_eq!(decode_rgb_id([105, 0, 0]), 105);
    }

    #[tokio::test]
    async fn simulate_locations_generates_locations_when_raster_ids_match() {
        let root = test_root("valid");
        make_world_fixture(&root, 105);

        let output = simulate_locations(&root, "world-1", &scoped_request())
            .await
            .expect("simulate locations");

        assert!(output.generated_location_count > 0);
        assert_eq!(output.metadata.config.resolved_province_ids, vec![105]);
        assert_eq!(
            output.metadata.coverage.total_locations,
            output.locations.len()
        );
        assert!(output.metadata.coverage.viable_province_count >= 1);
    }

    #[tokio::test]
    async fn simulate_locations_rejects_scope_when_raster_ids_do_not_match() {
        let root = test_root("mismatch");
        make_world_fixture(&root, 106);

        let error = simulate_locations(&root, "world-1", &scoped_request())
            .await
            .expect_err("scope mismatch should fail");

        assert!(error.contains("province_id.png does not match provinces.json"));
    }

    #[test]
    fn build_generation_metadata_only_counts_selected_scope() {
        let contexts = vec![
            ProvinceContext {
                province: ProvinceRecord {
                    id: 1,
                    seed_x: 0,
                    seed_y: 0,
                    area: 10,
                    duchy_id: 1,
                    kingdom_id: 1,
                    biome_primary: 1,
                    biome_primary_id: Some("plains".to_string()),
                    biome_confidence: None,
                    biome_candidate_ids: Vec::new(),
                    name: "Province 2".to_string(),
                    wealth: None,
                    development: None,
                    population: None,
                },
                duchy: None,
                kingdom: None,
                continent_id: None,
                biome_id: "plains".to_string(),
                ecology: None,
                adjacency: ProvinceAdjacency {
                    province_id: 1,
                    neighbors: Vec::new(),
                },
                raster: ProvinceRasterStats {
                    total_pixels: 4,
                    land_pixels: 4,
                    river_pixels: 0,
                    coast_pixels: 0,
                    steep_pixels: 0,
                    sample_count: 1,
                    mean_elevation: 0.5,
                    mean_slope: 0.0,
                    max_slope: 0.0,
                    candidate_points: vec![CandidatePoint {
                        x: 0.25,
                        y: 0.25,
                        river: false,
                        coastal: false,
                        slope: 0.0,
                        elevation: 0.5,
                        score: 1.0,
                    }],
                },
                viability: ProvinceViability {
                    is_viable_land: true,
                    allows_maritime_location: false,
                    land_share: 1.0,
                },
                scores: ProvinceScores {
                    habitability: 70,
                    economic: 60,
                    strategic: 50,
                    hazard: 20,
                    resource_potential: 40,
                    climate_stability: 80,
                },
                is_duchy_seat: false,
                is_kingdom_capital: false,
            },
            ProvinceContext {
                province: ProvinceRecord {
                    id: 2,
                    seed_x: 0,
                    seed_y: 0,
                    area: 10,
                    duchy_id: 1,
                    kingdom_id: 1,
                    biome_primary: 1,
                    biome_primary_id: Some("plains".to_string()),
                    biome_confidence: None,
                    biome_candidate_ids: Vec::new(),
                    name: "Province 3".to_string(),
                    wealth: None,
                    development: None,
                    population: None,
                },
                duchy: None,
                kingdom: None,
                continent_id: None,
                biome_id: "plains".to_string(),
                ecology: None,
                adjacency: ProvinceAdjacency {
                    province_id: 2,
                    neighbors: Vec::new(),
                },
                raster: ProvinceRasterStats::new(),
                viability: ProvinceViability {
                    is_viable_land: true,
                    allows_maritime_location: false,
                    land_share: 1.0,
                },
                scores: ProvinceScores {
                    habitability: 70,
                    economic: 60,
                    strategic: 50,
                    hazard: 20,
                    resource_potential: 40,
                    climate_stability: 80,
                },
                is_duchy_seat: false,
                is_kingdom_capital: false,
            },
        ];
        let locations = vec![
            LocationRecord {
                id: "loc-1".to_string(),
                name: "Scope Town".to_string(),
                category: LocationCategory::Settlement,
                subtype: "market_town".to_string(),
                status: LocationStatus::Stable,
                scale: LocationScale::Small,
                province_id: 1,
                province_region_id: province_region_id(1),
                province_name: "Province 2".to_string(),
                duchy_id: Some(1),
                kingdom_id: Some(1),
                continent_id: None,
                x: 0.25,
                y: 0.25,
                population_estimate: Some(500),
                importance: 50,
                habitability_score: 70,
                economic_score: 60,
                strategic_score: 50,
                hazard_score: 20,
                ruling_faction: "None".to_string(),
                tags: Vec::new(),
                placement_drivers: Vec::new(),
                history_hooks: LocationHistoryHooks {
                    founding_reason: String::new(),
                    current_tension: String::new(),
                    story_seeds: Vec::new(),
                    linked_lore_snippet_ids: Vec::new(),
                },
                lore: String::new(),
                source: RecordSource::HumanityGenerated,
                is_customized: false,
                last_humanity_job_id: None,
                type_label: "Market Town".to_string(),
            },
            LocationRecord {
                id: "loc-2".to_string(),
                name: "Outside Scope".to_string(),
                category: LocationCategory::Settlement,
                subtype: "market_town".to_string(),
                status: LocationStatus::Stable,
                scale: LocationScale::Small,
                province_id: 2,
                province_region_id: province_region_id(2),
                province_name: "Province 3".to_string(),
                duchy_id: Some(1),
                kingdom_id: Some(1),
                continent_id: None,
                x: 0.75,
                y: 0.75,
                population_estimate: Some(500),
                importance: 50,
                habitability_score: 70,
                economic_score: 60,
                strategic_score: 50,
                hazard_score: 20,
                ruling_faction: "None".to_string(),
                tags: Vec::new(),
                placement_drivers: Vec::new(),
                history_hooks: LocationHistoryHooks {
                    founding_reason: String::new(),
                    current_tension: String::new(),
                    story_seeds: Vec::new(),
                    linked_lore_snippet_ids: Vec::new(),
                },
                lore: String::new(),
                source: RecordSource::HumanityGenerated,
                is_customized: false,
                last_humanity_job_id: None,
                type_label: "Market Town".to_string(),
            },
        ];

        let metadata = build_generation_metadata(
            "world-1",
            &scoped_request(),
            &contexts,
            &locations,
            &[1],
            "seed",
            AiDetailPassSummary {
                status: "disabled".to_string(),
                attempted_batches: 0,
                successful_batches: 0,
                refined_locations: 0,
                total_locations: 2,
            },
        );

        assert_eq!(metadata.coverage.total_locations, 1);
        assert_eq!(metadata.coverage.settlement_count, 1);
        assert_eq!(metadata.coverage.viable_province_count, 1);
        assert!(metadata.uncovered_province_ids.is_empty());
    }
}
