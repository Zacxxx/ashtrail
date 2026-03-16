# Ashtrail Dev-Tools User Guide

  <p align="center">
    <img src="https://i.imgur.com/57U7hnG.png" alt="Ashtrail hero image" width="920" />
  </p>


<p align="center">
  <b>A practical tutorial designed to help developers understand, navigate, and use the platform's worldbuilding toolset effectively.</b>
</p>

<p align="center">
  <i>It introduces the purpose of each Dev-Tool, explains how they fit into the broader creative pipeline, and provides a clear usage framework for generating worlds, assets, characters, quests, ecological systems, and supporting content.</i>
</p>

<p align="center">
  This guide is intended as a hands-on reference for building, iterating, and orchestrating coherent game experiences within the Ashtrail ecosystem.
</p>

 <p align="center">
    <a href="https://bun.sh"><img alt="Built with Bun" src="https://img.shields.io/badge/Built%20with-Bun-000000?logo=bun&logoColor=white"></a>
    <img alt="React" src="https://img.shields.io/badge/Frontend-React%2019-61DAFB?logo=react&logoColor=black">
    <img alt="Tailwind" src="https://img.shields.io/badge/Styling-Tailwind%204-06B6D4?logo=tailwindcss&logoColor=white">
  </p>
---



## 🎯 Objective and Goal

**Ashtrail Dev-Tools User Guide** is a practical tutorial designed to help developers understand, navigate, and use the platform's worldbuilding toolset effectively. It introduces the purpose of each Dev-Tool, explains how they fit into the **broader creative pipeline**, and provides a clear usage framework for **generating worlds, assets, characters, quests, ecological systems, and supporting content**. This guide is intended as a **hands-on reference** for building, iterating, and orchestrating coherent game experiences within the Ashtrail ecosystem. 


## 🛠️ Dev-Tools Overview

- **World Generator**: AI-driven planetary simulation and terrain generation tool used to create coherent worlds, large-scale environments, and explorable world structures through the Gemini API.

- **Asset Generator**: Multimodal content generation tool used to produce icons, battlemaps, world assets, game assets, ecology illustrations, sprites, songs, videos, and asset packs aligned with the project's worldbuilding and creative direction.

- **Game Master**: World-scoped AI orchestration tool used to define canon context, system directives, and narrative grounding for the game world, while coordinating live lore inputs, factions, locations, temporality, and quest generation so that events, consequences, and progression remain consistent with the established world state.

- **Gallery**: Centralized content archive used to collect, browse, inspect, and synchronize all generated outputs across the production pipeline, including planets, textures, icons, characters, songs, videos, and isolated world assets; its Isolated section is specifically designed to organize world-derived regional outputs into separated territorial layers such as kingdoms, duchies, provinces, and counties for easier review and reuse.

- **Gameplay Engine**: Central gameplay design and balancing tool used to define the core rules of the game, structure exploration, events, combat, character systems, and skills, and configure the numerical logic that drives progression, movement, statistics, status effects, and overall gameplay behavior.

- **Character Builder**: Comprehensive character creation and configuration tool used to design playable characters, NPCs, monsters, and archetypes, with full control over identity, appearance, lore, traits, attributes, occupation, skills, equipment, inventory, relationships, and character-sheet data required by the game systems.

- **History**: Advanced lore generation and canon-structuring tool used to create, organize, and maintain narrative coherence across the world's main lore and more granular storytelling layers, including regions, locations, factions, characters, timeline progression, and temporality.

- **Ecology**: World ecology design and generation tool used to create and structure flora, fauna, biomes, and environmental baselines, establishing the ecological logic, biological diversity, and natural reference framework of the world.

- **Quests**: Dynamic quest generation and execution environment used to create, run, archive, and test world-scoped, party-based, multi-ending quest flows driven by lore, history, ecology, character state, and live world context.

- **Job Center**: Centralized generation tracking and connectivity hub used to monitor all current and past generation jobs across the entire dev-tools ecosystem, providing real-time status updates, historical logs, and cross-tool integration for seamless workflow orchestration and debugging.


## 🚀 Getting Started

### Prerequisites

Before using the Ashtrail Dev-Tools, ensure you have the following installed and configured:

