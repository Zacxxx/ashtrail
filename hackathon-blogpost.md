# Building Ashtrail: An AI-Orchestrated Multimodal Game Storytelling Agent with Gemini

*This article was created for the purposes of entering the Gemini Live Agent Challenge hackathon. #GeminiLiveAgentChallenge*

  <p align="center">
    <img src="https://i.imgur.com/uo6jpcP.jpeg" alt="Ashtrail hero image" width="920" />
  </p>

## The Vision: Beyond Single-Purpose AI

When we started building Ashtrail, we had a clear goal: to show that Gemini can power far more than isolated AI interactions. It can serve as an agentic, multimodal orchestration layer for entire game creation pipelines and immersive player experiences.

What if AI could generate not just text, but synchronized visuals, music, lore, and game mechanics? What if developers could prototype entire worlds in minutes, and players could experience dynamically generated narratives with matching imagery?

That's exactly what we set out to build.

## What is Ashtrail?

Ashtrail is an AI-orchestrated multimodal game storytelling agent that enhances developer creativity and delivers end-to-end player experiences through synchronized generation of visuals, lore, music, and game design.

We built Ashtrail as an agentic, multimodal game storytelling system, and paired it with dedicated dev-tools to demonstrate the practical capabilities of the Gemini SDK in this setting. To make those capabilities tangible, we also created video game assets and interactive surfaces that showcase synchronized AI-driven generation across the player and developer experience.

Ashtrail demonstrates:
- AI-orchestrated creation across storytelling, asset generation, and game design
- Synchronized multimodal outputs spanning visuals, lore, music, and interactive content
- Dedicated dev-tools for prototyping worlds, characters, quests, ecosystems, and audiovisual assets
- A playable showcase that exposes these capabilities through a cinematic and interactive player experience

## The Technical Journey

### Architecture: A Bun Monorepo

We built Ashtrail as a Bun monorepo to ensure unified type safety and rapid development across multiple surfaces:

- **`apps/website`**: The player-facing portal with immersive survival gameplay
- **`apps/server`**: The orchestration layer handling simulation and AI-driven runtime logic
- **`apps/dev-tools`**: Developer-facing tools with a Rust backend for performance-critical generation
- **`packages/ui`**: A strict Design-System-first component library using Tailwind CSS v4
- **`packages/core`**: Shared schemas and game logic ensuring consistency

### The Google AI Stack

Ashtrail leverages an extensive range of Google AI models and services:

#### Text & Reasoning Models
- **`gemini-3-flash-preview`**: Primary narrative engine for storytelling
- **`gemini-3-pro-preview`**: Complex reasoning tasks and Game Master logic
- **`gemini-2.5-flash`**: Fast text workflows and ecology generation
- **`gemini-2.0-flash`**: Fallback for multimodal tasks

#### Image Generation Models
- **`gemini-3.1-flash-image-preview`** (nicknamed "Nano Banana 2"): Ultra-fast next-gen image model
- **`gemini-3-pro-image-preview`**: High-quality image generation and editing
- **`gemini-2.5-flash-image`**: Biome and creature synthesis

#### Specialized Models
- **`gemini-2.5-flash-preview-tts`**: Text-to-speech for narrated briefings
- **`lyria-002`** (via Vertex AI): Procedural music generation

### Integration Approaches

We used multiple integration strategies to maximize flexibility:

1. **Google Generative AI SDK (`@google/genai`)**: Used in frontend and shared packages for rapid prototyping
2. **Direct REST/HTTP via Rust**: The backend uses `reqwest` for fine-grained control over multimodal and interleaved generation flows
3. **Vertex AI (GCP)**: Specialized workflows like music synthesis with Lyria

This hybrid approach gave us the best of both worlds: SDK convenience for rapid iteration and direct API control for performance-critical paths.

## The Dev-Tools: AI-Powered Game Development

  <p align="center">
    <img src="https://i.imgur.com/57U7hnG.png" alt="Ashtrail hero image" width="920" />
  </p>


One of Ashtrail's most innovative aspects is the comprehensive suite of developer tools, each powered by Gemini:

### 🌍 World Generator
AI-driven planetary simulation and terrain generation tool that creates coherent worlds with procedural biomes, terrain, and explorable structures. Features multi-stage workflow (geology → geography → ecology → humanity), 3D visualization with real-time globe rendering, hierarchical geography (kingdoms, duchies, provinces, counties), and AI-powered province refinement with texture variants. The foundation layer for all other dev-tools.

### 🧠 Game Master
World-scoped AI orchestration tool that defines canon context, system directives, and narrative grounding for the game world. Coordinates live lore inputs, factions, locations, temporality, and quest generation to ensure events, consequences, and progression remain consistent with established world state. Compiles dynamic context from all dev-tools into a coherent prompt block used by Events and Quests.

