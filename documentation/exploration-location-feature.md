# Exploration Location Feature

## Summary
This document captures the current direction, implementation context, and decisions for the dev-tools exploration-location feature in `gameplay-engine`.

The old top-down `LocationExploration` flow is being sunset in favor of an isometric exploration runtime derived from the combat isometric core. Exploration generation remains Job Center-driven, while the active exploration session is moving toward a Rust-authoritative websocket runtime.

## Product Direction
- Hard-replace the old exploration renderer.
- Reuse the combat isometric projection/rendering core where practical.
- Keep exploration distinct from combat:
  - no turns
  - no skills
  - free click-to-move
  - quest/interactions HUD instead of combat HUD
- Support large maps, interiors, roofs, obstacles, doors, NPCs, and light lighting.
- Keep v1 single-floor.
- Keep generation and long-running AI work in the Job Center.
- Keep the system textureless-safe and blocky/Minecraft-inspired first, with generated assets as optional enrichment.

## Key Decisions From Conversation
- Exploration uses an isometric scene only; the old 2D renderer is not a supported long-term path.
- The setup and generation flow should stay in dev-tools and remain Job Center-compatible.
- Rust should own logic and compute-heavy exploration behavior.
- React should remain the client rendering layer.
- Interiors are in-place, not instanced.
- Doors gate entry into interiors; buildings are not freely enterable from any edge.
- Multiplayer is scaffolded at the protocol/session shape level, not fully implemented in v1.
- Textureless readability is a requirement, not a fallback.
- Asset generation needs to evolve away from loose texture batches toward exploration-oriented kits and block/palette semantics.

## Current Architecture State

### Frontend
- `ExplorationView.tsx` is the dev-tools entry point.
- The active renderer now points to `IsometricLocationExploration.tsx`.
- Shared isometric projection helpers live under `apps/dev-tools/src/gameplay-engine/iso/`.
- Combat still uses the same projection family through `combat/tacticalGrid.ts`.

### Backend
- Exploration generation is handled by `apps/dev-tools/backend/src/exploration_jobs.rs`.
- Generation is already Job Center-based and writes manifests under:
  - `generated/planets/{worldId}/exploration/{locationId}/manifest.json`
- A built-in `__test_exploration__` location exists for iteration.

### Shared Types
- Exploration map/pawn/object types live in:
  - `packages/core/src/game-engine/gameplay/exploration.ts`

## Implemented Work To Date

### Generation / Job Center
- Exploration generation uses shared `JobRecord`/Job Center plumbing.
- Parent and child jobs exist for:
  - location generation
  - semantics
  - block pack linkage
  - asset kit linkage
  - preview linkage
- Restore metadata and output refs are part of the exploration job flow.

### Setup UX
- Exploration setup was reworked to be more space-efficient and easier to iterate on.
- Generated locations are accessible through a library flow instead of forcing regeneration each time.
- A built-in test exploration location was added for debugging and showcase work.

### Isometric Runtime
- The active exploration renderer is isometric, not top-down.
- Shared iso helpers were extracted so combat and exploration use the same projection core.
- The exploration view supports:
  - click-to-move
  - pawn selection
  - pan/zoom
  - roofs/interior reveal
  - ambient lighting
  - NPC presence
  - textureless rendering

## Current Implementation Gap That Prompted The Latest Work
The earlier hard-replacement direction was only partially complete:
- the old 2D runtime was no longer the active path
- but exploration movement/NPC behavior still lived entirely in the client renderer
- there was no exploration websocket runtime
- manifests did not have a clean v2/isometric upgrade path

This latest implementation pass closes those gaps by moving the active exploration scene toward a websocket-backed session model and versioning the manifest as isometric-first.

## Current Implementation Plan

### 1. Shared Exploration Session Contract
Add shared exploration session protocol types to `packages/core`:
- `ExplorationSessionConfig`
- `ExplorationSessionSnapshot`
- `ExplorationClientAction`
- `ExplorationSessionEvent`

### 2. Backend Exploration WebSocket Runtime
Add `apps/dev-tools/backend/src/exploration_engine/` with:
- `mod.rs`
- `manifest.rs`
- `session.rs`
- `types.rs`

Responsibilities:
- accept websocket connections at `/api/exploration/ws`
- own active exploration map state
- accept click-to-move requests
- validate pathing
- advance pawn movement over time
- drive simple NPC wandering
- emit authoritative `state_sync` updates

### 3. Manifest Upgrade Path
Upgrade manifests to an isometric-oriented shape by ensuring:
- `version: 2`
- `renderMode: "isometric"`
- `ambientLight`
- basic `metadata`

Existing manifests should be upgraded on load and rewritten in place.

### 4. Frontend WebSocket Cutover
Add a dedicated `useExplorationWebSocket` hook.

The isometric exploration scene should:
- start a websocket session when opened
- send the selected pawn + manifest-backed map to the server
- render the latest server snapshot
- send movement and interaction requests to the server instead of mutating local exploration state directly

### 5. Asset Generator Scope
The legacy asset-generator and pack model is still based on generic texture batches and generic pack grouping.

To support the new exploration system, the asset pipeline should move toward:
- exploration kits
- block palettes
- wall / roof / door / clutter / foliage semantics

The first compatibility step is to broaden grouping semantics so the tooling can classify:
- `biome`
- `structure`
- `exploration-kit`
- `block-palette`

## Design Constraints
- Keep the repo’s current dark dev-tools visual language.
- Prefer deterministic and procedural generation for layout.
- Use AI for semantic enrichment and optional asset generation, not total ownership of gameplay layout.
- Preserve the ability to render without any textures.
- Avoid dual-renderer maintenance.

## Next Visual / Runtime Improvements Requested
These remain active quality goals for the exploration scene:
- roofs aligned correctly and rendered better
- 3D-looking walls
- doors/walls/obstacles centered on and occupying tiles properly
- buildings entered through doors, not arbitrary edges
- interiors hidden unless revealed
- grid hidden by default with a toggle
- character-centric zoom
- MOBA-style edge panning
- WASD / arrow panning
- better pathing and collision
- better test environment content including paths and trees
- stronger Minecraft-like readability

## Related Files
- `apps/dev-tools/src/gameplay-engine/ExplorationView.tsx`
- `apps/dev-tools/src/gameplay-engine/IsometricLocationExploration.tsx`
- `apps/dev-tools/src/gameplay-engine/exploration/useExplorationWebSocket.ts`
- `apps/dev-tools/src/gameplay-engine/iso/shared.ts`
- `apps/dev-tools/backend/src/exploration_jobs.rs`
- `apps/dev-tools/backend/src/exploration_engine/session.rs`
- `apps/dev-tools/backend/src/exploration_engine/manifest.rs`
- `packages/core/src/game-engine/gameplay/exploration.ts`
- `apps/dev-tools/src/assetgen/AssetGeneratorPage.tsx`
- `apps/dev-tools/backend/src/asset_packs.rs`

## Risks
- There is still a lot of visualization quality work left in the renderer.
- The current websocket runtime is a v1 authority layer, not yet a full chunked multiplayer-ready exploration server.
- Asset generation still needs deeper exploration-specific schema work.
- Combat handoff from exploration remains a follow-up integration concern.

## Intended Follow-Up
After the websocket-backed hard replacement is stable:
1. improve roof/wall/door placement and visual quality
2. make obstacles truly tile-occupying and centered
3. deepen interiors/reveal logic
4. improve the test exploration location
5. rework asset-generator and `game-assets` around exploration kits and block palettes
6. move more simulation and future multiplayer scaffolding into Rust
