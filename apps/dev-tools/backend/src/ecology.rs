use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path as FsPath, PathBuf},
    sync::{Arc, Mutex},
};
use uuid::Uuid;
use worldgen_core::cluster::{DuchyRecord, KingdomRecord, ProvinceRecord};

use crate::{gemini, worldgen_pipeline, AppState, JobRecord, JobStatus};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EcologyBundle {
    pub world_id: String,
    pub updated_at: String,
    #[serde(default)]
    pub baselines: Vec<EcologyBaseline>,
    #[serde(default)]
    pub climates: Vec<ClimateProfile>,
    #[serde(default)]
    pub flora: Vec<FloraEntry>,
    #[serde(default)]
    pub fauna: Vec<FaunaEntry>,
    #[serde(default)]
    pub provinces: Vec<ProvinceEcologyRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EcologyBaseline {
    pub scope: BaselineScope,
    pub entity_id: BaselineEntityId,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_entity_id: Option<BaselineEntityId>,
    pub status: EcologyStatus,
    pub summary: String,
    #[serde(default)]
    pub climate_directives: Vec<String>,
    #[serde(default)]
    pub flora_directives: Vec<String>,
    #[serde(default)]
    pub fauna_directives: Vec<String>,
    #[serde(default)]
    pub agriculture_directives: Vec<String>,
    #[serde(default)]
    pub consistency_rules: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub generated_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClimateProfile {
    pub id: String,
    pub status: EntryStatus,
    pub name: String,
    pub classification: String,
    pub temperature_summary: String,
    pub precipitation_summary: String,
    pub seasonality: String,
    pub agriculture_notes: String,
    #[serde(default)]
    pub province_ids: Vec<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FloraEntry {
    pub id: String,
    pub status: EntryStatus,
    pub name: String,
    pub category: FloraCategory,
    pub description: String,
    #[serde(default)]
    pub ecological_roles: Vec<String>,
    #[serde(default)]
    pub adaptations: Vec<String>,
    pub edibility: FloraEdibility,
    pub agriculture_value: i32,
    #[serde(default)]
    pub climate_profile_ids: Vec<String>,
    #[serde(default)]
    pub province_ids: Vec<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FaunaEntry {
    pub id: String,
    pub status: EntryStatus,
    pub name: String,
    pub category: FaunaCategory,
    pub description: String,
    #[serde(default)]
    pub ecological_roles: Vec<String>,
    #[serde(default)]
    pub adaptations: Vec<String>,
    pub domestication_potential: i32,
    pub danger_level: i32,
    #[serde(default)]
    pub climate_profile_ids: Vec<String>,
    #[serde(default)]
    pub province_ids: Vec<u32>,
    pub earth_analog: String,
    pub ancestral_stock: String,
    #[serde(default)]
    pub evolutionary_pressures: Vec<String>,
    pub mutation_summary: String,
    pub divergence_summary: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProvinceEcologyRecord {
    pub province_id: u32,
    pub duchy_id: u32,
    pub kingdom_id: u32,
    pub status: EcologyStatus,
    pub source_isolated_image_url: String,
    pub description: String,
    #[serde(default)]
    pub climate_profile_ids: Vec<String>,
    #[serde(default)]
    pub flora_ids: Vec<String>,
    #[serde(default)]
    pub fauna_ids: Vec<String>,
    pub ecological_potential: i32,
    pub agriculture_potential: i32,
    #[serde(default)]
    pub consistency_notes: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub generated_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum EcologyStatus {
    Missing,
    Draft,
    Approved,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum EntryStatus {
    Draft,
    Approved,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum BaselineScope {
    World,
    Kingdom,
    Duchy,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(untagged)]
pub enum BaselineEntityId {
    World(String),
    Numeric(u32),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FloraCategory {
    Tree,
    Shrub,
    Grass,
    Crop,
    Fungus,
    Aquatic,
    AlienOther,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FloraEdibility {
    None,
    Limited,
    Common,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FaunaCategory {
    Herbivore,
    Predator,
    Omnivore,
    Scavenger,
    Avian,
    Aquatic,
    BeastOfBurden,
    Companion,
    AlienOther,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProvinceGenerationResponse {
    description: String,
    ecological_potential: i32,
    agriculture_potential: i32,
    #[serde(default)]
    consistency_notes: Vec<String>,
    #[serde(default)]
    reuse_climate_profile_ids: Vec<String>,
    #[serde(default)]
    new_climate_profiles: Vec<ClimateDraft>,
    #[serde(default)]
    reuse_flora_ids: Vec<String>,
    #[serde(default)]
    new_flora: Vec<FloraDraft>,
    #[serde(default)]
    reuse_fauna_ids: Vec<String>,
    #[serde(default)]
    new_fauna: Vec<FaunaDraft>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClimateDraft {
    name: String,
    classification: String,
    temperature_summary: String,
    precipitation_summary: String,
    seasonality: String,
    agriculture_notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FloraDraft {
    name: String,
    category: FloraCategory,
    description: String,
    #[serde(default)]
    ecological_roles: Vec<String>,
    #[serde(default)]
    adaptations: Vec<String>,
    edibility: FloraEdibility,
    agriculture_value: i32,
    #[serde(default)]
    climate_profile_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FaunaDraft {
    name: String,
    category: FaunaCategory,
    description: String,
    #[serde(default)]
    ecological_roles: Vec<String>,
    #[serde(default)]
    adaptations: Vec<String>,
    domestication_potential: i32,
    danger_level: i32,
    #[serde(default)]
    climate_profile_ids: Vec<String>,
    earth_analog: String,
    ancestral_stock: String,
    #[serde(default)]
    evolutionary_pressures: Vec<String>,
    mutation_summary: String,
    divergence_summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CellFeaturesFile {
    cells: Vec<CellFeatureRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CellFeatureRecord {
    primary_region: Option<u32>,
    primary_region_type: Option<String>,
    vegetation_index: Option<f64>,
    aridity_index: Option<f64>,
    is_water: Option<bool>,
    is_coastal: Option<bool>,
    terrain_class: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EcologyJobAccepted {
    job_id: String,
}

pub async fn get_ecology_data(
    State(state): State<AppState>,
    Path(world_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let bundle = load_ecology_bundle(&state.planets_dir, &world_id)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
    Ok(Json(bundle))
}

pub async fn save_ecology_data(
    State(state): State<AppState>,
    Path(world_id): Path<String>,
    Json(mut bundle): Json<EcologyBundle>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let existing = load_ecology_bundle(&state.planets_dir, &world_id)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
    bundle.world_id = world_id.clone();
    normalize_bundle_for_save(&existing, &mut bundle);
    validate_bundle_references(&bundle).map_err(|err| (StatusCode::BAD_REQUEST, err))?;
    save_ecology_bundle(&state.planets_dir, &world_id, &bundle)
        .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err))?;
    Ok(Json(bundle))
}

pub async fn generate_world_baseline(
    State(state): State<AppState>,
    Path(world_id): Path<String>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    spawn_ecology_job(state, world_id, EcologyJobKind::WorldBaseline).await
}

pub async fn generate_kingdom_baseline(
    State(state): State<AppState>,
    Path((world_id, kingdom_id)): Path<(String, u32)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    spawn_ecology_job(state, world_id, EcologyJobKind::KingdomBaseline { kingdom_id }).await
}

pub async fn generate_duchy_baseline(
    State(state): State<AppState>,
    Path((world_id, duchy_id)): Path<(String, u32)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    spawn_ecology_job(state, world_id, EcologyJobKind::DuchyBaseline { duchy_id }).await
}

pub async fn generate_province_record(
    State(state): State<AppState>,
    Path((world_id, province_id)): Path<(String, u32)>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    spawn_ecology_job(state, world_id, EcologyJobKind::Province { province_id }).await
}

#[derive(Debug, Clone)]
enum EcologyJobKind {
    WorldBaseline,
    KingdomBaseline { kingdom_id: u32 },
    DuchyBaseline { duchy_id: u32 },
    Province { province_id: u32 },
}

async fn spawn_ecology_job(
    state: AppState,
    world_id: String,
    job_kind: EcologyJobKind,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let job_id = Uuid::new_v4().to_string();
    {
        let mut jobs = state
            .jobs
            .lock()
            .map_err(|_| (StatusCode::INTERNAL_SERVER_ERROR, "job store lock poisoned".to_string()))?;
        jobs.insert(
            job_id.clone(),
            JobRecord {
                status: JobStatus::Queued,
                progress: 0.0,
                current_stage: "Queued ecology generation".to_string(),
                result: None,
                error: None,
                cancel_requested: false,
            },
        );
    }

    let jobs = state.jobs.clone();
    let planets_dir = state.planets_dir.clone();
    let isolated_dir = state.isolated_dir.clone();
    let spawned_job_id = job_id.clone();
    tokio::spawn(async move {
        run_ecology_job(spawned_job_id, jobs, planets_dir, isolated_dir, world_id, job_kind).await;
    });

    Ok((StatusCode::ACCEPTED, Json(EcologyJobAccepted { job_id })))
}

async fn run_ecology_job(
    job_id: String,
    jobs: Arc<Mutex<HashMap<String, JobRecord>>>,
    planets_dir: PathBuf,
    isolated_dir: PathBuf,
    world_id: String,
    job_kind: EcologyJobKind,
) {
    update_job(&jobs, &job_id, JobStatus::Running, 5.0, "Loading ecology bundle", None);
    let result = match job_kind {
        EcologyJobKind::WorldBaseline => generate_world_baseline_impl(&planets_dir, &world_id).await,
        EcologyJobKind::KingdomBaseline { kingdom_id } => {
            generate_kingdom_baseline_impl(&planets_dir, &world_id, kingdom_id).await
        }
        EcologyJobKind::DuchyBaseline { duchy_id } => {
            generate_duchy_baseline_impl(&planets_dir, &world_id, duchy_id).await
        }
        EcologyJobKind::Province { province_id } => {
            generate_province_record_impl(&planets_dir, &isolated_dir, &world_id, province_id).await
        }
    };

    match result {
        Ok(()) => update_job(&jobs, &job_id, JobStatus::Completed, 100.0, "Completed", None),
        Err(err) => update_job(&jobs, &job_id, JobStatus::Failed, 100.0, "Failed", Some(err)),
    }
}

fn update_job(
    jobs: &Arc<Mutex<HashMap<String, JobRecord>>>,
    job_id: &str,
    status: JobStatus,
    progress: f32,
    stage: &str,
    error_message: Option<String>,
) {
    if let Ok(mut map) = jobs.lock() {
        if let Some(job) = map.get_mut(job_id) {
            job.status = status;
            job.progress = progress;
            job.current_stage = stage.to_string();
            job.error = error_message;
        }
    }
}

async fn generate_world_baseline_impl(planets_dir: &FsPath, world_id: &str) -> Result<(), String> {
    let hierarchy = load_hierarchy(planets_dir, world_id)?;
    let mut bundle = load_ecology_bundle(planets_dir, world_id)?;
    let prompt = build_world_baseline_prompt(&hierarchy);
    let text = gemini::generate_text(&prompt).await.map_err(|(_, err)| err)?;
    let mut baseline: EcologyBaseline = parse_json_payload(&text)?;
    baseline.scope = BaselineScope::World;
    baseline.entity_id = BaselineEntityId::World("world".to_string());
    baseline.parent_entity_id = None;
    baseline.status = EcologyStatus::Draft;
    baseline.generated_at = Some(Utc::now().to_rfc3339());
    baseline.approved_at = None;
    upsert_world_baseline(&mut bundle.baselines, baseline);
    save_ecology_bundle(planets_dir, world_id, &bundle)
}

async fn generate_kingdom_baseline_impl(
    planets_dir: &FsPath,
    world_id: &str,
    kingdom_id: u32,
) -> Result<(), String> {
    let hierarchy = load_hierarchy(planets_dir, world_id)?;
    let mut bundle = load_ecology_bundle(planets_dir, world_id)?;
    let world_baseline = get_approved_baseline(
        &bundle.baselines,
        BaselineScope::World,
        &BaselineEntityId::World("world".to_string()),
    )?
    .clone();
    if let Some(existing) = find_baseline_mut(&mut bundle.baselines, BaselineScope::Kingdom, &BaselineEntityId::Numeric(kingdom_id)) {
        if existing.status == EcologyStatus::Approved {
            return Err("Approved kingdom baseline cannot be overwritten automatically.".to_string());
        }
    }
    let kingdom = hierarchy
        .kingdoms
        .iter()
        .find(|entry| entry.id == kingdom_id)
        .ok_or_else(|| format!("Kingdom {} not found", kingdom_id))?;
    let prompt = build_kingdom_baseline_prompt(&hierarchy, kingdom, &world_baseline);
    let text = gemini::generate_text(&prompt).await.map_err(|(_, err)| err)?;
    let mut baseline: EcologyBaseline = parse_json_payload(&text)?;
    baseline.scope = BaselineScope::Kingdom;
    baseline.entity_id = BaselineEntityId::Numeric(kingdom_id);
    baseline.parent_entity_id = Some(BaselineEntityId::World("world".to_string()));
    baseline.status = EcologyStatus::Draft;
    baseline.generated_at = Some(Utc::now().to_rfc3339());
    baseline.approved_at = None;
    upsert_world_baseline(&mut bundle.baselines, baseline);
    save_ecology_bundle(planets_dir, world_id, &bundle)
}

async fn generate_duchy_baseline_impl(
    planets_dir: &FsPath,
    world_id: &str,
    duchy_id: u32,
) -> Result<(), String> {
    let hierarchy = load_hierarchy(planets_dir, world_id)?;
    let mut bundle = load_ecology_bundle(planets_dir, world_id)?;
    let duchy = hierarchy
        .duchies
        .iter()
        .find(|entry| entry.id == duchy_id)
        .ok_or_else(|| format!("Duchy {} not found", duchy_id))?;
    let kingdom_baseline = get_approved_baseline(
        &bundle.baselines,
        BaselineScope::Kingdom,
        &BaselineEntityId::Numeric(duchy.kingdom_id),
    )?
    .clone();
    if let Some(existing) = find_baseline_mut(&mut bundle.baselines, BaselineScope::Duchy, &BaselineEntityId::Numeric(duchy_id)) {
        if existing.status == EcologyStatus::Approved {
            return Err("Approved duchy baseline cannot be overwritten automatically.".to_string());
        }
    }
    let prompt = build_duchy_baseline_prompt(&hierarchy, duchy, &kingdom_baseline);
    let text = gemini::generate_text(&prompt).await.map_err(|(_, err)| err)?;
    let mut baseline: EcologyBaseline = parse_json_payload(&text)?;
    baseline.scope = BaselineScope::Duchy;
    baseline.entity_id = BaselineEntityId::Numeric(duchy_id);
    baseline.parent_entity_id = Some(BaselineEntityId::Numeric(duchy.kingdom_id));
    baseline.status = EcologyStatus::Draft;
    baseline.generated_at = Some(Utc::now().to_rfc3339());
    baseline.approved_at = None;
    upsert_world_baseline(&mut bundle.baselines, baseline);
    save_ecology_bundle(planets_dir, world_id, &bundle)
}

async fn generate_province_record_impl(
    planets_dir: &FsPath,
    isolated_dir: &FsPath,
    world_id: &str,
    province_id: u32,
) -> Result<(), String> {
    let hierarchy = load_hierarchy(planets_dir, world_id)?;
    let province = hierarchy
        .provinces
        .iter()
        .find(|entry| entry.id == province_id)
        .cloned()
        .ok_or_else(|| format!("Province {} not found", province_id))?;
    let duchy = hierarchy
        .duchies
        .iter()
        .find(|entry| entry.id == province.duchy_id)
        .cloned()
        .ok_or_else(|| format!("Duchy {} not found", province.duchy_id))?;
    let kingdom = hierarchy
        .kingdoms
        .iter()
        .find(|entry| entry.id == province.kingdom_id)
        .cloned()
        .ok_or_else(|| format!("Kingdom {} not found", province.kingdom_id))?;

    let filename = worldgen_pipeline::ensure_isolated_province_asset(planets_dir, isolated_dir, world_id, province_id)?;
    let image_path = isolated_dir.join(world_id).join(&filename);
    let image_base64 = general_purpose::STANDARD.encode(
        fs::read(&image_path).map_err(|e| format!("Failed to read isolated image: {}", e))?,
    );

    let mut bundle = load_ecology_bundle(planets_dir, world_id)?;
    if let Some(existing) = bundle.provinces.iter().find(|entry| entry.province_id == province_id) {
        if existing.status == EcologyStatus::Approved {
            return Err("Approved province ecology cannot be overwritten automatically.".to_string());
        }
    }

    let duchy_baseline = get_approved_baseline(
        &bundle.baselines,
        BaselineScope::Duchy,
        &BaselineEntityId::Numeric(duchy.id),
    )?;
    let kingdom_baseline = get_approved_baseline(
        &bundle.baselines,
        BaselineScope::Kingdom,
        &BaselineEntityId::Numeric(kingdom.id),
    )?;

    let metrics = load_cell_metrics(planets_dir, world_id, province_id).unwrap_or_default();
    let prompt = build_province_prompt(
        &province,
        &duchy,
        &kingdom,
        duchy_baseline,
        kingdom_baseline,
        &bundle,
        &metrics,
    );
    let text = gemini::generate_text_with_inline_image(&prompt, &image_base64, "image/png")
        .await
        .map_err(|(_, err)| err)?;
    let response: ProvinceGenerationResponse = parse_json_payload(&text)?;

    validate_generation_reuse(&bundle, &response)?;

    let mut climate_ids = response.reuse_climate_profile_ids.clone();
    let mut flora_ids = response.reuse_flora_ids.clone();
    let mut fauna_ids = response.reuse_fauna_ids.clone();

    for draft in response.new_climate_profiles {
        let id = format!("climate-{}", Uuid::new_v4());
        bundle.climates.push(ClimateProfile {
            id: id.clone(),
            status: EntryStatus::Draft,
            name: draft.name,
            classification: draft.classification,
            temperature_summary: draft.temperature_summary,
            precipitation_summary: draft.precipitation_summary,
            seasonality: draft.seasonality,
            agriculture_notes: draft.agriculture_notes,
            province_ids: vec![province_id],
            approved_at: None,
        });
        climate_ids.push(id);
    }

    for draft in response.new_flora {
        let id = format!("flora-{}", Uuid::new_v4());
        bundle.flora.push(FloraEntry {
            id: id.clone(),
            status: EntryStatus::Draft,
            name: draft.name,
            category: draft.category,
            description: draft.description,
            ecological_roles: draft.ecological_roles,
            adaptations: draft.adaptations,
            edibility: draft.edibility,
            agriculture_value: draft.agriculture_value,
            climate_profile_ids: draft.climate_profile_ids,
            province_ids: vec![province_id],
            approved_at: None,
        });
        flora_ids.push(id);
    }

    for draft in response.new_fauna {
        let id = format!("fauna-{}", Uuid::new_v4());
        bundle.fauna.push(FaunaEntry {
            id: id.clone(),
            status: EntryStatus::Draft,
            name: draft.name,
            category: draft.category,
            description: draft.description,
            ecological_roles: draft.ecological_roles,
            adaptations: draft.adaptations,
            domestication_potential: draft.domestication_potential,
            danger_level: draft.danger_level,
            climate_profile_ids: draft.climate_profile_ids,
            province_ids: vec![province_id],
            earth_analog: draft.earth_analog,
            ancestral_stock: draft.ancestral_stock,
            evolutionary_pressures: draft.evolutionary_pressures,
            mutation_summary: draft.mutation_summary,
            divergence_summary: draft.divergence_summary,
            approved_at: None,
        });
        fauna_ids.push(id);
    }

    link_existing_entries(&mut bundle, province_id, &climate_ids, &flora_ids, &fauna_ids);
    let province_record = ProvinceEcologyRecord {
        province_id,
        duchy_id: duchy.id,
        kingdom_id: kingdom.id,
        status: EcologyStatus::Draft,
        source_isolated_image_url: format!("/api/isolated-assets/{}/{}", world_id, filename),
        description: response.description,
        climate_profile_ids: dedupe_ids(climate_ids),
        flora_ids: dedupe_ids(flora_ids),
        fauna_ids: dedupe_ids(fauna_ids),
        ecological_potential: response.ecological_potential.clamp(0, 100),
        agriculture_potential: response.agriculture_potential.clamp(0, 100),
        consistency_notes: response.consistency_notes,
        generated_at: Some(Utc::now().to_rfc3339()),
        approved_at: None,
    };
    upsert_province_record(&mut bundle.provinces, province_record);
    validate_bundle_references(&bundle)?;
    save_ecology_bundle(planets_dir, world_id, &bundle)
}

fn load_ecology_bundle(planets_dir: &FsPath, world_id: &str) -> Result<EcologyBundle, String> {
    let ecology_dir = ecology_dir(planets_dir, world_id);
    if !ecology_dir.exists() {
        return Ok(empty_bundle(world_id));
    }

    let bundle_path = ecology_dir.join("bundle.json");
    if bundle_path.exists() {
        let raw = fs::read_to_string(&bundle_path)
            .map_err(|e| format!("Failed to read bundle.json: {}", e))?;
        let mut bundle: EcologyBundle = serde_json::from_str(&raw)
            .map_err(|e| format!("Failed to parse bundle.json: {}", e))?;
        bundle.world_id = world_id.to_string();
        return Ok(bundle);
    }

    let mut bundle = empty_bundle(world_id);
    bundle.baselines = read_optional_json(ecology_dir.join("baselines.json"))?;
    bundle.climates = read_optional_json(ecology_dir.join("climates.json"))?;
    bundle.flora = read_optional_json(ecology_dir.join("flora.json"))?;
    bundle.fauna = read_optional_json(ecology_dir.join("fauna.json"))?;
    bundle.provinces = read_optional_json(ecology_dir.join("provinces.json"))?;
    Ok(bundle)
}

fn save_ecology_bundle(planets_dir: &FsPath, world_id: &str, bundle: &EcologyBundle) -> Result<(), String> {
    let ecology_dir = ecology_dir(planets_dir, world_id);
    fs::create_dir_all(&ecology_dir)
        .map_err(|e| format!("Failed to create ecology dir: {}", e))?;
    let mut normalized = bundle.clone();
    normalized.world_id = world_id.to_string();
    normalized.updated_at = Utc::now().to_rfc3339();

    write_json_file(ecology_dir.join("bundle.json"), &normalized)?;
    write_json_file(ecology_dir.join("baselines.json"), &normalized.baselines)?;
    write_json_file(ecology_dir.join("climates.json"), &normalized.climates)?;
    write_json_file(ecology_dir.join("flora.json"), &normalized.flora)?;
    write_json_file(ecology_dir.join("fauna.json"), &normalized.fauna)?;
    write_json_file(ecology_dir.join("provinces.json"), &normalized.provinces)?;
    Ok(())
}

fn ecology_dir(planets_dir: &FsPath, world_id: &str) -> PathBuf {
    planets_dir.join(world_id).join("ecology")
}

fn empty_bundle(world_id: &str) -> EcologyBundle {
    EcologyBundle {
        world_id: world_id.to_string(),
        updated_at: Utc::now().to_rfc3339(),
        baselines: Vec::new(),
        climates: Vec::new(),
        flora: Vec::new(),
        fauna: Vec::new(),
        provinces: Vec::new(),
    }
}

fn read_optional_json<T: for<'de> Deserialize<'de>>(path: PathBuf) -> Result<Vec<T>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
}

fn write_json_file<T: Serialize>(path: PathBuf, value: &T) -> Result<(), String> {
    let payload = serde_json::to_string_pretty(value)
        .map_err(|e| format!("Failed to serialize {}: {}", path.display(), e))?;
    fs::write(&path, payload).map_err(|e| format!("Failed to write {}: {}", path.display(), e))
}

struct HierarchyData {
    provinces: Vec<ProvinceRecord>,
    duchies: Vec<DuchyRecord>,
    kingdoms: Vec<KingdomRecord>,
}

fn load_hierarchy(planets_dir: &FsPath, world_id: &str) -> Result<HierarchyData, String> {
    let worldgen_dir = planets_dir.join(world_id).join("worldgen");
    let provinces: Vec<ProvinceRecord> = read_typed_json(worldgen_dir.join("provinces.json"))?;
    let duchies: Vec<DuchyRecord> = read_typed_json(worldgen_dir.join("duchies.json"))?;
    let kingdoms: Vec<KingdomRecord> = read_typed_json(worldgen_dir.join("kingdoms.json"))?;
    let regions_path = planets_dir.join(world_id).join("worldgen");
    let _ = regions_path;
    Ok(HierarchyData {
        provinces,
        duchies,
        kingdoms,
    })
}

fn read_typed_json<T: for<'de> Deserialize<'de>>(path: PathBuf) -> Result<T, String> {
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse {}: {}", path.display(), e))
}

fn build_world_baseline_prompt(hierarchy: &HierarchyData) -> String {
    let kingdom_summaries = hierarchy
        .kingdoms
        .iter()
        .map(|kingdom| format!("- {} ({} duchies)", kingdom.name, kingdom.duchy_ids.len()))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "You are building a canonical world ecology baseline for a science-minded fantasy worldbuilding tool.\n\
Return ONLY strict JSON matching this shape:\n\
{{\"summary\":\"...\",\"climateDirectives\":[\"...\"],\"floraDirectives\":[\"...\"],\"faunaDirectives\":[\"...\"],\"agricultureDirectives\":[\"...\"],\"consistencyRules\":[\"...\"]}}\n\
Goal: define climate, flora, fauna and agriculture constraints that all child kingdoms must remain consistent with.\n\
Kingdom overview:\n{}\n",
        kingdom_summaries
    )
}

fn build_kingdom_baseline_prompt(
    hierarchy: &HierarchyData,
    kingdom: &KingdomRecord,
    world_baseline: &EcologyBaseline,
) -> String {
    let duchies = hierarchy
        .duchies
        .iter()
        .filter(|duchy| duchy.kingdom_id == kingdom.id)
        .map(|duchy| format!("- {} ({} provinces)", duchy.name, duchy.province_ids.len()))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "You are refining a kingdom ecology baseline.\n\
Return ONLY strict JSON matching this shape:\n\
{{\"summary\":\"...\",\"climateDirectives\":[\"...\"],\"floraDirectives\":[\"...\"],\"faunaDirectives\":[\"...\"],\"agricultureDirectives\":[\"...\"],\"consistencyRules\":[\"...\"]}}\n\
Parent world baseline summary: {}\n\
Parent climate directives: {:?}\n\
Kingdom: {}.\n\
Duchies:\n{}\n",
        world_baseline.summary,
        world_baseline.climate_directives,
        kingdom.name,
        duchies
    )
}

fn build_duchy_baseline_prompt(
    hierarchy: &HierarchyData,
    duchy: &DuchyRecord,
    kingdom_baseline: &EcologyBaseline,
) -> String {
    let provinces = duchy
        .province_ids
        .iter()
        .filter_map(|province_id| hierarchy.provinces.iter().find(|province| province.id == *province_id))
        .map(|province| {
            format!(
                "- {} (area {}, biomePrimary {})",
                province.name, province.area, province.biome_primary
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "You are refining a duchy ecology baseline.\n\
Return ONLY strict JSON matching this shape:\n\
{{\"summary\":\"...\",\"climateDirectives\":[\"...\"],\"floraDirectives\":[\"...\"],\"faunaDirectives\":[\"...\"],\"agricultureDirectives\":[\"...\"],\"consistencyRules\":[\"...\"]}}\n\
Parent kingdom baseline summary: {}\n\
Parent fauna directives: {:?}\n\
Duchy: {}.\n\
Provinces:\n{}\n",
        kingdom_baseline.summary,
        kingdom_baseline.fauna_directives,
        duchy.name,
        provinces
    )
}

#[derive(Default)]
struct ProvinceCellMetrics {
    dominant_terrain_classes: Vec<String>,
    avg_vegetation_index: Option<f64>,
    avg_aridity_index: Option<f64>,
    water_share: Option<f64>,
    coastal_share: Option<f64>,
}

fn build_province_prompt(
    province: &ProvinceRecord,
    duchy: &DuchyRecord,
    kingdom: &KingdomRecord,
    duchy_baseline: &EcologyBaseline,
    kingdom_baseline: &EcologyBaseline,
    bundle: &EcologyBundle,
    metrics: &ProvinceCellMetrics,
) -> String {
    let approved_climates = bundle
        .climates
        .iter()
        .filter(|entry| entry.status == EntryStatus::Approved)
        .map(|entry| format!("{}: {} [{}]", entry.id, entry.name, entry.classification))
        .collect::<Vec<_>>()
        .join("\n");
    let approved_flora = bundle
        .flora
        .iter()
        .filter(|entry| entry.status == EntryStatus::Approved)
        .map(|entry| format!("{}: {} [{:?}]", entry.id, entry.name, entry.category))
        .collect::<Vec<_>>()
        .join("\n");
    let approved_fauna = bundle
        .fauna
        .iter()
        .filter(|entry| entry.status == EntryStatus::Approved)
        .map(|entry| format!("{}: {} [{:?}] Earth analog {}", entry.id, entry.name, entry.category, entry.earth_analog))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "You are generating one province ecology dossier from an isolated province image and parent ecology baselines.\n\
Return ONLY strict JSON with this shape:\n\
{{\"description\":\"...\",\"ecologicalPotential\":0,\"agriculturePotential\":0,\"consistencyNotes\":[\"...\"],\"reuseClimateProfileIds\":[\"...\"],\"newClimateProfiles\":[{{\"name\":\"...\",\"classification\":\"...\",\"temperatureSummary\":\"...\",\"precipitationSummary\":\"...\",\"seasonality\":\"...\",\"agricultureNotes\":\"...\"}}],\"reuseFloraIds\":[\"...\"],\"newFlora\":[{{\"name\":\"...\",\"category\":\"tree|shrub|grass|crop|fungus|aquatic|alien_other\",\"description\":\"...\",\"ecologicalRoles\":[\"...\"],\"adaptations\":[\"...\"],\"edibility\":\"none|limited|common\",\"agricultureValue\":0,\"climateProfileIds\":[\"existing or newly created climate ids only if justified\" ]}}],\"reuseFaunaIds\":[\"...\"],\"newFauna\":[{{\"name\":\"...\",\"category\":\"herbivore|predator|omnivore|scavenger|avian|aquatic|beast_of_burden|companion|alien_other\",\"description\":\"...\",\"ecologicalRoles\":[\"...\"],\"adaptations\":[\"...\"],\"domesticationPotential\":0,\"dangerLevel\":0,\"climateProfileIds\":[\"...\"],\"earthAnalog\":\"...\",\"ancestralStock\":\"...\",\"evolutionaryPressures\":[\"...\"],\"mutationSummary\":\"...\",\"divergenceSummary\":\"...\"}}]}}\n\
Rules:\n\
- Prefer reuse of approved existing entries when possible.\n\
- New fauna must include full convergent-evolution lineage fields.\n\
- Keep the province coherent with the duchy and kingdom baselines.\n\
- Scores must be integers from 0 to 100.\n\
Province metadata: name={}, area={}, biomePrimary={}, duchy={}, kingdom={}\n\
Duchy baseline summary: {}\n\
Duchy flora directives: {:?}\n\
Kingdom baseline summary: {}\n\
Kingdom fauna directives: {:?}\n\
Optional cell metrics: terrain={:?}, avgVegetation={:?}, avgAridity={:?}, waterShare={:?}, coastalShare={:?}\n\
Approved climates:\n{}\n\
Approved flora:\n{}\n\
Approved fauna:\n{}\n",
        province.name,
        province.area,
        province.biome_primary,
        duchy.name,
        kingdom.name,
        duchy_baseline.summary,
        duchy_baseline.flora_directives,
        kingdom_baseline.summary,
        kingdom_baseline.fauna_directives,
        metrics.dominant_terrain_classes,
        metrics.avg_vegetation_index,
        metrics.avg_aridity_index,
        metrics.water_share,
        metrics.coastal_share,
        approved_climates,
        approved_flora,
        approved_fauna
    )
}

fn parse_json_payload<T: for<'de> Deserialize<'de>>(raw: &str) -> Result<T, String> {
    let trimmed = raw.trim().trim_matches('`').trim();
    if let Ok(parsed) = serde_json::from_str::<T>(trimmed) {
        return Ok(parsed);
    }

    let start = trimmed
        .find(['{', '['])
        .ok_or_else(|| "No JSON object found in model response".to_string())?;
    let end = trimmed
        .rfind(['}', ']'])
        .ok_or_else(|| "No JSON terminator found in model response".to_string())?;
    serde_json::from_str(&trimmed[start..=end])
        .map_err(|e| format!("Failed to parse model JSON payload: {}", e))
}

fn get_approved_baseline<'a>(
    baselines: &'a [EcologyBaseline],
    scope: BaselineScope,
    entity_id: &BaselineEntityId,
) -> Result<&'a EcologyBaseline, String> {
    baselines
        .iter()
        .find(|entry| entry.scope == scope && &entry.entity_id == entity_id && entry.status == EcologyStatus::Approved)
        .ok_or_else(|| match scope {
            BaselineScope::World => "Approved world baseline required".to_string(),
            BaselineScope::Kingdom => "Approved kingdom baseline required".to_string(),
            BaselineScope::Duchy => "Approved duchy baseline required".to_string(),
        })
}

fn find_baseline_mut<'a>(
    baselines: &'a mut [EcologyBaseline],
    scope: BaselineScope,
    entity_id: &BaselineEntityId,
) -> Option<&'a mut EcologyBaseline> {
    baselines
        .iter_mut()
        .find(|entry| entry.scope == scope && &entry.entity_id == entity_id)
}

fn upsert_world_baseline(baselines: &mut Vec<EcologyBaseline>, baseline: EcologyBaseline) {
    if let Some(index) = baselines
        .iter()
        .position(|entry| entry.scope == baseline.scope && entry.entity_id == baseline.entity_id)
    {
        baselines[index] = baseline;
    } else {
        baselines.push(baseline);
    }
}

fn upsert_province_record(records: &mut Vec<ProvinceEcologyRecord>, record: ProvinceEcologyRecord) {
    if let Some(index) = records.iter().position(|entry| entry.province_id == record.province_id) {
        records[index] = record;
    } else {
        records.push(record);
    }
}

fn dedupe_ids(ids: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    ids.into_iter().filter(|id| seen.insert(id.clone())).collect()
}

fn link_existing_entries(
    bundle: &mut EcologyBundle,
    province_id: u32,
    climate_ids: &[String],
    flora_ids: &[String],
    fauna_ids: &[String],
) {
    for entry in &mut bundle.climates {
        if climate_ids.contains(&entry.id) && !entry.province_ids.contains(&province_id) {
            entry.province_ids.push(province_id);
        }
    }
    for entry in &mut bundle.flora {
        if flora_ids.contains(&entry.id) && !entry.province_ids.contains(&province_id) {
            entry.province_ids.push(province_id);
        }
    }
    for entry in &mut bundle.fauna {
        if fauna_ids.contains(&entry.id) && !entry.province_ids.contains(&province_id) {
            entry.province_ids.push(province_id);
        }
    }
}

fn validate_generation_reuse(bundle: &EcologyBundle, response: &ProvinceGenerationResponse) -> Result<(), String> {
    let approved_climates: HashSet<&str> = bundle
        .climates
        .iter()
        .filter(|entry| entry.status == EntryStatus::Approved)
        .map(|entry| entry.id.as_str())
        .collect();
    let approved_flora: HashSet<&str> = bundle
        .flora
        .iter()
        .filter(|entry| entry.status == EntryStatus::Approved)
        .map(|entry| entry.id.as_str())
        .collect();
    let approved_fauna: HashSet<&str> = bundle
        .fauna
        .iter()
        .filter(|entry| entry.status == EntryStatus::Approved)
        .map(|entry| entry.id.as_str())
        .collect();

    for climate_id in &response.reuse_climate_profile_ids {
        if !approved_climates.contains(climate_id.as_str()) {
            return Err(format!("Unknown approved climate reference: {}", climate_id));
        }
    }
    for flora_id in &response.reuse_flora_ids {
        if !approved_flora.contains(flora_id.as_str()) {
            return Err(format!("Unknown approved flora reference: {}", flora_id));
        }
    }
    for fauna_id in &response.reuse_fauna_ids {
        if !approved_fauna.contains(fauna_id.as_str()) {
            return Err(format!("Unknown approved fauna reference: {}", fauna_id));
        }
    }
    Ok(())
}

fn validate_bundle_references(bundle: &EcologyBundle) -> Result<(), String> {
    let climate_ids: HashSet<&str> = bundle.climates.iter().map(|entry| entry.id.as_str()).collect();
    let flora_ids: HashSet<&str> = bundle.flora.iter().map(|entry| entry.id.as_str()).collect();
    let fauna_ids: HashSet<&str> = bundle.fauna.iter().map(|entry| entry.id.as_str()).collect();

    for flora in &bundle.flora {
        for climate_id in &flora.climate_profile_ids {
            if !climate_ids.contains(climate_id.as_str()) {
                return Err(format!("Flora {} references missing climate {}", flora.id, climate_id));
            }
        }
    }
    for fauna in &bundle.fauna {
        for climate_id in &fauna.climate_profile_ids {
            if !climate_ids.contains(climate_id.as_str()) {
                return Err(format!("Fauna {} references missing climate {}", fauna.id, climate_id));
            }
        }
    }
    for province in &bundle.provinces {
        for climate_id in &province.climate_profile_ids {
            if !climate_ids.contains(climate_id.as_str()) {
                return Err(format!("Province {} references missing climate {}", province.province_id, climate_id));
            }
        }
        for flora_id in &province.flora_ids {
            if !flora_ids.contains(flora_id.as_str()) {
                return Err(format!("Province {} references missing flora {}", province.province_id, flora_id));
            }
        }
        for fauna_id in &province.fauna_ids {
            if !fauna_ids.contains(fauna_id.as_str()) {
                return Err(format!("Province {} references missing fauna {}", province.province_id, fauna_id));
            }
        }
    }
    Ok(())
}

fn normalize_bundle_for_save(existing: &EcologyBundle, incoming: &mut EcologyBundle) {
    incoming.updated_at = Utc::now().to_rfc3339();
    normalize_baselines_for_save(&existing.baselines, &mut incoming.baselines);
    normalize_entry_status_for_save(&existing.climates, &mut incoming.climates);
    normalize_entry_status_for_save(&existing.flora, &mut incoming.flora);
    normalize_entry_status_for_save(&existing.fauna, &mut incoming.fauna);
    normalize_provinces_for_save(&existing.provinces, &mut incoming.provinces);
}

fn normalize_baselines_for_save(existing: &[EcologyBaseline], incoming: &mut [EcologyBaseline]) {
    for entry in incoming {
        if entry.status == EcologyStatus::Approved && entry.approved_at.is_none() {
            entry.approved_at = Some(Utc::now().to_rfc3339());
        }
        if let Some(previous) = existing
            .iter()
            .find(|candidate| candidate.scope == entry.scope && candidate.entity_id == entry.entity_id)
        {
            if previous.status == EcologyStatus::Approved && previous != entry {
                entry.status = EcologyStatus::Draft;
                entry.approved_at = None;
            }
        }
    }
}

trait IdentifiedEntry {
    fn id(&self) -> &str;
    fn status(&self) -> &EntryStatus;
    fn status_mut(&mut self) -> &mut EntryStatus;
    fn approved_at_mut(&mut self) -> &mut Option<String>;
}

impl IdentifiedEntry for ClimateProfile {
    fn id(&self) -> &str { &self.id }
    fn status(&self) -> &EntryStatus { &self.status }
    fn status_mut(&mut self) -> &mut EntryStatus { &mut self.status }
    fn approved_at_mut(&mut self) -> &mut Option<String> { &mut self.approved_at }
}

impl IdentifiedEntry for FloraEntry {
    fn id(&self) -> &str { &self.id }
    fn status(&self) -> &EntryStatus { &self.status }
    fn status_mut(&mut self) -> &mut EntryStatus { &mut self.status }
    fn approved_at_mut(&mut self) -> &mut Option<String> { &mut self.approved_at }
}

impl IdentifiedEntry for FaunaEntry {
    fn id(&self) -> &str { &self.id }
    fn status(&self) -> &EntryStatus { &self.status }
    fn status_mut(&mut self) -> &mut EntryStatus { &mut self.status }
    fn approved_at_mut(&mut self) -> &mut Option<String> { &mut self.approved_at }
}

fn normalize_entry_status_for_save<T>(existing: &[T], incoming: &mut [T])
where
    T: IdentifiedEntry + PartialEq,
{
    for entry in incoming {
        if *entry.status() == EntryStatus::Approved && entry.approved_at_mut().is_none() {
            *entry.approved_at_mut() = Some(Utc::now().to_rfc3339());
        }
        if let Some(previous) = existing.iter().find(|candidate| candidate.id() == entry.id()) {
            if *previous.status() == EntryStatus::Approved && previous != entry {
                *entry.status_mut() = EntryStatus::Draft;
                *entry.approved_at_mut() = None;
            }
        }
    }
}

fn normalize_provinces_for_save(existing: &[ProvinceEcologyRecord], incoming: &mut [ProvinceEcologyRecord]) {
    for entry in incoming {
        if entry.status == EcologyStatus::Approved && entry.approved_at.is_none() {
            entry.approved_at = Some(Utc::now().to_rfc3339());
        }
        if let Some(previous) = existing.iter().find(|candidate| candidate.province_id == entry.province_id) {
            if previous.status == EcologyStatus::Approved && previous != entry {
                entry.status = EcologyStatus::Draft;
                entry.approved_at = None;
            }
        }
    }
}

fn load_cell_metrics(planets_dir: &FsPath, world_id: &str, province_id: u32) -> Result<ProvinceCellMetrics, String> {
    let path = planets_dir.join(world_id).join("cell_features.json");
    if !path.exists() {
        return Ok(ProvinceCellMetrics::default());
    }
    let payload: CellFeaturesFile = read_typed_json(path)?;
    let matching: Vec<&CellFeatureRecord> = payload
        .cells
        .iter()
        .filter(|cell| cell.primary_region == Some(province_id) && cell.primary_region_type.as_deref() == Some("province"))
        .collect();
    if matching.is_empty() {
        return Ok(ProvinceCellMetrics::default());
    }

    let mut terrain_counts: HashMap<String, usize> = HashMap::new();
    let mut vegetation_total = 0.0;
    let mut vegetation_count = 0usize;
    let mut aridity_total = 0.0;
    let mut aridity_count = 0usize;
    let mut water_count = 0usize;
    let mut coastal_count = 0usize;

    for cell in &matching {
        if let Some(class_name) = &cell.terrain_class {
            *terrain_counts.entry(class_name.clone()).or_default() += 1;
        }
        if let Some(value) = cell.vegetation_index {
            vegetation_total += value;
            vegetation_count += 1;
        }
        if let Some(value) = cell.aridity_index {
            aridity_total += value;
            aridity_count += 1;
        }
        if cell.is_water.unwrap_or(false) {
            water_count += 1;
        }
        if cell.is_coastal.unwrap_or(false) {
            coastal_count += 1;
        }
    }

    let mut dominant_terrain_classes = terrain_counts.into_iter().collect::<Vec<_>>();
    dominant_terrain_classes.sort_by(|a, b| b.1.cmp(&a.1));

    Ok(ProvinceCellMetrics {
        dominant_terrain_classes: dominant_terrain_classes.into_iter().take(3).map(|entry| entry.0).collect(),
        avg_vegetation_index: (vegetation_count > 0).then_some(vegetation_total / vegetation_count as f64),
        avg_aridity_index: (aridity_count > 0).then_some(aridity_total / aridity_count as f64),
        water_share: Some(water_count as f64 / matching.len() as f64),
        coastal_share: Some(coastal_count as f64 / matching.len() as f64),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};

    fn temp_world_dir(label: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ashtrail-ecology-{}-{}", label, Uuid::new_v4()));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn approved_baseline(scope: BaselineScope, entity_id: BaselineEntityId, parent: Option<BaselineEntityId>) -> EcologyBaseline {
        EcologyBaseline {
            scope,
            entity_id,
            parent_entity_id: parent,
            status: EcologyStatus::Approved,
            summary: "approved".to_string(),
            climate_directives: vec!["stable".to_string()],
            flora_directives: vec!["reuse".to_string()],
            fauna_directives: vec!["reuse".to_string()],
            agriculture_directives: vec!["fertile".to_string()],
            consistency_rules: vec!["keep coherent".to_string()],
            generated_at: Some(Utc::now().to_rfc3339()),
            approved_at: Some(Utc::now().to_rfc3339()),
        }
    }

    #[test]
    fn bundle_round_trip_writes_split_files() {
        let planets_dir = temp_world_dir("bundle");
        let bundle = EcologyBundle {
            world_id: "world-1".to_string(),
            updated_at: Utc::now().to_rfc3339(),
            baselines: vec![approved_baseline(BaselineScope::World, BaselineEntityId::World("world".to_string()), None)],
            climates: Vec::new(),
            flora: Vec::new(),
            fauna: Vec::new(),
            provinces: Vec::new(),
        };
        save_ecology_bundle(&planets_dir, "world-1", &bundle).expect("save bundle");
        let loaded = load_ecology_bundle(&planets_dir, "world-1").expect("load bundle");
        assert_eq!(loaded.world_id, "world-1");
        assert_eq!(loaded.baselines.len(), 1);
        assert!(planets_dir.join("world-1").join("ecology").join("flora.json").exists());
    }

    #[test]
    fn validation_rejects_unknown_province_reference() {
        let bundle = EcologyBundle {
            world_id: "world".to_string(),
            updated_at: Utc::now().to_rfc3339(),
            baselines: Vec::new(),
            climates: Vec::new(),
            flora: Vec::new(),
            fauna: Vec::new(),
            provinces: vec![ProvinceEcologyRecord {
                province_id: 1,
                duchy_id: 1,
                kingdom_id: 1,
                status: EcologyStatus::Draft,
                source_isolated_image_url: "/img".to_string(),
                description: "draft".to_string(),
                climate_profile_ids: vec!["climate-1".to_string()],
                flora_ids: Vec::new(),
                fauna_ids: Vec::new(),
                ecological_potential: 50,
                agriculture_potential: 40,
                consistency_notes: Vec::new(),
                generated_at: None,
                approved_at: None,
            }],
        };
        let err = validate_bundle_references(&bundle).expect_err("missing climate should fail");
        assert!(err.contains("missing climate"));
    }

    #[test]
    fn generation_reuse_rejects_nonapproved_ids() {
        let bundle = EcologyBundle {
            world_id: "world".to_string(),
            updated_at: Utc::now().to_rfc3339(),
            baselines: Vec::new(),
            climates: vec![ClimateProfile {
                id: "climate-a".to_string(),
                status: EntryStatus::Draft,
                name: "draft climate".to_string(),
                classification: "dry".to_string(),
                temperature_summary: String::new(),
                precipitation_summary: String::new(),
                seasonality: String::new(),
                agriculture_notes: String::new(),
                province_ids: Vec::new(),
                approved_at: None,
            }],
            flora: Vec::new(),
            fauna: Vec::new(),
            provinces: Vec::new(),
        };
        let response = ProvinceGenerationResponse {
            description: "desc".to_string(),
            ecological_potential: 50,
            agriculture_potential: 40,
            consistency_notes: Vec::new(),
            reuse_climate_profile_ids: vec!["climate-a".to_string()],
            new_climate_profiles: Vec::new(),
            reuse_flora_ids: Vec::new(),
            new_flora: Vec::new(),
            reuse_fauna_ids: Vec::new(),
            new_fauna: Vec::new(),
        };
        let err = validate_generation_reuse(&bundle, &response).expect_err("draft id should fail");
        assert!(err.contains("Unknown approved climate reference"));
    }

    #[test]
    fn province_reference_merge_keeps_reused_and_new_entries() {
        let mut bundle = EcologyBundle {
            world_id: "world".to_string(),
            updated_at: Utc::now().to_rfc3339(),
            baselines: Vec::new(),
            climates: vec![ClimateProfile {
                id: "climate-ok".to_string(),
                status: EntryStatus::Approved,
                name: "Temperate".to_string(),
                classification: "temperate".to_string(),
                temperature_summary: String::new(),
                precipitation_summary: String::new(),
                seasonality: String::new(),
                agriculture_notes: String::new(),
                province_ids: Vec::new(),
                approved_at: Some(Utc::now().to_rfc3339()),
            }],
            flora: vec![FloraEntry {
                id: "flora-ok".to_string(),
                status: EntryStatus::Approved,
                name: "Tree".to_string(),
                category: FloraCategory::Tree,
                description: String::new(),
                ecological_roles: Vec::new(),
                adaptations: Vec::new(),
                edibility: FloraEdibility::None,
                agriculture_value: 10,
                climate_profile_ids: vec!["climate-ok".to_string()],
                province_ids: Vec::new(),
                approved_at: Some(Utc::now().to_rfc3339()),
            }],
            fauna: vec![FaunaEntry {
                id: "fauna-ok".to_string(),
                status: EntryStatus::Approved,
                name: "Grazer".to_string(),
                category: FaunaCategory::Herbivore,
                description: String::new(),
                ecological_roles: Vec::new(),
                adaptations: Vec::new(),
                domestication_potential: 50,
                danger_level: 10,
                climate_profile_ids: vec!["climate-ok".to_string()],
                province_ids: Vec::new(),
                earth_analog: "goat".to_string(),
                ancestral_stock: "ungulate".to_string(),
                evolutionary_pressures: Vec::new(),
                mutation_summary: String::new(),
                divergence_summary: String::new(),
                approved_at: Some(Utc::now().to_rfc3339()),
            }],
            provinces: Vec::new(),
        };
        let new_climate = ClimateProfile {
            id: "climate-new".to_string(),
            status: EntryStatus::Draft,
            name: "Wet".to_string(),
            classification: "humid".to_string(),
            temperature_summary: String::new(),
            precipitation_summary: String::new(),
            seasonality: String::new(),
            agriculture_notes: String::new(),
            province_ids: vec![7],
            approved_at: None,
        };
        bundle.climates.push(new_climate);
        link_existing_entries(
            &mut bundle,
            7,
            &["climate-ok".to_string(), "climate-new".to_string()],
            &["flora-ok".to_string()],
            &["fauna-ok".to_string()],
        );
        assert!(bundle.climates.iter().find(|entry| entry.id == "climate-ok").unwrap().province_ids.contains(&7));
        assert!(bundle.flora.iter().find(|entry| entry.id == "flora-ok").unwrap().province_ids.contains(&7));
        assert!(bundle.fauna.iter().find(|entry| entry.id == "fauna-ok").unwrap().province_ids.contains(&7));
    }

    #[test]
    fn auto_cache_isolated_province_creates_png() {
        let planets_dir = temp_world_dir("isolate-planets");
        let isolated_root = temp_world_dir("isolate-assets");
        let world_dir = planets_dir.join("world-a");
        let worldgen_dir = world_dir.join("worldgen");
        let textures_dir = world_dir.join("textures");
        fs::create_dir_all(&worldgen_dir).expect("create worldgen dir");
        fs::create_dir_all(&textures_dir).expect("create textures dir");

        let mut base = RgbImage::new(2, 2);
        base.put_pixel(0, 0, Rgb([255, 0, 0]));
        base.put_pixel(1, 0, Rgb([0, 255, 0]));
        base.put_pixel(0, 1, Rgb([0, 0, 255]));
        base.put_pixel(1, 1, Rgb([255, 255, 0]));
        base.save(textures_dir.join("base.jpg")).expect("save base");

        let province_img = image::RgbImage::from_fn(2, 2, |x, _y| {
            if x == 0 {
                image::Rgb([1, 0, 0])
            } else {
                image::Rgb([2, 0, 0])
            }
        });
        province_img.save(worldgen_dir.join("province_id.png")).expect("save province ids");

        fs::write(
            worldgen_dir.join("provinces.json"),
            serde_json::to_string_pretty(&vec![
                ProvinceRecord { id: 1, seed_x: 0, seed_y: 0, area: 2, duchy_id: 1, kingdom_id: 1, biome_primary: 3, name: "P1".to_string(), population: 0, wealth: 0, development: 0 },
                ProvinceRecord { id: 2, seed_x: 1, seed_y: 0, area: 2, duchy_id: 1, kingdom_id: 1, biome_primary: 3, name: "P2".to_string(), population: 0, wealth: 0, development: 0 },
            ])
            .unwrap(),
        )
        .expect("save provinces");
        fs::write(
            worldgen_dir.join("duchies.json"),
            serde_json::to_string_pretty(&vec![DuchyRecord { id: 1, province_ids: vec![1, 2], kingdom_id: 1, name: "D1".to_string() }]).unwrap(),
        )
        .expect("save duchies");
        fs::write(
            worldgen_dir.join("kingdoms.json"),
            serde_json::to_string_pretty(&vec![KingdomRecord { id: 1, duchy_ids: vec![1], name: "K1".to_string() }]).unwrap(),
        )
        .expect("save kingdoms");

        let filename = worldgen_pipeline::ensure_isolated_province_asset(&planets_dir, &isolated_root, "world-a", 1)
            .expect("ensure isolated province");
        assert_eq!(filename, "province_1.png");
        assert!(isolated_root.join("world-a").join("province_1.png").exists());
    }
}
