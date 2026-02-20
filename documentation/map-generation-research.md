# Layered Procedural Map Generation

## The Vision

Drawing inspiration from recent simulation and generative AI advancements (such as Google DeepMind's **Generative Agent-Based Models (GABMs)** like _Concordia_ and environmental representation models like _AlphaEarth Foundations_), we can construct a **layered, deterministic generation pipeline** for the world of Olaas.

Instead of prompting an LLM to "invent a map" directly (which leads to hallucinatory, disconnected geographies), we simulate the world chronologically. Each layer provides the **hard constraints** and **context** for the next layer.

---

## The 5-Layer Generation Pipeline

### Layer 1: Planet & Astrometry (The Canvas)

**The simulation step:** Define the planetary baseline.

- **Inputs:** Size of the map (grid/hexes), planetary temperature baseline, axial tilt, sun exposure.
- **Outputs:** A fundamental heatmap and heightmap base.
- **AI Role:** An LLM defines the initial parameters (e.g., "Olaas is a tidally locked desert planet with intense radiation on the sun-side").

### Layer 2: Geology & Topography (The Bones)

**The simulation step:** Let tectonic plates and erosion dictate the landscape.

- **Inputs:** Heatmap from Layer 1.
- **Outputs:** Elevations, mountains, fault lines, valleys, subterranean caves, and initial mineral deposits.
- **How it works:** We run a fast programmatic cellular automaton or Perlin noise algorithm to establish where high/low ground is.
- **AI Role:** The LLM "reads" the heightmap data to name geological features (e.g., "The Jagged Spine", "The Ashen Basin") without breaking the underlying physics.

### Layer 3: Ecology & Climate (The Meat)

**The simulation step:** Determine biomes based on geology.

- **Inputs:** Elevation, atmospheric winds, and water sources.
- **Outputs:** Biomes (e.g., irradiated desert, toxic swamp, salt flats), rivers, oases, and native mutant flora/fauna hotspots.
- **AI Role:** Given the combination of "low elevation + scarce water," the AI GM is instructed to generate species and hazards tailored to those exact conditions (e.g., "Glass-spiders that thrive in the heat").

### Layer 4: Human Effects & Settlements (The History)

**The simulation step:** Where do people go? Humans settle where Ecology and Geology allow survival.

- **Inputs:** Rivers (for water), mountains (for defense), mineral veins (for fuel/parts).
- **Outputs:** Ruins, pre-apocalypse highways, modern scavenger settlements, and military checkpoints.
- **AI Role:** Using DeepMind-style Generative Agents, we simulate a "fast-forward" historic colonization. We spawn _N_ founding factions and ask the AI GM to run 100 years of history. "Faction A settles near the salt flats for defense. Faction B settles near the ruins for scrap." This organically generates trade routes and node points.

### Layer 5: Economy & Current State (The Game)

**The simulation step:** What is the condition _today_?

- **Inputs:** Settlement locations, trade routes from Layer 4, and resource distributions from Layer 3.
- **Outputs:** The exact scarcity values at each node, active threats, and faction relationships.
- **AI Role:** The LLM establishes the contemporary context. Are the fuel lines cut? Is there a war over water? This sets the Rumor engine baseline and provides the exact starting `GameState`.

---

## Implementation Strategy for `dev-tools`

To achieve this, the our `dev-tools` map generator will not be a single script. It will be a stepping UI:

1. **Generate Terrain:** Run programmatic noise.
2. **Simulate Ecology:** Apply climate rules.
3. **Run History Simulation:** Let AI agents fast-forward the settlement process (utilizing GABM principles to let them decide where to build).
4. **Finalize Economy:** Calculate local scarcity and generate Rumors.
5. **Export:** Export the final constrained map as a JSON state file ready for the `server` to run.
