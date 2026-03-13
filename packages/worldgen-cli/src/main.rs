use clap::Parser;
use image::ImageReader;
use std::path::PathBuf;
use worldgen_core::*;

/// CK3-Style Province Generation Pipeline
#[derive(Parser, Debug)]
#[command(name = "worldgen", version)]
enum Cli {
    /// Run the full pipeline on a base image
    Build {
        /// Path to the input base image (e.g. base.jpg)
        #[arg(short, long)]
        input: PathBuf,

        /// Output directory (e.g. generated/planets/{id})
        #[arg(short, long)]
        out: PathBuf,

        /// Target number of counties/provinces
        #[arg(short, long, default_value = "500")]
        counties: u32,

        /// RNG seed for deterministic output
        #[arg(short, long, default_value = "42")]
        seed: u64,
    },

    /// Show pipeline status for a planet folder
    Status {
        /// Planet output directory
        #[arg(short = 'd', long)]
        planet_dir: PathBuf,
    },
}

fn main() {
    let cli = Cli::parse();

    match cli {
        Cli::Build {
            input,
            out,
            counties,
            seed,
        } => {
            run_build(&input, &out, counties, seed);
        }
        Cli::Status { planet_dir } => {
            run_status(&planet_dir);
        }
    }
}

fn run_build(input: &PathBuf, out: &PathBuf, counties: u32, seed: u64) {
    // Create output directory
    std::fs::create_dir_all(out).expect("Failed to create output directory");

    let mut config = WorldgenConfig::default();
    config.counties = counties;

    let mut progress = |pct: f32, msg: &str| {
        println!("  [{:5.1}%] {}", pct, msg);
    };

    // ── Stage 1: Load Base Image ──
    println!("\n🖼️  Stage 1: Load Base Image");
    let img = ImageReader::open(input)
        .expect("Failed to open input image")
        .decode()
        .expect("Failed to decode input image")
        .to_rgb8();
    let (width, height) = img.dimensions();
    println!("  Input: {}x{}", width, height);

    let mut status = export::PipelineStatus::new();

    // ── Stage 2: Landmask ──
    println!("\n🌊 Stage 2: Land Mask");
    let landmask = landmask::extract_landmask(&img, &config, 500, 200, &mut progress);
    export::write_landmask(&landmask, width, height, &out.join("landmask.png"))
        .expect("Failed to write landmask.png");
    let land_count = landmask.iter().filter(|&&v| v).count();
    println!(
        "  ✅ landmask.png ({} land / {} total = {:.1}%)",
        land_count,
        landmask.len(),
        land_count as f64 / landmask.len() as f64 * 100.0
    );
    status.mark_completed("landmask");

    println!("\n🎨 Stage 3: Normalize Albedo");
    let flat = normalize::normalize_albedo(&img, &landmask, 60.0, &mut progress);
    export::write_rgb_image(&flat, &out.join("albedo_flat.png"))
        .expect("Failed to write albedo_flat.png");
    println!("  ✅ albedo_flat.png");
    status.mark_completed("normalize");

    // ── Stage 4: Height ──
    println!("\n⛰️  Stage 4: Height Reconstruction");
    let height_field = height::reconstruct_height(&flat, &landmask, seed, &mut progress);
    export::write_height_texture(&height_field, width, height, &out.join("height16.png"))
        .expect("Failed to write height16.png");
    println!("  ✅ height16.png");
    status.mark_completed("height");

    // ── Stage 5: Rivers ──
    println!("\n🌊 Stage 5: Rivers & Flow");
    let (river_mask, _accumulation) =
        hydrology::compute_rivers(&height_field, &landmask, width, height, 200, &mut progress);
    export::write_mask_texture(&river_mask, width, height, &out.join("river_mask.png"))
        .expect("Failed to write river_mask.png");
    let river_count = river_mask.iter().filter(|&&v| v > 0).count();
    println!("  ✅ river_mask.png ({} river pixels)", river_count);
    status.mark_completed("rivers");

    // ── Stage 6: Biomes ──
    println!("\n🌲 Stage 6: Biome Classification");
    let registry = BiomeRegistry::default_registry();
    let model_settings = BiomeModelSettings::default();
    let biome_analysis = biome::classify_biomes(
        &height_field,
        &landmask,
        Some(&river_mask),
        &img,
        &config,
        &registry,
        &model_settings,
        None,
        width,
        height,
        &mut progress,
    );
    export::write_mask_texture(&biome_analysis.biome_indices, width, height, &out.join("biome.png"))
        .expect("Failed to write biome.png");
    export::write_mask_texture(
        &biome_analysis.confidence_map,
        width,
        height,
        &out.join("biome_confidence.png"),
    )
    .expect("Failed to write biome_confidence.png");
    println!("  ✅ biome.png");
    status.mark_completed("biome");

    // ── Stage 7: Suitability ──
    println!("\n📊 Stage 7: Suitability Map");
    let suitability = suitability::compute_suitability(
        &height_field,
        &landmask,
        &river_mask,
        &biome_analysis.biome_indices,
        &registry,
        width,
        height,
        &mut progress,
    );
    export::write_f32_binary(&suitability, &out.join("suitability.bin"))
        .expect("Failed to write suitability.bin");
    println!("  ✅ suitability.bin");
    status.mark_completed("suitability");

    // ── Stage 8: Seeds ──
    println!("\n🌱 Stage 8: Seed Placement");
    let seeds = sampling::place_seeds(
        &suitability,
        &landmask,
        width,
        height,
        config.counties,
        config.seed_radius_min,
        config.seed_radius_max,
        seed,
        &mut progress,
    );
    export::write_seeds_json(&seeds, &out.join("seeds.json")).expect("Failed to write seeds.json");
    println!("  ✅ seeds.json ({} seeds placed)", seeds.len());
    status.mark_completed("seeds");

    // ── Stage 9: Province Growth ──
    println!("\n🗺️  Stage 9: Province Growth (Dijkstra)");
    let mut province_labels = partition::grow_provinces(
        &seeds,
        &height_field,
        &landmask,
        &river_mask,
        width,
        height,
        config.cost_slope,
        config.cost_river_crossing,
        config.cost_ridge_crossing,
        &mut progress,
    );
    println!("  ✅ Province labels computed");
    status.mark_completed("partition");

    // ── Stage 10: Postprocessing ──
    println!("\n✨ Stage 10: Postprocessing");
    postprocess::postprocess_provinces(
        &mut province_labels,
        &landmask,
        width,
        height,
        config.min_county_area,
        config.smooth_iterations,
        &mut progress,
    );
    export::write_id_texture(
        &province_labels,
        width,
        height,
        &out.join("province_id.png"),
    )
    .expect("Failed to write province_id.png");
    println!("  ✅ province_id.png");
    status.mark_completed("postprocess");

    // ── Stage 11: Adjacency ──
    println!("\n🔗 Stage 11: Adjacency Graph");
    let adjacency = graph::build_adjacency(
        &province_labels,
        &height_field,
        &river_mask,
        width,
        height,
        &mut progress,
    );
    export::write_adjacency_json(&adjacency, &out.join("adjacency.json"))
        .expect("Failed to write adjacency.json");
    println!(
        "  ✅ adjacency.json ({} provinces with edges)",
        adjacency.len()
    );
    status.mark_completed("adjacency");

    // ── Stage 12: Clustering ──
    println!("\n👑 Stage 12: Hierarchy Clustering");
    let seed_tuples: Vec<(u32, u32, u32)> = seeds.iter().map(|s| (s.id, s.x, s.y)).collect();
    let (provinces, duchies, kingdoms, duchy_labels, kingdom_labels) = cluster::cluster_hierarchy(
        &province_labels,
        &biome_analysis.biome_indices,
        &seed_tuples,
        &adjacency,
        width,
        height,
        config.duchy_size_min,
        config.duchy_size_max,
        config.kingdom_size_min,
        config.kingdom_size_max,
        &mut progress,
    );
    export::write_id_texture(&duchy_labels, width, height, &out.join("duchy_id.png"))
        .expect("Failed to write duchy_id.png");
    export::write_id_texture(&kingdom_labels, width, height, &out.join("kingdom_id.png"))
        .expect("Failed to write kingdom_id.png");
    export::write_provinces_json(&provinces, &out.join("provinces.json"))
        .expect("Failed to write provinces.json");
    export::write_duchies_json(&duchies, &out.join("duchies.json"))
        .expect("Failed to write duchies.json");
    export::write_kingdoms_json(&kingdoms, &out.join("kingdoms.json"))
        .expect("Failed to write kingdoms.json");
    println!(
        "  ✅ {} provinces, {} duchies, {} kingdoms",
        provinces.len(),
        duchies.len(),
        kingdoms.len()
    );
    status.mark_completed("clustering");

    // ── Stage 13: Naming (placeholder) ──
    println!("\n📝 Stage 13: Naming & Flavor (placeholder)");
    println!("  ⏭️  Skipped — will be implemented with AI integration");
    status.mark_completed("naming");

    // ── Save pipeline status ──
    status
        .save(&out.join("pipeline_status.json"))
        .expect("Failed to save pipeline status");
    println!("\n═══════════════════════════════════════");
    println!("✅ Pipeline complete! Output: {}", out.display());
    println!(
        "   {} provinces, {} duchies, {} kingdoms",
        provinces.len(),
        duchies.len(),
        kingdoms.len()
    );
    println!("═══════════════════════════════════════\n");
}

fn run_status(planet_dir: &PathBuf) {
    let status_path = planet_dir.join("pipeline_status.json");
    let status = export::PipelineStatus::load(&status_path);

    println!("\n📋 Pipeline Status for {}", planet_dir.display());
    println!("───────────────────────────────────");

    let stage_names = [
        "normalize",
        "landmask",
        "height",
        "rivers",
        "biome",
        "suitability",
        "seeds",
        "partition",
        "postprocess",
        "adjacency",
        "clustering",
        "naming",
    ];

    for (i, name) in stage_names.iter().enumerate() {
        let record = status.stages.get(*name);
        let icon = if record.map(|r| r.completed).unwrap_or(false) {
            "✅"
        } else {
            "⬜"
        };
        println!("  {:02}. {} {}", i + 1, icon, name);
    }
    println!();
}
