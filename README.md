  # Ashtrail

  <p align="center">
    <img src="https://i.imgur.com/uo6jpcP.jpeg" alt="Ashtrail hero image" width="920" />
  </p>

  <p align="center">
    <b>An AI-orchestrated multimodal game storytelling agent built for the <a href="https://geminiliveagentchallenge.devpost.com/">Gemini Live Agent Challenge</a>.</b><br/>
    <i>Multimodal, stateful, procedural storytelling with interleaved narrative + image synthesis.</i>
  </p>

  <p align="center">
    <a href="#-quickstart"><img alt="Quickstart" src="https://img.shields.io/badge/Quickstart-bun-000000?logo=bun&logoColor=white"></a>
    <a href="https://geminiliveagentchallenge.devpost.com/"><img alt="Gold Track" src="https://img.shields.io/badge/Track-Creative%20Storyteller-4c1d95"></a>
    <img alt="Mode" src="https://img.shields.io/badge/Mode-Real--time%20GM-0f766e">
    <img alt="Status" src="https://img.shields.io/badge/Status-Prototype-f59e0b">
  </p>

  <p align="center">
    <a href="https://bun.sh"><img alt="Built with Bun" src="https://img.shields.io/badge/Built%20with-Bun-000000?logo=bun&logoColor=white"></a>
    <img alt="React" src="https://img.shields.io/badge/Frontend-React%2019-61DAFB?logo=react&logoColor=black">
    <img alt="Tailwind" src="https://img.shields.io/badge/Styling-Tailwind%204-06B6D4?logo=tailwindcss&logoColor=white">
  </p>

  ---

  ## 🌌 The Concept

  **Ashtrail is an AI-orchestrated multimodal game storytelling agent** that enhances developer creativity and delivers end-to-end player experiences through synchronized generation of visuals, lore, music, and game design.

  We built Ashtrail as an agentic, multimodal game storytelling system, and paired it with dedicated dev-tools to **demonstrate the practical capabilities of the Gemini SDK** in this setting. To make those capabilities tangible, **we also created video game assets and interactive surfaces that showcase synchronized AI-driven generation across the player and developer experience**.

### 🎭 What Ashtrail Demonstrates

