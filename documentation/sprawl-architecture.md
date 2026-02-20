# Sprawl-Inspired Modular Generation

## 1. Core Philosophy

Inspired by the Gemini "Sprawl" project, the generation of Olaas will not rely on a single monolithic prompt or a single rigid algorithm. Instead, we use a **Modular, Multi-step Workflow**. Gemini acts as both a programmer (writing math modules) and a synthesizer (stitching the output into a cohesive map).

The generation is broken down into specific, visually verifiable steps.

## 2. The Sprawl Pipeline for Ash Trail

1. **Module Registry (The Code Arsenal)**
   - Before generating terrain, we define atomic logic modules: Vector Math, Hex Grid traversals, A\* Pathfinding for rivers and roads, Label Relaxation (so node names don't overlap), and Flow Fields.
   - These are tested independently in the `dev-tools` UI.

2. **GEO (Geography & Terrain)**
   - The foundation. Generating continuous noise models to map out elevation (mountains, coastlines) and hydrology (rivers, lakes, radiated zones).

3. **HUBS (Ecology & Resources)**
   - The system analyzes the GEO layer to identify "Hubs" - areas with high survival probability. In Ash Caravan, this means flat terrain near water or salvage sites.
   - These hubs become the candidate locations for Settlements, Cult Camps, and Trade Posts.

4. **ANTS (Pathfinding & Trade Routes)**
   - We simulate 'ants' (scavengers/traders) moving between the Hubs.
   - They seek the path of least resistance (avoiding mountains, preferring water edges).
   - The trails with the highest traffic solidify into the wasteland's primary Trade Routes.

5. **SHAPES & SUBDIV (Factions & Territories)**
   - Voronoi partitioning around the Hubs based on Faction power.
   - We subdivide the map into controlled zones, dead zones, and disputed territories.

6. **TRAFFIC (Simulation)**
   - Validating the economy. We run the deterministic engine to ensure the trade routes actually flow and resources decay at expected rates.

7. **NAMES (AI Toponymy)**
   - Gemini Synthesizes the data. It looks at a Hub's location (e.g., "high elevation, arid, iron deposits") and generates a culturally appropriate name and lore snippet (e.g., "Rust Peak").

8. **SAT (Final Export / Satellite)**
   - The final top-down render of the world map, baked into a structured JSON `GameState` ready for the Server to consume.

## 3. Dev-Tools UI Architecture

To support this, the dev-tools will adopt the "Sprawl" UI layout:

- **Bottom Navigation**: A step-by-step pipeline bar (GEO -> HUBS -> ANTS -> SHAPES -> TRAFFIC -> NAMES -> EXPORT).
- **Left Sidebar**: Contextual inspectors (Geography Inspector, Visualizations, Global Settings).
- **Module Registry View**: A dedicated dashboard to verify that all the underlying mathematical and programmatic "tools" the AI uses are functioning correctly before a generation run.
