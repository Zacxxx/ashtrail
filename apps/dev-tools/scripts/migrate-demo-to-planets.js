#!/usr/bin/env node

/**
 * Migration script to move demo content from demo-output to planets folder structure
 * Usage: node scripts/migrate-demo-to-planets.js <demo-run-id>
 * Example: node scripts/migrate-demo-to-planets.js e84c79a9-48e2-407b-8d27-2a0e900473de
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEMO_RUN_ID = process.argv[2];

if (!DEMO_RUN_ID) {
    console.error('❌ Please provide a demo run ID');
    console.error('Usage: node scripts/migrate-demo-to-planets.js <demo-run-id>');
    process.exit(1);
}

const DEMO_OUTPUT_DIR = path.join(__dirname, '../generated/demo-output', DEMO_RUN_ID);
const PLANETS_DIR = path.join(__dirname, '../generated/planets');
const NEW_WORLD_ID = `demo-${DEMO_RUN_ID}`;
const NEW_WORLD_DIR = path.join(PLANETS_DIR, NEW_WORLD_ID);

console.log(`🚀 Migrating demo run: ${DEMO_RUN_ID}`);
console.log(`📁 Source: ${DEMO_OUTPUT_DIR}`);
console.log(`📁 Target: ${NEW_WORLD_DIR}`);

// Check if demo output exists
if (!fs.existsSync(DEMO_OUTPUT_DIR)) {
    console.error(`❌ Demo output directory not found: ${DEMO_OUTPUT_DIR}`);
    process.exit(1);
}

// Create world directory structure
console.log('\n📦 Creating world directory structure...');
const dirs = [
    NEW_WORLD_DIR,
    path.join(NEW_WORLD_DIR, 'characters'),
    path.join(NEW_WORLD_DIR, 'items'),
    path.join(NEW_WORLD_DIR, 'locations'),
    path.join(NEW_WORLD_DIR, 'quests'),
    path.join(NEW_WORLD_DIR, 'quests/chains'),
    path.join(NEW_WORLD_DIR, 'quests/glossary'),
    path.join(NEW_WORLD_DIR, 'quests/illustrations'),
    path.join(NEW_WORLD_DIR, 'quests/illustration-images'),
    path.join(NEW_WORLD_DIR, 'quests/snapshots'),
    path.join(NEW_WORLD_DIR, 'textures'),
    path.join(NEW_WORLD_DIR, 'worldgen'),
];

dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`  ✓ Created ${path.relative(PLANETS_DIR, dir)}`);
    }
});

// Step 1: Migrate world data
console.log('\n🌍 Step 1: Migrating world data...');
const step1Artifact = JSON.parse(fs.readFileSync(path.join(DEMO_OUTPUT_DIR, 'artifact.json'), 'utf8'));

const worldData = {
    id: NEW_WORLD_ID,
    name: step1Artifact.artifact.metadata.title,
    description: step1Artifact.artifact.loreText,
    createdAt: step1Artifact.createdAt,
    updatedAt: Date.now(),
};

fs.writeFileSync(
    path.join(NEW_WORLD_DIR, 'world_data.json'),
    JSON.stringify(worldData, null, 2)
);
console.log(`  ✓ Created world_data.json`);

// Copy world texture
const textureSource = path.join(DEMO_OUTPUT_DIR, 'image.png');
const textureDest = path.join(NEW_WORLD_DIR, 'textures', 'world-texture.png');
if (fs.existsSync(textureSource)) {
    fs.copyFileSync(textureSource, textureDest);
    console.log(`  ✓ Copied world texture`);
}

// Copy world audio
const audioSource = path.join(DEMO_OUTPUT_DIR, 'audio.wav');
const audioDest = path.join(NEW_WORLD_DIR, 'world-soundtrack.wav');
if (fs.existsSync(audioSource)) {
    fs.copyFileSync(audioSource, audioDest);
    console.log(`  ✓ Copied world soundtrack`);
}

// Create metadata.json
const metadata = {
    id: NEW_WORLD_ID,
    name: step1Artifact.artifact.metadata.title,
    description: step1Artifact.artifact.loreText,
    tags: step1Artifact.artifact.metadata.tags || [],
    createdAt: step1Artifact.createdAt,
    updatedAt: Date.now(),
    source: 'demo',
    demoRunId: DEMO_RUN_ID,
};

fs.writeFileSync(
    path.join(NEW_WORLD_DIR, 'metadata.json'),
    JSON.stringify(metadata, null, 2)
);
console.log(`  ✓ Created metadata.json`);

// Create gm_settings.json
const gmSettings = {
    worldPrompt: step1Artifact.artifact.loreText,
    worldName: step1Artifact.artifact.metadata.title,
};

fs.writeFileSync(
    path.join(NEW_WORLD_DIR, 'gm_settings.json'),
    JSON.stringify(gmSettings, null, 2)
);
console.log(`  ✓ Created gm_settings.json`);

// Step 2: Migrate character data
console.log('\n👤 Step 2: Migrating character data...');
const step2Dir = path.join(DEMO_OUTPUT_DIR, 'step-2');
if (fs.existsSync(step2Dir)) {
    const heroes = fs.readdirSync(step2Dir);
    
    heroes.forEach(hero => {
        const heroDir = path.join(step2Dir, hero);
        const artifactPath = path.join(heroDir, 'artifact.json');
        
        if (fs.existsSync(artifactPath)) {
            const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
            const draft = artifact.artifact.draft;
            
            // Create character ID
            const characterId = `demo-char-${hero}-${DEMO_RUN_ID.substring(0, 8)}`;
            
            // Build character object
            const character = {
                id: characterId,
                worldId: NEW_WORLD_ID,
                name: draft.name,
                age: draft.age,
                gender: draft.gender,
                level: draft.level,
                type: 'player',
                isNPC: false,
                occupation: {
                    name: draft.occupationName,
                },
                stats: draft.stats,
                history: draft.history,
                backstory: draft.backstory,
                traits: draft.traitNames || [],
                portraitUrl: artifact.artifact.portraitUrl,
                createdAt: artifact.createdAt,
                updatedAt: Date.now(),
            };
            
            fs.writeFileSync(
                path.join(NEW_WORLD_DIR, 'characters', `${characterId}.json`),
                JSON.stringify(character, null, 2)
            );
            console.log(`  ✓ Migrated character: ${draft.name} (${characterId})`);
            
            // Migrate weapon
            if (artifact.artifact.weaponArtifact) {
                const weapon = artifact.artifact.weaponArtifact.weapon;
                const weaponId = weapon.id || `demo-weapon-${hero}-${DEMO_RUN_ID.substring(0, 8)}`;
                
                const weaponData = {
                    ...weapon,
                    id: weaponId,
                    worldId: NEW_WORLD_ID,
                    ownerId: characterId,
                    loreText: artifact.artifact.weaponArtifact.loreText,
                    imageUrl: artifact.artifact.weaponArtifact.image?.url,
                    createdAt: artifact.createdAt,
                    updatedAt: Date.now(),
                };
                
                fs.writeFileSync(
                    path.join(NEW_WORLD_DIR, 'items', `${weaponId}.json`),
                    JSON.stringify(weaponData, null, 2)
                );
                console.log(`  ✓ Migrated weapon: ${weapon.name} (${weaponId})`);
            }
        }
    });
}

// Step 3: Migrate location data
console.log('\n📍 Step 3: Migrating location data...');
const step3Dir = path.join(DEMO_OUTPUT_DIR, 'step-3');
if (fs.existsSync(step3Dir)) {
    const heroes = fs.readdirSync(step3Dir);
    
    heroes.forEach(hero => {
        const heroDir = path.join(step3Dir, hero);
        const locations = fs.readdirSync(heroDir).filter(f => f.startsWith('demo-loc-'));
        
        locations.forEach(locDir => {
            const locPath = path.join(heroDir, locDir);
            const artifactPath = path.join(locPath, 'artifact.json');
            
            if (fs.existsSync(artifactPath)) {
                const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
                const locationId = artifact.artifact.locationHint.nodeId;
                
                const location = {
                    id: locationId,
                    worldId: NEW_WORLD_ID,
                    name: artifact.artifact.locationTitle,
                    description: artifact.artifact.briefText,
                    type: 'landmark',
                    coordinates: {
                        lat: artifact.artifact.locationHint.lat,
                        lon: artifact.artifact.locationHint.lon,
                    },
                    imageUrl: artifact.artifact.image?.url,
                    createdAt: artifact.createdAt,
                    updatedAt: Date.now(),
                };
                
                fs.writeFileSync(
                    path.join(NEW_WORLD_DIR, 'locations', `${locationId}.json`),
                    JSON.stringify(location, null, 2)
                );
                console.log(`  ✓ Migrated location: ${artifact.artifact.locationTitle} (${locationId})`);
            }
        });
    });
}

// Step 4: Move quest data
console.log('\n🎯 Step 4: Migrating quest data...');
const step4Artifact = path.join(DEMO_OUTPUT_DIR, 'step-4/john/loc-3/artifact.json');
if (fs.existsSync(step4Artifact)) {
    const artifact = JSON.parse(fs.readFileSync(step4Artifact, 'utf8'));
    const questRunId = artifact.artifact.questRunId;
    
    if (questRunId) {
        // Check if quest exists in old world
        const oldWorldId = artifact.artifact.worldId || '665774da-472d-4570-adfb-1242ceefdfd9';
        const oldQuestPath = path.join(PLANETS_DIR, oldWorldId, 'quests', `${questRunId}.json`);
        
        if (fs.existsSync(oldQuestPath)) {
            const questData = JSON.parse(fs.readFileSync(oldQuestPath, 'utf8'));
            
            // Update world ID
            questData.worldId = NEW_WORLD_ID;
            
            // Save to new location
            fs.writeFileSync(
                path.join(NEW_WORLD_DIR, 'quests', `${questRunId}.json`),
                JSON.stringify(questData, null, 2)
            );
            console.log(`  ✓ Migrated quest: ${questRunId}`);
        } else {
            console.log(`  ⚠️  Quest not found: ${questRunId}`);
        }
    }
}

// Update step 4 artifact with new world ID
console.log('\n📝 Updating artifacts with new world ID...');
if (fs.existsSync(step4Artifact)) {
    const artifact = JSON.parse(fs.readFileSync(step4Artifact, 'utf8'));
    artifact.artifact.worldId = NEW_WORLD_ID;
    fs.writeFileSync(step4Artifact, JSON.stringify(artifact, null, 2));
    console.log(`  ✓ Updated step 4 artifact`);
}

console.log(`\n✅ Migration complete!`);
console.log(`\n📊 Summary:`);
console.log(`  World ID: ${NEW_WORLD_ID}`);
console.log(`  World Name: ${step1Artifact.artifact.metadata.title}`);
console.log(`  Location: ${NEW_WORLD_DIR}`);
console.log(`\n🎮 You can now use this world in the demo and devtools!`);