### 📜 History
Advanced lore generation and canon-structuring tool that creates, organizes, and maintains narrative coherence across the world's storytelling layers. Manages main lore, granular lore snippets (critical/major/minor), regions, locations, factions, characters, timeline progression, and temporality (custom calendar systems). Primary source of truth for all narrative content, feeding dynamic context into Game Master, Events, and Quests.

### 🌿 Ecology
World ecology design and generation tool that creates and structures flora, fauna, biomes, and environmental baselines. Establishes the ecological logic, biological diversity, and natural reference framework of the world. Species definitions inform exploration encounters, resource distribution, and environmental storytelling.

### ⚙️ Gameplay Engine
Central gameplay design and balancing tool that defines core game rules, structures exploration, events, combat, character systems, and skills. Configures the numerical logic driving progression, movement, statistics, status effects, and overall gameplay behavior. Includes combat simulator for testing encounters and event generator for dynamic narrative moments.

### 👤 Character Builder
Comprehensive character creation tool for designing playable characters, NPCs, monsters, and archetypes with full control over identity, appearance, lore, traits, attributes, occupation, skills, equipment, inventory, and relationships. Features AI-assisted generation, portrait synthesis, talent tree progression, multi-occupation systems, and dynamic stat calculation. All character data feeds into Quests, Events, and Combat.

### 🎯 Quests
Dynamic quest generation and execution environment that creates world-scoped, party-based, multi-ending quest flows driven by lore, history, ecology, character state, and live world context. Features seed-based generation, real-time party management, freeform player actions, combat integration, glossary-enhanced storytelling, and quest chain progression. Synthesizes all dev-tool outputs into playable, branching story experiences.

### 🎨 Asset Generator
Multimodal content generation tool that produces icons, battlemaps, world assets, ecology illustrations, sprites, songs, videos, and complete asset packs aligned with the project's worldbuilding and creative direction. Supports batch generation, variant creation, and seamless integration with other tools for synchronized visual storytelling.

### 🌌 Gallery
Centralized content archive that collects, browses, inspects, and synchronizes all generated outputs across the production pipeline—planets, textures, icons, characters, songs, videos, and isolated world assets. Features an Isolated section specifically designed to organize world-derived regional outputs into separated territorial layers (kingdoms, duchies, provinces, counties) for easier review and reuse.

## The Player Experience: Multimodal Storytelling

The player-facing experience showcases synchronized AI generation:

### Interleaved Scenes
The narrative system dynamically generates both text and imagery to illustrate unfolding action. When you encounter a hostile creature, Gemini generates the description and the visual simultaneously, creating a cohesive experience.

### Zone Briefing Panel
Multimodal overlays reveal the dangers, flora, and lore of newly discovered regions through cinematic presentation with AI-generated visuals and narration.

### Dynamic Combat
Tactical confrontation system with unlockable abilities, where the AI adapts enemy behavior and generates contextual combat imagery.

### Survival Console
Real-time resource management (Fuel, Food, Morale) with AI-driven events that challenge player decisions.

## Technical Challenges & Solutions

### Challenge 1: Reliability at Scale
**Problem**: Image generation can fail, especially under load.

**Solution**: We implemented a sophisticated fallback chain system. If `gemini-3.1-flash-image-preview` fails, the system automatically tries `gemini-3-pro-image-preview`, then `gemini-2.5-flash-image`. This ensures generation always succeeds.

### Challenge 2: Concurrency Control
**Problem**: Too many simultaneous generation requests could overwhelm the API.

**Solution**: We built a job queue system in Rust with configurable concurrency limits (`WORLDGEN_REFINE_MAX_CONCURRENT`) and queue depth (`WORLDGEN_REFINE_MAX_QUEUE`), returning 429 status codes when capacity is exceeded.

### Challenge 3: Multimodal Synchronization
**Problem**: Text and images need to be coherent and generated in the right sequence.

**Solution**: We use Gemini's interleaved generation capabilities, where the model can output both text and image generation instructions in a single response, ensuring narrative and visual coherence.

### Challenge 4: Performance
**Problem**: JavaScript isn't ideal for computationally intensive terrain generation.

**Solution**: We built a Rust backend for the dev-tools, handling terrain algorithms and API orchestration with blazing speed, while keeping the frontend in React for rapid UI iteration.

## Deployment: Google Cloud Run + Firebase

We deployed Ashtrail using Google Cloud services:

- **`apps/server`**: Deployed on **Google Cloud Run** for scalable, serverless orchestration
- **`apps/website`**: Hosted on **Firebase Hosting** (Spark tier) for fast global delivery

This architecture ensures the AI-heavy backend can scale independently while the static frontend loads instantly.

## Key Learnings

