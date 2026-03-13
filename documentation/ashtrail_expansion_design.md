# Technical Design Document: Ashtrail Gameplay Expansion
**Revision**: 1.0 (Final Design Phase)  
**Status**: Ready for Implementation  
**Systems**: Crafting, Loot, Durability, Encumbrance, Stash, Housing

---

## 1. Executive Summary
This document outlines the architectural design for six interconnected gameplay systems aimed at deepening the "grounded" survival experience of Ashtrail. The architecture enforces a strict separation between **React (Presentation & UX)** and **Rust/WASM (Calculation & State Logic)**, leveraging the pre-existing dynamic Modifier and State system.

## 2. Core Architectural Pillars

### 2.1 The Logic/React Split
To ensure performance and maintainability, all deterministic gameplay math resides in the **Rust Core**.
- **Calculations**: Combat math, durability degradation, weight penalties, and roll successes.
- **State Management**: The Rust core acts as the source of truth for body integrity and item transitions.
- **UI Orchestration**: React handles the generative AI calls (Gemini) and the visual representation of the "Grounded" world.

### 2.2 Dynamic Modifier Integration
The expansion **does not** create a new effect system. Instead, it pulls from the existing `Modifiers` and `States` catalog.
- **The Harmonizer**: AI-generated items are forced to map their "Intent" (flavor text) to these pre-defined "Modifier Atoms."
- **Extensibility**: Adding a new skill or behavior to the core system automatically makes it available to the AI Crafting engine without code changes.

---

## 3. System Detailed Specifications

### 3.1 AI-Powered Crafting (The "Recipe Architect")
The crafting system allows for both deterministic recipes and "Freeflow" improvisation.

- **Interaction Modes**:
    1. **Pre-baked Recipes**: Fixed ingredients, deterministic result.
    2. **Freeflow (Improvisation)**: Player inputs `[Materials]` + optional `[Goal Prompt]`.
- **Logic Flow**:
    - The system sends a context snapshot (Character Stats, Biome, Materials, Intent) to Gemini.
    - **Stat Influence**: Characters with high Intelligence/Wisdom have lower "Stability Risk" and broader access to complex modifier atoms.
    - **Success Roll (Rust)**: High stats allow players to skip rolls; low stats induce a risk of:
        - **The Boom**: Total material loss + character damage.
        - **The Cursed**: Item created with a hidden negative modifier.
        - **The Unreadable**: Item created but recipe cannot be saved.
- **Discovery**: Successfully improvised recipes are saved as **Character-Specific Knowledge**.

### 3.2 Grounded Loot & Body Integrity
Looting is a direct byproduct of combat intensity and damage types.

- **Overkill Math**: At the moment of an actor's death, the Rust engine calculates:  
  `Integrity_Loss = (Overkill_Damage / Max_HP)`
- **Inventory Impact**: Every item in the actor's inventory takes durability damage equal to the `Integrity_Loss`.
- **States of Destruction**: 
    - 0 Durability items are not deleted; they are replaced by a **Salvage ID** (e.g., *Fine Leather Boots* -> *Scrap Leather*).
- **Future-Proofing**: The logic includes placeholders for `DamageType` influence (Fire destroys more integrity than Piercing).

### 3.3 Physicality: Weight & Encumbrance
A tiered realism system replaces binary carry limits.

- **The Tiered Penalty**:
    - **0-70% (Light)**: No penalties.
    - **71-100% (Encumbered)**: -1 AP, -1 MP per turn.
    - **100%+ (Heavy)**: -2 AP, -2 MP, chance to skip turns.
    - **120%+ (Overloaded)**: Immobile.
- **Equipped Efficiency**: Gear placed in Equippable slots (Armor, Weapons) contributes **30% less** to the total weight than gear carried in sacks.

### 3.4 Housing & Local Presence
Enforcing the nomad-to-settler transition.

- **Local Stash**: Persistence is tied to specific **Location IDs (NodeID)**. There is no global magical bank; items stored in a base must be physically retrieved from that base.
- **Pre-defined Housing**: Locations exist in the world as "Ruins" or "Outposts" that can be claimed and upgraded.
- **Functionality**: Housing provides access to advanced "Masterwork" crafting tools and localized storage.

---

## 4. Implementation Phasing

### Phase 1: Rust Core Extension
- Extend the Rust `Item` struct with `weight`, `durability`, `quality`, and `salvageId`.
- Implement the `encumbrance_calc` function.

### Phase 2: AI Orchestrator
- Build the "Harmonizer" template for Gemini.
- Implement the "Character Registry" for discovered recipes in the persistent state.

### Phase 3: UI Integration
- Develop the "Workbench" UI (Classic Slots + Optional Prompt).
- Build the "Loot Summary" screen that displays post-destruction quality of dropped items.

---

## 5. Technical Risks
- **AI Validation**: Gemini must be strictly validated to ensure it only outputs valid Modifier IDs. If invalid data is returned, the Harmonizer must default to "Inert Scrap."
- **Latency**: Heavy Rust calculations must be handled via WASM to ensure frame-rate stability during combat-to-loot transitions.

---

## Appendix: Design Q&A (Transcript Summary)

**Q: How should the AI Freeflow system function?**  
**A:** The system acts as a "Recipe Architect." It analyzes current items (e.g., a rifle) and available ingredients to determine improvements or create entirely new improvised recipes. It takes into account the player's inventory and stash, and is directly influenced by character stats like Intelligence and Wisdom.

**Q: What happens if the AI suggests an effect that hasn't been coded?**  
**A:** We use the "Harmonizer" approach. The AI is restricted to using existing "Modifier Atoms" and "States." This ensures that the system is dynamic; when new modifiers or skills are added to the core system, the crafting AI can utilize them automatically without needing new code.

**Q: How do character stats affect the crafting outcomes?**  
**A:** Stats determine stability and creative range. High-stat characters can avoid success rolls entirely. Low-stat characters face higher risks: critical failures can lead to the item "Booming" (loss of materials and damage) or becoming "Cursed" (hidden negative modifiers). Additionally, they might fail to "record" the recipe for future use.

**Q: What is the technical split for these systems?**  
**A:** A strict client/server-like decoupling: React is used for the client and UI orchestration, while Rust is used for all core logic, weight calculations, durability math, and combat resolutions via WASM.

**Q: How does the "Grounded" loot system handle destruction?**  
**A:** At the moment of death, any overkill damage (damage exceeding max health) is used to calculate a durability penalty for the actor's inventory. Items can drop as broken or "scrap" level (e.g., clothes turning into trash/scraps) instead of being readily available. This necessitates a repair system tied back into the crafting engine.

**Q: How is weight and encumbrance handled?**  
**A:** A tiered penalty system is used (Light, Encumbered, Heavy). Equipped gear receives a 30% weight reduction to encourage wearing items rather than carrying them in sacks.

**Q: Are stashes global or local?**  
**A:** Stashes are strictly local (location-locked). Items stored in one specific housing location stay there and are not accessible from other "Safe Zones" or magical banks.
