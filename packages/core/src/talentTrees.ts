import { TalentTree } from './types';

export const MOCK_TALENT_TREES: Record<string, TalentTree> = {
    'occ-soldier': {
        occupationId: 'occ-soldier',
        nodes: [
            // Tier 1: Entry
            { id: 's-1', name: 'Basic Training', description: 'Standard military protocols.', pos: { x: 0, y: -300 }, type: 'passive' },

            // Tier 2: The Split
            { id: 's-2', name: 'Offensive Stance', description: 'Focus on direct engagements.', pos: { x: -150, y: -180 }, dependencies: ['s-1'], type: 'passive' },
            { id: 's-3', name: 'Defensive Stance', description: 'Focus on hazard mitigation.', pos: { x: 150, y: -180 }, dependencies: ['s-1'], type: 'passive' },

            // Tier 3: Mid-Branch
            { id: 's-4', name: 'Heavy Weapons', description: 'Increased firepower.', pos: { x: -150, y: -60 }, dependencies: ['s-2'], type: 'passive' },
            { id: 's-5', name: 'Armor Plating', description: 'Increased protection.', pos: { x: 150, y: -60 }, dependencies: ['s-3'], type: 'passive' },

            // Tier 4: The Convergence
            { id: 's-6', name: 'Elite Operative', description: 'Versatile combat master.', pos: { x: 0, y: 60 }, dependencies: ['s-4', 's-5'], type: 'passive' },

            // Tier 5: Transition
            { id: 's-7', name: 'War Hero', description: 'Inspirational presence.', pos: { x: 0, y: 180 }, dependencies: ['s-6'], type: 'passive' },

            // Tier 6: Final Split (Capstone)
            { id: 's-8', name: 'Apex Predator', description: 'Single-target elimination.', pos: { x: -120, y: 300 }, dependencies: ['s-7'], type: 'active' },
            { id: 's-9', name: 'Battlefield Legend', description: 'Wide-area influence.', pos: { x: 120, y: 300 }, dependencies: ['s-7'], type: 'passive' },
        ]
    },
    'occ-guard': {
        occupationId: 'occ-guard',
        nodes: [
            // Tier 1: Entry
            { id: 'g-1', name: 'Sentry Protocols', description: 'Standard watch procedures.', pos: { x: 0, y: -300 }, type: 'passive' },

            // Tier 2: The Split
            { id: 'g-2', name: 'Shield Specialization', description: 'Left defensive path.', pos: { x: -150, y: -180 }, dependencies: ['g-1'], type: 'passive' },
            { id: 'g-3', name: 'Detection Grid', description: 'Right detection path.', pos: { x: 150, y: -180 }, dependencies: ['g-1'], type: 'passive' },

            // Tier 3: Mid-Branch
            { id: 'g-4', name: 'Kinetic Rebound', description: 'Advanced energy redirection.', pos: { x: -150, y: -60 }, dependencies: ['g-2'], type: 'passive' },
            { id: 'g-5', name: 'Neural Scanner', description: 'Improved biological detection.', pos: { x: 150, y: -60 }, dependencies: ['g-3'], type: 'passive' },

            // Tier 4: The Convergence
            { id: 'g-6', name: 'Fortress', description: 'The absolute unit of defense.', pos: { x: 0, y: 60 }, dependencies: ['g-4', 'g-5'], type: 'passive' },

            // Tier 5: Transition
            { id: 'g-7', name: 'Bastion Protocols', description: 'Area denial mastery.', pos: { x: 0, y: 180 }, dependencies: ['g-6'], type: 'passive' },

            // Tier 6: Final Split
            { id: 'g-8', name: 'Guardian Angel', description: 'Total ally protection.', pos: { x: -120, y: 300 }, dependencies: ['g-7'], type: 'active' },
            { id: 'g-9', name: 'Eternal Watcher', description: 'Infinite awareness.', pos: { x: 120, y: 300 }, dependencies: ['g-7'], type: 'passive' },
        ]
    }
};