**Required Software:**
- **[Bun](https://bun.sh)**: JavaScript runtime and package manager for the monorepo and frontend tooling
- **[Rust](https://www.rust-lang.org/tools/install)**: Stable toolchain required for the dev-tools terrain backend

**API Keys:**
- **Gemini API Key**: Required for AI-driven generation across all dev-tools
  - Used by the Rust backend for image/text generation endpoints
  - Obtain from [Google AI Studio](https://aistudio.google.com/app/apikey)

**Optional Services:**
- **Supabase Bucket**: For cloud synchronization via the Gallery tool (optional but recommended for team workflows)

### Installation

1. **Clone the repository** and navigate to the project root:
   ```bash
   git clone <repository-url>
   cd ashtrail
   ```

2. **Install dependencies** for the entire monorepo:
   ```bash
   bun install
   ```

3. **Configure environment variables** by creating a `.env.local` file at the root:
   ```env
   # Required: Gemini API key for dev-tools backend
   GEMINI_API_KEY=your_gemini_api_key_here

   # Required: Legacy key name for other app surfaces
   GOOGLE_GENAI_API_KEY=your_gemini_api_key_here

   # Optional: Image model catalog for worldgen refinement UI
   AI_IMAGE_MODELS=gemini-3.1-flash-image-preview|Nano Banana 2,gemini-3-pro-image-preview|Gemini 3 Pro Image Preview,gemini-2.5-flash-image|Gemini 2.5 Flash Image

   # Optional: Default image model
   AI_IMAGE_DEFAULT_MODEL=gemini-3.1-flash-image-preview

   # Optional: Fallback chain for image generation
   AI_IMAGE_FALLBACK_CHAIN=gemini-3-pro-image-preview,gemini-2.5-flash-image

   # Optional: Refine job protection
   WORLDGEN_REFINE_MAX_CONCURRENT=1
   WORLDGEN_REFINE_MAX_QUEUE=3
   ```

### Launching the Dev-Tools

**Option 1: Run Frontend + Backend Together (Recommended)**
```bash
bun run dev:dev-tools
```
This command starts both the React frontend and the Rust backend simultaneously.

**Option 2: Run Components Separately**
```bash
# Terminal 1: Start the Rust backend (http://127.0.0.1:8787)
bun run dev:dev-tools:backend

# Terminal 2: Start the frontend (includes demo at `/` and dev-tools at `/devtools`)
bun run dev:dev-tools:frontend
```

**Option 3: Access Demo Landing Only**
```bash
bun run dev:demo
```

### First Launch

Once the dev-tools are running:

1. **Navigate to** `http://localhost:5173/devtools` (or the port shown in your terminal)
2. You'll see the **Dev-Tools Dashboard** with all available tools
3. **Start with the World Generator** to create your first world - this is mandatory before using other tools
4. Once a world is generated, **select it as your active world** to unlock the other dev-tools

> **Important**: All dev-tools require an active world to be selected. The World Generator is always your starting point.

---

## 🔄 Workflow & Pipeline

### Core Principle: World-Centric Design

All Ashtrail dev-tools operate within the context of a **selected active world**. This ensures that every asset, character, quest, and piece of lore remains coherent and connected to the same canonical universe.

### Recommended Pipeline

While the dev-tools are flexible, following this logical order ensures optimal coherence and minimizes connectivity issues:

```
1. World Generator
   ↓
2. Game Master
   ↓
3. History (Lore)
   ↓
4. Ecology
   ↓
5. Gameplay Engine
   ↓
6. Character Builder
   ↓
7. Quests
```

### Pipeline Breakdown

**1. World Generator** (Foundation Layer)
- **Purpose**: Create the planetary foundation and explorable world structure
- **Output**: Procedurally generated planet with biomes, terrain, and tiles
- **Why First**: Establishes the physical and environmental baseline for all subsequent tools
- **Action**: Generate a world and set it as your **active world**

**2. Game Master** (Canon Layer)
- **Purpose**: Define the world's canonical context, system directives, and narrative grounding
- **Output**: World prompt, ambience settings, tones, factions, locations, temporality
- **Why Second**: Locks the creative direction and lore framework before detailed content generation
- **Dependencies**: Requires an active world

**3. History** (Narrative Layer)
- **Purpose**: Build the world's lore, timeline, regions, factions, and character backstories
- **Output**: Main lore, regional lore, location lore, faction histories, temporal progression
- **Why Third**: Provides narrative depth and context for characters, quests, and ecology
- **Dependencies**: Benefits from Game Master canon being defined first

**4. Ecology** (Environmental Layer)
- **Purpose**: Design flora, fauna, biomes, and environmental baselines
- **Output**: Species definitions, ecological logic, biological diversity, natural systems
- **Why Fourth**: Enriches the world with living ecosystems that inform exploration and quests
- **Dependencies**: Uses world structure and lore context

**5. Gameplay Engine** (Rules Layer)
- **Purpose**: Define core game rules, exploration mechanics,combat system, character system and skills.
- **Output**: Numerical logic, progression systems, movement rules, status effects, gameplay behavior
- **Why Fifth**: Establishes the mechanical framework that characters and quests will operate within
- **Dependencies**: Informed by world structure and lore

**6. Character Builder** (Actor Layer)
- **Purpose**: Create playable characters, NPCs, monsters, and archetypes
- **Output**: Character sheets with identity, traits, attributes, skills, equipment, relationships
- **Why Sixth**: Populates the world with actors that drive quests and interactions
- **Dependencies**: Uses gameplay rules, lore, and ecological context

**7. Quests** (Experience Layer)
- **Purpose**: Generate dynamic, world-scoped, multi-ending quest flows
- **Output**: Quest runs with nodes, choices, illustrations, and narrative progression
- **Why Last**: Synthesizes all previous layers into playable narrative experiences
- **Dependencies**: Requires world, lore, characters, ecology, and gameplay rules to be coherent

### Flexible Usage

While the above order is recommended, the dev-tools are designed to be flexible:

- **Iterative Workflow**: You can return to any tool at any time to refine or expand content
- **Parallel Development**: Asset Generator and Gallery can be used alongside any step
- **Non-Linear Exploration**: Advanced users can jump between tools as needed, but maintaining logical coherence is crucial

### Supporting Tools

**Asset Generator** (Multimodal Content)
- Can be used at any stage to generate icons, battlemaps, sprites, songs, videos, and asset packs
- Automatically aligns with the active world's creative direction

**Gallery** (Content Archive)
- Continuously collects all generated outputs across the pipeline
- Use the **Isolated** section to organize world-derived regional outputs by territory (kingdoms, duchies, provinces, counties)
- Supports **Supabase sync** for cloud backup and team collaboration

**Job Center** (Monitoring Hub)
- Passive monitoring tool for tracking all current and past generation jobs
- Provides real-time status updates and historical logs
- Useful for debugging and understanding cross-tool connectivity

### Key Workflow Rules

1. **Always start with World Generator** - No other tool will function without an active world
2. **Select your active world** before using any other dev-tool
3. **Follow the logical pipeline** for first-time world creation to ensure coherence
4. **Use Job Center** to monitor long-running generation tasks
5. **Sync via Gallery** to preserve and share your generated content
6. **Iterate freely** once your foundation is established

---


## 📖 Tool-by-Tool Guides

<details>
<summary><b>🌍 World Generator</b></summary>

### Purpose & Overview

The World Generator is the foundational tool of the Ashtrail dev-tools ecosystem. It creates procedurally generated planets with coherent terrain, biomes, climate systems, and territorial hierarchies through AI-driven simulation algorithms powered by the Gemini API. This tool establishes the physical and environmental baseline that all other dev-tools depend on.

### Key Features

- **AI-Driven Planet Generation**: Text-to-image synthesis of planetary textures using Gemini image models
- **Procedural Terrain Simulation**: Physics-based generation of continents, oceans, mountains, and biomes
- **Multi-Stage Workflow**: Structured pipeline from geology → geography → ecology → humanity
- **3D Visualization**: Real-time globe rendering with multiple view modes (2D map, 3D map, globe, provinces)
- **Hierarchical Geography**: Automatic generation of kingdoms, duchies, provinces, and counties
- **Province Refinement**: AI-powered texture refinement for individual provinces with variant generation
- **Ecology Layer**: Vegetation and fauna distribution across biomes
- **Humanity Layer**: Settlement generation with configurable scope (world, kingdom, duchy, province)
- **History Integration**: All generated worlds are saved and can be selected as the active world

### Interface Walkthrough

The World Generator interface is organized into four main workflow stages accessible via the top navigation bar:

1. **GEO (Geology)**: Initial planet generation and configuration
2. **GEOGRAPHY**: Province hierarchy management, inspection, isolation, and refinement
3. **ECO (Ecology)**: Flora and fauna layer generation
4. **HUMANITY**: Settlement and location generation

**View Modes:**
- **MAP 2D**: Flat projection of the planet texture
- **MAP 3D**: 3D terrain visualization with elevation
- **GLOBE 3D**: Interactive rotating globe view
- **PROVINCES**: Province overlay visualization with territorial boundaries

**Left Sidebar**: Context-sensitive configuration panels that change based on the active workflow stage

**Top Bar**: Stage navigation, view mode controls, and world history picker

### Inputs Required

**For Initial Planet Generation (GEO Stage):**
- **World Prompt**: Text description of the planet's visual appearance and atmosphere
  - Example: "A desolate, dusty orange planet with deep canyon scars, dry ocean basins, and rocky gray mountain ranges."
- **AI Resolution**: Image generation resolution (512x256, 1024x512, 2048x1024, 4096x2048)
- **AI Temperature**: Creativity parameter for image generation (0.0 - 1.0)
- **Simulation Config**:
  - World parameters: size, seed, water level
  - Geology parameters: tectonic plates, mountain formation, erosion
  - Climate parameters: temperature, precipitation, wind patterns
- **Continents**: Optional manual continent configuration with name, prompt, and size

**For Geography Stage:**
- Active world selection (from history)
- Province hierarchy is auto-generated but can be manually adjusted

**For Ecology Stage:**
- **Ecology Prompt**: Description of vegetation and fauna characteristics
- **Vegetation Density**: 0.0 - 1.0 slider
- **Fauna Density**: 0.0 - 1.0 slider

**For Humanity Stage:**
- **Humanity Prompt**: Description of settlements, civilization level, and infrastructure
- **Settlement Density**: 0.0 - 1.0 slider
- **Technology Level**: 0.0 - 1.0 slider
- **Scope Mode**: World, Kingdom, Duchy, or Province
- **Scope Targets**: Specific regions to generate settlements within (if scoped)

### Outputs Generated

**GEO Stage Outputs:**
- **Planet Texture**: High-resolution equirectangular texture (PNG)
- **Terrain Data**: Elevation, temperature, precipitation, biome data per cell
- **World Configuration**: Serialized simulation parameters
- **History Entry**: Saved world with unique ID, timestamp, and metadata

**GEOGRAPHY Stage Outputs:**
- **Province Hierarchy**: JSON structure with kingdoms, duchies, provinces, counties
- **Province Overlays**: SVG path data for territorial boundaries
- **Region Metadata**: Names, types, parent-child relationships, raw IDs
- **Refined Textures**: AI-generated texture variants for individual provinces

**ECO Stage Outputs:**
- **Ecology Data**: Flora and fauna distribution maps
- **Biome Enrichment**: Enhanced biome definitions with species lists

**HUMANITY Stage Outputs:**
- **World Locations**: JSON array of settlements with:
  - ID, name, type (city, town, village, outpost)
  - Coordinates (latitude, longitude)
  - Population, technology level, description
  - Parent region references
- **Location Generation Metadata**: Generation parameters and statistics
- **Humanity Readiness**: Status indicators for location data availability

### Step-by-Step Usage

#### Step 1: Generate Your First Planet (GEO Stage)

1. **Launch the dev-tools** and navigate to the World Generator (it should be the default landing page)

2. **Configure the planet prompt**:
   - In the left sidebar under the "Base" tab, enter a descriptive prompt
   - Be specific about terrain features, colors, atmosphere, and overall aesthetic
   - Example: "A frozen ice world with massive glaciers, deep blue ice canyons, and polar auroras"

3. **Set generation parameters**:
   - **AI Resolution**: Start with 2048x1024 for good quality (higher = slower but better detail)
   - **AI Temperature**: 0.7 is a good default (lower = more literal, higher = more creative)

4. **Configure simulation settings** (optional):
   - Switch to the "World" tab to adjust planet size and water level
   - Switch to "Geology" tab to control tectonic activity and erosion
   - Switch to "Climate" tab to adjust temperature and precipitation patterns
   - Default values work well for most use cases

5. **Configure continents** (optional):
   - Switch to the "Continents" tab
   - Use "Auto-Generate Continents" for AI-suggested continent configurations
   - Or manually add/edit continents with custom prompts and sizes

6. **Generate the planet**:
   - Click the "Generate Planet" button at the bottom of the left sidebar
   - A progress overlay will appear showing generation stages
   - Wait for the texture generation to complete (30 seconds to 2 minutes depending on resolution)

7. **Review the result**:
   - The generated planet will appear in the 3D globe view
   - Use mouse controls to rotate and zoom the globe
   - Switch between view modes (2D, 3D, Globe) to inspect different perspectives

8. **Save and activate**:
   - The world is automatically saved to history
   - It becomes your active world automatically
   - You can access it later via the history picker (archive icon in top-right)

#### Step 2: Build Geographic Hierarchy (GEOGRAPHY Stage)

1. **Navigate to the GEOGRAPHY stage** using the top workflow bar

2. **Run the geography pipeline**:
   - In the left sidebar, select the "Pipeline" tab
   - Click "Generate Province Hierarchy" to create kingdoms, duchies, provinces, and counties
   - The system will analyze terrain features and create logical territorial divisions
   - Wait for the pipeline to complete (1-3 minutes)

3. **Inspect the hierarchy**:
   - Switch to the "Inspector" tab in the left sidebar
   - Browse the hierarchical tree of regions
   - Click on any region to select it and view details
   - Use the layer selector to switch between viewing kingdoms, duchies, provinces, or counties

4. **Refine provinces** (optional):
   - Switch to the "Refinement" tab
   - Select a province from the map or inspector
   - Click "Generate Variants" to create AI-refined texture variations for that province
   - Review variants and apply your preferred one
   - Refined provinces get higher-quality localized textures

5. **Isolate regions** (optional):
   - Switch to the "Isolator" tab
   - Select a kingdom, duchy, or province
   - Click "Isolate Region" to export it as a standalone asset
   - Isolated regions are saved to the Gallery for reuse

#### Step 3: Add Ecology Layer (ECO Stage)

1. **Navigate to the ECO stage** using the top workflow bar

2. **Configure ecology parameters**:
   - Enter an ecology prompt describing the flora and fauna
   - Example: "Dense bioluminescent jungles with giant mushrooms and alien predators"
   - Adjust vegetation density (0.0 = barren, 1.0 = lush)
   - Adjust fauna density (0.0 = lifeless, 1.0 = teeming with creatures)

3. **Generate ecology**:
   - Click "Generate Ecology" in the left sidebar
   - The system will distribute species across biomes based on climate and terrain
   - Wait for generation to complete

4. **Review ecology data**:
   - Ecology data is stored per-world and accessible via the Ecology tool
   - The World Generator provides a preview of distribution patterns

#### Step 4: Generate Settlements (HUMANITY Stage)

1. **Navigate to the HUMANITY stage** using the top workflow bar

2. **Configure humanity parameters**:
   - Enter a humanity prompt describing civilization characteristics
   - Example: "Medieval city-states connected by trade routes with fortified walls"
   - Adjust settlement density (0.0 = sparse, 1.0 = dense urbanization)
   - Adjust technology level (0.0 = primitive, 1.0 = advanced)

3. **Set generation scope**:
   - **World Scope**: Generate settlements across the entire planet
   - **Kingdom Scope**: Generate only within selected kingdoms
   - **Duchy Scope**: Generate only within selected duchies
   - **Province Scope**: Generate only within selected provinces
   - Use the scope selector and region picker to define your target area

4. **Generate settlements**:
   - Click "Generate Humanity" in the left sidebar
   - The system will place settlements based on terrain suitability, resources, and scope
   - Wait for generation to complete (1-3 minutes depending on scope)

5. **Review locations**:
   - Generated locations appear as markers on the map
   - Click on any location to view details (name, type, population, description)
   - Locations are saved per-world and accessible via the History tool

6. **Adopt humanity output** (optional):
   - Click "Adopt Humanity Output" to finalize and lock the generated locations
   - This makes the locations available to other dev-tools (Quests, Character Builder, etc.)

### Best Practices

1. **Start Simple**: Use default simulation parameters for your first few worlds. Advanced tuning is powerful but can produce unexpected results.

2. **Prompt Quality Matters**: Detailed, specific prompts produce better results. Include colors, terrain features, atmosphere, and mood.

3. **Resolution vs Speed**: Use 1024x512 for rapid iteration, 2048x1024 for production quality, 4096x2048 only for final hero assets.

4. **Iterative Refinement**: Generate a base planet first, then refine specific provinces that will be featured prominently in your game.

5. **Scope Your Humanity Generation**: Don't generate settlements for the entire world unless necessary. Focus on kingdoms or provinces where your story takes place.

6. **Save Variants**: When refining provinces, generate multiple variants and save the best ones. You can always return to previous versions via history.

7. **Use Consistent Themes**: Keep your ecology and humanity prompts thematically aligned with your initial world prompt for coherence.

8. **Monitor Job Center**: For long-running generations, check the Job Center to track progress and debug issues.

9. **Sync to Gallery**: Regularly sync your worlds to the Gallery (especially isolated regions) for backup and team collaboration.

### Common Pitfalls

1. **Forgetting to Select Active World**: Other dev-tools won't work until you have an active world selected. Always check the history picker.

2. **Skipping Geography Stage**: Provinces are required for humanity generation and many other features. Don't skip the geography pipeline.

3. **Over-Scoping Humanity**: Generating settlements for an entire planet can take a long time and produce too much data. Start with a single kingdom.

4. **Ignoring Terrain Suitability**: The AI places settlements based on terrain. If your world is 90% ocean, expect fewer settlements.

5. **Mismatched Prompts**: If your world prompt describes a desert planet but your ecology prompt describes jungles, the results will be incoherent.

6. **Not Saving Variants**: Province refinement variants are temporary until applied. Always apply your preferred variant before moving on.

7. **Concurrent Generation**: Don't start multiple generation jobs simultaneously. Wait for each stage to complete before moving to the next.

8. **Resolution Limits**: 4096x2048 resolution can fail or timeout on some systems. If generation fails, try a lower resolution.

### Integration with Other Tools

- **Game Master**: Uses the active world's texture, provinces, and locations as context for canon definition
- **History**: Reads world locations and metadata to generate lore and timelines
- **Ecology**: Extends the ecology layer with detailed species definitions and interactions
- **Character Builder**: Uses world locations as birthplaces and faction affiliations for characters
- **Quests**: Uses world locations as quest destinations and narrative anchors
- **Gallery**: Stores all generated textures, provinces, and isolated regions for reuse
- **Job Center**: Tracks all generation jobs (planet, geography, ecology, humanity) with real-time status

</details>


<details>
<summary><b>🧠 Game Master</b></summary>

### Purpose & Overview

The Game Master is the central AI orchestration tool that defines the canonical narrative context, system directives, and ambience settings for your game world. It acts as the "brain" of the Ashtrail ecosystem, coordinating live lore inputs, factions, locations, temporality, and quest generation to ensure that all events, consequences, and progression remain consistent with the established world state. The Game Master compiles dynamic world context from multiple sources (History, Ecology, Characters, etc.) and packages it into a coherent prompt block used by Events and Quests.

### Key Features

- **Canonical World Prompt**: Define the narrative identity, pressures, and thematic foundation of your world
- **System Directive**: Configure how the AI GM reasons about scenes, consequences, escalation, and progression
- **Structured Ambience**: Set pressure profiles (atmosphere, scarcity, social tension, grounded consequences)
- **Tone Presets**: Apply narrative accents (bleak, political, survival, mystic, decaying, frontier)
- **Dynamic Context Compilation**: Automatically pulls live data from History, Ecology, Characters, Factions, Locations, and Temporality
- **Lore Budget Management**: Control how much lore (main, critical, major, minor) is included in the compiled context
- **Context Source Gating**: Enable/disable specific data feeds (regions, locations, factions, characters, etc.)
- **Real-Time Preview**: See exactly what prompt block is being sent to Events and Quests
- **Auto-Save**: Changes are automatically saved per-world with debounced persistence
- **AI-Assisted Generation**: Generate canonical world prompts from existing lore and context

### Interface Walkthrough

The Game Master interface is organized into three main tabs accessible via the top navigation:

1. **CONTEXT**: View and manage dynamic world inputs and lore coverage
2. **DIRECTIVES**: Author the canonical world prompt, system directive, and ambience settings
3. **INTEGRATIONS**: See how the Game Master connects to other dev-tools

**Top Bar:**
- **Tab Selector**: Switch between Context, Directives, and Integrations
- **Save Status**: Real-time indicator (Saving, Saved, Save error, World scoped)
- **Pick World**: Select the active world to configure

**Main Dashboard (visible on all tabs):**
- **AI GM World Card**: Shows the selected world name, canonical prompt preview, and quick links
- **Lore Coverage Card**: Displays lore snippet counts (main, critical, major, minor) and enabled context feeds

### Inputs Required

**Prerequisites:**
- An active world must be selected (generated via World Generator)
- Recommended: History lore entries for richer context compilation

**For Directives Tab:**
- **Canonical World Prompt**: 2-3 paragraph narrative description of the world's identity, pressures, history, and social tensions
  - Example: "The Ashlands are a dying frontier world where fuel scarcity drives brutal territorial wars. Ancient ruins hint at a lost civilization, but survival demands pragmatism over archaeology. Trust is currency, and every alliance is temporary."
- **System Directive**: Instructions for how the AI GM should reason about gameplay
  - Example: "Prioritize grounded consequences. Player choices should reshape faction relationships and resource availability. Escalate tension gradually, but allow moments of respite."
- **Ambience Settings**:
  - **Atmosphere**: Low / Medium / High (environmental oppressiveness)
  - **Pressure**: Low / Medium / High (urgency and stakes)
  - **Scarcity**: Low / Medium / High (resource availability)
  - **Social Tension**: Low / Medium / High (interpersonal conflict)
  - **Grounded Consequences**: Low / Medium / High (realism vs. heroic fantasy)
- **Tone Presets**: Select from bleak, political, survival, mystic, decaying, frontier (multiple allowed)
- **Ambience Notes**: Optional freeform text for nuanced pressure descriptions

**For Context Tab (Advanced):**
- **Context Source Toggles**: Enable/disable specific data feeds
- **Max Lore Snippets**: Budget for non-main lore (1-16 snippets)
- **Event Prompt Prefix**: Framework instructions prepended to all event/quest prompts
- **Negative Directive**: Anti-patterns and behaviors to avoid

### Outputs Generated

**Primary Outputs:**
- **Compiled GM Context**: JSON object containing:
  - `promptBlock`: The full compiled prompt sent to Events and Quests
  - `worldPrompt`: Canonical world prompt
  - `ambience`: Structured ambience settings
  - `sourceSummary`: Metadata about enabled sources and lore counts
  - `worldSeedPrompt`: Original graphical world-generation prompt (for reference only)

**Saved Files (per world):**
- `generated/planets/{worldId}/gm_settings.json`: All Game Master configuration
- `generated/planets/{worldId}/lore_snippets.json`: Compiled lore data
- `generated/planets/{worldId}/metadata.json`: World metadata

**Integration Outputs:**
- **To Events**: Compiled context used for event generation, rethinking, and resolution
- **To Quests**: Canonical world prompt + compiled context used for quest seed generation and node progression
- **To Character Builder**: Ambience and tone settings inform character personality generation
- **To History**: Lore snippets are pulled dynamically from History and fed back into the GM context

### Step-by-Step Usage

#### Step 1: Select Your Active World

1. **Launch the Game Master** from the dev-tools dashboard
2. **Click "Pick World"** in the top-right corner
3. **Select a world** from the history picker (must have been generated via World Generator)
4. The Game Master will load the world's existing configuration or create a default one

#### Step 2: Write the Canonical World Prompt (DIRECTIVES Tab)

1. **Navigate to the DIRECTIVES tab** using the top navigation

2. **Review the current world prompt** (if any):
   - The left card shows the "Canonical World Prompt" section
   - If empty, you'll see a red warning banner at the top

3. **Write or generate the world prompt**:
   - **Manual Authoring**: Click into the textarea and write 2-3 paragraphs describing:
     - The world's narrative identity and core themes
     - Historical pressures and current state
     - Social tensions and power dynamics
     - Ecological or environmental challenges
     - Tone and atmosphere
   - **AI Generation**: Click "Generate from Canon" to auto-generate from existing lore
     - The system will compile all History lore, ecology, and world data
     - Wait 30-60 seconds for generation to complete
     - Review and edit the generated prompt as needed

4. **Important**: This prompt should be narrative and systemic, NOT visual
   - ❌ Bad: "A planet with orange skies and rocky terrain rendered in cinematic style"
   - ✅ Good: "A dying frontier world where fuel scarcity drives territorial wars and ancient ruins hint at lost civilizations"

5. **Auto-save**: Changes are saved automatically after 500ms of inactivity

#### Step 3: Configure the System Directive

1. **Scroll to the "System Directive" card** (right side of DIRECTIVES tab)

2. **Define AI GM behavior**:
   - How should the GM reason about player choices?
   - What level of consequence realism is expected?
   - Should escalation be gradual or dramatic?
   - Are there specific narrative patterns to follow or avoid?

3. **Example System Directive**:
   ```
   You are the Game Master for a grounded survival RPG. Prioritize:
   - Realistic consequences: player choices reshape faction relationships and resource availability
   - Gradual escalation: tension builds over time, but allow moments of respite
   - Moral ambiguity: NPCs have complex motivations, not clear good/evil alignments
   - Environmental pressure: scarcity and climate should constantly influence decisions
   ```

4. **Auto-save**: Changes are saved automatically

#### Step 4: Set Ambience and Tone (DIRECTIVES Tab)

1. **Scroll to the "Structured Ambience" card** (bottom of DIRECTIVES tab)

2. **Configure pressure levels** for each dimension:
   - **Atmosphere**: Environmental oppressiveness (Low = breathable, High = hostile)
   - **Pressure**: Urgency and stakes (Low = exploratory, High = survival-critical)
   - **Scarcity**: Resource availability (Low = abundant, High = desperate)
   - **Social Tension**: Interpersonal conflict (Low = cooperative, High = paranoid)
   - **Grounded Consequences**: Realism (Low = heroic fantasy, High = brutal realism)

3. **Select tone presets**:
   - Click on tone tags to toggle them (bleak, political, survival, mystic, decaying, frontier)
   - Multiple tones can be active simultaneously
   - Tones influence the narrative voice and event flavor

4. **Add ambience notes** (optional):
   - Use the textarea to add nuanced pressure descriptions
   - Example: "The world feels like a dying ember—hope exists, but it's fragile and contested"

5. **Review the compiled intent preview**:
   - The blue preview box shows how your settings will be summarized for the AI GM
   - Example: "Atmosphere high, pressure high, scarcity medium, social tension high, grounded consequences high. Tone accents: bleak, frontier."

#### Step 5: Review Context Sources (CONTEXT Tab)

1. **Navigate to the CONTEXT tab** using the top navigation

2. **Review the "Lore Coverage" card** (top-right):
   - Shows how many lore snippets are available vs. used
   - Main / Critical / Major / Minor categories
   - Example: "3 / 5" means 3 snippets are being used out of 5 available

3. **Review "Live Context Feeds"**:
   - Shows which data sources are currently enabled
   - Examples: Main Lore, Regions, Locations, Factions, Characters, Temporality

4. **Inspect individual context sections**:
   - Each card shows:
     - **Label**: Source name (e.g., "Main Lore", "Factions")
     - **Item Count**: Number of entries available
     - **Status**: Live (enabled) or Muted (disabled)
     - **Preview**: Sample of the actual data being fed to the AI GM

5. **Verify context quality**:
   - If a section shows "0" items, that data source is empty
   - Go to the relevant tool (History, Character Builder, etc.) to populate it
   - Example: If "Factions" shows 0, go to History → Factions tab to create factions

#### Step 6: Advanced Configuration (CONTEXT Tab, Optional)

1. **Click "Show Advanced"** at the top of the CONTEXT tab

2. **Gate context sources** (left card):
   - Toggle checkboxes to enable/disable specific data feeds
   - Useful for debugging or limiting context size
   - Example: Disable "Minor Lore" if you want a more focused context

3. **Adjust lore budget**:
   - Use the slider to set "Non-main lore budget" (1-16 snippets)
   - Controls how many critical/major/minor lore snippets are included
   - Higher = more context, but longer prompts

4. **Edit framework prefix** (optional):
   - Advanced: Prepended to all event/quest prompts
   - Only edit if you understand prompt engineering
   - Default is usually sufficient

5. **Edit negative directive** (optional):
   - Define anti-patterns and behaviors to avoid
   - Example: "Do not introduce deus ex machina solutions. Do not break established lore."

6. **Review raw prompt preview** (right card):
   - Shows the exact compiled prompt block sent to Events and Quests
   - Useful for debugging context issues
   - Read-only (edit via other sections)

#### Step 7: Verify Integrations (INTEGRATIONS Tab)

1. **Navigate to the INTEGRATIONS tab** using the top navigation

2. **Review connected tools**:
   - **History**: Lore, factions, characters, regions, locations, temporality flow from here
   - **Gameplay Events**: Consumes compiled GM context for event generation
   - **Quests**: Uses canonical world prompt + compiled context for quest generation
   - **Stored Files**: Shows where GM data is persisted on disk

3. **Quick navigation**:
   - Click "Open Lore Editor" to jump to History
   - Click "Open Events View" to jump to Gameplay Engine
   - Click "Open Quests" to jump to Quests

### Best Practices

1. **Write the World Prompt First**: This is the foundation. Don't skip it or leave it empty. Quests are blocked until this is defined.

2. **Be Narrative, Not Visual**: The world prompt should describe themes, pressures, and social dynamics—not colors, rendering, or camera angles.

3. **Start with Default Ambience**: Use Medium/High for most settings initially. Fine-tune after testing Events and Quests.

4. **Use Tone Presets Sparingly**: 2-3 tones are usually enough. Too many can dilute the narrative voice.

5. **Populate History First**: The Game Master is most powerful when it has rich lore to compile. Go to History and write main lore, factions, and locations before configuring the GM.

6. **Test with Events**: After configuring the GM, go to Gameplay Engine → Events and generate a test event to see how your settings influence output.

7. **Iterate on System Directive**: The system directive is subtle but powerful. If Events/Quests feel too heroic or too bleak, adjust the directive.

8. **Monitor Lore Coverage**: If "Used" counts are much lower than "Available" counts, your lore might not be tagged correctly in History.

9. **Use Advanced Sparingly**: The advanced controls are for debugging. Most users should stay in DIRECTIVES and CONTEXT tabs.

10. **Sync Across Tools**: Keep your Game Master settings aligned with your History lore and Ecology data for maximum coherence.

### Common Pitfalls

1. **Empty World Prompt**: Quests will not generate without a canonical world prompt. Always write or generate this first.

2. **Confusing World Prompt with Seed Prompt**: The "Visual World Seed Prompt" (shown in gray) is for graphics only. The "Canonical World Prompt" drives narrative.

3. **Over-Tuning Ambience**: Setting everything to "High" can make the game feel oppressively bleak. Balance is key.

4. **Ignoring Lore Coverage**: If your lore counts show 0/0, the GM has no context to work with. Populate History first.

5. **Disabling Critical Sources**: Turning off "Main Lore" or "Locations" can break Events and Quests. Only disable sources for debugging.

6. **Not Testing Output**: Always generate a test Event or Quest after changing GM settings to verify the impact.

7. **Editing Framework Prefix Without Understanding**: The event prompt prefix is advanced. Incorrect edits can break generation.

8. **Forgetting to Select a World**: The Game Master is world-scoped. If no world is selected, nothing will load.

9. **Mismatched Tone and Ambience**: If your world prompt describes a hopeful frontier but your ambience is set to "bleak + high pressure," the output will feel incoherent.

10. **Not Using AI Generation**: If you're stuck writing the world prompt, use "Generate from Canon" to get a starting point.

### Integration with Other Tools

- **World Generator**: Provides the world texture, provinces, and seed prompt (visual reference only)
- **History**: Primary source of lore, factions, characters, regions, locations, and temporality data
- **Ecology**: Provides flora, fauna, and biome data for environmental context
- **Gameplay Engine (Events)**: Consumes compiled GM context for event generation, rethinking, and resolution
- **Quests**: Uses canonical world prompt + compiled context for quest seed generation and node progression
- **Character Builder**: Ambience and tone settings inform character personality and dialogue generation
- **Gallery**: GM settings are saved per-world and can be synced to cloud storage
- **Job Center**: Tracks world prompt generation jobs

### Advanced: Understanding the Compiled Context

The Game Master compiles a `promptBlock` that looks like this:

```
[Canonical World Prompt]
{Your 2-3 paragraph world prompt}

[System Directive]
{Your AI GM behavior instructions}

[Ambience]
Atmosphere: high, Pressure: high, Scarcity: medium, Social Tension: high, Grounded Consequences: high
Tones: bleak, frontier
{Your ambience notes}

[Main Lore]
{All main lore entries from History}

[Critical Lore]
{Critical lore snippets}

[Major Lore]
{Major lore snippets}

[Minor Lore]
{Minor lore snippets, up to budget limit}

[Regions]
{Region data from World Generator geography}

[Locations]
{Location data from World Generator humanity layer}

[Factions]
{Faction data from History}

[Characters]
{Character data from Character Builder}

[Temporality]
{Timeline and temporal state from History}
```

This block is prepended to every Event and Quest generation request, ensuring consistency across all AI-generated content.

</details>


<details>
<summary><b>📜 History</b></summary>


### Purpose & Overview

The History tool is the advanced lore generation and canon-structuring system that creates, organizes, and maintains narrative coherence across your world's storytelling layers. It serves as the primary source of truth for all narrative content, feeding dynamic context into the Game Master, Events, Quests, and Character Builder. The History tool manages main lore, granular lore snippets, regions, locations, factions, characters, timeline progression, and temporality (custom calendar systems).

### Key Features

- **Main Lore Management**: Define the foundational world lore and ambience used by the AI GM
- **Lore Snippet System**: Create prioritized lore entries (critical, major, minor) with dates, locations, and involved entities
- **AI-Assisted Generation**: Batch-generate lore snippets, factions, characters, and locations using AI
- **Priority Tagging**: Organize lore by importance (main, critical, major, minor) for GM context budgeting
- **Temporal Dating**: Assign custom calendar dates to lore events for timeline coherence
- **Faction Management**: Create and manage political entities, guilds, organizations, and power structures
- **Location Management**: Define settlements, landmarks, and points of interest with province linkage
- **Character Registry**: Maintain a database of NPCs and key figures with faction affiliations
- **Region Management**: View and organize world geography hierarchy (kingdoms, duchies, provinces)
- **Timeline Visualization**: See chronological progression of events across eras
- **Temporality Configuration**: Define custom calendar systems with eras, months, and year structures
- **Auto-Save**: All changes are automatically persisted per-world with debounced saving
- **Cross-Tool Integration**: Lore data flows automatically into Game Master, Events, Quests, and Character Builder



### Interface Walkthrough

The History tool interface is organized into seven main tabs accessible via the top navigation:

1. **LORE**: Main lore and prioritized lore snippets
2. **REGIONS**: World geography hierarchy (kingdoms, duchies, provinces, counties)
3. **LOCATIONS**: Settlements, landmarks, and points of interest
4. **FACTIONS**: Political entities, guilds, organizations, and power structures
5. **CHARACTERS**: NPCs, key figures, and character registry
6. **TIMELINE**: Chronological visualization of events across eras
7. **TEMPORALITY**: Custom calendar system configuration

**Top Bar:**
- **Tab Selector**: Switch between Lore, Regions, Locations, Factions, Characters, Timeline, and Temporality
- **Tool Title**: "HISTORY GENERATOR" with icon

**Left Sidebar (Lore Tab):**
- List of all lore snippets with priority badges
- Quick actions: GM link, AI Generate, Add New
- Save status indicator

**Main Editor (Lore Tab):**
- Full-screen editor for selected lore snippet
- Metadata fields (title, priority, date, location, factions, characters)
- Content textarea with syntax highlighting



### Inputs Required

**Prerequisites:**
- An active world must be selected (generated via World Generator)
- Recommended: World Generator geography pipeline completed for region/location linkage
- Recommended: Temporality configured for accurate date tagging

**For Lore Tab:**
- **Main Lore Content**: Foundational world lore (2-5 paragraphs)
- **Lore Snippets**:
  - Title (optional for minor snippets)
  - Priority: Critical / Major / Minor
  - Target Date: Custom calendar date (year, era, month, day)
  - Location: Settlement or region name
  - Involved Factions: Comma-separated faction names
  - Involved Characters: Comma-separated character names
  - Content: Lore text (manual or AI-generated)

**For Factions Tab:**
- Faction Name
- Faction Type (guild, kingdom, organization, etc.)
- Description
- Goals and motivations
- Relationships with other factions

**For Locations Tab:**
- Location Name
- Location Type (city, town, village, outpost, landmark)
- Province/Region linkage
- Description
- Population (optional)
- Notable features

**For Characters Tab:**
- Character Name
- Role/Title
- Faction affiliation
- Description
- Personality traits
- Relationships

**For Temporality Tab:**
- Era Names (before/after pivotal event)
- Month Names (12 months)
- Days per Month
- Current Date (year, era, month, day)



### Outputs Generated

**Primary Outputs:**
- **Lore Snippets JSON**: Array of all lore entries with metadata
- **Factions JSON**: Array of faction definitions
- **Characters JSON**: Array of character profiles
- **Locations JSON**: Array of settlement and landmark data
- **Temporality Config JSON**: Custom calendar system definition

**Saved Files (per world):**
- `generated/planets/{worldId}/lore_snippets.json`: All lore data
- `generated/planets/{worldId}/factions.json`: Faction definitions
- `generated/planets/{worldId}/characters.json`: Character registry
- `generated/planets/{worldId}/locations.json`: Location database
- `generated/planets/{worldId}/temporality.json`: Calendar configuration

**Integration Outputs:**
- **To Game Master**: Lore snippets, factions, characters, locations, and temporality feed into compiled GM context
- **To Events**: Historical context informs event generation and consequences
- **To Quests**: Lore, factions, and characters drive quest narrative and objectives
- **To Character Builder**: Faction affiliations and character profiles inform NPC generation
- **To Ecology**: Location data provides spatial context for species distribution



### Step-by-Step Usage

#### Step 1: Write Main Lore (LORE Tab)

1. **Launch the History tool** from the dev-tools dashboard
2. **Ensure a world is selected** (the tool will show "Select a world first" if none is active)
3. **Navigate to the LORE tab** (should be default)
4. **Select "Main Lore"** from the left sidebar (should be pre-selected)
5. **Write foundational world lore** in the content textarea:
   - Describe the world's core identity and themes
   - Establish historical context and pivotal events
   - Define social structures and power dynamics
   - Set the tone and atmosphere
   - Keep it 2-5 paragraphs for optimal GM context
6. **Auto-save**: Changes are saved automatically after 450ms of inactivity
7. **Verify in Game Master**: Click the "GM" button to see how this lore feeds into the compiled context



#### Step 2: Create Lore Snippets (LORE Tab)

1. **Click "+ ADD"** in the left sidebar to create a new lore snippet
2. **Fill in metadata**:
   - **Title**: Optional descriptive title (e.g., "The Fuel Wars Begin")
   - **Priority**: Select Critical / Major / Minor based on importance
   - **Target Date**: Use the date selector to set when this event occurred
   - **Location**: Select a settlement or region from the dropdown
   - **Involved Factions**: Click faction tags to associate them with this event
   - **Involved Characters**: Click character tags to link characters
3. **Write content**:
   - **Manual**: Write the lore snippet directly in the textarea
   - **AI-Assisted**: Describe the event briefly and click "Generate with AI"
4. **Save**: Click "Save Snippet" to persist the entry
5. **Repeat**: Create multiple snippets to build a rich historical tapestry

**Priority Guidelines:**
- **Critical**: Major world-changing events (wars, cataclysms, regime changes)
- **Major**: Significant regional events (battles, treaties, discoveries)
- **Minor**: Local events and flavor lore (festivals, minor conflicts, rumors)



#### Step 3: AI Batch Generation (LORE Tab)

1. **Click "✨ GEN"** in the left sidebar to open the AI Generate Modal
2. **Configure generation parameters**:
   - **Entity Type**: Lore (pre-selected)
   - **Quantity**: Number of snippets to generate (1-10)
   - **Context**: The modal auto-fills world context, factions, locations, and characters
3. **Provide generation prompt**:
   - Example: "Generate 5 major historical events related to the Fuel Wars, involving the Nomads and the Fuel Guild"
4. **Click "Generate"** and wait for AI to create snippets
5. **Review generated snippets** in the preview
6. **Edit if needed** before confirming
7. **Click "Confirm"** to add all snippets to your lore database



#### Step 4: Manage Factions (FACTIONS Tab)

1. **Navigate to the FACTIONS tab** using the top navigation
2. **Click "+ Add Faction"** to create a new faction
3. **Fill in faction details**:
   - **Name**: Faction identifier (e.g., "The Fuel Guild")
   - **Type**: Guild, Kingdom, Organization, Cult, etc.
   - **Description**: Purpose, structure, and influence
   - **Goals**: What the faction wants to achieve
   - **Relationships**: Allies, enemies, neutral parties
4. **Save**: Changes auto-save after 450ms
5. **Link to lore**: Factions automatically appear in the Lore tab for tagging events

**Faction Best Practices:**
- Create 3-7 major factions for a balanced political landscape
- Define clear goals and motivations for each faction
- Establish relationships (ally, enemy, neutral, rival) between factions
- Use factions to drive conflict and narrative tension



#### Step 5: Define Locations (LOCATIONS Tab)

1. **Navigate to the LOCATIONS tab**
2. **Review auto-generated locations** (if World Generator humanity layer was run)
3. **Edit existing locations** or **add new ones**:
   - **Name**: Settlement or landmark name
   - **Type**: City, Town, Village, Outpost, Landmark, Ruins
   - **Province**: Link to a province from World Generator geography
   - **Description**: Physical features, culture, economy
   - **Population**: Approximate population size
   - **Notable Features**: Unique characteristics
4. **Save**: Auto-save after 450ms
5. **Use in lore**: Locations appear in the Lore tab location dropdown

**Location Tips:**
- Start with 5-10 key locations that will feature in quests
- Link locations to provinces for spatial coherence
- Describe what makes each location unique and memorable
- Consider resource availability, climate, and strategic importance



#### Step 6: Create Characters (CHARACTERS Tab)

1. **Navigate to the CHARACTERS tab**
2. **Click "+ Add Character"** to create a new NPC
3. **Fill in character details**:
   - **Name**: Character identifier
   - **Role/Title**: Position or occupation
   - **Faction**: Affiliation (links to Factions tab)
   - **Description**: Physical appearance, personality, background
   - **Traits**: Key personality characteristics
   - **Relationships**: Connections to other characters
4. **Save**: Auto-save after 450ms
5. **Link to lore**: Characters appear in the Lore tab for event tagging

**Character Best Practices:**
- Create 5-15 key NPCs that will drive quests and events
- Give each character clear motivations and conflicts
- Link characters to factions for political depth
- Use characters to personalize abstract faction conflicts



#### Step 7: Configure Temporality (TEMPORALITY Tab)

1. **Navigate to the TEMPORALITY tab**
2. **Define era names**:
   - **Before Era**: Name for the era before the pivotal event (e.g., "BC", "Before Collapse")
   - **After Era**: Name for the current era (e.g., "AC", "After Collapse")
3. **Configure month names**: Enter 12 month names for your calendar
4. **Set days per month**: Define how many days each month has
5. **Set current date**: Define the "now" of your world (year, era, month, day)
6. **Save**: Auto-save after 450ms
7. **Use in lore**: The date selector in the Lore tab now uses your custom calendar

**Temporality Tips:**
- Use a pivotal world event as the era divider (e.g., "The Collapse", "The Founding")
- Keep month names thematic and memorable
- Standard 30-day months work well for simplicity
- Set the current date to align with your intended story start



### Best Practices

1. **Start with Main Lore**: Write the foundational world lore before creating snippets. This gives the AI GM a strong baseline.

2. **Use Priority Wisely**: Don't make everything "critical". Reserve critical priority for truly world-changing events. Most lore should be major or minor.

3. **Date Everything**: Assign dates to lore snippets for timeline coherence. Undated snippets are harder to contextualize.

4. **Link Entities**: Always tag involved factions and characters in lore snippets. This creates a rich web of relationships.

5. **Create Factions First**: Define factions before writing detailed lore. This gives you clear actors to reference in events.

6. **Populate Locations Early**: Having a location database makes lore snippet creation much faster.

7. **Use AI Generation Strategically**: AI is great for bulk generation of minor lore, but hand-craft critical events for quality.

8. **Review GM Context**: Regularly check the Game Master → Context tab to see how your lore is being compiled.

9. **Maintain Consistency**: If you change a faction name or character name, update all related lore snippets.

10. **Iterate on Main Lore**: As your world evolves, refine the main lore to reflect new themes and directions.



### Common Pitfalls

1. **Empty Main Lore**: The Game Master needs main lore to function. Don't skip this step.

2. **Over-Prioritizing**: Making too many snippets "critical" dilutes their importance and bloats GM context.

3. **Undated Snippets**: Lore without dates is hard to place in the timeline and can cause temporal inconsistencies.

4. **Orphaned References**: Mentioning factions or characters in lore without creating them in their respective tabs breaks linkage.

5. **Inconsistent Naming**: Changing a faction name in the Factions tab doesn't auto-update lore snippets. Manual updates required.

6. **Ignoring Locations**: Not linking lore snippets to locations makes spatial context vague.

7. **Too Much Lore**: Creating hundreds of minor snippets can overwhelm the GM context budget. Focus on quality over quantity.

8. **Not Using Temporality**: Without a custom calendar, dates default to generic format. Configure temporality for immersion.

9. **Skipping Regions Tab**: The Regions tab shows your world geography. Review it to understand spatial relationships.

10. **Not Testing Integration**: Always generate a test Event or Quest after adding lore to verify it's being used correctly.



### Integration with Other Tools

- **World Generator**: Provides regions, provinces, and auto-generated locations (humanity layer)
- **Game Master**: Consumes all lore, factions, characters, locations, and temporality for compiled GM context
- **Gameplay Engine (Events)**: Uses historical context to inform event generation and consequences
- **Quests**: Lore, factions, and characters drive quest narrative, objectives, and NPC interactions
- **Character Builder**: Faction affiliations and character profiles inform NPC generation and dialogue
- **Ecology**: Location data provides spatial context for species distribution and biome definitions
- **Gallery**: Lore data is saved per-world and can be synced to cloud storage
- **Job Center**: Tracks AI generation jobs for lore, factions, characters, and locations

### Advanced: Lore Priority System

The History tool uses a priority system to manage GM context budget:

- **Main (1 entry)**: Always included in full. This is your world's canonical foundation.
- **Critical (unlimited)**: High-priority events that should always be in context. Use sparingly.
- **Major (unlimited)**: Important events that are included when budget allows.
- **Minor (unlimited)**: Flavor lore and local events. Included based on relevance and budget.

The Game Master's "Max Lore Snippets" setting (default: 8) controls how many non-main snippets are included in the compiled context. The system prioritizes critical > major > minor when selecting snippets.



</details>


<details>
<summary><b>🌿 Ecology</b></summary>

### Purpose & Overview

The Ecology tool is the world ecology design and generation system that creates and structures flora, fauna, biomes, and environmental baselines for your game world. It establishes the ecological logic, biological diversity, and natural reference framework that enriches exploration, resource management, and environmental storytelling. The Ecology tool manages species definitions, biome coverage, habitat relationships, and hierarchical environmental directives from world-level down to duchy-level granularity.

### Key Features

- **Flora Library**: Create and manage plant species with detailed profiles (size, resources, hazards, edibility)
- **Fauna Library**: Design creatures with combat stats, behavior, locomotion, and ecological roles
- **Biome Coverage**: Define planet-wide biome distribution synced with World Generator geography
- **Biome Archetypes**: Create reusable biome templates with climate, flora, and fauna presets
- **Environmental Baselines**: Set hierarchical ecology directives (world → kingdom → duchy)
- **AI Batch Generation**: Generate multiple flora or fauna entries with illustrations in one operation
- **Illustration Integration**: Auto-generate species illustrations via Asset Generator integration
- **Derived Stats System**: Automatically calculate gameplay stats (HP, AC, damage, resources) from ecological profiles
- **Habitat Relationships**: Link species to specific biomes for spatial coherence
- **Resource Profiles**: Define harvestable resources, yields, and regrowth rates for flora
- **Combat Profiles**: Configure creature stats for gameplay integration (HP, AC, attacks, temperament)
- **Status Workflow**: Draft → Approved workflow for quality control
- **Cross-Tool Integration**: Ecology data feeds into Gameplay Engine, Quests, and Events



### Interface Walkthrough

The Ecology tool interface is organized into four main tabs accessible via the top navigation:

1. **FLORA**: Plant species library with resource and hazard profiles
2. **FAUNA**: Creature library with combat stats and behavior profiles
3. **BIOMES**: Planet biome coverage and archetype registry
4. **BASELINES**: Hierarchical environmental directives (world, kingdom, duchy)

**Top Bar:**
- **Tab Selector**: Switch between Flora, Fauna, Biomes, and Baselines
- **Tool Title**: "ECOLOGY ARCHIVE" with icon
- **Job Status**: Real-time indicator for AI generation jobs

**Left Sidebar (Flora/Fauna Tabs):**
- Search bar for filtering entries
- List of all species with category badges
- Quick actions: Refresh Stats, Generate Batch, New Entry

**Main Editor (Flora/Fauna Tabs):**
- Full-screen editor for selected species
- Metadata fields (name, category, description, biomes)
- Profile sections (body, resources, hazards, combat)
- Illustration preview and generation controls
- Status workflow (Draft → Approved)

**Biomes Tab:**
- **Instances Sub-Tab**: Planet-wide biome coverage list
- **Archetypes Sub-Tab**: Reusable biome templates
- Sync controls for World Generator integration

**Baselines Tab:**
- Hierarchical cards (World → Kingdoms → Duchies)
- Environmental directive editors per scope
- Climate, flora, fauna, agriculture, and consistency rules



### Inputs Required

**Prerequisites:**
- An active world must be selected (generated via World Generator)
- Recommended: World Generator geography pipeline completed for biome syncing
- Recommended: Game Master configured for ecology context integration

**For Flora Entries:**
- **Name**: Species identifier (e.g., "Ashwood Tree", "Glowcap Fungus")
- **Category**: tree, shrub, grass, crop, fungus, aquatic, alien_other
- **Description**: Physical appearance, habitat, and ecological role
- **Edibility**: none, limited, common
- **Agriculture Value**: 0.0 - 1.0 (cultivation potential)
- **Biome Assignments**: Which biomes this species inhabits
- **Body Profile**: Size class, height, spread, root depth, biomass, lifespan, growth rate
- **Resource Profile**: Rarity, yield, regrowth, harvest difficulty, nutrition, medicinal, fuel, structural, concealment values
- **Hazard Profile**: Toxicity, irritation, thorniness, flammability, resilience

**For Fauna Entries:**
- **Name**: Species identifier (e.g., "Ashland Wolf", "Dust Beetle")
- **Category**: herbivore, predator, omnivore, scavenger, avian, aquatic, beast_of_burden, companion, alien_other
- **Description**: Physical appearance, behavior, and ecological role
- **Earth Analog**: Real-world animal reference (optional but recommended)
- **Biome Assignments**: Which biomes this species inhabits
- **Body Profile**: Size class, length, height, weight, lifespan
- **Combat Profile**: HP, AC, speed, attacks, damage, temperament, activity cycle
- **Behavior Profile**: Locomotion, natural weapons, armor class, pack size, territory size

**For Biomes:**
- **Name**: Biome identifier (e.g., "Ashland Desert", "Frozen Tundra")
- **Climate**: Temperature, precipitation, wind patterns
- **Dominant Flora**: Key plant species
- **Dominant Fauna**: Key creature species

**For Baselines:**
- **Scope**: World, Kingdom, or Duchy
- **Summary**: Overview of environmental characteristics
- **Climate Directives**: Temperature, precipitation, seasonal patterns
- **Flora Directives**: Dominant vegetation types and adaptations
- **Fauna Directives**: Dominant creature types and behaviors
- **Agriculture Directives**: Crop viability and farming practices
- **Consistency Rules**: Ecological constraints and relationships



### Outputs Generated

**Primary Outputs:**
- **Flora Entries JSON**: Array of all plant species with full profiles
- **Fauna Entries JSON**: Array of all creature species with full profiles
- **Biomes JSON**: Array of biome definitions with species assignments
- **Archetypes JSON**: Reusable biome templates
- **Baselines JSON**: Hierarchical environmental directives
- **Derived Stats**: Auto-calculated gameplay stats for all species

**Saved Files (per world):**
- `generated/planets/{worldId}/ecology_bundle.json`: Complete ecology data
- `generated/planets/{worldId}/ecology_illustrations/flora/`: Flora illustration images
- `generated/planets/{worldId}/ecology_illustrations/fauna/`: Fauna illustration images

**Integration Outputs:**
- **To Game Master**: Ecology baselines and species summaries feed into compiled GM context
- **To Gameplay Engine**: Flora and fauna stats drive exploration, combat, and resource mechanics
- **To Quests**: Species and biomes provide environmental context for quest objectives
- **To Events**: Ecology data informs environmental events and encounters
- **To Asset Generator**: Species descriptions generate illustration prompts



### Step-by-Step Usage

#### Step 1: Sync Biomes from World Generator (BIOMES Tab)

1. **Launch the Ecology tool** from the dev-tools dashboard
2. **Ensure a world is selected** with completed geography pipeline
3. **Navigate to the BIOMES tab**
4. **Select "Planet Biome Coverage" sub-tab** (should be default)
5. **Click "Sync From World Map"** to import biomes from World Generator
6. **Confirm the sync operation** (this rebuilds biome coverage from worldgen outputs)
7. **Review imported biomes** in the list (e.g., "Desert", "Tundra", "Forest", "Ocean")
8. **Edit biome details** if needed (name, climate description)

**Why Sync First:** Biomes provide the spatial framework for species distribution. Syncing ensures your ecology aligns with the actual world geography.



#### Step 2: Create Flora Entries (FLORA Tab)

**Manual Creation:**
1. **Navigate to the FLORA tab**
2. **Click "NEW FLORA"** to create a blank entry
3. **Fill in basic info**:
   - **Name**: Descriptive species name
   - **Category**: Select from tree, shrub, grass, crop, fungus, aquatic, alien_other
   - **Description**: Physical appearance, habitat, and ecological role
   - **Edibility**: none, limited, common
   - **Agriculture Value**: 0.0 - 1.0 slider
4. **Assign biomes**: Check boxes for biomes where this species grows
5. **Configure body profile**:
   - Size class, height, spread, root depth, biomass, lifespan, growth rate
6. **Configure resource profile**:
   - Rarity, yield, regrowth, harvest difficulty, nutrition, medicinal, fuel, structural, concealment
7. **Configure hazard profile**:
   - Toxicity, irritation, thorniness, flammability, resilience
8. **Click "Refresh Stats"** to auto-calculate derived gameplay stats
9. **Generate illustration** (optional): Click "Generate Illustration" for AI-generated species art
10. **Approve**: Click "Approve Entry" to mark as production-ready

**AI Batch Generation:**
1. **Click "GENERATE BATCH"** in the Flora tab
2. **Configure generation**:
   - **Quantity**: Number of species to generate (1-20)
   - **Biome Filter**: Target specific biomes or "all"
   - **Category Filter**: Target specific categories or "mixed"
   - **Include Illustrations**: Check to auto-generate images
   - **Style Prompt**: Art style for illustrations (e.g., "botanical illustration, detailed, scientific")
3. **Click "Generate"** and wait for AI to create entries
4. **Review generated species** and edit as needed
5. **Approve entries** individually or in batch



#### Step 3: Create Fauna Entries (FAUNA Tab)

**Manual Creation:**
1. **Navigate to the FAUNA tab**
2. **Click "NEW FAUNA"** to create a blank entry
3. **Fill in basic info**:
   - **Name**: Descriptive species name
   - **Category**: herbivore, predator, omnivore, scavenger, avian, aquatic, beast_of_burden, companion, alien_other
   - **Description**: Physical appearance, behavior, and ecological role
   - **Earth Analog**: Real-world reference (e.g., "wolf", "bear", "eagle")
4. **Assign biomes**: Check boxes for biomes where this species lives
5. **Configure body profile**:
   - Size class, length, height, weight, lifespan
6. **Configure combat profile**:
   - HP, AC, speed, attacks per round, damage dice, temperament, activity cycle
7. **Configure behavior profile**:
   - Locomotion, natural weapons, armor class, pack size, territory size
8. **Click "Refresh Stats"** to auto-calculate derived gameplay stats
9. **Generate illustration** (optional): Click "Generate Illustration"
10. **Approve**: Click "Approve Entry"

**AI Batch Generation:**
1. **Click "GENERATE BATCH"** in the Fauna tab
2. **Configure generation** (same as Flora)
3. **Click "Generate"** and wait
4. **Review and approve**



#### Step 4: Define Environmental Baselines (BASELINES Tab)

1. **Navigate to the BASELINES tab**
2. **Start with World baseline**:
   - **Summary**: High-level overview of planetary ecology
   - **Climate Directives**: Global temperature, precipitation, seasonal patterns
   - **Flora Directives**: Dominant vegetation types across the planet
   - **Fauna Directives**: Dominant creature types and behaviors
   - **Agriculture Directives**: General crop viability and farming practices
   - **Consistency Rules**: Ecological constraints (e.g., "No trees in extreme deserts")
3. **Define Kingdom baselines** (optional):
   - Select a kingdom card
   - Fill in directives specific to that kingdom
   - Directives inherit from world baseline but can override
4. **Define Duchy baselines** (optional):
   - Select a duchy card
   - Fill in directives specific to that duchy
   - Directives inherit from kingdom → world
5. **Auto-save**: Changes are saved automatically

**Baseline Best Practices:**
- Start broad (world) and get specific (duchy) only where needed
- Use baselines to establish ecological rules that AI generation must follow
- Reference specific flora/fauna species in directives for consistency



### Best Practices

1. **Sync Biomes First**: Always sync biomes from World Generator before creating species. This ensures spatial coherence.

2. **Use Earth Analogs**: For fauna, always provide an earth analog. This helps AI generation and makes species easier to understand.

3. **Start with Key Species**: Create 5-10 iconic species per biome before bulk generating. These anchor your ecology.

4. **Balance Categories**: Don't create only predators or only trees. Aim for ecological diversity (herbivores, predators, plants, fungi).

5. **Assign Multiple Biomes**: Most species should inhabit 2-3 biomes for realistic distribution. Avoid single-biome species unless they're highly specialized.

6. **Use Derived Stats**: Always click "Refresh Stats" after editing profiles. This ensures gameplay stats are up-to-date.

7. **Approve Strategically**: Only approve species that are production-ready. Draft status allows iteration without polluting the canon.

8. **Generate Illustrations in Batches**: Generating illustrations for 10 species at once is faster than one-by-one.

9. **Define Baselines Early**: Write world-level baselines before bulk generating species. This guides AI generation.

10. **Test in Gameplay Engine**: After creating ecology, test species in the Gameplay Engine → Exploration tab to verify stats work correctly.



### Common Pitfalls

1. **Not Syncing Biomes**: Creating species without syncing biomes first leads to orphaned species with no habitat.

2. **Over-Specialization**: Creating species that only live in one biome makes the world feel sparse. Most species should have 2-3 biomes.

3. **Ignoring Derived Stats**: Manually editing HP/AC without refreshing stats causes inconsistencies. Always use "Refresh Stats".

4. **Skipping Earth Analogs**: Fauna without earth analogs are harder for AI to generate and for players to understand.

5. **Unbalanced Ecology**: Creating 50 predators and 5 herbivores breaks ecological logic. Aim for realistic food chain ratios.

6. **Not Using Baselines**: Skipping baselines means AI generation has no constraints, leading to incoherent species.

7. **Approving Too Early**: Approving draft species locks them into the canon. Iterate in draft status first.

8. **Forgetting Illustrations**: Species without illustrations feel incomplete in the game. Use batch generation to create visuals.

9. **Inconsistent Naming**: Using random naming conventions makes species hard to remember. Use thematic naming (e.g., "Ash-" prefix for desert species).

10. **Not Testing Integration**: Always test ecology in Gameplay Engine and Quests to verify species work as intended.



### Integration with Other Tools

- **World Generator**: Provides biome coverage data synced via "Sync From World Map"
- **Game Master**: Ecology baselines and species summaries feed into compiled GM context
- **Gameplay Engine**: Flora and fauna stats drive exploration encounters, combat, and resource harvesting
- **Quests**: Species and biomes provide environmental context for quest objectives and challenges
- **Events**: Ecology data informs environmental events (migrations, plagues, resource scarcity)
- **Asset Generator**: Species descriptions auto-generate illustration prompts for batch image generation
- **Character Builder**: Fauna profiles inform companion animals and mounts
- **Gallery**: Ecology illustrations are stored and can be synced to cloud storage

### Advanced: Derived Stats System

The Ecology tool uses a derived stats system that auto-calculates gameplay values from ecological profiles:

**Flora Derived Stats:**
- **Harvest DC**: Based on harvest difficulty + rarity
- **Yield Amount**: Based on yield per harvest + size class
- **Regrowth Time**: Based on regrowth days + growth rate
- **Resource Types**: Based on nutrition, medicinal, fuel, structural values

**Fauna Derived Stats:**
- **HP**: Based on size class + weight + resilience
- **AC**: Based on armor class + size class
- **Attack Bonus**: Based on natural weapons + temperament
- **Damage Dice**: Based on size class + natural weapons
- **Speed**: Based on locomotion + size class

Click "Refresh Stats" after editing profiles to recalculate all derived values.



</details>


<details>
<summary><b>⚙️ Gameplay Engine</b></summary>

### Purpose & Overview

The Gameplay Engine is the central gameplay design and balancing tool that defines the core rules of the game, structures exploration, events, combat, character systems, and skills, and configures the numerical logic that drives progression, movement, statistics, status effects, and overall gameplay behavior. It serves as the mechanical foundation that transforms narrative content from other tools into playable systems with consistent rules and balanced interactions.

### Key Features

- **Game Rules Configuration**: Define core mechanics (movement, actions, rest, death, leveling, XP)
- **Character System**: Create traits, occupations, and character archetypes with stat modifiers
- **Skills Builder**: Design custom skills with effects, cooldowns, and resource costs
- **Items System**: Define equipment, consumables, and gear with stat bonuses
- **Exploration Mechanics**: Configure location-based exploration with grid movement and encounters
- **Events System**: AI-driven event generation with branching choices and consequences
- **Combat Simulator**: Turn-based tactical combat with initiative, actions, and status effects
- **Validation Panel**: Real-time rule consistency checking and balance warnings
- **Registry System**: Centralized database for all gameplay entities (traits, occupations, items, skills)
- **Live Testing**: Test mechanics in real-time without leaving the tool
- **Cross-Tool Integration**: Gameplay rules feed into Quests, Events, and Character Builder



### Interface Walkthrough

The Gameplay Engine interface is organized into six main sections accessible via the top navigation:

1. **RULES**: Core game mechanics and numerical configuration
2. **EXPLORATION**: Location-based exploration with grid movement and encounters
3. **EVENTS**: AI-driven event generation with branching narratives
4. **COMBAT**: Turn-based tactical combat simulator
5. **CHARACTER**: Traits, occupations, characters, and items management
6. **SKILLS**: Custom skill builder with effects and resource costs

**Top Bar:**
- **Section Selector**: Switch between Rules, Exploration, Events, Combat, Character, and Skills
- **Tool Title**: "GAMEPLAY ENGINE"
- **Exploration Sub-Tabs**: Location Exploration / World Exploration (when in Exploration section)

**Left Sidebar (Character Section):**
- **Character Rule Panel**: List of traits, occupations, characters, and items
- **Validation Panel**: Real-time rule consistency warnings
- **Quick Actions**: Create new entities, delete, edit

**Main Editor (Character Section):**
- Full-screen editor for selected entity
- Metadata fields (name, description, effects)
- Stat modifiers and bonuses
- Preview and testing controls

**Exploration View:**
- **Location Tab**: Grid-based exploration with movement and encounters
- **World Tab**: World-level exploration with location selection

**Events View:**
- Event generation interface with AI prompts
- Branching choice trees
- Consequence tracking
- Combat redirect integration

**Combat Simulator:**
- Turn-based combat interface
- Initiative tracker
- Action selection (attack, skill, item, move)
- HP/status tracking
- Combat log



### Inputs Required

**Prerequisites:**
- Recommended: World Generator completed for exploration location data
- Recommended: Ecology completed for creature stats in combat
- Recommended: Game Master configured for event generation context

**For Game Rules (RULES Section):**
- **Movement**: Base speed, sprint multiplier, difficult terrain penalties
- **Actions**: Actions per turn, bonus actions, reactions
- **Leveling**: XP thresholds, level cap, stat increases per level
- **Combat**: Initiative rules, attack rolls, damage calculations

**For Traits (CHARACTER Section):**
- **Name**: Trait identifier (e.g., "Resilient", "Quick Reflexes")
- **Description**: What the trait represents
- **Stat Modifiers**: HP, AC, Speed, Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma
- **Special Effects**: Custom mechanical effects (optional)

**For Occupations (CHARACTER Section):**
- **Name**: Occupation identifier (e.g., "Soldier", "Scout", "Medic")
- **Description**: Role and background
- **Starting Traits**: Traits granted by this occupation
- **Stat Modifiers**: Base stat adjustments
- **Starting Equipment**: Items granted at character creation

**For Skills (SKILLS Section):**
- **Name**: Skill identifier (e.g., "Power Strike", "Heal", "Sprint")
- **Description**: What the skill does
- **Resource Cost**: HP, Stamina, Mana, or custom resource
- **Cooldown**: Turns before skill can be used again
- **Effects**: Damage, healing, buffs, debuffs, movement
- **Target**: Self, ally, enemy, area

**For Items (CHARACTER Section):**
- **Name**: Item identifier (e.g., "Iron Sword", "Health Potion")
- **Type**: Weapon, Armor, Consumable, Tool
- **Description**: Physical appearance and function
- **Stat Bonuses**: HP, AC, damage, etc.
- **Special Effects**: Custom mechanical effects



### Outputs Generated

**Primary Outputs:**
- **Game Registry JSON**: Centralized database of all gameplay entities
- **Traits JSON**: Array of all trait definitions
- **Occupations JSON**: Array of all occupation definitions
- **Skills JSON**: Array of all skill definitions
- **Items JSON**: Array of all item definitions
- **Game Rules JSON**: Core mechanics configuration

**Saved Files:**
- `apps/dev-tools/backend/src/game_registry.json`: Complete gameplay registry
- Individual JSON files per entity type in the registry

**Integration Outputs:**
- **To Quests**: Gameplay rules inform quest difficulty and rewards
- **To Events**: Traits, occupations, and skills drive event choices and consequences
- **To Combat**: All combat stats and mechanics are defined here
- **To Character Builder**: Traits, occupations, and items are available for character creation
- **To Exploration**: Movement rules and encounter mechanics are configured here



### Step-by-Step Usage

#### Step 1: Configure Core Rules (RULES Section)

1. **Navigate to the RULES section** using the top navigation
2. **Review the rule categories** in the left sidebar:
   - **All Rules**: View all categories at once
   - **Core Stats**: HP, AP, MP, Crit, Resist, Armor scaling
   - **Combat Math**: Damage formulas, attack rolls, weapon scaling
   - **Grid & Move**: Movement costs, disengage mechanics, terrain
   - **Regions**: Regional modifiers and environmental effects
   - **Area of Effect**: AoE damage calculations and targeting
   - **Status Effects**: Buffs, debuffs, and condition mechanics
   - **Modifiers**: Stat modifiers and bonus calculations
   - **XP & Leveling**: Experience thresholds and level progression
3. **Configure Core Stats** (most important):
   - **HP Base**: Starting HP (default: ~20)
   - **HP per Endurance**: HP gained per Endurance point (default: ~5)
   - **AP Base**: Starting Action Points (default: ~3)
   - **Agility Divisor**: AP += floor(AGI / divisor) (default: ~5)
   - **MP Base**: Starting Movement Points (default: ~5)
   - **Crit per INT**: Crit chance per Intelligence point (default: ~0.5%)
   - **Resist per WIS**: Status resistance per Wisdom point (default: ~1%)
   - **Armor Scaling**: Logarithmic scaling factors for AGI and ENDU
4. **Configure Combat Math**:
   - **Damage Variance**: Min/Max damage multipliers
   - **Strength Scaling**: Melee damage scaling factors
   - **Weapon Base Damage**: Default weapon damage values
   - **Defense Reduction**: How armor reduces incoming damage
5. **Configure Grid & Move**:
   - **Base Disengage Cost**: AP cost to move away from enemies
   - **Threat Scaling**: Additional cost per adjacent enemy
   - **Agility Mitigation**: How AGI reduces disengage cost
6. **Configure XP & Leveling**:
   - **XP Thresholds**: XP required per level
   - **Level Cap**: Maximum character level
   - **Stat Increases**: Stat points gained per level
7. **Click "Apply Rules"** to save changes
8. **Use "Reset Defaults"** if you want to revert to baseline values

**Rule Configuration Tips:**
- Start with defaults and adjust based on playtesting
- Use the live preview tables to see how stat values translate to gameplay
- The validation panel will warn you about extreme values



#### Step 2: Create Traits (CHARACTER Section)

1. **Navigate to the CHARACTER section**
2. **Select "Traits" tab** in the left sidebar
3. **Click "New Trait"** to create a blank trait
4. **Fill in trait details**:
   - **Name**: Descriptive trait name
   - **Description**: What the trait represents mechanically and narratively
5. **Configure stat modifiers**:
   - HP bonus/penalty
   - AC bonus/penalty
   - Speed bonus/penalty
   - Attribute modifiers (Strength, Dexterity, etc.)
6. **Add special effects** (optional):
   - Custom mechanical effects (e.g., "Advantage on stealth checks")
7. **Save**: Click "Save Trait"
8. **Test**: Use the validation panel to check for balance issues

**Example Traits:**
- **Resilient**: +10 HP, +1 Constitution
- **Quick Reflexes**: +2 AC, +1 Dexterity, +5 Speed
- **Strong**: +2 Strength, +2 melee damage
- **Intelligent**: +2 Intelligence, +1 skill point per level



#### Step 3: Create Occupations (CHARACTER Section)

1. **Select "Occupations" tab** in the left sidebar
2. **Click "New Occupation"**
3. **Fill in occupation details**:
   - **Name**: Occupation identifier (e.g., "Soldier", "Scout")
   - **Description**: Role, background, and typical responsibilities
4. **Assign starting traits**:
   - Select 1-3 traits that define this occupation
   - Example: Soldier gets "Resilient" and "Strong"
5. **Configure stat modifiers**:
   - Base stat adjustments for this occupation
6. **Define starting equipment**:
   - Select items granted at character creation
   - Example: Soldier starts with "Iron Sword" and "Leather Armor"
7. **Save**: Click "Save Occupation"

**Example Occupations:**
- **Soldier**: Resilient, Strong, starts with sword and armor
- **Scout**: Quick Reflexes, Perceptive, starts with bow and light armor
- **Medic**: Intelligent, Empathetic, starts with medical kit
- **Engineer**: Intelligent, Resourceful, starts with tools and explosives



#### Step 4: Design Skills (SKILLS Section)

1. **Navigate to the SKILLS section**
2. **Click "New Skill"**
3. **Fill in skill details**:
   - **Name**: Skill identifier (e.g., "Power Strike", "Heal")
   - **Description**: What the skill does mechanically
4. **Configure resource cost**:
   - HP cost (self-damage skills)
   - Stamina cost (physical skills)
   - Mana cost (magical skills)
   - Custom resource cost
5. **Set cooldown**:
   - Number of turns before skill can be used again
   - 0 = usable every turn
6. **Define effects**:
   - **Damage**: Dice formula (e.g., "2d6+4")
   - **Healing**: Dice formula (e.g., "1d8+2")
   - **Buffs**: Stat increases (e.g., "+2 AC for 3 turns")
   - **Debuffs**: Stat decreases (e.g., "-2 Speed for 2 turns")
   - **Movement**: Teleport, dash, etc.
7. **Set target type**:
   - Self, Single Ally, Single Enemy, All Allies, All Enemies, Area
8. **Save**: Click "Save Skill"

**Example Skills:**
- **Power Strike**: 10 Stamina, 2 turn cooldown, 2d6+4 damage to single enemy
- **Heal**: 15 Mana, 3 turn cooldown, 1d8+2 healing to single ally
- **Sprint**: 5 Stamina, 1 turn cooldown, +10 Speed for 1 turn (self)
- **Shove**: 5 Stamina, 0 cooldown, push enemy 2 tiles



#### Step 5: Test Combat (COMBAT Section)

1. **Navigate to the COMBAT section**
2. **Click "Setup Combat"**
3. **Select player characters**:
   - Choose from created characters or use test characters
4. **Select enemies**:
   - Choose from Ecology fauna or create test enemies
5. **Click "Start Combat"**
6. **Play through combat**:
   - Initiative is rolled automatically
   - Select actions: Attack, Skill, Item, Move, End Turn
   - Observe damage calculations and status effects
   - Test skill cooldowns and resource costs
7. **Review combat log** for balance issues
8. **Iterate**: Adjust skills, traits, or rules based on testing

**Combat Testing Tips:**
- Test with 2-3 players vs 2-4 enemies for typical encounters
- Verify skills work as intended
- Check if combat length feels right (3-5 rounds is ideal)
- Ensure no single skill is overpowered



#### Step 6: Test Events (EVENTS Section)

1. **Navigate to the EVENTS section**
2. **Ensure Game Master is configured** (events use GM context)
3. **Click "Generate Event"**
4. **Review generated event**:
   - Event description
   - Available choices
   - Predicted consequences
5. **Select a choice** and observe outcome
6. **Test combat redirect**:
   - Some event choices trigger combat
   - Verify combat initializes correctly with event-specified enemies
7. **Iterate**: Adjust Game Master settings if events feel off-tone

**Event Testing Tips:**
- Generate 5-10 events to see variety
- Check if choices feel meaningful
- Verify consequences align with Game Master ambience settings
- Test combat redirects work smoothly



### Best Practices

1. **Start with Rules**: Configure core mechanics before creating traits, skills, or occupations. This establishes the foundation.

2. **Balance Traits**: Traits should provide meaningful but not overpowered bonuses. +10 HP is good, +100 HP is broken.

3. **Design Occupations Around Roles**: Each occupation should have a clear gameplay identity (tank, damage, support, utility).

4. **Test Skills in Combat**: Always test new skills in the combat simulator before using them in quests.

5. **Use Cooldowns Wisely**: Powerful skills should have 2-3 turn cooldowns. Weak skills can be spammable (0 cooldown).

6. **Resource Costs Matter**: Skills with high resource costs should be proportionally powerful.

7. **Validate Regularly**: Check the validation panel after creating new entities. It catches balance issues early.

8. **Iterate Based on Testing**: Combat and event testing reveals balance problems. Adjust and retest.

9. **Keep It Simple**: Don't create 50 traits and 100 skills. Start with 10-15 of each and expand as needed.

10. **Document Special Effects**: If a trait or skill has custom mechanics, document them clearly in the description.



### Common Pitfalls

1. **Skipping Rules Configuration**: Creating traits and skills without defining core rules leads to inconsistent mechanics.

2. **Overpowered Traits**: Giving traits too many bonuses makes characters unbalanced. Limit to 2-3 meaningful bonuses per trait.

3. **Underpowered Skills**: Skills with high costs and low effects feel bad to use. Balance cost vs. power.

4. **No Cooldowns on Strong Skills**: Spammable powerful skills break combat. Use cooldowns to gate power.

5. **Ignoring Validation Warnings**: The validation panel catches real issues. Don't ignore red flags.

6. **Not Testing Combat**: Assuming skills work without testing leads to broken encounters. Always test.

7. **Too Many Occupations**: Creating 20 occupations dilutes identity. Start with 5-7 core roles.

8. **Inconsistent Naming**: Using random naming conventions makes the registry hard to navigate. Use clear, thematic names.

9. **Forgetting Integration**: Gameplay rules affect Quests, Events, and Character Builder. Test cross-tool integration.

10. **Over-Complexity**: Adding too many custom mechanics makes the game hard to balance. Keep it simple and elegant.



### Integration with Other Tools

- **World Generator**: Provides exploration locations and spatial data for location-based exploration
- **Game Master**: Supplies compiled context for AI-driven event generation
- **Ecology**: Fauna stats feed into combat encounters and exploration
- **Quests**: Gameplay rules inform quest difficulty, rewards, and combat encounters
- **Character Builder**: Traits, occupations, items, and skills are available for character creation
- **Events**: Traits and skills drive event choices and consequences
- **Gallery**: Gameplay registry can be exported and synced

### Advanced: Game Registry System

The Gameplay Engine uses a centralized registry system (`GameRegistry`) that stores all gameplay entities:

```typescript
GameRegistry.getAllTraits()        // Returns all traits
GameRegistry.getAllOccupations()   // Returns all occupations
GameRegistry.getAllSkills()        // Returns all skills
GameRegistry.getAllItems()         // Returns all items
GameRegistry.getTrait(id)          // Get specific trait by ID
```

The registry is persisted to `game_registry.json` and loaded by other tools for consistent gameplay mechanics across the entire dev-tools ecosystem.



</details>


<details>
<summary><b>👤 Character Builder</b></summary>

### Purpose & Overview

The Character Builder is the comprehensive character creation and configuration tool used to design playable characters, NPCs, monsters, and archetypes with full control over identity, appearance, lore, traits, attributes, occupation, skills, equipment, inventory, and relationships. It serves as the central character registry for the entire Ashtrail ecosystem, providing character-sheet data required by the game systems, quests, events, and combat encounters. The Character Builder supports AI-assisted generation, portrait synthesis, appearance customization, talent tree progression, multi-occupation systems, and dynamic stat calculation.

### Key Features

- **Character Registry**: Centralized database for all characters (players, NPCs, monsters, archetypes) with world-scoped organization
- **Character Types**: Support for Human, Mutant, Monster, Animal, and Construct base types with custom type definitions
- **Identity Management**: Name, age, gender, faction, alignment, title, badge, and family relationships
- **Appearance System**: Visual customization with selectors (hair, eyes, skin, build, facial hair) and AI-generated appearance prompts
- **Portrait Generation**: AI-powered portrait synthesis from appearance descriptions with variant generation
- **Lore & Backstory**: Backstory drafting, AI-generated character history, and alignment inference from narrative
- **Trait System**: Trait selection with point budgets and stat modifiers from Gameplay Engine registry
- **Stat Allocation**: Base stats, attribute upgrades, level-up progression, and equipment modifiers
- **Multi-Occupation System**: Primary and secondary occupations with independent progression and talent trees
- **Talent Trees**: Visual talent tree editor with node unlocking, point spending, and prerequisite validation
- **Pioneer System**: Post-max-level progression with pioneer levels and additional stat/talent points
- **Skills Management**: Skill selection, loadout configuration, and dynamic skill updates based on equipment
- **Equipment System**: Slot-based equipment (head, chest, gloves, waist, legs, boots, main hand, off hand) with stat bonuses
- **Inventory Management**: Multi-bag inventory with item stacking, rarity filtering, and context menus
- **Credits System**: Multi-currency wallet (fuel, food, scrap, tech, medical) with transaction tracking
- **Relationship System**: Character-to-character relationships with mirroring logic and relationship types
- **Exploration Sprites**: Directional sprite binding for world exploration with Asset Generator integration
- **AI Batch Generation**: Generate multiple characters at once with configurable parameters (level range, faction, location, sex)
- **Character Sheet**: Comprehensive character sheet with derived stats (HP, AP, Armor, Crit, Resist, Damage)
- **XP & Leveling**: Experience tracking, level progression, and automatic stat/talent point allocation
- **World Settings**: Custom base type definitions with tab restrictions and innate stat bonuses
- **Cross-Tool Integration**: Characters feed into Quests, Events, Combat, and History

### Interface Walkthrough

The Character Builder interface is organized into a multi-tab workflow accessible via the top navigation bar:

**Main Tabs:**
1. **IDENTITY**: Name, age, gender, type, faction, alignment, title, badge, family
2. **APPEARANCE**: Visual customization with selectors and AI-generated appearance prompts
3. **LORE**: Backstory, history, relationships, and AI-generated character story
4. **TRAITS**: Trait selection with point budget and stat preview
5. **STATS**: Base stat allocation, attribute upgrades, and stat redistribution
6. **OCCUPATION**: Occupation selection, talent tree progression, and multi-occupation management
7. **SKILLS**: Skill selection, loadout configuration, and skill library browsing
8. **EQUIPMENT**: Slot-based equipment management with stat bonuses and visual preview
9. **CHARACTER SHEET**: Comprehensive character sheet with derived stats and combat preview
10. **INVENTORY**: Multi-bag inventory management with item stacking and context menus
11. **SAVE**: Save character to registry and export options


**Top Bar:**
- **Tool Title**: "CHARACTER BUILDER" with icon
- **World Picker**: Select active world for character scoping
- **Character Gallery**: Browse saved characters with type and world filters
- **AI Generator**: Batch generate characters with AI

**Left Sidebar:**
- **Character List**: All saved characters with search, type filter, and world filter
- **Quick Actions**: New Character, AI Generate, Delete, Duplicate
- **Character Preview**: Mini card with portrait, name, level, occupation

**Main Editor:**
- **Tab Content**: Context-sensitive editor for selected tab
- **Save Status**: Real-time indicator (Saving, Saved, Save error)
- **Navigation**: Tab bar with visual indicators for completed sections

### Inputs Required

**Prerequisites:**
- An active world must be selected (generated via World Generator)
- Recommended: Gameplay Engine configured for traits, occupations, skills, and items
- Recommended: History configured for factions and locations
- Recommended: Game Master configured for AI-generated lore context

**For Identity Tab:**
- **Name**: Character identifier
- **Age**: Numeric age (1-200)
- **Gender**: Male / Female / Other
- **Character Type**: Human, Mutant, Monster, Animal, Construct (or custom types)
- **Is NPC**: Toggle for NPC vs. Player Character
- **Faction**: Faction affiliation (from History)
- **Alignment**: Lawful Good, Neutral Good, Chaotic Good, Lawful Neutral, True Neutral, Chaotic Neutral, Lawful Evil, Neutral Evil, Chaotic Evil
- **Title**: Character title (e.g., "Wasteland Survivor", "Ash-Born")
- **Badge**: Character badge emoji (e.g., "👤", "💀", "⚔️")
- **Relationship**: Tab used to define relationships between existing or future characters.

**For Appearance Tab:**
- **Appearance Selectors**:
  - Hair Style: Short, Long, Bald, Braided, Mohawk, Dreadlocks, Ponytail, Buzz Cut
  - Hair Color: Black, Brown, Blonde, Red, Gray, White, Blue, Green, Purple
  - Eye Color: Brown, Blue, Green, Gray, Hazel, Amber, Red, Black
  - Skin Tone: Fair, Light, Medium, Tan, Dark, Ebony, Pale, Olive
  - Build: Slim, Athletic, Muscular, Stocky, Heavy, Wiry, Frail
  - Facial Hair: None, Stubble, Goatee, Full Beard, Mustache, Sideburns (Male only)
- **Appearance Prompt**: AI-generated or manual narrative description of appearance
- **Portrait**: AI-generated portrait image from appearance description

**For Lore Tab:**
- **Backstory**: Draft backstory text (manual or AI-assisted)
- **History**: Full character history (AI-generated from backstory, relationships, and world lore)
- **Relationships**: Character-to-character relationships with type (Friend, Enemy, Rival, Family, Lover, Mentor, Student, Ally, Neutral)

**For Traits Tab:**
- **Trait Selection**: Select traits from Gameplay Engine registry
- **Trait Points**: Budget for trait selection (default: 15 points)
- **Trait Search**: Filter traits by name or description

**For Stats Tab:**
- **Base Stats**: Strength, Agility, Intelligence, Wisdom, Endurance, Charisma (default: 3 each)
- **Stat Points**: Budget for base stat allocation (default: 18 points)
- **Attribute Upgrades**: Level-up stat increases (earned through progression)
- **Stat Redistribution**: Reset and reallocate stats (optional)

**For Occupation Tab:**
- **Occupation Selection**: Select primary occupation from Gameplay Engine registry
- **Occupation Category Filter**: Filter by category (Combat, Support, Utility, Crafting, Social, etc.)
- **Talent Tree**: Visual talent tree with node unlocking and point spending
- **Multi-Occupation**: Add secondary occupations with independent progression
- **Pioneer Points**: Post-max-level progression points for unlocking additional occupations

**For Skills Tab:**
- **Skill Selection**: Select skills from Gameplay Engine registry
- **Skill Category Filter**: Base, Occupation, Combat, Utility, Social, Crafting
- **Skill Search**: Filter skills by name or description
- **Skill Loadout**: Configure active skill bar for combat

**For Equipment Tab:**
- **Equipment Slots**: Head, Chest, Gloves, Waist, Legs, Boots, Main Hand, Off Hand
- **Item Library**: Browse items from Gameplay Engine registry
- **Equip/Unequip**: Drag-and-drop or click to equip items
- **Stat Bonuses**: View stat modifiers from equipped items

**For Inventory Tab:**
- **Inventory Bags**: Multi-bag system with configurable bag count
- **Item Stacking**: Automatic stacking of identical items
- **Item Filters**: Filter by category (Weapon, Armor, Consumable, Resource, Junk)
- **Context Menu**: Right-click for Use, Equip, Drop, Destroy actions
- **Credits**: Multi-currency wallet (Fuel, Food, Scrap, Tech, Medical)

**For AI Batch Generation:**
- **Prompt**: Creative direction for character generation
- **Count**: Number of characters to generate (1-10)
- **Character Type**: Base type filter (Human, Mutant, Monster, Animal, Construct)
- **Sex Restriction**: Any, Male Only, Female Only
- **Level Range**: Min and max level (1-50)
- **Faction Anchor**: Optional faction affiliation
- **Location Anchor**: Optional location origin


### Outputs Generated

**Primary Outputs:**
- **Character JSON**: Complete character data with all attributes, stats, traits, occupation, skills, equipment, inventory
- **Character Portrait**: AI-generated portrait image (PNG)
- **Character Sheet**: Derived stats (HP, AP, Armor, Crit, Resist, Damage) calculated from base stats, traits, occupation, and equipment
- **Progression Data**: XP, level, pioneer level, talent tree state, attribute upgrades, occupation states

**Saved Files (per world):**
- `generated/characters/char-{id}.json`: Individual character data
- `generated/characters/portraits/char-{id}.png`: Character portrait image

**Integration Outputs:**
- **To Quests**: Characters are available as party members, NPCs, and quest targets
- **To Events**: Characters drive event choices, consequences, and narrative branching
- **To Combat**: Character stats, skills, and equipment feed into combat encounters
- **To History**: Character relationships and backstories enrich world lore
- **To Asset Generator**: Character portraits and sprites are generated via Asset Generator integration

### Step-by-Step Usage

#### Step 1: Create a New Character (IDENTITY Tab)

1. **Launch the Character Builder** from the dev-tools dashboard
2. **Ensure a world is selected** (the tool will show "Select a world first" if none is active)
3. **Click "NEW CHARACTER"** in the left sidebar to create a blank character
4. **Fill in basic identity**:
   - **Name**: Enter a character name
   - **Age**: Set numeric age (default: 25)
   - **Gender**: Select Male, Female, or Other
   - **Character Type**: Select Human, Mutant, Monster, Animal, or Construct
   - **Is NPC**: Toggle on for NPCs/Archetypes, off for Player Characters
5. **Optional identity fields**:
   - **Faction**: Select from History factions (if available)
   - **Title**: Select from preset titles or enter custom
   - **Badge**: Select emoji badge for character icon
   - **Relationship**: Select character's relation.
6. **Auto-save**: Changes are saved automatically after 500ms of inactivity
7. **Character ID**: A unique ID is auto-generated (e.g., `char-1773444650126`)

**Identity Tips:**
- Player Characters should have `Is NPC` toggled off
- NPCs and Archetypes should have `Is NPC` toggled on
- Faction affiliation affects AI-generated lore and quest integration
- Family grouping is useful for creating related characters (siblings, parents, etc.)

#### Step 2: Customize Appearance (APPEARANCE Tab)

1. **Navigate to the APPEARANCE tab** using the top navigation
2. **Configure appearance selectors**:
   - **Hair Style**: Select from dropdown (Short, Long, Bald, Braided, etc.)
   - **Hair Color**: Select from dropdown (Black, Brown, Blonde, Red, etc.)
   - **Eye Color**: Select from dropdown (Brown, Blue, Green, Gray, etc.)
   - **Skin Tone**: Select from dropdown (Fair, Light, Medium, Tan, etc.)
   - **Build**: Select from dropdown (Slim, Athletic, Muscular, Stocky, etc.)
   - **Facial Hair**: Select from dropdown (None, Stubble, Goatee, Full Beard, etc.) - Male only
3. **Generate appearance prompt**:
   - **Click "MANIFEST APPEARANCE"** to AI-generate a narrative description from selectors
   - Wait for generation to complete (10-20 seconds)
   - Review and edit the generated appearance prompt if needed
4. **Generate portrait**:
   - **Click "REFRESH PORTRAIT"** to AI-generate a portrait image from appearance prompt
   - Wait for generation to complete (30-60 seconds)
   - The portrait will appear in the preview area
5. **Iterate**: You can regenerate the portrait multiple times to get different variations
6. **Auto-save**: Portrait URL is saved automatically to the character record

**Appearance Tips:**
- Use "MANIFEST APPEARANCE" first to get a coherent narrative description
- Edit the appearance prompt manually for more control over portrait generation
- Regenerate portraits multiple times to find the best match
- Female characters automatically have "Facial Hair" set to "None"


#### Step 3: Write Backstory and Generate History (LORE Tab)

1. **Navigate to the LORE tab**
2. **Write backstory draft**:
   - Enter a brief backstory in the "Backstory" textarea (2-3 paragraphs)
   - Include character motivations, origins, and key life events
   - Example: "Born in the northern wastes, survived the Ash Wars, now seeks revenge against the Fuel Guild"
3. **Add relationships** (optional):
   - Click "+ ADD RELATIONSHIP" to link this character to another
   - Select target character from dropdown
   - Select relationship type (Friend, Enemy, Rival, Family, Lover, Mentor, Student, Ally, Neutral)
   - Relationships are automatically mirrored (e.g., if A is B's mentor, B becomes A's student)
4. **Generate full history**:
   - **Click "GENERATE STORY"** to AI-generate a full character history
   - The AI uses backstory, relationships, and world lore to create a coherent narrative
   - Wait for generation to complete (30-60 seconds)
   - The history will appear with a typing animation effect
5. **Alignment inference**:
   - The AI automatically infers alignment from the generated history
   - Alignment is set based on moral choices and behavioral patterns in the narrative
   - You can manually override alignment in the IDENTITY tab if needed
6. **Auto-save**: History and relationships are saved automatically

**Lore Tips:**
- Write a detailed backstory draft for better AI-generated history
- Add relationships before generating history for richer narrative connections
- The AI considers world lore from History tool when generating character stories
- Alignment is inferred from keywords (e.g., "protect" → Good, "revenge" → Evil, "law" → Lawful, "chaos" → Chaotic)

#### Step 4: Select Traits (TRAITS Tab)

1. **Navigate to the TRAITS tab**
2. **Review trait points budget**:
   - Default: 15 trait points available
   - Each trait costs a certain number of points (usually 1-5)
   - Trait points are configured in World Settings
3. **Browse available traits**:
   - Traits are loaded from Gameplay Engine registry
   - Use the search bar to filter traits by name or description
   - Hover over traits to see stat modifiers and effects
4. **Select traits**:
   - Click on a trait to add it to your character
   - Selected traits appear in the "Selected Traits" panel
   - Remaining trait points are displayed at the top
5. **Review stat preview**:
   - The right panel shows how selected traits affect stats
   - Example: "Resilient" trait adds +10 HP, +1 Endurance
6. **Remove traits**:
   - Click on a selected trait to remove it
   - Trait points are refunded automatically
7. **Auto-save**: Trait selection is saved automatically

**Trait Tips:**
- Prioritize traits that align with your character's role (e.g., "Strong" for melee fighters)
- Balance offensive and defensive traits for well-rounded characters
- Some traits have prerequisites or restrictions (check trait descriptions)
- Trait stat modifiers stack with base stats and equipment bonuses

#### Step 5: Allocate Stats (STATS Tab)

1. **Navigate to the STATS tab**
2. **Review stat points budget**:
   - Default: 18 stat points available for base stats
   - Each stat starts at 3 (minimum)
   - Stat points are configured in World Settings
3. **Allocate base stats**:
   - **Strength**: Melee damage, carrying capacity
   - **Agility**: Initiative, dodge, ranged accuracy, action points
   - **Intelligence**: Crit chance, skill effectiveness
   - **Wisdom**: Status resistance, perception
   - **Endurance**: HP, armor, stamina
   - **Charisma**: Social interactions, leadership
4. **Use stat sliders or +/- buttons** to allocate points
5. **Review derived stats preview**:
   - HP, AP, Armor, Crit, Resist, Damage are calculated in real-time
   - Example: Endurance 10 → HP 60 (10 base + 10 * 5)
6. **Attribute upgrades** (for leveled characters):
   - Attribute upgrades are earned through leveling
   - Each level grants attribute points (configured in Gameplay Engine)
   - Attribute upgrades stack with base stats
7. **Stat redistribution** (optional):
   - Click "REDISTRIBUTE STATS" to reset and reallocate all stats
   - Useful for respeccing characters or fixing mistakes
8. **Auto-save**: Stat allocation is saved automatically

**Stat Tips:**
- Melee fighters: Prioritize Strength and Endurance
- Ranged fighters: Prioritize Agility and Intelligence
- Support characters: Prioritize Wisdom and Charisma
- Balanced characters: Distribute points evenly across all stats
- Check derived stats preview to ensure your build meets your goals


#### Step 6: Select Occupation and Unlock Talents (OCCUPATION Tab)

1. **Navigate to the OCCUPATION tab**
2. **Select primary occupation**:
   - Browse occupations from Gameplay Engine registry
   - Use category filter to narrow options (Combat, Support, Utility, Crafting, Social)
   - Click on an occupation to select it as primary
   - Primary occupation determines starting skills and equipment
3. **Review occupation details**:
   - Description, starting traits, stat modifiers, starting equipment
   - Example: "Soldier" grants "Resilient" trait, +2 Strength, starts with sword and armor
4. **Open talent tree**:
   - Click "OPEN TALENT TREE" to view the occupation's talent tree
   - Talent trees are visual node graphs with prerequisites and costs
5. **Unlock talent nodes**:
   - Click on an available talent node to unlock it
   - Available nodes are highlighted (prerequisites met)
   - Each node costs talent points (usually 1 point per node)
   - Talent points are earned through leveling (1 point per level)
6. **Review talent effects**:
   - Talents provide stat bonuses, passive abilities, or active skills
   - Example: "Power Strike" talent unlocks a new combat skill
   - Capstone talents (end of tree) provide powerful bonuses
7. **Multi-occupation system** (advanced):
   - Click "+ ADD OCCUPATION" to add a secondary occupation
   - Secondary occupations have independent progression and talent trees
   - Pioneer points are required to unlock additional occupations
   - Primary occupation can be switched via dropdown
8. **Pioneer system** (post-max-level):
   - After reaching max level (default: 30), characters earn pioneer levels
   - Pioneer levels grant additional talent points and stat points
   - Pioneer points can be spent on unlocking new occupations
9. **Auto-save**: Occupation selection and talent tree state are saved automatically

**Occupation Tips:**
- Choose an occupation that aligns with your character's role and playstyle
- Unlock talents that synergize with your selected skills and equipment
- Capstone talents are powerful but require significant investment
- Multi-occupation builds are complex but offer unique combinations
- Pioneer system allows for continued progression after max level

#### Step 7: Select Skills (SKILLS Tab)

1. **Navigate to the SKILLS tab**
2. **Review skill categories**:
   - **Base**: Universal skills available to all characters (e.g., "Use Weapon", "Sprint")
   - **Occupation**: Skills granted by occupation or unlocked via talent tree
   - **Combat**: Offensive and defensive combat skills
   - **Utility**: Non-combat skills (lockpicking, crafting, etc.)
   - **Social**: Dialogue and persuasion skills
   - **Crafting**: Item creation and modification skills
3. **Browse skill library**:
   - Use category filter to narrow options
   - Use search bar to find specific skills
   - Hover over skills to see effects, costs, cooldowns, and range
4. **Select skills**:
   - Click on a skill to add it to your character's skill loadout
   - Selected skills appear in the "Selected Skills" panel
   - Player characters automatically have all base skills equipped
5. **Review skill details**:
   - **Resource Cost**: HP, Stamina, Mana, or custom resource
   - **Cooldown**: Turns before skill can be used again
   - **Range**: Min and max range for skill targeting
   - **Area Type**: Single, Line, Cone, Circle (for AoE skills)
   - **Effects**: Damage, healing, buffs, debuffs, movement
6. **Dynamic skills**:
   - Some skills (e.g., "Use Weapon") dynamically update based on equipped items
   - Weapon range, damage, and area type are inherited from equipped weapon
7. **Remove skills**:
   - Click on a selected skill to remove it from loadout
8. **Auto-save**: Skill selection is saved automatically

**Skill Tips:**
- Player characters should always have base skills (Use Weapon, Sprint, Hide, First Aid)
- NPCs can have custom skill loadouts without base skills
- Prioritize skills that synergize with your occupation and talents
- Check skill resource costs and cooldowns to avoid resource starvation
- Dynamic skills like "Use Weapon" adapt to your equipped weapon


#### Step 8: Equip Items (EQUIPMENT Tab)

1. **Navigate to the EQUIPMENT tab**
2. **Review equipment slots**:
   - **Head**: Helmets, hats, headgear
   - **Chest**: Armor, vests, jackets
   - **Gloves**: Gloves, gauntlets, hand protection
   - **Waist**: Belts, sashes, utility belts
   - **Legs**: Pants, leg armor, greaves
   - **Boots**: Boots, shoes, footwear
   - **Main Hand**: Primary weapon (sword, gun, staff, etc.)
   - **Off Hand**: Secondary weapon, shield, or tool
3. **Browse item library**:
   - Items are loaded from Gameplay Engine registry
   - Use category filter to narrow options (Weapon, Armor, Consumable, Resource, Junk)
   - Use search bar to find specific items
4. **Equip items**:
   - Click on an item in the library to equip it to the appropriate slot
   - Drag-and-drop items from inventory to equipment slots
   - Equipped items appear in the equipment slot preview
5. **Review stat bonuses**:
   - Equipped items provide stat modifiers (HP, AC, Damage, etc.)
   - Stat bonuses are displayed in the equipment slot card
   - Total stat bonuses are shown in the derived stats panel
6. **Unequip items**:
   - Click on an equipped item to unequip it
   - Unequipped items return to inventory
7. **Weapon dynamics**:
   - Equipped weapons affect the "Use Weapon" skill
   - Weapon range, damage, and area type are inherited by the skill
   - Ranged weapons use fixed damage, melee weapons scale with Strength
8. **Auto-save**: Equipment configuration is saved automatically

**Equipment Tips:**
- Prioritize weapons and armor for combat-focused characters
- Check stat bonuses to ensure equipment aligns with your build
- Ranged weapons (bows, guns) use fixed damage and don't scale with Strength
- Melee weapons (swords, axes) scale with Strength for increased damage
- Shields and off-hand items provide defensive bonuses

#### Step 9: Manage Inventory (INVENTORY Tab)

1. **Navigate to the INVENTORY tab**
2. **Review inventory bags**:
   - Default: 3 bags with 20 slots each (configurable in World Settings)
   - Switch between bags using the bag selector at the top
3. **Add items to inventory**:
   - Click on an item in the library to add it to the active bag
   - Items are automatically stacked if identical
   - Drag-and-drop items between bags
4. **Use item filters**:
   - Filter by category (Weapon, Armor, Consumable, Resource, Junk, ALL)
   - Use search bar to find specific items
5. **Item context menu**:
   - Right-click on an item to open context menu
   - **Use**: Consume item (for consumables)
   - **Equip**: Equip item to appropriate slot (for equipable items)
   - **Drop**: Remove item from inventory
   - **Destroy**: Permanently delete item with animation
6. **Item hover info**:
   - Hover over an item to see detailed tooltip
   - Tooltip shows item name, category, rarity, effects, and description
7. **Credits management**:
   - Credits panel shows multi-currency wallet (Fuel, Food, Scrap, Tech, Medical)
   - Credits are earned through quests, events, and trading
   - Credits are spent on items, services, and upgrades
8. **Auto-save**: Inventory and credits are saved automatically

**Inventory Tips:**
- Organize items by category across different bags (e.g., Bag 1 for weapons, Bag 2 for consumables)
- Stack identical items to save inventory space
- Keep consumables (Med Kits, Stimulants) easily accessible for combat
- Monitor credits to ensure you can afford quest expenses
- Use "Destroy" animation for dramatic item disposal

#### Step 10: AI Batch Generation (Optional)

1. **Click "AI GENERATE"** in the top bar to open the AI Character Generator modal
2. **Configure generation parameters**:
   - **Prompt**: Enter creative direction (e.g., "Veteran scavengers from the northern wastes")
   - **Count**: Number of characters to generate (1-10)
   - **Character Type**: Select base type (Human, Mutant, Monster, Animal, Construct)
   - **Sex Restriction**: Any, Male Only, Female Only
   - **Level Range**: Min and max level (1-50)
   - **Faction Anchor**: Optional faction affiliation (from History)
   - **Location Anchor**: Optional location origin (from World Generator)
3. **Click "GENERATE"** and wait for AI to create characters (30-90 seconds)
4. **Review generated characters**:
   - Preview panel shows all generated characters with stats, traits, and backstories
   - Select/deselect characters using checkboxes
   - Click "SELECT ALL" or "DESELECT ALL" for batch selection
5. **Import characters**:
   - Click "IMPORT X CHARACTERS TO REGISTRY" to add selected characters
   - Characters are automatically saved to the registry
   - Base skills are automatically equipped for player characters
6. **Edit imported characters**:
   - Click on an imported character in the left sidebar to edit
   - All character properties can be modified after import

**AI Generation Tips:**
- Use detailed prompts for better character generation (include personality, background, motivations)
- Faction and location anchors help create cohesive character groups
- Generate multiple characters at once for NPC squads or enemy groups
- Review and edit generated characters before using them in quests
- AI-generated characters have random stats, traits, and occupations based on level range


### Best Practices

1. **Start with Identity**: Always fill in name, age, gender, and type before moving to other tabs. This establishes the character's foundation.

2. **Generate Appearance Early**: Use the APPEARANCE tab to generate portraits early in the process. Portraits help visualize the character during development.

3. **Write Detailed Backstories**: The AI-generated history is only as good as the backstory draft. Include motivations, origins, and key life events.

4. **Add Relationships Before Generating History**: Relationships enrich AI-generated narratives. Add them before clicking "GENERATE STORY".

5. **Balance Traits and Stats**: Don't min-max excessively. Balanced characters are more versatile and fun to play.

6. **Choose Occupation Early**: Occupation determines starting skills and equipment. Select it before allocating stats to ensure synergy.

7. **Unlock Talents Strategically**: Plan your talent tree progression. Capstone talents require significant investment but provide powerful bonuses.

8. **Equip Base Skills for Players**: Player characters should always have base skills (Use Weapon, Sprint, Hide, First Aid) equipped.

9. **Test Equipment Synergy**: Ensure equipped weapons and armor align with your character's stats and skills. Ranged weapons for Agility builds, melee weapons for Strength builds.

10. **Use AI Generation for NPCs**: AI batch generation is perfect for creating NPC squads, enemy groups, or background characters quickly.

11. **Organize Inventory by Category**: Use multiple bags to organize items by type (weapons, armor, consumables, resources).

12. **Monitor Derived Stats**: Always check the derived stats panel (HP, AP, Armor, Crit, Resist, Damage) to ensure your build meets your goals.

13. **Save Frequently**: The tool auto-saves, but manually click "SAVE" in the SAVE tab to ensure all changes are persisted.

14. **Use World Settings for Custom Types**: Create custom base types (e.g., "Cyborg", "Alien") in World Settings for unique character archetypes.

15. **Link Characters to Factions**: Faction affiliation affects AI-generated lore and quest integration. Always assign factions when relevant.

### Common Pitfalls

1. **Forgetting to Select a World**: The Character Builder is world-scoped. Always select an active world before creating characters.

2. **Skipping Appearance Generation**: Characters without portraits feel incomplete. Always generate portraits for important characters.

3. **Not Adding Relationships**: Relationships enrich character narratives and create interesting quest dynamics. Don't skip this step.

4. **Over-Allocating Trait Points**: Spending all trait points on offensive traits leaves characters vulnerable. Balance offense and defense.

5. **Ignoring Derived Stats**: Focusing only on base stats without checking derived stats (HP, AP, Armor) can lead to weak builds.

6. **Not Unlocking Talents**: Talent trees provide significant power boosts. Don't forget to unlock talents as you level up.

7. **Equipping Incompatible Items**: Equipping a ranged weapon on a Strength-focused character wastes stat allocation. Ensure equipment synergy.

8. **Forgetting Base Skills**: Player characters without base skills (Use Weapon, Sprint) are severely handicapped in combat.

9. **Not Using Multi-Occupation**: Multi-occupation builds offer unique combinations but require pioneer points. Plan ahead for post-max-level progression.

10. **Ignoring Alignment**: Alignment affects quest choices and NPC interactions. Ensure alignment matches character personality.

11. **Not Testing in Combat**: Always test characters in the Gameplay Engine → Combat simulator to verify builds work as intended.

12. **Overloading Inventory**: Inventory space is limited. Don't hoard unnecessary items. Use "Destroy" to remove junk.

13. **Not Syncing Sprites**: Characters with exploration sprites feel more immersive. Use Asset Generator to create directional sprites.

14. **Forgetting to Save**: While auto-save is enabled, always manually save in the SAVE tab before closing the tool.

15. **Not Using AI Generation**: AI batch generation saves time for creating NPC groups. Don't manually create every NPC.

### Integration with Other Tools

- **World Generator**: Provides world context, factions, and locations for character creation
- **Game Master**: Supplies compiled context for AI-generated character histories and portraits
- **Gameplay Engine**: Provides traits, occupations, skills, items, and game rules for character configuration
- **History**: Factions, locations, and lore feed into character backstories and relationships
- **Ecology**: Fauna profiles inform companion animals and mounts (for Animal type characters)
- **Quests**: Characters are available as party members, NPCs, and quest targets with live stat integration
- **Events**: Characters drive event choices, consequences, and narrative branching
- **Combat**: Character stats, skills, and equipment feed into combat encounters with real-time updates
- **Asset Generator**: Character portraits and exploration sprites are generated via Asset Generator integration
- **Gallery**: Character portraits are stored and can be synced to cloud storage
- **Job Center**: Tracks all character generation jobs (portraits, stories, batch generation) with real-time status

### Advanced: Character Progression System

The Character Builder uses a multi-layered progression system:

**Base Progression (Levels 1-30):**
- Characters earn XP through quests, events, and combat
- Each level grants attribute points (configured in Gameplay Engine)
- Attribute points are spent on stat upgrades (Strength, Agility, etc.)
- Each level grants 1 talent point for unlocking talent tree nodes

**Pioneer Progression (Post-Level 30):**
- After reaching max level (default: 30), characters earn pioneer levels
- Pioneer levels grant additional talent points and stat points
- Pioneer points can be spent on unlocking new occupations
- Pioneer progression has its own XP curve (configured in Gameplay Engine)

**Multi-Occupation Progression:**
- Characters can have multiple occupations with independent progression
- Each occupation has its own talent tree and level
- Primary occupation determines starting skills and equipment
- Secondary occupations provide additional talents and abilities
- Pioneer points are required to unlock additional occupations

**Talent Tree Progression:**
- Talent trees are visual node graphs with prerequisites
- Each node costs talent points (usually 1 point per node)
- Nodes provide stat bonuses, passive abilities, or active skills
- Capstone nodes (end of tree) provide powerful bonuses
- Converging nodes (multiple prerequisites) provide unique combinations

**Stat Calculation:**
- **Base Stats**: Allocated during character creation (default: 18 points)
- **Attribute Upgrades**: Earned through leveling (configured in Gameplay Engine)
- **Trait Modifiers**: Provided by selected traits
- **Equipment Modifiers**: Provided by equipped items
- **Occupation Modifiers**: Provided by occupation innate bonuses
- **Total Stats**: Base + Attribute Upgrades + Trait Modifiers + Equipment Modifiers + Occupation Modifiers

**Derived Stats:**
- **HP**: `(HP Base + Endurance * HP Per Endurance) + Equipment HP Bonuses`
- **AP**: `(AP Base + floor(Agility / AP Agility Divisor))`
- **Armor**: `(Armor Agi Scale * log(Agility + 1) + Armor Endu Scale * log(Endurance + 1)) + Equipment Armor Bonuses`
- **Crit**: `Intelligence * Crit Per Intelligence * 100%`
- **Resist**: `Wisdom * Resist Per Wisdom * 100%`
- **Damage**: `Weapon Base Damage * (1 + Strength * Strength Scaling)` (melee) or `Weapon Base Damage` (ranged)

All formulas are configured in Gameplay Engine → Rules.



</details>


<details>
<summary><b>🎯 Quests</b></summary>

### Purpose & Overview

The Quests tool is the dynamic quest generation and execution environment used to create, run, archive, and test world-scoped, party-based, multi-ending quest flows driven by lore, history, ecology, character state, and live world context. It serves as the primary narrative delivery system for the Ashtrail ecosystem, synthesizing all dev-tool outputs (world, lore, characters, ecology, gameplay rules) into playable, branching story experiences with AI-driven progression, combat encounters, character development, and consequence tracking. The Quests tool supports seed-based generation, real-time party management, freeform player actions, combat integration, glossary-enhanced storytelling, and quest chain progression.

### Key Features

- **Quest Seed System**: Define premise, objective, stakes, tone, difficulty, run length, openness, and target ending count
- **AI Brief Generator**: Auto-generate quest seeds from world context, party composition, and selected anchors
- **Party Management**: Select 1-3 player characters from Character Builder registry with live stat integration
- **Anchor System**: Link quests to factions, locations, and ecology elements for contextual grounding
- **Multi-Stage Workflow**: Structured pipeline (BRIEF → PARTY → ANCHORS → REVIEW) for quest seed configuration
- **Dynamic Quest Generation**: AI-driven quest run creation with branching narrative nodes and multiple endings
- **Real-Time Quest Execution**: Advance quests through player choices, freeform actions, and combat resolutions
- **Combat Integration**: Seamless transition to Gameplay Engine combat simulator with enemy generation and resolution tracking
- **Illustration System**: AI-generated key-beat illustrations for major quest nodes with status tracking
- **Glossary System**: Contextual term highlighting with hover tooltips for lore-rich storytelling
- **Quest Chains**: Multi-quest narrative arcs with persistent consequences and character progression
- **Quest Archive**: Historical record of all completed, active, and abandoned quests per world
- **Party Updates**: Live character stat, inventory, and relationship updates during quest progression
- **NPC Materialization**: Auto-generate and save quest NPCs to Character Builder registry
- **Character Portraits**: AI-generated portraits for quest NPCs with on-demand generation
- **Run Log System**: Comprehensive quest history with node-by-node progression tracking
- **Freeform Actions**: Player-driven narrative input for open-ended quest progression
- **Consequence Tracking**: Persistent world state changes, faction reputation, and character relationships
- **Retry System**: Restore quest runs to previous states for alternate path exploration
- **Quest Status Management**: Active, completed, abandoned, and failed quest states
- **Cross-Tool Integration**: Quests consume data from all dev-tools and write back character/world state changes

### Interface Walkthrough

The Quests tool interface is organized into three main tabs accessible via the top navigation:

**Main Tabs:**
1. **SEED**: Quest seed configuration with multi-stage workflow (BRIEF, PARTY, ANCHORS, REVIEW)
2. **RUN**: Active quest execution with narrative progression, choices, combat, and party management
3. **ARCHIVE**: Historical quest runs with filtering, search, and run detail viewing

**Seed Tab Workflow (4 Stages):**
1. **BRIEF**: Define premise, objective, stakes, tone, difficulty, run length, openness, target endings
2. **PARTY**: Select 1-3 player characters from Character Builder registry
3. **ANCHORS**: Link factions, locations, and ecology elements to quest context
4. **REVIEW**: Final review of quest seed configuration before generation

**Run Tab Components:**
- **Narrative Panel**: Current quest node with title, text, illustration, and glossary terms
- **Choices Panel**: Available player actions with consequence previews
- **Freeform Input**: Custom player action text input for open-ended progression
- **Party Panel**: Character sheets, stats, inventory, and relationships for all party members
- **Run Log**: Historical node progression with HISTORY, CHAIN, GLOSSARY, and ARC tabs
- **Combat Brief**: Encounter details with enemy count, difficulty, and combat initialization

**Archive Tab Components:**
- **Quest List**: All quest runs for selected world with status badges (Active, Completed, Abandoned, Failed)
- **Run Detail**: Full quest run data with node history, party composition, and outcome
- **Delete/Restore**: Manage archived quests with deletion and retry functionality

**Top Bar:**
- **Tool Title**: "QUESTS" with icon
- **World Picker**: Select active world for quest scoping
- **Workflow Bar**: Stage navigation for seed configuration (BRIEF → PARTY → ANCHORS → REVIEW)
- **Generate Button**: Launch quest generation from seed configuration

### Inputs Required

**Prerequisites:**
- An active world must be selected (generated via World Generator)
- Game Master must have a canonical world prompt configured (quests are blocked without this)
- Recommended: Character Builder has 1-3 player characters created
- Recommended: History has factions and locations configured
- Recommended: Ecology has biomes, flora, and fauna configured
- Recommended: Gameplay Engine has skills, items, and combat rules configured

**For BRIEF Stage:**
- **Premise**: Text description of the quest's inciting problem or tension (1-2 sentences)
- **Objective**: Text description of what the party is trying to achieve (1-2 sentences)
- **Stakes**: Text description of what changes if the party fails (1-2 sentences)
- **Tone**: Narrative tone (e.g., "tense", "hopeful", "bleak", "mysterious")
- **Difficulty**: Low, Medium, High, Deadly
- **Run Length**: Short (5-8 nodes), Medium (9-12 nodes), Long (13-16 nodes)
- **Openness**: Guided (linear), Balanced (semi-linear), Open (sandbox)
- **Target Ending Count**: Number of possible endings (3-6)
- **Custom Notes**: Optional extra constraints, story motifs, or themes

**For PARTY Stage:**
- **Party Selection**: Select 1-3 player characters from Character Builder registry
- Characters must be non-NPC and belong to the active world

**For ANCHORS Stage:**
- **Faction Anchors**: Select factions from History that will be involved in the quest
- **Location Anchors**: Select locations from World Generator/History that will be featured
- **Ecology Anchors**: Select biomes, flora, or fauna from Ecology that will appear

**For Quest Execution (RUN Tab):**
- **Choice Selection**: Click on a choice to advance the quest
- **Freeform Action**: Enter custom player action text for open-ended progression
- **Combat Resolution**: Complete combat encounters in Gameplay Engine combat simulator

### Outputs Generated

**Primary Outputs:**
- **Quest Run Record**: Complete quest data with all nodes, choices, outcomes, and party state
- **Quest Illustrations**: AI-generated key-beat images for major quest nodes (PNG)
- **Quest Chain Record**: Multi-quest narrative arc with persistent consequences
- **Quest Glossary**: Contextual term definitions for lore-rich storytelling
- **Materialized NPCs**: Auto-generated quest NPCs saved to Character Builder registry
- **Party Updates**: Character stat, inventory, and relationship changes during quest progression

**Saved Files (per world):**
- `generated/planets/{worldId}/quests/{runId}.json`: Individual quest run data
- `generated/planets/{worldId}/quests/chains/{chainId}.json`: Quest chain data
- `generated/planets/{worldId}/quests/illustrations/{illustrationId}.png`: Quest illustration images
- `generated/planets/{worldId}/quests/glossary/{termSlug}.json`: Glossary entry data

**Integration Outputs:**
- **To Character Builder**: Materialized NPCs, party stat updates, inventory changes, relationship updates
- **To History**: Quest outcomes feed into world lore and faction reputation
- **To Gameplay Engine**: Combat encounters use live character stats and skills
- **To Game Master**: Quest consequences update world state and faction relationships
- **To Asset Generator**: Quest illustrations are generated via Asset Generator integration


### Step-by-Step Usage

#### Step 1: Configure Quest Seed - BRIEF Stage

1. **Launch the Quests tool** from the dev-tools dashboard
2. **Ensure a world is selected** and Game Master has a canonical world prompt configured
3. **Navigate to the SEED tab** (should be default)
4. **The workflow bar shows 4 stages**: BRIEF → PARTY → ANCHORS → REVIEW
5. **BRIEF stage is active by default**

**Option A: Manual Brief Configuration**
1. **Enter Premise**: Describe the inciting problem or tension
   - Example: "A fuel convoy has gone missing in the northern wastes, and the Fuel Guild suspects sabotage by the Nomads."
2. **Enter Objective**: Describe what the party is trying to achieve
   - Example: "Locate the missing convoy, recover the fuel, and determine who is responsible."
3. **Enter Stakes**: Describe what changes if the party fails
   - Example: "The Fuel Guild will cut off fuel supplies to the region, causing widespread starvation and conflict."
4. **Configure Tone**: Enter narrative tone (e.g., "tense", "hopeful", "bleak")
5. **Select Difficulty**: Low, Medium, High, or Deadly
6. **Select Run Length**: Short (5-8 nodes), Medium (9-12 nodes), or Long (13-16 nodes)
7. **Select Openness**: Guided (linear), Balanced (semi-linear), or Open (sandbox)
8. **Set Target Ending Count**: Use slider to set 3-6 possible endings
9. **Add Custom Notes** (optional): Extra constraints, story motifs, or themes

**Option B: AI Brief Generation**
1. **Click "GENERATE" in the AI Brief Generator panel** (cyan panel at top)
2. **Wait for AI to generate premise, objective, and stakes** (20-40 seconds)
3. **Review generated brief** and edit as needed
4. **AI uses world context, party composition, and selected anchors** to create coherent brief

**Brief Tips:**
- Keep premise, objective, and stakes concise (1-2 sentences each)
- Be specific and gameable (avoid vague or abstract descriptions)
- Tone affects narrative voice and event flavor
- Difficulty affects combat encounters and skill check DCs
- Run length affects node count and pacing
- Openness affects branching complexity and player agency

#### Step 2: Select Party - PARTY Stage

1. **Click "PARTY" in the workflow bar** to advance to party selection
2. **Review available party characters**:
   - Only non-NPC characters from the active world are shown
   - Characters display name, level, occupation, portrait, and stats
3. **Select 1-3 characters** by clicking checkboxes
   - Minimum: 1 character
   - Maximum: 3 characters
   - Selection limit is enforced (checkboxes disabled when at limit)
4. **Review party composition**:
   - Check character stats, skills, and equipment
   - Ensure party has balanced roles (combat, support, utility)
   - Consider character relationships and faction affiliations
5. **Party selection is saved automatically**

**Party Tips:**
- Balanced parties (tank, damage, support) perform better in combat
- Character relationships affect dialogue options and quest outcomes
- Faction affiliations influence quest choices and NPC interactions
- Check character inventories to ensure adequate supplies (Med Kits, Stimulants)

#### Step 3: Link Anchors - ANCHORS Stage

1. **Click "ANCHORS" in the workflow bar** to advance to anchor selection
2. **Three anchor categories are available**:
   - **Faction Anchors**: Factions from History that will be involved
   - **Location Anchors**: Locations from World Generator/History that will be featured
   - **Ecology Anchors**: Biomes, flora, or fauna from Ecology that will appear
3. **Select faction anchors**:
   - Click on factions to toggle selection
   - Selected factions appear with highlighted border
   - Faction type and status are shown in subtitle
4. **Select location anchors**:
   - Click on locations to toggle selection
   - Location type and status are shown in subtitle
5. **Select ecology anchors**:
   - Click on ecology elements to toggle selection
   - Biomes, flora, and fauna are all available
   - Ecology kind (biome, fauna, flora) is shown in subtitle
   - Hover over ecology anchors to see detailed summary
6. **Anchor selection is saved automatically**

**Anchor Tips:**
- Anchors provide contextual grounding for quest generation
- More anchors = more specific quest narrative
- Fewer anchors = more creative freedom for AI
- Faction anchors drive political intrigue and conflict
- Location anchors provide spatial context and exploration
- Ecology anchors enrich environmental storytelling and encounters

#### Step 4: Review and Generate - REVIEW Stage

1. **Click "REVIEW" in the workflow bar** to advance to final review
2. **Review all quest seed configuration**:
   - Premise, objective, stakes
   - Tone, difficulty, run length, openness, target endings
   - Selected party characters
   - Selected faction, location, and ecology anchors
3. **Verify prerequisites**:
   - World is selected
   - Game Master has canonical world prompt
   - Party has 1-3 characters selected
   - Brief fields (premise, objective, stakes) are filled
4. **Click "GENERATE QUEST"** button at bottom
5. **Wait for quest generation** (60-120 seconds depending on run length)
6. **Generation progress is shown** with real-time status updates
7. **Upon completion**:
   - Quest run is created and saved to archive
   - Active quest is set to the new run
   - Tab automatically switches to RUN tab
   - Materialized NPCs are saved to Character Builder
   - Notices panel shows generation summary

**Generation Tips:**
- Quest generation can take 1-2 minutes for long runs
- Check Job Center for real-time generation progress
- If generation fails, check notices panel for error details
- Materialized NPCs are automatically added to Character Builder
- Quest runs are automatically saved to archive

#### Step 5: Execute Quest - RUN Tab

1. **After generation, the RUN tab is automatically activated**
2. **Quest run interface shows**:
   - Current node title and narrative text
   - Quest illustration (if available, or "Generating..." status)
   - Available choices with consequence previews
   - Party panel with character sheets
   - Run log with node history
3. **Read the current node**:
   - Node title describes the scene
   - Narrative text provides context and description
   - Glossary terms are highlighted (hover for tooltips)
   - Illustration shows key-beat visual (if ready)
4. **Review available choices**:
   - Choices are displayed as clickable cards
   - Each choice shows action description
   - Some choices may have skill checks or requirements
5. **Select a choice**:
   - Click on a choice card to advance the quest
   - Wait for AI to generate next node (20-40 seconds)
   - New node appears with updated narrative and choices
6. **Or enter freeform action**:
   - Type custom player action in freeform input field
   - Click "ADVANCE" to submit freeform action
   - AI interprets freeform action and generates appropriate response
7. **Quest progresses node by node** until reaching an ending

**Execution Tips:**
- Read narrative text carefully for context clues
- Hover over glossary terms for lore tooltips
- Check party stats before making risky choices
- Use freeform actions for creative problem-solving
- Combat encounters require completion before advancing
- Quest illustrations may take 30-60 seconds to generate


#### Step 6: Handle Combat Encounters

1. **Combat nodes are indicated** by red border and "ENCOUNTER" badge
2. **Combat brief shows**:
   - Encounter title and description
   - Enemy count and difficulty
   - Run progress (current node / max nodes)
3. **Click "BEGIN COMBAT"** to launch combat simulator
4. **Combat simulator opens** (Gameplay Engine integration):
   - Party characters are loaded with live stats
   - Enemy characters are auto-generated based on difficulty
   - Turn-based combat begins with initiative rolls
5. **Complete combat**:
   - Use skills, items, and movement to defeat enemies
   - Combat log tracks all actions and damage
   - Combat ends when all enemies are defeated or party is defeated
6. **Combat resolution is saved**:
   - Victory: Quest advances with success outcome
   - Defeat: Quest advances with failure outcome or retry option
7. **Return to quest run** after combat completion
8. **Quest automatically advances** with combat resolution applied

**Combat Tips:**
- Check party HP and inventory before combat
- Use skills strategically (manage cooldowns and resource costs)
- Position characters for optimal range and area coverage
- Combat difficulty scales with quest difficulty setting
- Defeat doesn't always mean quest failure (depends on quest design)

#### Step 7: Manage Party During Quest

1. **Click "PARTY" button** in run interface to open party modal
2. **Party modal shows all party characters**:
   - Character portraits and names
   - Current HP, AP, and status effects
   - Inventory and equipped items
   - Skills and cooldowns
   - Relationships and faction affiliations
3. **Select a character** to view detailed character sheet
4. **Character sheet shows**:
   - Full stats (Strength, Agility, Intelligence, Wisdom, Endurance, Charisma)
   - Derived stats (HP, AP, Armor, Crit, Resist, Damage)
   - Traits and occupation
   - Skills with descriptions and costs
   - Equipment with stat bonuses
   - Inventory with item counts
5. **Party updates are live**:
   - Stat changes during quest are reflected immediately
   - Inventory changes (item use, loot) are tracked
   - Relationship changes are updated in real-time
6. **Close party modal** to return to quest run

**Party Management Tips:**
- Monitor party HP throughout quest
- Check inventory for consumables (Med Kits, Stimulants)
- Review character skills before combat encounters
- Track relationship changes for dialogue options
- Party state persists across quest sessions

#### Step 8: Use Run Log System

1. **Click "RUN LOG" button** in run interface to open run log modal
2. **Run log has 4 tabs**:
   - **HISTORY**: Node-by-node progression with choices and outcomes
   - **CHAIN**: Quest chain context and related quests
   - **GLOSSARY**: All glossary terms encountered with definitions
   - **ARC**: Quest arc overview with branching visualization
3. **HISTORY tab shows**:
   - All previous nodes in chronological order
   - Node titles, narrative text, and choices made
   - Combat encounters and resolutions
   - Party updates and consequences
4. **CHAIN tab shows**:
   - Current quest chain name and status
   - Related quests in the chain
   - Chain progression and consequences
5. **GLOSSARY tab shows**:
   - All glossary terms encountered in the quest
   - Term definitions with lore context
   - Term categories (faction, location, character, item, concept)
6. **ARC tab shows**:
   - Quest arc visualization with branching paths
   - Current position in the arc
   - Possible endings and requirements
7. **Close run log modal** to return to quest run

**Run Log Tips:**
- Use HISTORY tab to review past decisions
- Use GLOSSARY tab to understand lore terms
- Use CHAIN tab to see quest connections
- Use ARC tab to plan for desired endings

#### Step 9: Complete or Abandon Quest

**Quest Completion:**
1. **Quest reaches an ending node** when:
   - All objectives are achieved (success ending)
   - Critical failure occurs (failure ending)
   - Alternative resolution is reached (neutral ending)
2. **Ending node shows**:
   - Final narrative text with outcome description
   - Quest consequences (faction reputation, world state changes)
   - Party rewards (XP, items, credits)
   - Character relationship updates
3. **Quest status changes to "Completed"**
4. **Quest is saved to archive** with completion timestamp
5. **Party characters are updated** with rewards and consequences
6. **Quest chain progresses** (if part of a chain)

**Quest Abandonment:**
1. **Click "ABANDON" button** in run interface
2. **Confirm abandonment** in modal dialog
3. **Quest status changes to "Abandoned"**
4. **Quest is saved to archive** with abandonment timestamp
5. **Party characters retain current state** (no rewards)
6. **Quest chain is paused** (if part of a chain)

**Completion Tips:**
- Review quest consequences before accepting ending
- Check party rewards (XP, items, credits) in ending node
- Abandoned quests can be retried from archive
- Completed quests affect future quest generation (faction reputation, world state)

#### Step 10: Browse Quest Archive

1. **Navigate to the ARCHIVE tab** using the top navigation
2. **Quest archive shows all quest runs** for the active world
3. **Quest list displays**:
   - Quest title and premise
   - Status badge (Active, Completed, Abandoned, Failed)
   - Party composition (character portraits)
   - Node count and max nodes
   - Completion timestamp
4. **Filter quests** by status using filter buttons
5. **Search quests** by title or premise using search bar
6. **Click on a quest** to view run detail
7. **Run detail shows**:
   - Full quest seed configuration
   - Complete node history
   - Party composition and final state
   - Quest outcome and consequences
8. **Delete quest** using delete button (confirmation required)
9. **Retry quest** using retry button (restores quest to previous state)

**Archive Tips:**
- Use archive to review past quest outcomes
- Retry quests to explore alternate paths
- Delete failed or abandoned quests to clean up archive
- Completed quests provide context for future quest generation

### Best Practices

1. **Configure Game Master First**: Always ensure Game Master has a canonical world prompt before generating quests. Quests are blocked without this.

2. **Use AI Brief Generator**: The AI brief generator creates coherent quest seeds from world context. Use it as a starting point and refine manually.

3. **Balance Party Composition**: Select characters with complementary roles (combat, support, utility) for better quest outcomes.

4. **Link Relevant Anchors**: Anchor selection grounds quests in world context. Link factions, locations, and ecology elements that match your quest theme.

5. **Start with Medium Difficulty**: Medium difficulty provides balanced challenge. Adjust difficulty based on party level and composition.

6. **Use Freeform Actions Strategically**: Freeform actions allow creative problem-solving but may produce unexpected outcomes. Use them when standard choices don't fit.

7. **Monitor Party State**: Check party HP, inventory, and skills regularly. Use consumables before combat encounters.

8. **Read Glossary Terms**: Hover over highlighted terms for lore context. Glossary enriches storytelling and provides world-building depth.

9. **Complete Combat Encounters**: Combat encounters must be completed before advancing. Don't skip combat or quest progression will be blocked.

10. **Review Run Log**: Use run log to track quest progression, review past decisions, and understand quest consequences.

11. **Save Quest Runs**: Quest runs are auto-saved but manually save before closing the tool to ensure all progress is persisted.

12. **Use Quest Chains**: Quest chains provide narrative continuity across multiple quests. Complete quests in order for coherent story arcs.

13. **Generate NPC Portraits**: Use the portrait generation button for quest NPCs to enhance immersion and character recognition.

14. **Test Different Endings**: Retry quests from archive to explore alternate endings and consequences.

15. **Sync Quest Data**: Quest runs, illustrations, and glossary entries are saved per-world. Sync to Gallery for backup and team collaboration.

### Common Pitfalls

1. **Missing Canonical World Prompt**: Quests cannot be generated without a Game Master canonical world prompt. Always configure Game Master first.

2. **No Party Selected**: Quest generation requires 1-3 party characters. Always select party before generating.

3. **Empty Brief Fields**: Premise, objective, and stakes must be filled. Don't leave brief fields empty or generation will fail.

4. **Ignoring Anchor Selection**: Quests without anchors lack contextual grounding. Always link relevant factions, locations, and ecology elements.

5. **Skipping Combat Encounters**: Combat encounters must be completed before advancing. Don't try to skip combat or quest will be blocked.

6. **Not Monitoring Party HP**: Party HP carries over between nodes. Monitor HP and use consumables to avoid party defeat.

7. **Overusing Freeform Actions**: Freeform actions are powerful but unpredictable. Use standard choices when available for more controlled outcomes.

8. **Ignoring Glossary Terms**: Glossary terms provide lore context. Hover over terms to understand world-building and narrative depth.

9. **Not Reviewing Run Log**: Run log tracks quest progression and consequences. Review it regularly to understand quest state.

10. **Abandoning Quests Prematurely**: Abandoned quests don't provide rewards or consequences. Complete quests when possible for full narrative impact.

11. **Not Using Quest Chains**: Quest chains provide narrative continuity. Complete quests in order for coherent story arcs.

12. **Forgetting to Save**: Quest runs are auto-saved but manually save before closing to ensure all progress is persisted.

13. **Not Testing Alternate Paths**: Quests have multiple endings. Retry quests from archive to explore alternate paths and consequences.

14. **Ignoring Party Updates**: Party stat, inventory, and relationship changes persist across quests. Monitor party state for long-term consequences.

15. **Not Generating NPC Portraits**: Quest NPCs without portraits feel incomplete. Use portrait generation for important NPCs.

### Integration with Other Tools

- **World Generator**: Provides world context, locations, and geography for quest spatial grounding
- **Game Master**: Supplies canonical world prompt, compiled context, and ambience settings for quest generation
- **History**: Factions, locations, lore, and temporality feed into quest narrative and consequences
- **Ecology**: Biomes, flora, and fauna provide environmental context and encounter variety
- **Gameplay Engine**: Combat rules, skills, items, and stats drive quest encounters and skill checks
- **Character Builder**: Party characters, NPCs, stats, inventory, and relationships are used and updated during quests
- **Events**: Quest outcomes feed into world events and faction reputation changes
- **Asset Generator**: Quest illustrations and NPC portraits are generated via Asset Generator integration
- **Gallery**: Quest runs, illustrations, and glossary entries are stored and can be synced to cloud storage
- **Job Center**: Tracks all quest generation jobs (runs, illustrations, portraits) with real-time status

### Advanced: Quest Generation System

The Quests tool uses a multi-layered generation system:

**Quest Seed Compilation:**
- **World Context**: Canonical world prompt, visual seed prompt, world name
- **Party Context**: Character names, occupations, levels, stats, relationships
- **Anchor Context**: Faction names, location names, ecology elements
- **Seed Configuration**: Premise, objective, stakes, tone, difficulty, run length, openness, target endings
- **Custom Notes**: Extra constraints, story motifs, themes

**Quest Run Generation:**
- **Opening Node**: Generated from premise and objective with party introduction
- **Branching Nodes**: Generated based on previous choices and quest openness setting
- **Combat Nodes**: Generated based on difficulty setting with enemy composition
- **Ending Nodes**: Generated based on target ending count with success/failure/neutral outcomes
- **Node Count**: Determined by run length setting (Short: 5-8, Medium: 9-12, Long: 13-16)

**Quest Progression:**
- **Choice Selection**: Player selects a choice from available options
- **Freeform Action**: Player enters custom action text for open-ended progression
- **Combat Resolution**: Player completes combat encounter with victory/defeat outcome
- **Node Advancement**: AI generates next node based on choice, freeform action, or combat resolution
- **Party Updates**: Character stats, inventory, and relationships are updated based on node consequences
- **Glossary Expansion**: New terms are added to glossary as they appear in narrative

**Quest Illustration System:**
- **Key-Beat Detection**: AI identifies major quest nodes for illustration generation
- **Illustration Prompt**: Generated from node title, narrative text, and party context
- **Illustration Generation**: AI generates image via Asset Generator integration
- **Illustration Status**: Tracked as "generating", "ready", or "failed"
- **Illustration Caching**: Illustrations are saved per-world and reused across sessions

**Quest Chain System:**
- **Chain Creation**: Quests can be linked into narrative arcs with persistent consequences
- **Chain Progression**: Completing a quest advances the chain to the next quest
- **Chain Status**: Active, completed, or paused based on quest outcomes
- **Chain Consequences**: Quest outcomes affect subsequent quests in the chain

All quest generation uses the Game Master compiled context for narrative consistency and world coherence.



</details>



<details>
<summary><b>🎨 Asset Generator</b></summary>

### Purpose & Overview

The Asset Generator is the multimodal content generation tool used to produce icons, battlemaps, world assets, game assets, ecology illustrations, sprites, songs, videos, and asset packs aligned with the project's worldbuilding and creative direction. It serves as the central asset production hub for the Ashtrail ecosystem, providing AI-driven generation of visual, audio, and video content with batch processing, style control, and cross-tool integration. The Asset Generator supports multiple asset types with specialized workflows, reference image integration, and asset pack organization for efficient content management.

### Key Features

- **Multi-Tab Interface**: 9 specialized tabs for different asset types (Icons, Battlemaps, World Assets, Game Assets, Ecology Illustrations, Sprites, Songs, Videos, Packs)
- **Batch Generation**: Generate multiple assets simultaneously with shared style and parameters
- **Icons Tab**: Generate game icons with customizable style, temperature, and batch naming
- **Battlemaps Tab**: Generate tactical combat maps with terrain, structures, and environmental features
- **World Assets Tab**: Generate world-level textures and environmental assets for planetary visualization
- **Game Assets Tab**: Generate in-game assets (buildings, terrain, structures) with gameplay properties
- **Ecology Illustrations Tab**: Generate flora and fauna illustrations for Ecology tool integration
- **Sprites Tab**: Generate directional sprite sets (human, monster, mutant, construct) with 8-direction support
- **Songs Tab**: Generate background music and ambient soundscapes with genre and style control
- **Videos Tab**: Generate cinematic video clips and cutscenes with prompt-based generation
- **Asset Packs Tab**: Organize assets into reusable packs with grouping and export functionality
- **Reference Image Support**: Upload reference images to guide generation style and content
- **Style Prompts**: Define artistic style, rendering technique, and visual direction
- **Temperature Control**: Adjust AI creativity (0.0 = literal, 1.0 = creative)
- **Batch Management**: Rename, delete, and organize batches with persistent storage
- **Selection System**: Multi-select assets for batch operations (export, pack, delete)
- **Export Functionality**: Export assets to code format for game integration
- **Job Tracking**: Real-time generation progress with Job Center integration
- **Cross-Tool Integration**: Assets feed into Character Builder, Ecology, Quests, and World Generator

### Interface Walkthrough

The Asset Generator interface is organized into 9 main tabs accessible via the top navigation:

**Main Tabs:**
1. **ICONS**: Game icon generation with batch processing
2. **BATTLEMAPS**: Tactical combat map generation
3. **WORLD ASSETS**: Planetary texture and environment generation
4. **GAME ASSETS**: In-game asset generation with gameplay properties
5. **ECOLOGY ILLUSTRATIONS**: Flora and fauna illustration generation
6. **SPRITES**: Directional sprite set generation for characters and creatures
7. **SONGS**: Background music and ambient soundscape generation
8. **VIDEOS**: Cinematic video clip generation
9. **PACKS**: Asset pack organization and management

**Common Interface Elements:**
- **Batch List**: Left sidebar showing all generated batches with thumbnails
- **Generation Panel**: Center panel with prompt input, style controls, and generation button
- **Preview Panel**: Right panel showing selected batch assets with selection controls
- **Top Bar**: Tab navigation, batch actions (rename, delete, export), and selection controls

**Icons Tab Specific:**
- **Prompt List**: Textarea for entering multiple icon prompts (one per line)
- **Batch Name**: Custom name for the generated batch
- **Style Prompt**: Artistic style and rendering direction
- **Temperature**: Creativity slider (0.0 - 1.0)
- **Reference Image**: Optional image upload for style guidance

**Sprites Tab Specific:**
- **Sprite Type**: Human, Monster, Mutant, Construct
- **Generation Mode**: Single sprite or directional set (8 directions)
- **Target Binding**: Link sprite to Character Builder character or Ecology fauna
- **Direction Preview**: Visual preview of all 8 directions

**Songs Tab Specific:**
- **Genre Selection**: Ambient, Cinematic, Electronic, Orchestral, Rock, Custom
- **Style Tags**: Mood, tempo, instrumentation descriptors
- **Duration**: Song length in seconds
- **Prompt**: Narrative description of desired music

**Videos Tab Specific:**
- **Prompt**: Scene description for video generation
- **Duration**: Video length in seconds
- **Style**: Cinematic style and visual direction

### Inputs Required

**Prerequisites:**
- Gemini API key configured in environment variables
- Recommended: Active world selected for context-aware generation
- Recommended: Ecology data for ecology illustration generation
- Recommended: Character Builder characters for sprite binding

**For Icons Tab:**
- **Prompt List**: One or more icon descriptions (one per line)
  - Example: "Rusty sword icon", "Health potion icon", "Shield icon"
- **Batch Name**: Custom name for the batch (optional, auto-generated if empty)
- **Style Prompt**: Artistic style description (e.g., "pixel art, 32x32, game icon style")
- **Temperature**: 0.0 - 1.0 (default: 0.7)
- **Reference Image**: Optional image file for style guidance

**For Battlemaps Tab:**
- **Prompt List**: One or more battlemap descriptions
  - Example: "Desert canyon with rocky outcrops", "Forest clearing with ancient ruins"
- **Batch Name**: Custom name for the batch
- **Style Prompt**: Map style and rendering (e.g., "top-down tactical map, grid overlay")
- **Temperature**: 0.0 - 1.0

**For World Assets Tab:**
- **Prompt List**: Planetary texture descriptions
  - Example: "Frozen ice world with glaciers", "Desert planet with sand dunes"
- **Category**: World texture type
- **Sub-Category**: Specific texture classification
- **Variations**: Number of variations per prompt (1-5)

**For Game Assets Tab:**
- **Asset Type**: Building or Terrain
- **Prompt**: Asset description
- **Gameplay Properties** (for buildings):
  - Natural: Is this a natural formation?
  - Passable: Can characters walk through?
  - Hidden: Is this a hidden/secret structure?
- **Gameplay Properties** (for terrain):
  - Natural: Is this natural terrain?
  - Move Efficiency: Movement cost multiplier (0.0 - 2.0)
  - Fertility: Agricultural fertility (0.0 - 1.0)

**For Ecology Illustrations Tab:**
- **Prompt List**: Flora or fauna descriptions
  - Example: "Giant mushroom with bioluminescent cap", "Six-legged predator with armored plates"
- **Biome Context**: Selected biome for ecological grounding
- **Style Prompt**: Illustration style (e.g., "scientific illustration, detailed, naturalistic")

**For Sprites Tab:**
- **Sprite Type**: Human, Monster, Mutant, Construct
- **Generation Mode**: Single or Directional Set
- **Prompt**: Character or creature description
- **Target Binding** (optional):
  - Character ID (from Character Builder)
  - Fauna ID (from Ecology)
- **Style Prompt**: Sprite art style (e.g., "pixel art, 64x64, top-down view")

**For Songs Tab:**
- **Genre**: Ambient, Cinematic, Electronic, Orchestral, Rock, Custom
- **Custom Genre** (if Custom selected): Freeform genre description
- **Style Tags**: Mood, tempo, instrumentation (e.g., "dark, slow, strings")
- **Duration**: Song length in seconds (30-300)
- **Prompt**: Narrative description of desired music

**For Videos Tab:**
- **Prompt**: Scene description for video generation
- **Duration**: Video length in seconds (5-60)
- **Style**: Cinematic style and visual direction

**For Packs Tab:**
- **Pack Name**: Name for the asset pack
- **Selected Assets**: Assets to include in the pack (from other tabs)
- **Grouping**: Organize assets by category or theme


### Outputs Generated

**Primary Outputs:**
- **Icon Batches**: PNG images with transparent backgrounds (256x256 or 512x512)
- **Battlemap Batches**: High-resolution tactical maps (1024x1024 or 2048x2048)
- **World Asset Batches**: Planetary textures and environment assets
- **Game Asset Batches**: In-game assets with gameplay metadata (JSON)
- **Ecology Illustration Batches**: Flora and fauna illustrations with species metadata
- **Sprite Batches**: Directional sprite sets with 8-direction frames (64x64 or 128x128)
- **Song Batches**: Audio files (MP3 or WAV) with metadata
- **Video Batches**: Video files (MP4) with metadata
- **Asset Packs**: Organized collections of assets with manifest files

**Saved Files:**
- `generated/icons/{batchId}/`: Icon batch folder with individual PNG files
- `generated/textures/{batchId}/`: Texture batch folder with PNG files
- `generated/sprites/{batchId}/`: Sprite batch folder with directional frames
- `generated/media-audio/{batchId}/`: Audio batch folder with audio files
- `generated/media-video/{batchId}/`: Video batch folder with video files
- `generated/packs/{packId}/`: Asset pack folder with manifest and references

**Integration Outputs:**
- **To Character Builder**: Sprites can be bound to characters for exploration
- **To Ecology**: Illustrations can be linked to flora and fauna entries
- **To Quests**: Assets can be used in quest illustrations and scenes
- **To World Generator**: World assets can be used for planetary textures
- **To Gallery**: All generated assets are automatically indexed in Gallery

### Step-by-Step Usage

#### Step 1: Generate Icons

1. **Navigate to the ICONS tab**
2. **Enter icon prompts** in the textarea (one per line):
   - Example: "Rusty sword icon"
   - Example: "Health potion with red liquid"
   - Example: "Wooden shield with metal rim"
3. **Configure generation settings**:
   - **Batch Name**: Enter custom name or leave empty for auto-generation
   - **Style Prompt**: Enter artistic style (e.g., "pixel art, 32x32, game icon, flat colors")
   - **Temperature**: Adjust creativity slider (0.7 is default)
4. **Optional: Upload reference image** for style guidance
5. **Click "GENERATE"** button
6. **Wait for generation** (30-90 seconds depending on batch size)
7. **Review generated icons** in the preview panel
8. **Select icons** for export or pack creation
9. **Batch is automatically saved** to local storage

#### Step 2: Generate Directional Sprites

1. **Navigate to the SPRITES tab**
2. **Select sprite type**: Human, Monster, Mutant, or Construct
3. **Select generation mode**: Directional Set (8 directions)
4. **Enter sprite prompt**:
   - Example: "Armored knight with sword and shield"
   - Example: "Six-legged alien creature with carapace"
5. **Configure style prompt**: "pixel art, 64x64, top-down view, 8 directions"
6. **Optional: Bind to target**:
   - Select Character Builder character ID
   - Or select Ecology fauna ID
7. **Click "GENERATE"**
8. **Wait for generation** (60-120 seconds for 8 directions)
9. **Review all 8 directions** in preview panel
10. **Sprite is automatically bound** to target if specified

#### Step 3: Generate Background Music

1. **Navigate to the SONGS tab**
2. **Select genre**: Ambient, Cinematic, Electronic, Orchestral, Rock, or Custom
3. **Enter style tags**: "dark, slow, strings, atmospheric"
4. **Set duration**: 60-180 seconds recommended
5. **Enter prompt**: "Tense exploration music for a desolate wasteland"
6. **Click "GENERATE"**
7. **Wait for generation** (90-180 seconds)
8. **Audio player appears** when generation completes
9. **Play audio** to review
10. **Song is saved** to media-audio folder

#### Step 4: Create Asset Pack

1. **Generate assets** in multiple tabs (icons, sprites, textures)
2. **Navigate to the PACKS tab**
3. **Click "CREATE NEW PACK"**
4. **Enter pack name**: "Desert Environment Pack"
5. **Return to asset tabs** and select assets to include
6. **Click "ADD TO PACK"** button
7. **Select target pack** from dropdown
8. **Assets are added** to pack manifest
9. **Pack is saved** with references to all included assets

### Best Practices

1. **Use Consistent Style Prompts**: Keep style prompts consistent across batches for visual coherence
2. **Reference Images Work Best**: Upload reference images for more controlled style guidance
3. **Batch Similar Assets**: Generate related assets in the same batch for efficiency
4. **Test Temperature Settings**: Lower temperature (0.3-0.5) for literal results, higher (0.7-0.9) for creative variations
5. **Organize with Packs**: Use asset packs to organize related assets by theme or use case
6. **Bind Sprites Early**: Bind sprites to characters/fauna during generation for automatic integration
7. **Review Before Exporting**: Always review generated assets before exporting to code
8. **Use Descriptive Batch Names**: Name batches clearly for easy identification later
9. **Generate Variations**: Use variation count for textures to get multiple options
10. **Monitor Job Center**: Check Job Center for generation progress and errors

### Common Pitfalls

1. **Vague Prompts**: Generic prompts produce generic results. Be specific and descriptive
2. **Inconsistent Styles**: Mixing art styles across batches creates visual inconsistency
3. **Skipping Reference Images**: Reference images significantly improve style consistency
4. **Not Binding Sprites**: Forgetting to bind sprites requires manual integration later
5. **Overusing High Temperature**: Temperature > 0.9 can produce unpredictable results
6. **Not Organizing Packs**: Unorganized assets become hard to manage at scale
7. **Ignoring Generation Errors**: Check Job Center for failed generations and error messages
8. **Not Testing Audio**: Always play generated audio before using in game
9. **Forgetting Batch Names**: Auto-generated names are hard to identify later
10. **Not Reviewing Sprites**: Always check all 8 directions for sprite consistency

### Integration with Other Tools

- **Character Builder**: Sprites can be bound to characters for exploration visualization
- **Ecology**: Illustrations can be linked to flora and fauna entries for species visualization
- **Quests**: Assets can be used in quest illustrations and key-beat scenes
- **World Generator**: World assets can be used for planetary texture refinement
- **Gallery**: All generated assets are automatically indexed and browsable in Gallery
- **Job Center**: All generation jobs are tracked with real-time status and error reporting

### Advanced: Sprite Binding System

Sprites can be automatically bound to Character Builder characters or Ecology fauna:

**Character Binding:**
- Select character ID during sprite generation
- Sprite is automatically saved to character's `explorationSprite` field
- Character uses sprite for world exploration visualization
- Binding persists across sessions

**Fauna Binding:**
- Select fauna ID during sprite generation
- Sprite is automatically saved to fauna's sprite metadata
- Fauna uses sprite for ecology visualization and encounters
- Binding persists across sessions

**Manual Binding:**
- Navigate to Character Builder or Ecology
- Select character or fauna entry
- Click "Link Sprite" button
- Select sprite batch and direction
- Binding is saved automatically



</details>



<details>
<summary><b>🖼️ Gallery</b></summary>

### Purpose & Overview

The Gallery is the centralized content archive used to collect, browse, inspect, and synchronize all generated outputs across the production pipeline, including planets, textures, icons, characters, songs, videos, and isolated world assets. It serves as the visual content management system for the Ashtrail ecosystem, providing organized browsing, cloud synchronization via Supabase, and cross-tool navigation. The Gallery's Isolated section is specifically designed to organize world-derived regional outputs into separated territorial layers such as kingdoms, duchies, provinces, and counties for easier review and reuse.

### Key Features

- **Multi-Tab Organization**: Separate tabs for Planets, Textures, Icons, Characters, Songs, Videos, and Isolated regions
- **Visual Browsing**: Grid-based thumbnail view with hover previews and metadata
- **Cloud Synchronization**: Supabase integration for cloud backup and team collaboration
- **Supabase Health Check**: Real-time status of cloud storage configuration and connectivity
- **Upload/Download**: Bidirectional sync between local storage and cloud storage
- **Isolated Regions**: Organize world-derived regional outputs by territorial hierarchy
- **Search and Filter**: Find assets by name, type, world, or metadata
- **Asset Preview**: Full-size preview with metadata display
- **Delete Functionality**: Remove assets from local and cloud storage
- **Cross-Tool Navigation**: Quick links to open assets in their source tools
- **Sync Statistics**: Track uploaded, downloaded, skipped, and failed items
- **World-Scoped Organization**: Assets are organized by world for easy management
- **Automatic Indexing**: All generated assets are automatically added to Gallery inventory

### Interface Walkthrough

The Gallery interface is organized into multiple tabs accessible via the top navigation:

**Main Tabs:**
1. **PLANETS**: All generated worlds from World Generator
2. **TEXTURES**: All texture batches from Asset Generator
3. **ICONS**: All icon batches from Asset Generator
4. **CHARACTERS**: All character portraits from Character Builder
5. **SONGS**: All audio clips from Asset Generator
6. **VIDEOS**: All video clips from Asset Generator
7. **ISOLATED**: World-derived regional outputs organized by territory

**Common Interface Elements:**
- **Tab Navigation**: Top bar with tab selector
- **World Filter**: Filter assets by world
- **Search Bar**: Search assets by name or metadata
- **Grid View**: Thumbnail grid with asset previews
- **Sync Button**: Trigger cloud synchronization
- **Supabase Status**: Health indicator for cloud storage

**Supabase Panel:**
- **Configuration Status**: Shows if Supabase is configured
- **Reachability Status**: Shows if Supabase is reachable
- **Sync Button**: Trigger bidirectional sync
- **Sync Results**: Display upload/download statistics
- **Error Messages**: Show sync errors and warnings

**Asset Cards:**
- **Thumbnail**: Visual preview of asset
- **Name**: Asset name or auto-generated ID
- **Metadata**: World, type, creation date
- **Actions**: View, Delete, Open in Tool
- **Sync Status**: Local only, Cloud only, or Synced

### Inputs Required

**Prerequisites:**
- Assets generated via World Generator, Asset Generator, Character Builder, or other tools
- Optional: Supabase bucket configured for cloud synchronization

**For Cloud Synchronization:**
- **Supabase URL**: Supabase project URL in environment variables
- **Supabase Key**: Supabase anon key in environment variables
- **Bucket Name**: Supabase storage bucket name (default: "ashtrail-assets")

**For Asset Browsing:**
- **World Filter**: Select world to filter assets (optional)
- **Search Query**: Enter search term to filter assets (optional)

**For Asset Management:**
- **Asset Selection**: Click on asset card to select
- **Delete Confirmation**: Confirm deletion when prompted

### Outputs Generated

**Primary Outputs:**
- **Gallery Inventory**: JSON manifest of all indexed assets
- **Sync Reports**: Upload/download statistics and error logs
- **Cloud Metadata**: Supabase storage metadata for synced assets

**Saved Files:**
- Gallery inventory is dynamically generated from existing asset folders
- No additional files are created by Gallery itself
- Cloud sync creates copies in Supabase storage bucket

**Integration Outputs:**
- **From World Generator**: Planets, textures, provinces, isolated regions
- **From Asset Generator**: Icons, textures, sprites, songs, videos
- **From Character Builder**: Character portraits
- **From Quests**: Quest illustrations
- **To Supabase**: All assets can be synced to cloud storage

### Step-by-Step Usage

#### Step 1: Browse Gallery Assets

1. **Launch the Gallery** from the dev-tools dashboard
2. **Select a tab** to browse specific asset type:
   - PLANETS: View all generated worlds
   - TEXTURES: View all texture batches
   - ICONS: View all icon batches
   - CHARACTERS: View all character portraits
   - SONGS: View all audio clips
   - VIDEOS: View all video clips
   - ISOLATED: View world-derived regional outputs
3. **Assets are displayed** in grid view with thumbnails
4. **Hover over asset** to see full preview
5. **Click on asset** to open full-size preview with metadata
6. **Use world filter** to show assets from specific world
7. **Use search bar** to find assets by name

#### Step 2: Configure Supabase (Optional)

1. **Create Supabase project** at https://supabase.com
2. **Create storage bucket** named "ashtrail-assets"
3. **Set bucket to public** for read access
4. **Copy project URL** and anon key
5. **Add to environment variables**:
   ```env
   SUPABASE_URL=your_project_url
   SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_BUCKET=ashtrail-assets
   ```
6. **Restart dev-tools backend**
7. **Gallery will show Supabase status** in top panel
8. **Green status** indicates successful configuration

#### Step 3: Sync to Cloud Storage

1. **Ensure Supabase is configured** (see Step 2)
2. **Click "SYNC TO CLOUD"** button in Gallery
3. **Sync process begins**:
   - Uploads local assets not in cloud
   - Downloads cloud assets not in local
   - Skips assets that are already synced
4. **Wait for sync to complete** (time depends on asset count)
5. **Sync results are displayed**:
   - Uploaded: X assets
   - Downloaded: Y assets
   - Skipped: Z assets
   - Failed: W assets
6. **Review errors** if any failures occurred
7. **Assets are now backed up** to cloud storage

#### Step 4: Browse Isolated Regions

1. **Navigate to the ISOLATED tab**
2. **Isolated regions are organized** by territorial hierarchy:
   - Kingdoms
   - Duchies
   - Provinces
   - Counties
3. **Each region shows**:
   - Region name
   - Parent region
   - Texture preview
   - Metadata (size, biome, etc.)
4. **Click on region** to view full details
5. **Use "Open in World Generator"** to edit region
6. **Isolated regions are useful** for focused regional development

#### Step 5: Delete Assets

1. **Navigate to asset tab** (e.g., ICONS)
2. **Click on asset** to select
3. **Click "DELETE"** button
4. **Confirm deletion** in modal dialog
5. **Asset is removed** from local storage
6. **If synced to cloud**, asset is also removed from Supabase
7. **Deletion is permanent** and cannot be undone

### Best Practices

1. **Sync Regularly**: Sync to cloud storage frequently to prevent data loss
2. **Use World Filter**: Filter by world to focus on specific project assets
3. **Organize Isolated Regions**: Use isolated regions for focused regional development
4. **Review Sync Errors**: Check sync error messages and resolve issues
5. **Backup Before Deleting**: Ensure assets are synced to cloud before deleting locally
6. **Use Search**: Search by name to quickly find specific assets
7. **Monitor Supabase Status**: Check Supabase health indicator regularly
8. **Clean Up Unused Assets**: Delete unused assets to save storage space
9. **Use Descriptive Names**: Name assets clearly for easy identification in Gallery
10. **Test Cloud Access**: Verify Supabase bucket permissions are correct

### Common Pitfalls

1. **Not Configuring Supabase**: Cloud sync requires Supabase configuration
2. **Incorrect Bucket Permissions**: Bucket must be public for read access
3. **Deleting Without Backup**: Deleted assets cannot be recovered without cloud backup
4. **Ignoring Sync Errors**: Sync errors indicate configuration or connectivity issues
5. **Not Using World Filter**: Browsing all assets at once can be overwhelming
6. **Forgetting to Sync**: Local assets are not backed up until synced to cloud
7. **Incorrect Environment Variables**: Supabase URL and key must be correct
8. **Not Restarting Backend**: Environment variable changes require backend restart
9. **Overwriting Cloud Assets**: Sync can overwrite cloud assets with local versions
10. **Not Monitoring Storage**: Supabase free tier has storage limits

### Integration with Other Tools

- **World Generator**: Planets, textures, provinces, and isolated regions are automatically indexed
- **Asset Generator**: All generated assets (icons, textures, sprites, songs, videos) are automatically indexed
- **Character Builder**: Character portraits are automatically indexed
- **Quests**: Quest illustrations are automatically indexed
- **Supabase**: Cloud storage for backup and team collaboration
- **Job Center**: Asset generation jobs are tracked and linked to Gallery assets

### Advanced: Supabase Sync Logic

The Gallery uses bidirectional sync with conflict resolution:

**Upload Logic:**
- Local assets not in cloud are uploaded
- Local assets newer than cloud are uploaded (overwrites cloud)
- Upload failures are logged and reported

**Download Logic:**
- Cloud assets not in local are downloaded
- Cloud assets newer than local are downloaded (overwrites local)
- Download failures are logged and reported

**Skip Logic:**
- Assets with matching timestamps are skipped
- Assets with matching hashes are skipped (if hash metadata available)

**Conflict Resolution:**
- Newest timestamp wins (based on file modification time)
- Manual conflict resolution is not supported (automatic only)



</details>


<details>
<summary><b>🏢 Job Center</b></summary>

### Purpose & Overview

The Job Center is the centralized generation tracking and connectivity hub used to monitor all current and past generation jobs across the entire dev-tools ecosystem. It provides real-time status updates, historical logs, cross-tool integration, and debugging capabilities for seamless workflow orchestration. The Job Center organizes jobs into families with hierarchical relationships, tracks job modalities (text, image, audio, video), and provides detailed inspection of job inputs, outputs, and execution stages. It serves as the operational monitoring system for all AI-driven generation tasks across World Generator, Asset Generator, Character Builder, Quests, History, Ecology, and Game Master.

### Key Features

- **Job Family Organization**: Groups related jobs into hierarchical families with parent-child relationships
- **Real-Time Status Tracking**: Monitor running, queued, completed, failed, and cancelled jobs
- **Dual-Tab Interface**: Overview tab for job families, Tools tab for tool usage analytics
- **Scope Filtering**: Filter by All, Running, or History jobs
- **Multi-Dimensional Filtering**: Filter by tool, status, world, modality, and search query
- **Job Timeline**: Chronological view of all job stages and transitions
- **Job Hierarchy**: Visual tree of parent and child jobs with dependencies
- **Output References**: Quick links to open job outputs in their source tools
- **Job Detail Inspection**: View full job configuration, inputs, and results
- **Tool Usage Analytics**: Track tool availability, usage count, active jobs, and unused tools
- **Technical Categories**: Organize tools by technical function (AI, Storage, Compute, etc.)
- **Product Areas**: Organize tools by product domain (World, Character, Quest, etc.)
- **Job Cancellation**: Cancel running or queued jobs
- **Job Retry**: Retry failed jobs with same configuration
- **Cross-Tool Navigation**: Jump directly to job outputs in their source tools
- **Modality Tracking**: Track text, image, audio, and video generation jobs
- **World-Scoped Jobs**: Filter jobs by world for focused project monitoring
- **Search Functionality**: Search jobs by name, tool, or metadata

### Interface Walkthrough

The Job Center interface is organized into two main tabs accessible via the top navigation:

**Main Tabs:**
1. **OVERVIEW**: Job family browser with filtering, timeline, and detail inspection
2. **TOOLS**: Tool usage analytics with technical and product categorization

**Overview Tab Layout:**
- **Top Bar**: Scope filters (All, Running, History) with job counts
- **Filter Row**: Search, Tool, Status, World, and Modality filters
- **Left Panel**: Job family list with expandable hierarchies
- **Center Panel**: Job timeline with chronological events
- **Right Panel**: Job detail with inputs, outputs, and metadata

**Tools Tab Layout:**
- **Top Bar**: Tool group mode (Technical, Product) and usage filters
- **Filter Row**: Search and category filters
- **Grid View**: Tool cards with usage statistics and job counts
- **Tool Detail**: Expandable detail with recent jobs and outputs

**Job Family Card:**
- **Family Name**: Auto-generated or custom name
- **Tool Badge**: Source tool identifier
- **Status Badge**: Current status (running, completed, failed, etc.)
- **Modality Badges**: Text, image, audio, video indicators
- **World Badge**: Associated world name
- **Timestamp**: Relative time (e.g., "2 minutes ago")
- **Expand Button**: Toggle hierarchy view

**Job Timeline Event:**
- **Event Title**: Job stage or action name
- **Status Indicator**: Color-coded status badge
- **Timestamp**: Relative time
- **Output Links**: Quick access to job outputs
- **Selection Indicator**: Highlight selected job

**Job Detail Panel:**
- **Job ID**: Unique identifier
- **Tool**: Source tool name
- **Status**: Current status with color coding
- **World**: Associated world name
- **Modalities**: Text, image, audio, video badges
- **Created**: Absolute timestamp
- **Duration**: Execution time
- **Inputs**: Job configuration and parameters
- **Outputs**: Generated artifacts with preview
- **Actions**: Cancel, Retry, Open Output buttons

**Tool Card:**
- **Tool Name**: Display name
- **Tool ID**: Technical identifier
- **Category Badges**: Technical and product categories
- **Usage Stats**: Total jobs, active jobs, success rate
- **Availability**: Available or unavailable indicator
- **Recent Jobs**: List of recent job families
- **View Jobs Button**: Jump to Overview filtered by tool

### Inputs Required

**Prerequisites:**
- Jobs generated via any dev-tool (World Generator, Asset Generator, Character Builder, etc.)
- Backend server running for job tracking

**For Overview Tab:**
- **Scope**: All, Running, or History
- **Search Query**: Optional text search
- **Tool Filter**: Optional tool identifier
- **Status Filter**: Optional status (running, completed, failed, etc.)
- **World Filter**: Optional world identifier
- **Modality Filter**: Optional modality (text, image, audio, video)

**For Tools Tab:**
- **Group Mode**: Technical or Product
- **Search Query**: Optional text search
- **Technical Category**: Optional technical category filter
- **Product Area**: Optional product area filter
- **Usage Status**: All, Available, Used, Active, Unused

**For Job Actions:**
- **Cancel Job**: Requires running or queued job
- **Retry Job**: Requires failed or completed job
- **Open Output**: Requires job with output references

### Outputs Generated

**Primary Outputs:**
- **Job Status Updates**: Real-time status changes for all jobs
- **Job Families**: Hierarchical groupings of related jobs
- **Job Timeline**: Chronological event log for each family
- **Tool Analytics**: Usage statistics and availability tracking
- **Job Details**: Full job configuration and results

**No Files Created:**
- Job Center is a monitoring tool and does not create files
- All job data is stored in backend database
- Job outputs are created by source tools (World Generator, Asset Generator, etc.)

**Integration Outputs:**
- **To All Tools**: Job status updates feed back to source tools
- **From All Tools**: All generation jobs are tracked in Job Center
- **Cross-Tool Navigation**: Quick links to open outputs in source tools

### Step-by-Step Usage

#### Step 1: Browse Job Families (Overview Tab)

1. **Launch the Job Center** from the dev-tools dashboard
2. **Overview tab is active** by default
3. **Job families are displayed** in left panel:
   - Each family represents a related group of jobs
   - Families show tool, status, modalities, and world
   - Timestamp shows relative time (e.g., "5 minutes ago")
4. **Use scope filters** to narrow view:
   - **All**: Show all job families
   - **Running**: Show only active jobs
   - **History**: Show only completed jobs
5. **Job counts** are displayed on scope buttons
6. **Click on a family** to view details
7. **Selected family** is highlighted in left panel
8. **Timeline appears** in center panel
9. **Detail panel appears** in right panel

#### Step 2: Filter Jobs

1. **Use search bar** to find jobs by name or metadata
2. **Select tool filter** to show jobs from specific tool:
   - Dropdown shows all tools that have generated jobs
   - Select "all" to clear filter
3. **Select status filter** to show jobs with specific status:
   - running, completed, failed, cancelled, queued
4. **Select world filter** to show jobs from specific world:
   - Dropdown shows all worlds with jobs
   - Select "all" to clear filter
5. **Select modality filter** to show jobs with specific modality:
   - text, image, audio, video
   - Select "all" to clear filter
6. **Filters are cumulative** and update results in real-time
7. **Clear all filters** by selecting "all" in each dropdown

#### Step 3: Inspect Job Timeline

1. **Select a job family** from left panel
2. **Timeline appears** in center panel with chronological events
3. **Each event shows**:
   - Event title (job stage or action)
   - Status badge (color-coded)
   - Relative timestamp
   - Output links (if available)
4. **Click on an event** to view full details in right panel
5. **Selected event** is highlighted in timeline
6. **Timeline scrolls** to show all events
7. **Events are ordered** from oldest to newest

#### Step 4: View Job Details

1. **Select a job** from timeline or family list
2. **Detail panel appears** in right panel
3. **Job metadata is displayed**:
   - Job ID, Tool, Status, World
   - Modalities (text, image, audio, video)
   - Created timestamp, Duration
4. **Inputs section** shows job configuration:
   - Prompt, parameters, settings
   - Reference data (world, characters, etc.)
5. **Outputs section** shows generated artifacts:
   - Output references with labels
   - Preview images (if available)
   - Quick links to open in source tools
6. **Actions section** shows available actions:
   - Cancel (for running jobs)
   - Retry (for failed jobs)
   - Open Output (for completed jobs)

#### Step 5: Open Job Outputs

1. **Select a job** with outputs
2. **Outputs section** shows available artifacts
3. **Click "Open Output"** button next to an output
4. **Output opens** in source tool:
   - World Generator: Opens world in GEO stage
   - Asset Generator: Opens batch in relevant tab
   - Character Builder: Opens character detail
   - Quests: Opens quest run
5. **Or click output link** in timeline event
6. **Job Center remains open** for continued monitoring

#### Step 6: Cancel Running Jobs

1. **Select a running job** from timeline
2. **Click "Cancel"** button in detail panel
3. **Confirm cancellation** in modal dialog
4. **Job status changes** to "cancelled"
5. **Job stops executing** immediately
6. **Partial outputs** may be available
7. **Cancelled jobs** remain in history

#### Step 7: Retry Failed Jobs

1. **Select a failed job** from timeline
2. **Click "Retry"** button in detail panel
3. **Job is resubmitted** with same configuration
4. **New job is created** in same family
5. **Timeline updates** with new job event
6. **Monitor new job** in real-time
7. **Original failed job** remains in history

#### Step 8: Explore Tool Usage (Tools Tab)

1. **Click "Tools" tab** in top navigation
2. **Tool cards are displayed** in grid view
3. **Each tool card shows**:
   - Tool name and ID
   - Category badges (technical, product)
   - Usage statistics (total jobs, active jobs)
   - Availability status
   - Recent job families
4. **Use group mode** to organize tools:
   - **Technical**: Group by technical category (AI, Storage, etc.)
   - **Product**: Group by product area (World, Character, etc.)
5. **Use filters** to narrow tool list:
   - Search by tool name
   - Filter by technical category
   - Filter by product area
   - Filter by usage status (all, available, used, active, unused)

#### Step 9: View Tool Details

1. **Click on a tool card** to expand details
2. **Tool detail shows**:
   - Full tool description
   - Technical and product categories
   - Total jobs, active jobs, success rate
   - Recent job families with timestamps
3. **Click "View Jobs"** to jump to Overview filtered by tool
4. **Recent jobs** are clickable to view details
5. **Tool detail collapses** when clicking another tool

#### Step 10: Monitor Active Jobs

1. **Use "Running" scope filter** to show only active jobs
2. **Active jobs update** in real-time
3. **Status badges** change as jobs progress
4. **Timeline events** appear as jobs advance
5. **Refresh button** manually updates job list
6. **Auto-refresh** occurs every 10 seconds
7. **Notifications** appear for job completions (if enabled)

### Best Practices

1. **Monitor Long-Running Jobs**: Use Running scope to track active generation tasks
2. **Use Tool Filter**: Filter by tool to focus on specific generation workflows
3. **Check Failed Jobs**: Review failed jobs to identify configuration issues
4. **Retry with Adjustments**: If a job fails, adjust parameters before retrying
5. **Use World Filter**: Filter by world to focus on specific project jobs
6. **Search for Specific Jobs**: Use search to quickly find jobs by name or metadata
7. **Review Job Inputs**: Check job inputs to understand generation configuration
8. **Open Outputs Directly**: Use output links to jump to results in source tools
9. **Cancel Stuck Jobs**: Cancel jobs that are taking too long or producing errors
10. **Track Tool Usage**: Use Tools tab to identify unused or underutilized tools
11. **Monitor Modalities**: Filter by modality to track specific content types
12. **Review Job Timeline**: Use timeline to understand job progression and stages
13. **Check Job Duration**: Monitor duration to identify performance bottlenecks
14. **Use Technical Categories**: Group tools by technical function for debugging
15. **Use Product Areas**: Group tools by product domain for workflow optimization

### Common Pitfalls

1. **Not Checking Failed Jobs**: Failed jobs contain error messages that help debug issues
2. **Cancelling Jobs Too Early**: Some jobs take time; wait before cancelling
3. **Retrying Without Changes**: Retrying failed jobs without adjusting parameters repeats failures
4. **Ignoring Job Inputs**: Job inputs show configuration; review before retrying
5. **Not Using Filters**: Browsing all jobs at once can be overwhelming
6. **Missing Output Links**: Output links provide quick access to results
7. **Not Monitoring Active Jobs**: Active jobs may fail silently without monitoring
8. **Forgetting World Context**: Jobs are world-scoped; filter by world for clarity
9. **Not Using Tool Analytics**: Tool usage data helps optimize workflows
10. **Ignoring Job Duration**: Long durations indicate performance issues or configuration problems

### Integration with Other Tools

- **World Generator**: All planet, geography, ecology, and humanity generation jobs are tracked
- **Asset Generator**: All icon, texture, sprite, song, and video generation jobs are tracked
- **Character Builder**: All character, portrait, and batch generation jobs are tracked
- **Quests**: All quest run, illustration, and portrait generation jobs are tracked
- **History**: All lore, faction, character, and location generation jobs are tracked
- **Ecology**: All flora, fauna, and biome generation jobs are tracked
- **Game Master**: All world prompt generation jobs are tracked
- **Gallery**: Job outputs are linked to Gallery assets for easy access
- **All Tools**: Job Center provides universal monitoring for all dev-tools generation tasks

### Advanced: Job Family System

The Job Center organizes jobs into families with hierarchical relationships:

**Family Structure:**
- **Parent Job**: The root job that initiates a generation workflow
- **Child Jobs**: Dependent jobs spawned by the parent (e.g., sub-tasks, refinements)
- **Sibling Jobs**: Jobs at the same hierarchy level (e.g., parallel generations)

**Family Grouping Logic:**
- Jobs with the same `familyId` are grouped together
- Jobs without `familyId` are treated as standalone families
- Parent-child relationships are determined by `parentJobId` field
- Families inherit world context from parent job

**Family Timeline:**
- Timeline shows all jobs in chronological order
- Events include job creation, status changes, and completions
- Timeline provides unified view of entire generation workflow

**Family Status:**
- **Running**: At least one job in family is active
- **Completed**: All jobs in family are completed
- **Failed**: At least one job in family failed
- **Cancelled**: At least one job in family was cancelled

**Family Modalities:**
- Families track all modalities used across jobs
- Modalities include text, image, audio, video
- Multiple modalities indicate multimodal generation workflows

All job families are persisted in backend database and remain accessible in history for debugging and workflow analysis.



</details>


---

## � Troubleshooting

**Common Issues:**

1. **"No active world selected"**
   - Solution: Generate a world in World Generator and select it from history picker

2. **"Gemini API key not configured"**
   - Solution: Add `GEMINI_API_KEY` to `.env.local` and restart backend

3. **"Generation failed: timeout"**
   - Solution: Reduce resolution, complexity, or batch size and retry

4. **"Supabase sync failed"**
   - Solution: Check Supabase URL, key, and bucket configuration

5. **"Job stuck in running state"**
   - Solution: Cancel job in Job Center and retry with adjusted parameters

6. **"Character portraits not generating"**
   - Solution: Ensure world is selected and character has valid appearance data

7. **"Quest generation blocked"**
   - Solution: Configure Game Master canonical world prompt first

8. **"Ecology sync failed"**
   - Solution: Generate world biomes in World Generator before syncing to Ecology

9. **"Sprite binding failed"**
   - Solution: Ensure character or fauna exists before binding sprite

10. **"Gallery assets not appearing"**
    - Solution: Refresh Gallery or check that assets were generated successfully

---

## 📖 Glossary

**Technical Terms:**

- **Anchor**: A reference point (faction, location, or ecology element) used to ground quest generation in world context
- **Artifact**: The final output of a generation job (image, audio, video, or text)
- **Batch**: A group of related assets generated together with shared style and parameters
- **Binding**: The process of linking a sprite to a character or fauna entity for automatic integration
- **Family**: A hierarchical group of related jobs with parent-child relationships tracked in Job Center
- **Job**: A single generation task tracked by the Job Center with status, inputs, and outputs
- **Manifest**: A JSON file containing metadata and references for a batch of generated assets
- **Modality**: The type of content being generated (text, image, audio, video)
- **Node**: A single step or event in a quest run or job timeline
- **Pack**: An organized collection of assets grouped by theme or use case
- **Prompt Block**: The compiled context fed to AI models, including world prompt, lore, and directives
- **Seed**: The initial configuration and parameters used to generate content
- **Snippet**: A granular piece of lore with priority level (critical, major, minor) used by Game Master
- **Sprite**: A visual representation of a character or creature, often with directional frames
- **Temperature**: AI creativity parameter (0.0 = literal, 1.0 = creative)

**Game Concepts:**

- **Biome**: An environmental zone with specific climate, terrain, and ecological characteristics
- **Canon**: The official, established narrative and world state maintained by Game Master
- **County**: The smallest territorial division in the world hierarchy
- **Duchy**: A mid-level territorial division containing multiple provinces
- **Faction**: An organized group with goals, relationships, and influence in the world
- **Fauna**: Animal or creature species in the world's ecology system
- **Flora**: Plant species in the world's ecology system
- **Humanity Layer**: The civilization and settlement data generated on top of geography
- **Isolated Region**: A world-derived regional output organized by territorial hierarchy
- **Kingdom**: The largest territorial division in the world hierarchy
- **Lore**: Narrative content and world-building information stored in History
- **Province**: A territorial division within a duchy
- **Quest Chain**: A series of connected quests with persistent consequences
- **Temporality**: The custom calendar and time system for the world
- **World**: A complete planetary environment with geography, ecology, and civilization

---

## 🤝 Contribution & Feedback

We welcome contributions and feedback to improve the Ashtrail Dev-Tools!

**Repository:**
- GitHub: [https://github.com/Zacxxx/ashtrail](https://github.com/Zacxxx/ashtrail)
- Fork the repository, make your changes, and submit a pull request
- Please follow the existing code style and include tests for new features

**Report Issues:**
- GitHub Issues: [https://github.com/Zacxxx/ashtrail/issues](https://github.com/Zacxxx/ashtrail/issues)
- Email: founders@moebius.quest
- Include detailed steps to reproduce, expected behavior, and actual behavior

**Provide Feedback on Tools:**
- Share your experience using the dev-tools
- Suggest new features or improvements
- Report usability issues or confusing workflows
- Email: founders@moebius.quest

**License:**
- This project is licensed under the MIT License
- See the [LICENSE](LICENSE) file in the repository for full details

---

**Last Updated:** March 16, 2026

**Happy worldbuilding!**
