# Ash Caravan - Architecture & Tools Plan

## 1. Codebase Architecture

The project is structured as a Bun-based monorepo encompassing the following packages and applications:

### Applications (`apps/`)

- **`website`**: The main game client for players. Uses Vite, React, and Tailwind.
- **`server`**: The backend handling the deterministic state machine, running the simulation engine, and acting as the wrapper for the AI Game Master.
- **`dev-tools`**: A dedicated suite of frontend tools (Vite + React) for developers to visualize, test, and generate the game world (Olaas) and its assets before pushing them to the server/runtime.

### Shared Packages (`packages/`)

- **`core`**: Contains shared TypeScript models, types, and fundamental game logic (e.g., schemas for `GameState`, `Node`, `Faction`, `CrewMember`, `Rumor`, `EventOutcome`).
- **`ui`**: The central design system library. It implements a strict Atomic Design approach by providing highly reusable styled components (Button, Card, Input) utilizing Tailwind CSS. All visual elements in `website` and `dev-tools` compose these primitives.

## 2. World Generation Tools (Dev-Tools)

The `dev-tools` application acts as a comprehensive admin dashboard to facilitate AI-driven procedural generation and manual adjustments.

It provides the following specialized toolsets:

### 2.1 Map & Node Generator

- Visualizes the world of Olaas (hex/node map).
- Interfaces with the AI GM to generate specific regions, defining nodes (e.g., settlements, ruins, military outposts).
- Generates node parameters: local scarcity (cheap vs. expensive resources), threat clocks, and unique opportunities.

### 2.2 Faction & NPC Generator

- Tool for spawning dynamic factions with their own agendas (e.g., Fuel Guild, Cult of the Static Sun).
- Defines attitudes towards players and other factions.
- Manages the generation of notable NPCs, leaders, and trader profiles.

### 2.3 Economy & Rumor Engine Tool

- Defines the baseline economy (Food, Water, Fuel, Parts, Ammo, Meds).
- Generates rumors equipped with metadata (Accuracy chance, Source, Decay rate, Payload effects).
- Simulates the propagation of rumors across nodes to test their impact on the game's balance.

### 2.4 Simulation Fast-Forwarder

- Allows developers to run the deterministic engine for $N$ days without players, visualizing how factions spread, how resources deplete, and verifying that the generated world provides hard enough constraints without breaking immediately.
