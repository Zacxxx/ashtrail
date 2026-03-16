# Architecture Diagram - Ashtrail Game Development Platform

## Architecture Overview

```mermaid
graph TB
    subgraph "Frontend - React/TypeScript"
        UI[Dev Tools UI<br/>React + Vite]
        WG[World Generator]
        AG[Asset Generator]
        CB[Character Builder]
        GM[Game Master]
        QE[Quest Engine]
        EE[Ecology Editor]
        GE[Gameplay Engine]
        GAL[Gallery]
    end

    subgraph "Backend - Rust/Axum"
        API[Axum REST API<br/>Port 3001]
        WP[Worldgen Pipeline]
        GEN[Terrain Generator]
        HIER[Hierarchy System]
        JOBS[Job Queue System]
        MEDIA[Media Generation]
        CMS[Content Management]
        COMBAT[Combat Engine]
        EXPL[Exploration Engine]
    end

    subgraph "Google Cloud Platform - Gemini AI"
        GEMINI[Gemini 2.5 Flash<br/>Text Generation]
        GEMINI_IMG[Gemini 3 Pro Image<br/>Image Generation]
        GEMINI_VEO[Veo 3.1<br/>Video Generation]
        GEMINI_TTS[Gemini TTS<br/>Speech Synthesis]
        LYRIA[Lyria 002<br/>Music Generation]
    end

    subgraph "Storage & Assets"
        LOCAL[Local File System<br/>generated/]
        SUPABASE[Supabase Storage<br/>Cloud Sync]
        ASSETS[Game Assets<br/>Icons/Textures/Sprites]
    end

    subgraph "Core Libraries - Rust"
        GEO[geo-core<br/>Terrain Simulation]
        WORLDGEN[worldgen-core<br/>Province Clustering]
    end

    UI --> API
    WG --> API
    AG --> API
    CB --> API
    GM --> API
    QE --> API
    EE --> API
    GE --> API
    GAL --> API

    API --> WP
    API --> GEN
    API --> HIER
    API --> JOBS
    API --> MEDIA
    API --> CMS
    API --> COMBAT
    API --> EXPL

    WP --> GEO
    WP --> WORLDGEN
    GEN --> GEO

    MEDIA --> GEMINI
    MEDIA --> GEMINI_IMG
    MEDIA --> GEMINI_VEO
    MEDIA --> GEMINI_TTS
    MEDIA --> LYRIA

    WP --> GEMINI_IMG
    AG --> GEMINI_IMG
    CB --> GEMINI
    GM --> GEMINI
    QE --> GEMINI
    EE --> GEMINI_IMG

    API --> LOCAL
    API --> SUPABASE
    API --> ASSETS

    LOCAL -.Sync.-> SUPABASE
    SUPABASE -.Download.-> LOCAL

    style GEMINI fill:#4285f4,stroke:#1a73e8,color:#fff
    style GEMINI_IMG fill:#4285f4,stroke:#1a73e8,color:#fff
    style GEMINI_VEO fill:#4285f4,stroke:#1a73e8,color:#fff
    style GEMINI_TTS fill:#4285f4,stroke:#1a73e8,color:#fff
    style LYRIA fill:#4285f4,stroke:#1a73e8,color:#fff
    style API fill:#ff6b35,stroke:#d94e1f,color:#fff
    style UI fill:#61dafb,stroke:#21a1c4,color:#000
```

## Detailed Data Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Gemini
    participant Storage

    User->>Frontend: Request world generation
    Frontend->>Backend: POST /api/worldgen/generate
    Backend->>Backend: Create Job ID
    Backend-->>Frontend: Job ID + Status Queued
    
    Backend->>Gemini: Generate planet texture
    Gemini-->>Backend: Image base64
    
    Backend->>Backend: Terrain simulation (geo-core)
    Backend->>Backend: Province clustering (worldgen-core)
    Backend->>Backend: Hierarchy generation
    
    Backend->>Storage: Save assets
    Storage-->>Backend: Confirmation
    
    Frontend->>Backend: GET /api/jobs/jobId
    Backend-->>Frontend: Status + Progress
    
    Backend->>Backend: Job Completed
    Frontend->>Backend: GET /api/jobs/jobId
    Backend-->>Frontend: Result + Assets URLs
    
    Frontend->>User: Display generated world
