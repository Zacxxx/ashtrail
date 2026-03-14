# Story Loop Operational Plan

## Purpose

This document defines what is still required to make the new dev-tools `Story Loop` operational for the hackathon.

The current state is:

- the loop is architecturally defined
- the frontend scaffold exists
- the current repo already provides world canon, quest structure, and exploration inserts

What is missing is the runtime orchestration layer that turns those pieces into a live interleaved demo.

## Primary Objective

Deliver one stable, demonstrable loop where:

1. a world is selected
2. a quest node is loaded
3. a GM runtime generates a scene package
4. the frontend presents interleaved media for that scene
5. the player acts
6. the result is written back into quest and canon state
7. the next beat can continue from that updated state

This is the target state to optimize for.

Everything that does not move the project toward this loop is secondary.

## Current Baseline

The following parts already exist and should be reused rather than replaced:

- world selection and world history
- compiled GM canon and settings
- quest generation, quest archive, and active runs
- exploration manifests and location runtime
- asset generation surfaces
- job tracking and async workflow patterns

That means the next work should focus on orchestration, not tool rewrites.

## Operational Goal

Make the loop operational enough to demo this sequence end-to-end:

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

## Strategy

The fastest path is not to finish "the game".

The fastest path is to:

1. use quests as the backbone
2. use exploration only as an insert
3. add one GM runtime that packages a quest node into media
4. add one frontend runtime view that can render and advance that package
5. add writeback so the loop is stateful

This creates a clear critical path:

- no GM runtime -> no live loop
- no scene package contract -> no stable frontend integration
- no frontend runtime view -> no judged mixed-media surface
- no writeback -> no stateful progression

So the work should happen in that order.

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

## Critical Path

If the goal is to attain the objective quickly, the critical path is:

1. define the scene package contract
2. build the GM runtime that emits it
3. build the frontend scene timeline that renders it
4. add writeback into quest state
5. add exploration as an insert
6. only then add the architect runtime

This order matters.

The GM runtime and scene package are the first true blockers.

## Execution Roadmap

### Milestone 0. Lock the Target

Objective:

Prevent scope drift and make the loop measurable.

Tasks:

1. confirm that the demo is `quest-first hybrid`, not open exploration
2. confirm that the first playable slice is a single quest-node loop
3. confirm the media channels for v1:
   - narration
   - voice
   - still image
   - OST cue metadata
4. freeze broad gameplay expansion work unless it directly supports the loop

Exit condition:

- the team is aligned on one target loop and one path to ship it

### Milestone 1. Define the Scene Package

Objective:

Create the single contract the frontend and GM runtime will both target.

Tasks:

1. finalize the payload shape for a scene package
2. define which fields are required in v1 vs optional
3. define how choices are returned to the backend
4. define how exploration inserts are represented
5. define how a resolved scene writes back outcome data

Exit condition:

- the loop has one stable request/response contract

Why first:

- without this, the frontend and agent runtime will drift immediately

### Milestone 2. Build the GM Runtime

Objective:

Make one real SDK or ADK runtime capable of turning a quest node into a live scene package.

Tasks:

1. create the GM runtime service
2. read:
   - `CompiledGmContext`
   - active quest run
   - current quest node
   - optional exploration insert
3. generate:
   - narration text
   - voice request or audio output
   - still-image output or image request
   - OST cue metadata
   - choices
4. return the scene package to the frontend

Exit condition:

- one quest node can be transformed into a scene package by the GM runtime

Why second:

- this is the first point where the loop becomes real instead of planned

### Milestone 3. Build the Frontend Runtime View

Objective:

Turn the current loop scaffold into an actual playable scene surface.

Tasks:

1. add a `Generate Scene Package` action to the loop frontend
2. render each media channel separately with visible status
3. play or expose voice output
4. display the still image channel
5. display OST cue state
6. present choices and action controls
7. show job / generation progress while media channels are resolving

Exit condition:

- the frontend can request, display, and advance one scene package end-to-end

Why third:

- this is the judged surface, so it must exist before deeper orchestration work matters

### Milestone 4. Add State Writeback

Objective:

Make the loop stateful instead of decorative.

Tasks:

1. persist the selected choice or freeform action
2. update the quest run
3. record any world consequences
4. ensure the next scene package reads those consequences

Exit condition:

- the next scene visibly changes based on the previous result

Why fourth:

- this is what turns media generation into an actual game loop

### Milestone 5. Add Exploration Inserts

Objective:

Reuse the current exploration runtime as a controlled part of the loop.

Tasks:

1. attach an optional exploration insert to the scene package
2. launch the existing exploration runtime from the loop frontend
3. define a minimal exit / completion condition
4. resume the loop after the insert resolves

Exit condition:

- the user can move from scene package into exploration and back into the loop

Why fifth:

- exploration is useful, but it is not the first blocker to a strong demo

### Milestone 6. Add the World Architect Runtime

Objective:

Make the pre-play content preparation agent-driven as well.

Tasks:

1. create the architect agent service
2. let it orchestrate existing dev-tools tool endpoints
3. produce a pinned world snapshot and quest backbone
4. expose that workflow in dev-tools

Exit condition:

- world prep is agent-driven and hands a pinned snapshot to the GM runtime

Why sixth:

- this strengthens the architecture story, but the GM loop must work first

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

## Priority Summary

### Do first

- freeze the target loop
- finalize the scene package contract
- build the GM runtime
- build the frontend runtime scene view

### Do next

- add writeback into quest state
- add exploration inserts

### Do after that

- build the architect runtime
- deepen OST / visual sophistication
- expand world-prep automation

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

## Definition Of Done

The loop is operational when all of these are true:

1. a user can select a world and active quest run
2. the GM runtime can generate a scene package for the current node
3. the frontend can render the package with visible media channels
4. the player can choose an action
5. that action is written back into quest and canon state
6. the next beat can be generated from updated state

Exploration inserts are a plus, but the first operational definition does not require them.

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
- outcomes are written back into quest and canon state
- the next beat can be generated from updated state

For the stronger hybrid version, also require:

- exploration can be entered as an insert, not a separate mode
- the architect runtime can hand off a pinned snapshot to the GM runtime

Until then, the loop is scaffolded but not live.
