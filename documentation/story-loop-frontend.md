# Story Loop Frontend

## Purpose

The new `Story Loop` page in `apps/dev-tools` is a lightweight orchestration frontend for the hackathon demo.

It does not replace existing tools.

Instead, it composes the current dev-tools surfaces into one operator view that answers:

- should the demo be quest-led, hybrid, or exploration-led?
- is the current world ready for a live mixed-media loop?
- which existing tools already provide the story backbone?
- where should voice, cutscene, and OST channels plug in next?

## Route

New route:

- `/story-loop`

This route is meant to be a director console for the hackathon slice rather than a player-facing game screen.

## Data Sources Reused

The page intentionally reuses current APIs and state instead of introducing a new backend contract.

Current data dependencies:

- active world selection from local dev-tools state
- `GET /api/planet/gm-context/{worldId}`
- `GET /api/planet/quests/{worldId}`
- `GET /api/planet/quests/{worldId}/{runId}`
- `GET /api/planet/locations/{worldId}/exploration-manifests`
- current quest illustration image endpoint when available

This keeps the frontend aligned with the current build and avoids rewrites.

## Frontend Sections

### 1. Loop Recommendation

Shows the recommended loop mode:

- `quest-led`
- `hybrid`
- `exploration-led`

For the current repo, `hybrid` or `quest-led` will usually be the correct recommendation.

### 2. World Summary

Displays:

- active world
- canonical world prompt
- ambience snapshot
- GM context source counts

This makes canon readiness visible immediately.

### 3. Loop Blueprint

This is the core planning surface.

It describes the current demo loop as ordered phases with explicit ownership:

- World Architect Agent steps
- GM Agent steps
- player / UI steps

The goal is to make the two-agent story legible to judges and collaborators.

### 4. Readiness

Tracks the core dependencies for the demo:

- canon readiness
- quest backbone readiness
- exploration insert readiness

### 5. Media Channels

Tracks the interleaved output surface:

- narration
- voice
- cutscene still
- OST cue

These are currently framed as orchestration channels. They can later connect to the live runtime outputs without redesigning the page.

### 6. Launch Surfaces

Provides direct deep links back into existing tools:

- Game Master
- Quests
- Exploration
- Asset Generator

This keeps the page efficient as a control surface instead of duplicating tool functionality.

## Why It Uses Quests First

The page is intentionally biased toward a quest-first hybrid loop.

Reasons:

- quests already provide structure and pacing
- archived runs are already persisted
- current nodes are easy to map to scene packages
- quest illustrations already provide a visual seed path
- exploration can be inserted where it adds value instead of carrying the whole demo

This is a more efficient use of the current repository than trying to finish a full exploration-first game loop for the hackathon.

## Intended Next Integration Points

The page is only the frontend scaffold. The next runtime integrations should attach to it:

1. `World Architect Agent`
   - trigger world refresh / quest seeding from SDK-based agent runtime

2. `GM Agent`
   - trigger scene package generation from the active quest node
   - stream back narration, voice, image, and music events

3. `Media outputs`
   - narration text stream
   - speech synthesis output
   - cutscene still or animatic frame
   - OST cue metadata or generated audio

## Non-Goals

This page should not:

- duplicate quest authoring UI
- replace the exploration runtime
- replace the Game Master configuration page
- become a separate content-management system

Its job is orchestration and demo framing.

## Recommended Follow-up

After the scaffold lands:

1. wire agent endpoints into the page
2. surface a live scene event timeline
3. let the page trigger a quest-node scene package generation
4. add streamed status for voice / cutscene / OST channels
