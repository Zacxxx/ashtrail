use crate::graph::ProvinceAdjacency;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvinceRecord {
    pub id: u32,
    pub seed_x: u32,
    pub seed_y: u32,
    pub area: u32,
    pub duchy_id: u32,
    pub kingdom_id: u32,
    pub biome_primary: u8,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuchyRecord {
    pub id: u32,
    pub province_ids: Vec<u32>,
    pub kingdom_id: u32,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KingdomRecord {
    pub id: u32,
    pub duchy_ids: Vec<u32>,
    pub name: String,
}

/// Stage 11: Cluster provinces into duchies and kingdoms.
pub fn cluster_hierarchy(
    labels: &[u32],
    biome: &[u8],
    seeds: &[(u32, u32, u32)], // (id, x, y)
    adjacency: &[ProvinceAdjacency],
    width: u32,
    height: u32,
    duchy_size_min: u32,
    duchy_size_max: u32,
    _kingdom_size_min: u32,
    kingdom_size_max: u32,
    on_progress: &mut dyn FnMut(f32, &str),
) -> (
    Vec<ProvinceRecord>,
    Vec<DuchyRecord>,
    Vec<KingdomRecord>,
    Vec<u32>,
    Vec<u32>,
) {
    let n = (width * height) as usize;
    let no_label = u32::MAX;

    on_progress(0.0, "Computing province stats");

    // Compute per-province area and dominant biome
    let mut area_map: HashMap<u32, u32> = HashMap::new();
    let mut biome_counts: HashMap<u32, HashMap<u8, u32>> = HashMap::new();

    for i in 0..n {
        if labels[i] != no_label {
            *area_map.entry(labels[i]).or_insert(0) += 1;
            *biome_counts
                .entry(labels[i])
                .or_default()
                .entry(biome[i])
                .or_insert(0) += 1;
        }
    }

    let dominant_biome: HashMap<u32, u8> = biome_counts
        .iter()
        .map(|(&pid, counts)| {
            let &b = counts.iter().max_by_key(|(_, &c)| c).unwrap().0;
            (pid, b)
        })
        .collect();

    // Build adjacency map for quick lookup
    let adj_map: HashMap<u32, &ProvinceAdjacency> =
        adjacency.iter().map(|a| (a.province_id, a)).collect();

    on_progress(20.0, "Clustering duchies");

    // ── Duchy Clustering: Greedy Region Growing ──
    let mut duchy_assignment: HashMap<u32, u32> = HashMap::new();
    let mut duchies: Vec<DuchyRecord> = Vec::new();
    let _target_duchy_size = (duchy_size_min + duchy_size_max) / 2;

    // Sort provinces by area descending (start from largest)
    let mut province_ids: Vec<u32> = area_map.keys().cloned().collect();
    province_ids.sort_by(|a, b| area_map.get(b).cmp(&area_map.get(a)));

    let mut duchy_id_counter = 0u32;

    for &start_pid in &province_ids {
        if duchy_assignment.contains_key(&start_pid) {
            continue;
        }

        let duchy_id = duchy_id_counter;
        duchy_id_counter += 1;

        let mut duchy_members = vec![start_pid];
        duchy_assignment.insert(start_pid, duchy_id);

        // Grow by adding best neighbor
        while (duchy_members.len() as u32) < duchy_size_max {
            let mut best_candidate = None;
            let mut best_score = f64::MIN;

            for &member in &duchy_members {
                if let Some(adj) = adj_map.get(&member) {
                    for edge in &adj.neighbors {
                        if duchy_assignment.contains_key(&edge.neighbor_id) {
                            continue;
                        }
                        // Score: shared border + biome similarity
                        let border_score = edge.shared_border_length as f64;
                        let biome_bonus = if dominant_biome.get(&edge.neighbor_id)
                            == dominant_biome.get(&member)
                        {
                            50.0
                        } else {
                            0.0
                        };
                        let score = border_score + biome_bonus;
                        if score > best_score {
                            best_score = score;
                            best_candidate = Some(edge.neighbor_id);
                        }
                    }
                }
            }

            if let Some(candidate) = best_candidate {
                duchy_assignment.insert(candidate, duchy_id);
                duchy_members.push(candidate);
            } else {
                break; // No unassigned neighbors
            }
        }

        duchies.push(DuchyRecord {
            id: duchy_id,
            province_ids: duchy_members,
            kingdom_id: 0, // Will be set later
            name: format!("Duchy {}", duchy_id + 1),
        });
    }

    on_progress(50.0, "Clustering kingdoms");

    // ── Kingdom Clustering: Same approach on duchy graph ──
    // Build duchy adjacency from province adjacency
    let mut duchy_adj: HashMap<u32, HashSet<u32>> = HashMap::new();
    for prov_adj in adjacency {
        let d1 = duchy_assignment
            .get(&prov_adj.province_id)
            .cloned()
            .unwrap_or(no_label);
        for edge in &prov_adj.neighbors {
            let d2 = duchy_assignment
                .get(&edge.neighbor_id)
                .cloned()
                .unwrap_or(no_label);
            if d1 != no_label && d2 != no_label && d1 != d2 {
                duchy_adj.entry(d1).or_default().insert(d2);
                duchy_adj.entry(d2).or_default().insert(d1);
            }
        }
    }

    let mut kingdom_assignment: HashMap<u32, u32> = HashMap::new();
    let mut kingdoms: Vec<KingdomRecord> = Vec::new();
    let mut kingdom_id_counter = 0u32;

    // Sort duchies by size descending
    let mut duchy_ids: Vec<u32> = duchies.iter().map(|d| d.id).collect();
    duchy_ids.sort_by(|a, b| {
        let sa = duchies
            .iter()
            .find(|d| d.id == *a)
            .map(|d| d.province_ids.len())
            .unwrap_or(0);
        let sb = duchies
            .iter()
            .find(|d| d.id == *b)
            .map(|d| d.province_ids.len())
            .unwrap_or(0);
        sb.cmp(&sa)
    });

    for &start_did in &duchy_ids {
        if kingdom_assignment.contains_key(&start_did) {
            continue;
        }

        let kingdom_id = kingdom_id_counter;
        kingdom_id_counter += 1;

        let mut kingdom_members = vec![start_did];
        kingdom_assignment.insert(start_did, kingdom_id);

        while (kingdom_members.len() as u32) < kingdom_size_max {
            let mut best_candidate = None;
            let mut best_score = 0usize;

            for &member in &kingdom_members {
                if let Some(neighbors) = duchy_adj.get(&member) {
                    for &neighbor_did in neighbors {
                        if kingdom_assignment.contains_key(&neighbor_did) {
                            continue;
                        }
                        let score = 1; // Simple: just pick any unassigned neighbor
                        if score > best_score || best_candidate.is_none() {
                            best_score = score;
                            best_candidate = Some(neighbor_did);
                        }
                    }
                }
            }

            if let Some(candidate) = best_candidate {
                kingdom_assignment.insert(candidate, kingdom_id);
                kingdom_members.push(candidate);
            } else {
                break;
            }
        }

        // Update duchy records with kingdom assignment
        for &did in &kingdom_members {
            if let Some(duchy) = duchies.iter_mut().find(|d| d.id == did) {
                duchy.kingdom_id = kingdom_id;
            }
        }

        kingdoms.push(KingdomRecord {
            id: kingdom_id,
            duchy_ids: kingdom_members,
            name: format!("Kingdom {}", kingdom_id + 1),
        });
    }

    on_progress(75.0, "Building province records");

    // Build province records
    let seed_map: HashMap<u32, (u32, u32)> = seeds.iter().map(|&(id, x, y)| (id, (x, y))).collect();
    let provinces: Vec<ProvinceRecord> = province_ids
        .iter()
        .filter_map(|&pid| {
            let (sx, sy) = seed_map.get(&pid).cloned().unwrap_or((0, 0));
            let area = area_map.get(&pid).cloned().unwrap_or(0);
            let duchy = duchy_assignment.get(&pid).cloned().unwrap_or(0);
            let kingdom = kingdom_assignment.get(&duchy).cloned().unwrap_or(0);
            let biome_p = dominant_biome.get(&pid).cloned().unwrap_or(0);
            Some(ProvinceRecord {
                id: pid,
                seed_x: sx,
                seed_y: sy,
                area,
                duchy_id: duchy,
                kingdom_id: kingdom,
                biome_primary: biome_p,
                name: format!("Province {}", pid + 1),
            })
        })
        .collect();

    on_progress(85.0, "Building ID textures");

    // Build duchy_id and kingdom_id textures from labels
    let mut duchy_labels = vec![no_label; n];
    let mut kingdom_labels = vec![no_label; n];

    for i in 0..n {
        if labels[i] != no_label {
            let d = duchy_assignment
                .get(&labels[i])
                .cloned()
                .unwrap_or(no_label);
            duchy_labels[i] = d;
            if d != no_label {
                kingdom_labels[i] = kingdom_assignment.get(&d).cloned().unwrap_or(no_label);
            }
        }
    }

    on_progress(100.0, "Hierarchy clustering complete");
    (provinces, duchies, kingdoms, duchy_labels, kingdom_labels)
}