```

## Gemini Components Architecture

```mermaid
graph LR
    subgraph "Gemini Integration Layer"
        ROUTER[API Router]
        
        subgraph "Text Generation"
            TXT[generate_text<br/>Gemini 2.5 Flash]
            CHAR[Character Stories]
            LORE[World Lore]
            QUEST[Quest Narratives]
        end
        
        subgraph "Image Generation"
            IMG[generate_image_bytes<br/>Gemini 3 Pro]
            PLANET[Planet Textures]
            ICON[Game Icons]
            TEXTURE[Terrain Textures]
            SPRITE[Character Sprites]
        end
        
        subgraph "Multimodal Generation"
            MULTI[generate_multimodal<br/>Interleaved Model]
            AUDIO[Audio + Metadata]
            VIDEO[Video + Narration]
        end
        
        subgraph "Specialized Models"
            VEO[Veo 3.1<br/>Video Generation]
            TTS[Gemini TTS<br/>Voice Synthesis]
            LYRIA_M[Lyria 002<br/>Music Generation]
        end
    end

    ROUTER --> TXT
    ROUTER --> IMG
    ROUTER --> MULTI
    ROUTER --> VEO
    ROUTER --> TTS
    ROUTER --> LYRIA_M

    TXT --> CHAR
    TXT --> LORE
    TXT --> QUEST

    IMG --> PLANET
    IMG --> ICON
    IMG --> TEXTURE
    IMG --> SPRITE

    MULTI --> AUDIO
    MULTI --> VIDEO

    style ROUTER fill:#ff6b35,stroke:#d94e1f,color:#fff
    style TXT fill:#4285f4,stroke:#1a73e8,color:#fff
    style IMG fill:#4285f4,stroke:#1a73e8,color:#fff
    style MULTI fill:#4285f4,stroke:#1a73e8,color:#fff
    style VEO fill:#34a853,stroke:#0f9d58,color:#fff
    style TTS fill:#34a853,stroke:#0f9d58,color:#fff
    style LYRIA_M fill:#34a853,stroke:#0f9d58,color:#fff
```

## World Generation Pipeline

```mermaid
flowchart TD
    START[Start Generation]
    
    START --> PROMPT[User Prompt]
    PROMPT --> IMG_GEN[Gemini Image Generation<br/>Base Planet Texture]
    
    IMG_GEN --> TERRAIN[Terrain Simulation<br/>geo-core]
    TERRAIN --> CELLS[Cell Generation<br/>Elevation, Temperature, Biomes]
    
    CELLS --> CLUSTER[Province Clustering<br/>worldgen-core]
    CLUSTER --> DUCHY[Duchy Grouping]
    DUCHY --> KINGDOM[Kingdom Grouping]
    KINGDOM --> CONTINENT[Continent Grouping]
    
    CONTINENT --> ECOLOGY[Ecology Generation<br/>Flora, Fauna, Resources]
    ECOLOGY --> VISION[Gemini Vision Analysis<br/>Biome Archetypes]
    
    VISION --> LOCATIONS[Location Generation<br/>Cities, Villages, POIs]
    LOCATIONS --> SAVE[Save Assets]
    
    SAVE --> MANIFEST[Create manifest.json]
    MANIFEST --> END[Generation Complete]

    style IMG_GEN fill:#4285f4,stroke:#1a73e8,color:#fff
    style VISION fill:#4285f4,stroke:#1a73e8,color:#fff
    style TERRAIN fill:#ff6b35,stroke:#d94e1f,color:#fff
    style CLUSTER fill:#ff6b35,stroke:#d94e1f,color:#fff
```

## Asynchronous Job System

```mermaid
stateDiagram-v2
    [*] --> Queued: Create Job
    Queued --> Running: Start Processing
    Running --> Running: Update Progress
    Running --> Completed: Success
    Running --> Failed: Error
    Completed --> [*]
    Failed --> [*]
    
    note right of Running
        Progress: 0-100%
        Stage: Step Description
        Metadata: Job Context
    end note
    
    note right of Completed
        Result: Generated Data
        Output refs: Asset Links
    end note
