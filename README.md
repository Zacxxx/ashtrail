# Ashtrail

<p align="center">
  <img src="[assets/hero.png](https://i.imgur.com/Pfznj2R.jpeg)" alt="Ashtrail hero image" width="920" />
</p>

<p align="center">
  <b>A real-time AI Game Master showcase for the Gemini Live Agent Challenge (Creative Storyteller).</b><br/>
  Multimodal, stateful, procedural storytelling with interleaved narrative + image synthesis.
</p>

<p align="center">
  <a href="#quickstart"><img alt="Quickstart" src="https://img.shields.io/badge/Quickstart-bun-000000?logo=bun&logoColor=white"></a>
  <a href="#features"><img alt="Track" src="https://img.shields.io/badge/Track-Creative%20Storyteller-4c1d95"></a>
  <a href="#architecture"><img alt="Mode" src="https://img.shields.io/badge/Mode-Real--time%20GM-0f766e"></a>
  <a href="#license"><img alt="License" src="https://img.shields.io/badge/License-MIT-2563eb"></a>
</p>

<p align="center">
  <a href="https://bun.sh"><img alt="Built with Bun" src="https://img.shields.io/badge/Built%20with-Bun-000000?logo=bun&logoColor=white"></a>
  <img alt="Status" src="https://img.shields.io/badge/Status-Prototype-f59e0b">
  <img alt="UI" src="https://img.shields.io/badge/UI-Survival%20Console-111827">
</p>

---

## What is Ashtrail

Ashtrail replaces static game files with a Gemini-powered Game Master that acts as a real-time creative director, not a chatbot. Each encounter generates interleaved outputs: narrative text plus a hidden visual prompt that synthesizes an atmospheric scene. NPCs, factions, and quests are created procedurally from live player state so the world evolves without scripted paths.

---

## Demo

- Trailer: `TODO`
- Devpost page: `TODO`
- Live build: `TODO`

<p align="center">
  <img src="assets/demo.gif" alt="Ashtrail demo" width="920" />
</p>

---

## Features

- **Director Agent GM Core**
  - Persistent world state: resources, crew loyalty, sector danger
  - Fast iteration with Gemini Flash, deeper reasoning with Gemini Pro
- **Multimodal interleaving**
  - Encounter text plus visual prompt generation
  - Real-time scene synthesis via Gemini image models
- **Procedural content**
  - NPCs, factions, quests generated from player needs and risks
- **Showcase UI**
  - Survival-console aesthetic
  - GM Intelligence Overlay + Uplink Feed exposing model activity

---

## Architecture

```text
src/
  app/                      Next.js app router
  screens/                  Game screens
  ui/                       Reusable UI components
  gm/                       Game Master core (state, prompts, policies)
  services/
    gemini/                 Gemini client wrappers
    images/                 Image generation pipeline
  state/                    Game state store and reducers
  types/                    Shared types
public/
assets/                      README media (hero.png, demo.gif)
