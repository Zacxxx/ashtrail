# Story Loop Operational Plan

## Purpose

This document defines what is still required to make the new dev-tools `Story Loop` operational for the hackathon.

The current state is:

- the loop is architecturally defined
- the frontend scaffold exists
- the current repo already provides world canon, quest structure, and exploration inserts

What is missing is the runtime orchestration layer that turns those pieces into a live interleaved demo.

## Current Baseline

The following parts already exist and should be reused rather than replaced:

- world selection and world history
- compiled GM canon and settings
- quest generation, quest archive, and active runs
- exploration manifests and location runtime
- asset generation surfaces
- job tracking and async workflow patterns

That means the next work should focus on orchestration, not tool rewrites.

## Goal

Make the loop operational enough to demo this sequence:

1. choose or load a generated world
2. load a quest run for that world
3. generate a scene package for the current node
4. present interleaved outputs:
   - narration
   - voice
   - cutscene still
   - OST cue
   - player choices
5. optionally enter an exploration insert
6. resolve the result back into quest and canon state
7. continue to the next beat

## Missing Pieces

### 1. World Architect Agent Runtime

Need:

- a real SDK or ADK agent service
- deployed on Cloud Run
- capable of orchestrating existing dev-tools tool endpoints

Responsibilities:

- prepare or refresh the active world snapshot
- ensure a valid quest backbone exists
- decide when exploration manifests are needed
- persist durable outputs for the GM agent

This is not the Rust backend itself.
The Rust backend remains the tool layer.

### 2. GM Agent Runtime

Need:

- a real SDK or ADK runtime for the live scene loop
- deployed on Cloud Run

Responsibilities:

- read `CompiledGmContext`
- read the active quest node
- optionally read the exploration insert descriptor
- emit a single scene package for the frontend

This runtime should be the judged live agent.

### 3. Scene Package Contract

Need one stable payload shape for the loop frontend.

Recommended fields:

```json
{
  "worldId": "string",
  "runId": "string",
  "nodeId": "string",
  "sceneTitle": "string",
  "narration": {
    "text": "string"
  },
  "voice": {
    "status": "idle|queued|ready|failed",
    "audioUrl": "string|null",
    "transcript": "string|null"
  },
  "visual": {
    "status": "idle|queued|ready|failed",
    "imageUrl": "string|null",
    "prompt": "string|null"
  },
  "music": {
    "status": "idle|queued|ready|failed",
    "audioUrl": "string|null",
    "cueLabel": "string|null"
  },
  "choices": [
    {
      "id": "string",
      "label": "string",
      "kind": "choice|freeform|exploration_insert"
    }
  ],
  "explorationInsert": {
    "enabled": true,
    "worldId": "string",
    "locationId": "string",
    "label": "string"
  }
}
```

This contract should become the single handoff between the GM runtime and the loop frontend.

### 4. Loop Frontend Timeline

The new `Story Loop` page currently acts as a control and planning surface.

It still needs a runtime scene view that can:

- request a scene package
- render media channels progressively
- show job / generation state per channel
- present choices
- launch exploration inserts
- resume the loop after resolution

This should be added to the existing frontend, not as a separate app.

### 5. Voice Channel

Need:

- a speech-generation pipeline wired to the active narration
- surfaced in the loop frontend as a first-class channel

Minimum viable version:

- generate narration text first
- request speech synthesis immediately after
- expose audio playback and transcript in the scene package

### 6. OST Channel

Need:

- a music cue or ambient score generation layer
- attached to scene pressure, ambience, and quest tone

Minimum viable version:

- emit cue metadata first
- optionally attach generated audio if available

This can start as a cue system before full music generation is stable.

### 7. Cutscene / Visual Channel

Need:

- a loop-level action that either:
  - reuses an existing quest illustration
  - or generates a new scene still for the current node

Minimum viable version:

- if the active node already has an illustration, reuse it
- otherwise generate one still per scene package

This is preferable to attempting full AI video first.

### 8. Canon Writeback

After a scene resolves, the result must be persisted in a way the next beat can consume.

Writeback targets may include:

- active quest run
- quest log
- glossary updates
- world consequences
- architect-side world memory

Without this, the loop will feel like disconnected generations instead of a stateful agent-driven story.

### 9. Snapshot / Version Pinning

The GM runtime should not read mutable authoring state directly.

Need:

- a pinned world snapshot or version ID
- a consistent contract for what the GM agent is allowed to read during runtime

This avoids:

- canon drift
- accidental contradictions
- live authoring changes breaking the demo

## Recommended Build Order

### Phase 1. Operational Vertical Slice

Goal:

Get one working loop using existing quest state.

Tasks:

1. add a `Generate Scene Package` action to the loop frontend
2. have it call the GM agent
3. return:
   - narration
   - voice placeholder or audio
   - illustration URL or prompt result
   - OST cue label
   - player choices
4. render that package in the frontend

Deliverable:

- one quest-node scene can be generated and displayed end-to-end

### Phase 2. Exploration Insert

Goal:

Make exploration part of the same loop, but only as a controlled insert.

Tasks:

1. attach an optional exploration insert descriptor to the scene package
2. add an `Enter Exploration Insert` action in the frontend
3. open the existing exploration runtime using the selected manifest
4. define a simple completion / return condition
5. resume the loop with the result

Deliverable:

- the user can move from scene package into exploration and back out

### Phase 3. Canon Writeback

Goal:

Make the loop stateful and grounded.

Tasks:

1. persist scene outcomes back into quest state
2. record key consequences in world-facing structures
3. update what the next scene package sees

Deliverable:

- the next scene is visibly shaped by the previous one

### Phase 4. Architect Runtime

Goal:

Make the world-prep side agent-driven rather than manually assembled.

Tasks:

1. create the architect agent service
2. let it call existing dev-tools tool endpoints
3. produce a pinned world snapshot and quest backbone
4. expose this in dev-tools as a world-prep workflow

Deliverable:

- the pre-play setup is also clearly agent-driven

## Minimum Hackathon Slice

If time is constrained, the minimum viable operational loop is:

1. active world selected
2. active quest run loaded
3. scene package generation for the current quest node
4. interleaved frontend view for:
   - narration
   - voice
   - still image
   - OST cue
   - choices
5. optional exploration insert
6. result written back into the quest run

This is enough to demonstrate:

- agent architecture
- tool orchestration
- multimodal storytelling
- grounded stateful progression

## What Not To Do

Do not spend the next block of effort on:

- broad exploration feature expansion
- large gameplay rewrites
- replacing existing quest or GM tools
- building separate frontend apps for the loop

The repo already contains the right primitives.
What is missing is orchestration and a coherent runtime path through them.

## Operational Summary

For dev-tools, the loop becomes operational when these are all true:

- there is a real GM runtime that emits a scene package
- the loop frontend can render and advance that package
- exploration can be entered as an insert, not a separate mode
- outcomes are written back into quest and canon state

Until then, the loop is scaffolded but not live.