- **AI-orchestrated creation** across storytelling, asset generation, and game design.
- **Synchronized multimodal outputs** spanning visuals, lore, music, and interactive content.
- **Dedicated dev-tools** for prototyping worlds, characters, quests, ecosystems, and audiovisual assets.
- **A playable showcase** that exposes these capabilities through a cinematic and interactive player experience.

  ---

  ## 🏗 Architecture

  Ashtrail is built as a **Bun Monorepo** for unified type safety and rapid development.

  ```mermaid
  graph TD
      subgraph Applications
          W[website] -- "Main Client" --> C
          D[dev-tools] -- "Map/Asset Gen" --> C
          S[server] -- "Simulation / AI GM" --> C
      end

      subgraph Packages
          C[core] -- "Models/Logic" --> U
          U[ui] -- "Atomic Design System" --> W & D
      end

      S -- "Gemini API" --> Gemini[Gemini 1.5 Pro/Flash]
      W -- "Rendering" --> UI[React 19 / Tailwind 4]
  ```

  ### Modular Design

  - **`apps/website`**: The player-facing portal. Hosts the immersive survival and storytelling experience.
  - **`apps/server`**: The orchestration layer. Handles deterministic simulation, procedural state, and AI-driven runtime logic.
  - **`apps/dev-tools`**: Developer-facing tools for world generation, asset creation, prototyping, and the cinematic landing.
  - **`packages/ui`**: A strict Design-System-first library using Tailwind CSS.
  - **`packages/core`**: Shared schemas and game logic ensure consistency between client and server.

  ---

  ## ⚡ Quickstart

  Ashtrail requires:

  - [Bun](https://bun.sh) for the monorepo/frontend tooling
  - [Rust](https://www.rust-lang.org/tools/install) (stable toolchain) for the `dev-tools` terrain backend

  ### 1. Installation

  ```bash
  # Install dependencies for the entire monorepo
  bun install
  ```

  ### 2. Environment Setup

  Create a `.env.local` in the root (or specific app directories):

  ```env
  # Used by the Rust dev-tools backend image/text generation endpoints
  GEMINI_API_KEY=your_gemini_api_key_here

  # Used by other app surfaces still reading the legacy key name
  GOOGLE_GENAI_API_KEY=your_gemini_api_key_here

  # Optional: image model catalog shown in /devtools/worldgen refinement UI
  # Format: model_id|Display Label,model_id|Display Label
  AI_IMAGE_MODELS=gemini-3.1-flash-image-preview|Nano Banana 2,gemini-3-pro-image-preview|Gemini 3 Pro Image Preview,gemini-2.5-flash-image|Gemini 2.5 Flash Image

  # Optional: must match one model_id from AI_IMAGE_MODELS
  AI_IMAGE_DEFAULT_MODEL=gemini-3.1-flash-image-preview

  # Optional: ordered fallback chain (comma-separated model IDs)
  AI_IMAGE_FALLBACK_CHAIN=gemini-3-pro-image-preview,gemini-2.5-flash-image

  # Optional: refine job protection (queue/concurrency)
  WORLDGEN_REFINE_MAX_CONCURRENT=1
  WORLDGEN_REFINE_MAX_QUEUE=3
  ```

  ### 3. Running the Apps

  ```bash
  # Run the main game client
  bun run dev:website

  # Run the cinematic demo landing via dev-tools frontend (`/`)
  bun run dev:demo

  # Run dev-tools frontend + Rust backend together
  bun run dev:dev-tools

  # Run only the dev-tools Rust backend (http://127.0.0.1:8787)
  bun run dev:dev-tools:backend

  # Run only the unified frontend (demo at `/`, dev-tools at `/devtools`)
  bun run dev:dev-tools:frontend
  ```

  ---

  ## 🚀 Deployment

  Split deployment:

  - **`apps/server`** on **Google Cloud Run**
  - **`apps/website`** on **Firebase Hosting Spark**


  Full step-by-step instructions are in:

  - [`documentation/deploy-website-firebase.md`](documentation/deploy-website-firebase.md)

  ---

  ## 📖 Deep Dive

 <details>
<summary><b>🛠 Dev-Tools</b></summary>

- **World Generation (3D)**: Procedural generation and 3D visualization of planets, biomes, and tiles through coherent worldbuilding algorithms.
- **Asset Generator**: AI-assisted synthesis of graphical assets such as objects and environments, synchronized with the game’s lore and visual direction.
- **Character Builder**: Creation of complex NPCs with personality traits, hidden agendas, and distinct dialogue logic.
- **Quest AI Generator**: Dynamic quest generation engine that adapts narrative structure to player progression and contextual game state.
- **Ecology Lab**: Assisted design of ecosystems, including flora, fauna, and resource distribution, to enrich biome diversity.
- **Lyria Music Synth**: Adaptive music and immersive soundscape generation powered through Vertex AI.
- **Job Center**: Monitoring and balancing tool used to simulate exploration tasks, progression loops, and economic systems.
- **Story Loop Prototyper**: Testing environment for debugging multimodal narrative sequences across text, image, and audio.
- **Generated Gallery**: Visual archive for browsing, reviewing, and reusing previously generated AI content.

</details>

  <details>
 <summary><b>🎮 Demo Experience</b></summary>

- **Cinematic Landing**: Immersive introduction with parallax effects and spatialized sound design to establish tone and atmosphere.
- **Zone Briefing Panel**: Multimodal overlay revealing the dangers, flora, and lore of a newly discovered region through cinematic presentation.
- **Survival Console**: Futuristic command interface for managing critical resources such as Fuel, Food, and Morale in real time.
- **Interleaved Scenes**: Narrative system where encounters dynamically generate both text and imagery to illustrate unfolding action.
- **Strategic Combat**: Tactical confrontation system with unlockable abilities and an interactive skill bar.
- **Dynamic Planet Map**: Interactive planetary map for selecting destinations, points of interest, and high-risk zones.
- **Character Creation**: Full protagonist customization including appearance, profession, and talent selection.
- **Faction Reputation**: Social and systemic layer where player decisions reshape relationships with factions such as the Fuel Guild and the Nomads.
- **Quest Log & Lore**: Centralized journal for following procedural storylines and deepening knowledge of the world. 
  </details>

  <details>
<summary><b>🛠 Tech Stack Details</b></summary>

- **Runtime**: Bun
- **Framework**: React 19 (Vite)
- **Styling**: Tailwind CSS v4 + PostCSS
- **AI SDK**: Google Generative AI SDK (`@google/genai`)
- **Backend Integration**: Direct REST/HTTP integration through Rust using `reqwest`
- **Specialized Platform Access**: Lyria 2 for music generation
- **State**: Centralized shared schemas and game logic in `@ashtrail/core`

</details>

  ---
  ## 🤖 Models Used

### 1. SDK & Integrations

- **Google Generative AI SDK (`@google/genai`)**: Used in the frontend and shared packages, especially `apps/dev-tools` and `packages/core`.
- **Direct API (REST/HTTP)**: The Rust backend in `apps/dev-tools/backend` communicates directly with Google APIs via `reqwest` for fine-grained control over multimodal and interleaved generation flows.
- **Vertex AI (GCP)**: Used for specialized generation workflows.

### 2. Gemini Models (Text & Reasoning)

These models power narration, dialogue, orchestration, and Game Master logic.

- **`gemini-3-flash-preview`**: Primary model for the narrative engine.
- **`gemini-3-pro-preview`**: Used for more complex reasoning tasks.
- **`gemini-2.5-flash`**: Standard fast-generation model used for text workflows and ecology-related generation.
- **`gemini-2.0-flash`**: Used as a fallback for multimodal tasks.

### 3. Image Models (Generation & Vision)

Ashtrail uses a fallback chain for visual generation and image workflows.

- **`gemini-3.1-flash-image-preview`**: Referred to in the codebase as **“Nano Banana 2”**, used as an ultra-fast next-generation image model.
- **`gemini-3-pro-image-preview`**: Used for high-quality image generation and image editing.
- **`gemini-2.5-flash-image`**: Standard model for biome and creature synthesis.

### 4. Specialized Models

- **Text-to-Speech**: **`gemini-2.5-flash-preview-tts`**, used in `tts.rs` for narrated vocal briefings.
- **Music Generation**: **`lyria-002`**, used through Vertex AI in `lyria.rs` to generate procedural musical themes.

---

  ## 🏆 Hackathon Details

  Built for the **[Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/)** in the **Creative Storyteller** track.

  > **Challenge Focus**: We designed Ashtrail to demonstrate Gemini not just as a chatbot, but as an agentic multimodal system for game creation and player-facing storytelling. The project showcases how synchronized AI generation can support both developer workflows and end-to-end interactive experiences through a unified orchestration layer.
  ---

  ## 📜 License

  MIT © [Moebius](https://github.com/moebius)