### 1. Model Selection Matters
Different Gemini models excel at different tasks. `gemini-3-flash-preview` is perfect for rapid narrative generation, while `gemini-3-pro-preview` handles complex reasoning. Matching the model to the task dramatically improves quality and cost-efficiency.

### 2. Fallback Chains Are Essential
In production, things fail. Having automatic fallbacks between models ensures a smooth user experience even when specific models are unavailable or rate-limited.

### 3. Hybrid Integration Works
Using both the SDK and direct API calls gave us flexibility. The SDK accelerated development, while direct API access provided fine-grained control for performance-critical paths.

### 4. Multimodal is the Future
The ability to generate synchronized text, images, and audio in a single workflow is transformative. It's not just about generating content—it's about generating coherent, interconnected experiences.

### 5. Rust + TypeScript = Power + Speed
Combining Rust for computational heavy-lifting with TypeScript for UI development gave us the best of both worlds: type safety across the stack and performance where it matters.

## What's Next?

Ashtrail is a prototype, but it demonstrates the potential of AI-orchestrated game development. Future directions include:

- **Real-time multiplayer** with shared AI-generated worlds
- **Voice interaction** using Gemini's audio capabilities
- **Deeper procedural generation** with more sophisticated world simulation
- **Community content** where players can share AI-generated quests and characters

### Beyond Dev-Tools: Ashtrail as a Full Game

But Ashtrail has a bigger ambition—to become a complete survival MMORPG that breaks the mold. Our vision is to create a living, breathing post-apocalyptic world where every playthrough is unique, every world is procedurally generated, and every narrative moment is dynamically orchestrated by Gemini. Whether you play solo or with others, your experience will be entirely your own—shaped by your choices, your relationships, and the emergent stories that unfold around you.

Imagine a survival MMORPG where:
- **The Game Master never sleeps**: Gemini acts as a persistent AI dungeon master, adapting the story to your choices in real-time
- **Every world is unique**: Procedurally generated planets with coherent ecosystems, factions, and histories
- **Solo or multiplayer, your choice**: Play alone for a personal narrative, or join others in a shared world where everyone's actions ripple through the same living ecosystem
- **NPCs have memory and agency**: Characters remember your actions, form opinions, and pursue their own goals
- **Quests emerge organically**: No scripted missions—narratives arise from the world state, faction conflicts, and your reputation
- **Combat is tactical and consequential**: Every battle affects faction relationships, resource availability, and story progression
- **Exploration reveals secrets**: Ancient ruins, hidden lore, and environmental storytelling powered by AI-generated content
- **Post-apocalyptic survival**: Scavenge for fuel, manage scarce resources, navigate faction politics, and survive in a dying world where every decision matters



## Try It Yourself

Ashtrail is open source and ready to run:

```bash
# Clone the repo
git clone https://github.com/Zacxxx/ashtrail

# Install dependencies
bun install

# Set up your environment variables
# Create a .env.local file at the root with at minimum:
# GEMINI_API_KEY=your_gemini_api_key_here
# GOOGLE_GENAI_API_KEY=your_gemini_api_key_here
# 
# Optional: Add Vertex AI credentials for music generation
# Optional: Add Supabase credentials for cloud sync

# Run the demo
bun run dev:demo

# Or run the dev-tools
bun run dev:dev-tools
```

For complete setup instructions including optional services (Vertex AI, Supabase), see the [README](https://github.com/Zacxxx/ashtrail#-quickstart).

## Conclusion

Building Ashtrail taught us that Gemini is far more than a text generator—it's a complete multimodal orchestration platform capable of powering complex, creative applications. From procedural world generation to dynamic storytelling, from asset synthesis to adaptive music, Gemini handled it all.

The future of game development isn't about replacing human creativity—it's about augmenting it. Ashtrail shows what's possible when developers have AI tools that understand context, maintain coherence across modalities, and adapt to creative intent.

We're excited to see where the Gemini ecosystem goes next, and we hope Ashtrail inspires others to push the boundaries of what's possible with AI-orchestrated creativity.

---

**Built for the [Gemini Live Agent Challenge](https://geminiliveagentchallenge.devpost.com/) | Creative Storyteller Track**

**Tech Stack**: Bun, React 19, Tailwind CSS v4, Rust, Google Generative AI SDK, Vertex AI, Google Cloud Run, Firebase Hosting

**Models Used**: gemini-3-flash-preview, gemini-3-pro-preview, gemini-2.5-flash, gemini-3.1-flash-image-preview, gemini-3-pro-image-preview, gemini-2.5-flash-image, gemini-2.5-flash-preview-tts, lyria-002

#GeminiLiveAgentChallenge #AI #GameDev #Gemini #GoogleCloud #MultimodalAI #ProceduralGeneration
