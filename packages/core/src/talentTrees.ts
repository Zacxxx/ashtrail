import { TalentTree } from './types';

export const MOCK_TALENT_TREES: Record<string, TalentTree> = {
    'occ-soldier': {
        occupationId: 'occ-soldier',
        nodes: [
            // Tier 1
            { id: 's-t1-1', name: 'Basic Drills', description: 'Fundamental soldiering. +5% HP.', pos: { x: 0, y: -200 }, type: 'passive' },

            // Tier 2
            { id: 's-t2-1', name: 'Rifleman', description: 'Proficiency with distance weapons.', pos: { x: -150, y: -100 }, dependencies: ['s-t1-1'], type: 'passive' },
            { id: 's-t2-2', name: 'Commando', description: 'Close quarters combat training.', pos: { x: -50, y: -100 }, dependencies: ['s-t1-1'], type: 'passive' },
            { id: 's-t2-3', name: 'Medic Training', description: 'Basic first aid for the field.', pos: { x: 50, y: -100 }, dependencies: ['s-t1-1'], type: 'passive' },
            { id: 's-t2-4', name: 'Tactician', description: 'Understanding troop movements.', pos: { x: 150, y: -100 }, dependencies: ['s-t1-1'], type: 'passive' },

            // Tier 3
            { id: 's-t3-1', name: 'Sharpshooter', description: 'Critical hit chance +10%.', pos: { x: -150, y: 0 }, dependencies: ['s-t2-1'], type: 'stat' },
            { id: 's-t3-2', name: 'Breacher', description: 'First strike deals double damage.', pos: { x: -50, y: 0 }, dependencies: ['s-t2-2'], type: 'active' },
            { id: 's-t3-3', name: 'Field Surgeon', description: 'Healing items are 25% more effective.', pos: { x: 50, y: 0 }, dependencies: ['s-t2-3'], type: 'passive' },
            { id: 's-t3-4', name: 'Strategist', description: 'Reduce party AP costs by 1.', pos: { x: 150, y: 0 }, dependencies: ['s-t2-4'], type: 'passive' },

            // Tier 4
            { id: 's-t4-1', name: 'Overwatch', description: 'Free attack on moving enemies.', pos: { x: -150, y: 100 }, dependencies: ['s-t3-1'], type: 'active' },
            { id: 's-t4-2', name: 'Unstoppable', description: 'Cannot be stunned or slowed.', pos: { x: -50, y: 100 }, dependencies: ['s-t3-2'], type: 'passive' },
            { id: 's-t4-3', name: 'Trauma Specialist', description: 'Instantly revive downed allies (1/combat).', pos: { x: 50, y: 100 }, dependencies: ['s-t3-3'], type: 'active' },
            { id: 's-t4-4', name: 'War Room Master', description: 'Reveal all enemy positions on map.', pos: { x: 150, y: 100 }, dependencies: ['s-t3-4'], type: 'passive' },

            // Tier 5 - Capstone
            { id: 's-capstone', name: 'Legend of the Ash', description: 'The ultimate survivor. All stats +2.', pos: { x: 0, y: 200 }, dependencies: ['s-t4-1', 's-t4-2', 's-t4-3', 's-t4-4'], type: 'passive' },
        ]
    },
    'occ-guard': {
        occupationId: 'occ-guard',
        nodes: [
            { id: 'g-t1-1', name: 'Sentry Training', description: 'Basic vigilance. +10% vision.', pos: { x: 0, y: -200 }, type: 'passive' },
            { id: 'g-t2-1', name: 'Bulwark', description: 'Shield proficiency.', pos: { x: -75, y: -100 }, dependencies: ['g-t1-1'], type: 'passive' },
            { id: 'g-t2-2', name: 'Interrogator', description: 'Extract information from captives.', pos: { x: 75, y: -100 }, dependencies: ['g-t1-1'], type: 'active' },
            { id: 'g-capstone', name: 'Bastion of Hope', description: 'Immune to fear. Party defense +20%.', pos: { x: 0, y: 0 }, dependencies: ['g-t2-1', 'g-t2-2'], type: 'passive' },
        ]
    }
};