```

## Storage Architecture

```mermaid
graph TB
    subgraph "Local Storage Structure"
        ROOT[generated/]
        
        ROOT --> PLANETS[planets/<br/>Generated Worlds]
        ROOT --> CHARS[characters/<br/>Characters]
        ROOT --> MEDIA_A[media-audio/<br/>Music and Audio]
        ROOT --> MEDIA_V[media-video/<br/>Videos]
        ROOT --> DEMO[demo-output/<br/>Demos]
        
        PLANETS --> PLANET_ID["planet-id/"]
        PLANET_ID --> TEXTURES[textures/<br/>base.jpg/png]
        PLANET_ID --> WORLDGEN[worldgen/<br/>Pipeline data]
        PLANET_ID --> MANIFEST[manifest.json]
        
        WORLDGEN --> PROVINCES[provinces.json]
        WORLDGEN --> DUCHIES[duchies.json]
        WORLDGEN --> KINGDOMS[kingdoms.json]
        WORLDGEN --> ECOLOGY_DATA[ecology.json]
    end

    subgraph "Game Assets Structure"
        GAME_ROOT[game-assets/assets/]
        
        GAME_ROOT --> ICONS[Icons/<br/>UI icons]
        GAME_ROOT --> TEX[Textures/<br/>Terrain textures]
        GAME_ROOT --> SPRITES[Sprites/<br/>Character sprites]
        GAME_ROOT --> SONGS[Songs/<br/>Music clips]
        GAME_ROOT --> VIDEOS[Videos/<br/>Cinematic videos]
        GAME_ROOT --> ISOLATED[IsolatedRegions/<br/>Province extracts]
        GAME_ROOT --> PACKS[Packs/<br/>Asset bundles]
    end

    subgraph "Cloud Storage - Supabase"
        BUCKET[Storage Bucket]
        BUCKET --> CLOUD_PLANETS[planets/]
        BUCKET --> CLOUD_ASSETS[assets/]
        BUCKET --> CLOUD_MEDIA[media/]
    end

    PLANETS -.Sync.-> CLOUD_PLANETS
    GAME_ROOT -.Sync.-> CLOUD_ASSETS
    MEDIA_A -.Sync.-> CLOUD_MEDIA
    MEDIA_V -.Sync.-> CLOUD_MEDIA

    style ROOT fill:#2d3748,stroke:#4a5568,color:#fff
    style GAME_ROOT fill:#2d3748,stroke:#4a5568,color:#fff
    style BUCKET fill:#38b2ac,stroke:#319795,color:#fff
```

## GCP Integration and Authentication

```mermaid
graph TB
    subgraph "Backend Authentication"
        ENV[Environment Variables]
        
        ENV --> GEMINI_KEY[GEMINI_API_KEY<br/>API Key Auth]
        ENV --> VERTEX_KEY[VERTEX_API_KEY<br/>Vertex AI Auth]
        ENV --> SERVICE_ACCOUNT[GOOGLE_APPLICATION_CREDENTIALS<br/>Service Account JSON]
        ENV --> PROJECT[VERTEX_PROJECT_ID<br/>GCP Project]
    end

    subgraph "GCP Services"
        GEMINI_KEY --> GEMINI_API[Gemini API<br/>generativelanguage.googleapis.com]
        
        VERTEX_KEY --> VERTEX_LYRIA[Vertex AI Lyria<br/>aiplatform.googleapis.com]
        SERVICE_ACCOUNT --> VERTEX_LYRIA
        
        SERVICE_ACCOUNT --> OAUTH[OAuth 2.0 Token]
        OAUTH --> VERTEX_LYRIA
        
        PROJECT --> VERTEX_LYRIA
    end

    subgraph "Fallback Chain"
        PRIMARY[Primary Model]
        FALLBACK1[Fallback Model 1]
        FALLBACK2[Fallback Model 2]
        
        PRIMARY -.Failure.-> FALLBACK1
        FALLBACK1 -.Failure.-> FALLBACK2
    end

    GEMINI_API --> PRIMARY
    VERTEX_LYRIA --> PRIMARY

    style GEMINI_KEY fill:#4285f4,stroke:#1a73e8,color:#fff
    style VERTEX_KEY fill:#4285f4,stroke:#1a73e8,color:#fff
    style SERVICE_ACCOUNT fill:#34a853,stroke:#0f9d58,color:#fff
    style GEMINI_API fill:#4285f4,stroke:#1a73e8,color:#fff
    style VERTEX_LYRIA fill:#4285f4,stroke:#1a73e8,color:#fff
```

## Technologies Used

### Frontend
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **React Router** - Navigation
- **Tailwind CSS** - Styling
- **Three.js** - 3D visualization

### Backend
- **Rust** - Performance & safety
- **Axum** - Web framework
- **Tokio** - Async runtime
- **Serde** - Serialization
- **Reqwest** - HTTP client

### GCP / Gemini
- **Gemini 2.5 Flash** - Text generation
- **Gemini 3 Pro Image** - Image generation
- **Veo 3.1** - Video generation
- **Gemini TTS** - Speech synthesis
- **Lyria 002** - Music generation

### Storage
- **Local File System** - Primary storage
- **Supabase Storage** - Cloud backup & sync

### Core Libraries
- **geo-core** - Terrain simulation (Rust)
- **worldgen-core** - Province clustering (Rust)
- **@ashtrail/core** - Shared game logic (TypeScript)

## Key Architecture Points

1. **Hybrid Architecture**: React Frontend + Rust Backend for maximum performance
2. **Complete Gemini Integration**: Text, image, video, audio, music generation
3. **Procedural Generation Pipeline**: Terrain → Provinces → Ecology → Locations
4. **Asynchronous Job System**: Long-running task management with progress tracking
5. **Hybrid Storage**: Local + Cloud with Supabase synchronization
6. **Fallback Chain**: Resilience with backup models
7. **Modularity**: Independent tools (World Gen, Asset Gen, Character Builder, etc.)
