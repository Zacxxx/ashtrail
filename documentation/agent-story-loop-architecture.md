# Agent Story Loop Architecture

## Goal

Pivot the hackathon demo away from broad gameplay completion and toward one polished, interleaved narrative loop that is clearly driven by Google SDK-based agents on Google Cloud.

The current codebase already supports this direction better than a full exploration-first game:

- `apps/dev-tools` already owns world-scoped canon, jobs, quests, and exploration manifests.
- `apps/server` already uses `@google/genai` and is the cleanest starting point for a judged agent runtime.
- the Rust backend already behaves like a capable tool substrate for deterministic worldbuilding and content generation.

## Recommendation

Use a quest-first hybrid loop:

1. `World Architect Agent` builds or refreshes the world snapshot.
2. `GM Agent` turns the current quest node into a mixed-media scene package.
3. the frontend presents narration, voice, cutscene stills, OST cues, and choices as one continuous loop.
4. exploration manifests are inserted only when a scene benefits from direct player control.

This is a better fit than pure exploration for the current build because quests already provide:

- structural pacing
- explicit stakes
- archive persistence
- node progression
- illustration hooks
- world-scoped canon grounding

Exploration should remain an insert layer, not the backbone of the first hackathon demo.

## Agent Roles

### 1. World Architect Agent

Implementation target:

- Google GenAI SDK or ADK
- deployed on Cloud Run

Responsibilities:

- read worldgen outputs and compiled canon
- decide which deterministic dev-tools tools to call
- generate or refine quest runs, lore, factions, locations, and inserts
- write durable outputs back into the world snapshot
- maintain the handoff contract for the live GM

Primary tool sources in the current repo:

- world generation pipeline
- ecology canon
- history / lore authoring
- quest archive and chain state
- GM settings and compiled GM context
- exploration manifests

Output contract:

- canonical world prompt
- active world snapshot / version
- active quest run or quest spine
- optional exploration manifests for playable inserts
- media briefs for the GM agent

### 2. GM Agent

Implementation target:

- Google GenAI SDK or ADK
- deployed on Cloud Run

Responsibilities:

- read the pinned world snapshot from the architect layer
- read the current quest node and active tensions
- decide whether the next beat is:
  - pure cutscene
  - narrated choice
  - exploration insert
  - combat escalation
- emit one interleaved media package per beat
- avoid rewriting canon during runtime

Runtime outputs:

- narration text
- voice payload / speech synthesis request
- cutscene still brief or generated image
- OST cue brief
- player choice set
- optional exploration handoff descriptor

## Tool Layer

The Rust backend should be described as the tool layer, not the agent itself.

This is the clean submission framing:

- the agent runtime is the SDK/ADK service
- the Rust backend exposes deterministic and generative tool endpoints
- the agent orchestrates those tools

That keeps the architecture honest and resolves the "raw API vs SDK agent" caveat.

## Canon Handoff

Use `CompiledGmContext` as the primary handoff contract between the two agents.

Why:

- it already exists
- it already compiles world prompt + source summary + lore snippets + ambience
- it is world-scoped and stable enough to be the canonical bridge

Refine the architecture around this:

1. architect writes world-level canon and quest scaffolding
2. compiled GM context becomes the live runtime input
3. GM reads only the pinned context plus current quest / insert state

## Recommended Demo Loop

### Quest-first hybrid loop

1. World Architect Agent selects or builds the active world snapshot.
2. World Architect Agent ensures a quest run exists for the world.
3. GM Agent opens the current quest node and packages it into:
   - narration
   - voice
   - cutscene still
   - OST cue
   - choices
4. the player makes a choice.
5. if the node requires direct control, the GM emits an exploration insert:
   - selected manifest
   - playable objective
   - return condition
6. exploration resolves.
7. the result is persisted back into quest / canon state.
8. the next scene package begins.

## Why This Scores Better

This direction is stronger for the hackathon because it makes the judged qualities visible:

- clear agent architecture
- visible tool orchestration
- multimodal interleaving
- grounded world canon
- progressive scene delivery instead of isolated one-off generations

It is also easier to explain:

- `World Architect Agent` creates and maintains the world
- `GM Agent` runs the live scene loop
- dev-tools is the control plane and tool layer

## Cloud Story

Recommended deployment shape:

- Cloud Run service 1: `world-architect-agent`
- Cloud Run service 2: `gm-agent`
- dev-tools backend remains tool infrastructure
- website or dev-tools frontend consumes the live loop stream

Optional supporting Google Cloud services:

- Cloud Run for both agent runtimes
- Firebase Hosting for the frontend
- Vertex AI / Gemini endpoints for media generation as needed

## Immediate Build Priority

Do not spend the next block of time broadening gameplay systems.

Instead:

1. keep quests as the story spine
2. keep exploration as a controlled insert
3. wire a frontend that shows one interleaved loop clearly
4. make the two-agent split explicit in the demo and docs
