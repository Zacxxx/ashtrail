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
    },
    'occ-militia': {
        occupationId: 'occ-militia',
        nodes: [
            { id: 'm-1', name: 'Citizen Drill', description: 'Basic community defense training.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'm-2', name: 'Guerrilla Tactics', description: 'Fighting from the shadows.', pos: { x: -150, y: -180 }, dependencies: ['m-1'], type: 'passive' },
            { id: 'm-3', name: 'Hold the Line', description: 'Strength in numbers.', pos: { x: 150, y: -180 }, dependencies: ['m-1'], type: 'passive' },
            { id: 'm-4', name: 'Improvised Traps', description: 'Hinder enemy progress.', pos: { x: -150, y: -60 }, dependencies: ['m-2'], type: 'passive' },
            { id: 'm-5', name: 'Shield Link', description: 'Shared defense with allies.', pos: { x: 150, y: -60 }, dependencies: ['m-3'], type: 'passive' },
            { id: 'm-6', name: 'Volunteers Fury', description: 'Increased resolve when cornered.', pos: { x: 0, y: 60 }, dependencies: ['m-4', 'm-5'], type: 'passive' },
            { id: 'm-7', name: 'Home Ground Advantage', description: 'Maximum efficiency in settlements.', pos: { x: 0, y: 180 }, dependencies: ['m-6'], type: 'passive' },
            { id: 'm-8', name: 'Last Stand', description: 'Unbreakable morale for one engagement.', pos: { x: -120, y: 300 }, dependencies: ['m-7'], type: 'active' },
            { id: 'm-9', name: 'Veteran Volunteer', description: 'Permanent stat boost to all stats.', pos: { x: 120, y: 300 }, dependencies: ['m-7'], type: 'stat' },
        ]
    },
    'occ-mercenary': {
        occupationId: 'occ-mercenary',
        nodes: [
            { id: 'mc-1', name: 'Contract Negotiations', description: 'Maximise payout efficiency.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'mc-2', name: 'Tactical Flex', description: 'Adapting to any weapon.', pos: { x: -150, y: -180 }, dependencies: ['mc-1'], type: 'passive' },
            { id: 'mc-3', name: 'Iron Loyalty', description: 'Trust through profit.', pos: { x: 150, y: -180 }, dependencies: ['mc-1'], type: 'passive' },
            { id: 'mc-4', name: 'Deadly Precision', description: 'Critical hit mastery.', pos: { x: -150, y: -60 }, dependencies: ['mc-2'], type: 'passive' },
            { id: 'mc-5', name: 'Hazard Pay', description: 'Bonus loot from dangerous sites.', pos: { x: 150, y: -60 }, dependencies: ['mc-3'], type: 'passive' },
            { id: 'mc-6', name: 'War Profiteer', description: 'Scrap efficiency in combat.', pos: { x: 0, y: 60 }, dependencies: ['mc-4', 'mc-5'], type: 'passive' },
            { id: 'mc-7', name: 'Elite Contractor', description: 'High-tier reward unlock.', pos: { x: 0, y: 180 }, dependencies: ['mc-6'], type: 'passive' },
            { id: 'mc-8', name: 'Kill-Switch', description: 'Massive burst damage ability.', pos: { x: -120, y: 300 }, dependencies: ['mc-7'], type: 'active' },
            { id: 'mc-9', name: 'Legacy of Blood', description: 'Combat experience bonus.', pos: { x: 120, y: 300 }, dependencies: ['mc-7'], type: 'passive' },
        ]
    },
    'occ-bounty-hunter': {
        occupationId: 'occ-bounty-hunter',
        nodes: [
            { id: 'bh-1', name: 'Track & Tag', description: 'Initial target identification.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'bh-2', name: 'Dead or Alive', description: 'Bonus for non-lethal take-downs.', pos: { x: -150, y: -180 }, dependencies: ['bh-1'], type: 'passive' },
            { id: 'bh-3', name: 'Relentless Pursuit', description: 'Faster map discovery of targets.', pos: { x: 150, y: -180 }, dependencies: ['bh-1'], type: 'passive' },
            { id: 'bh-4', name: 'Sniper Nest', description: 'Long-range accuracy bonus.', pos: { x: -150, y: -60 }, dependencies: ['bh-2'], type: 'passive' },
            { id: 'bh-5', name: 'Net Trap', description: 'Slow enemies significantly.', pos: { x: 150, y: -60 }, dependencies: ['bh-3'], type: 'active' },
            { id: 'bh-6', name: 'Manhunter', description: 'Increased damage to human targets.', pos: { x: 0, y: 60 }, dependencies: ['bh-4', 'bh-5'], type: 'passive' },
            { id: 'bh-7', name: 'Shadow Stalker', description: 'Stealth efficiency.', pos: { x: 0, y: 180 }, dependencies: ['bh-6'], type: 'passive' },
            { id: 'bh-8', name: 'Marksman Focus', description: 'Guaranteed critical hit.', pos: { x: -120, y: 300 }, dependencies: ['bh-7'], type: 'active' },
            { id: 'bh-9', name: 'Headhunter Legend', description: 'Maximized bounty rewards.', pos: { x: 120, y: 300 }, dependencies: ['bh-7'], type: 'passive' },
        ]
    },
    'occ-caravan-guard': {
        occupationId: 'occ-caravan-guard',
        nodes: [
            { id: 'cg-1', name: 'Road Awareness', description: 'Spot ambushes early.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'cg-2', name: 'Cargo Protector', description: 'Reduce loot loss in defeat.', pos: { x: -150, y: -180 }, dependencies: ['cg-1'], type: 'passive' },
            { id: 'cg-3', name: 'Convoy Tactics', description: 'Shared defense for vehicles.', pos: { x: 150, y: -180 }, dependencies: ['cg-1'], type: 'passive' },
            { id: 'cg-4', name: 'Reinforced Bulkhead', description: 'Increased armor for transports.', pos: { x: -150, y: -60 }, dependencies: ['cg-2'], type: 'passive' },
            { id: 'cg-5', name: 'Lead Driver', description: 'Faster convoy travel speed.', pos: { x: 150, y: -60 }, dependencies: ['cg-3'], type: 'passive' },
            { id: 'cg-6', name: 'Road Warrior', description: 'Damage bonus while on roads.', pos: { x: 0, y: 60 }, dependencies: ['cg-4', 'cg-5'], type: 'passive' },
            { id: 'cg-7', name: 'Route Master', description: 'Fuel efficiency boost.', pos: { x: 0, y: 180 }, dependencies: ['cg-6'], type: 'passive' },
            { id: 'cg-8', name: 'Steel Curtain', description: 'Large area defensive buff.', pos: { x: -120, y: 300 }, dependencies: ['cg-7'], type: 'active' },
            { id: 'cg-9', name: 'Highway Legend', description: 'Permanent immunity to road fatigue.', pos: { x: 120, y: 300 }, dependencies: ['cg-7'], type: 'passive' },
        ]
    },
    'occ-reformed-raider': {
        occupationId: 'occ-reformed-raider',
        nodes: [
            { id: 'rr-1', name: 'Raider Logic', description: 'Understand bandit tactics.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'rr-2', name: 'Scavenged Armor', description: 'Make do with scrap.', pos: { x: -150, y: -180 }, dependencies: ['rr-1'], type: 'passive' },
            { id: 'rr-3', name: 'Intimidation', description: 'Scare off weaker foes.', pos: { x: 150, y: -180 }, dependencies: ['rr-1'], type: 'passive' },
            { id: 'rr-4', name: 'Dirty Fighting', description: 'Nasty surprises in melee.', pos: { x: -150, y: -60 }, dependencies: ['rr-2'], type: 'active' },
            { id: 'rr-5', name: 'Hidden Stash', description: 'Locate secret raider loot.', pos: { x: 150, y: -60 }, dependencies: ['rr-3'], type: 'passive' },
            { id: 'rr-6', name: 'Wasteland Survivor', description: 'Resource consumption bonus.', pos: { x: 0, y: 60 }, dependencies: ['rr-4', 'rr-5'], type: 'passive' },
            { id: 'rr-7', name: 'Blood Resolve', description: 'Health regen from combat.', pos: { x: 0, y: 180 }, dependencies: ['rr-6'], type: 'passive' },
            { id: 'rr-8', name: 'War Cry', description: 'AoE fear effect on enemies.', pos: { x: -120, y: 300 }, dependencies: ['rr-7'], type: 'active' },
            { id: 'rr-9', name: 'Raider King', description: 'Command over wasteland factions.', pos: { x: 120, y: 300 }, dependencies: ['rr-7'], type: 'passive' },
        ]
    },
    'occ-mechanic': {
        occupationId: 'occ-mechanic',
        nodes: [
            { id: 'mech-1', name: 'Engine Maintenance', description: 'Basis of all vehicle operations.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'mech-2', name: 'Jury-Rigging', description: 'Fix things with scrap.', pos: { x: -150, y: -180 }, dependencies: ['mech-1'], type: 'passive' },
            { id: 'mech-3', name: 'Tuning', description: 'Extract 10% more power.', pos: { x: 150, y: -180 }, dependencies: ['mech-1'], type: 'passive' },
            { id: 'mech-4', name: 'Salvage Expert', description: '30% more parts found.', pos: { x: -150, y: -60 }, dependencies: ['mech-2'], type: 'passive' },
            { id: 'mech-5', name: 'Overdrive', description: 'Temporary speed boost ability.', pos: { x: 150, y: -60 }, dependencies: ['mech-3'], type: 'active' },
            { id: 'mech-6', name: 'Master Grease-Monkey', description: 'All repairs 50% cheaper.', pos: { x: 0, y: 60 }, dependencies: ['mech-4', 'mech-5'], type: 'passive' },
            { id: 'mech-7', name: 'Vehicle Synchronicity', description: 'Ignore terrain penalties.', pos: { x: 0, y: 180 }, dependencies: ['mech-6'], type: 'passive' },
            { id: 'mech-8', name: 'Full Throttle', description: 'Maximum speed potential.', pos: { x: -120, y: 300 }, dependencies: ['mech-7'], type: 'active' },
            { id: 'mech-9', name: 'Omni-Mechanic', description: 'Can repair any tech type.', pos: { x: 120, y: 300 }, dependencies: ['mech-7'], type: 'passive' },
        ]
    },
    'occ-engineer': {
        occupationId: 'occ-engineer',
        nodes: [
            { id: 'eng-1', name: 'Blueprint Analysis', description: 'Understand complex designs.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'eng-2', name: 'Fortification Design', description: 'Stronger settlement walls.', pos: { x: -150, y: -180 }, dependencies: ['eng-1'], type: 'passive' },
            { id: 'eng-3', name: 'Energy Systems', description: 'Efficient power generation.', pos: { x: 150, y: -180 }, dependencies: ['eng-1'], type: 'passive' },
            { id: 'eng-4', name: 'Structural Integrity', description: 'Buildings last 40% longer.', pos: { x: -150, y: -60 }, dependencies: ['eng-2'], type: 'passive' },
            { id: 'eng-5', name: 'Plasma Cutter', description: 'Effective against heavy armor.', pos: { x: 150, y: -60 }, dependencies: ['eng-3'], type: 'active' },
            { id: 'eng-6', name: 'Senior Architect', description: 'Unlock advanced structures.', pos: { x: 0, y: 60 }, dependencies: ['eng-4', 'eng-5'], type: 'passive' },
            { id: 'eng-7', name: 'Precision Engineering', description: 'Crafted weapons stay sharp longer.', pos: { x: 0, y: 180 }, dependencies: ['eng-6'], type: 'passive' },
            { id: 'eng-8', name: 'Prime Directive', description: 'Global productivity buff.', pos: { x: -120, y: 300 }, dependencies: ['eng-7'], type: 'active' },
            { id: 'eng-9', name: 'Theoretical Master', description: 'Infinite blueprint knowledge.', pos: { x: 120, y: 300 }, dependencies: ['eng-7'], type: 'passive' },
        ]
    },
    'occ-electrician': {
        occupationId: 'occ-electrician',
        nodes: [
            { id: 'elec-1', name: 'Circuit Theory', description: 'Basic wiring and power flow.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'elec-2', name: 'High Voltage', description: 'Boost generator output.', pos: { x: -150, y: -180 }, dependencies: ['elec-1'], type: 'passive' },
            { id: 'elec-3', name: 'Low Signal', description: 'Stealth electronic detection.', pos: { x: 150, y: -180 }, dependencies: ['elec-1'], type: 'passive' },
            { id: 'elec-4', name: 'Tesla Coil', description: 'Static defense ability.', pos: { x: -150, y: -60 }, dependencies: ['elec-2'], type: 'active' },
            { id: 'elec-5', name: 'Signal Jammer', description: 'Inhibit enemy radio.', pos: { x: 150, y: -60 }, dependencies: ['elec-3'], type: 'passive' },
            { id: 'elec-6', name: 'Power Grid Master', description: 'Link multiple power sources.', pos: { x: 0, y: 60 }, dependencies: ['elec-4', 'elec-5'], type: 'passive' },
            { id: 'elec-7', name: 'Static Discharge', description: 'Reflect damage as electrical.', pos: { x: 0, y: 180 }, dependencies: ['elec-6'], type: 'passive' },
            { id: 'elec-8', name: 'Overcharge', description: 'Huge temporary power burst.', pos: { x: -120, y: 300 }, dependencies: ['elec-7'], type: 'active' },
            { id: 'elec-9', name: 'Neural Link', description: 'Control tech with thoughts.', pos: { x: 120, y: 300 }, dependencies: ['elec-7'], type: 'passive' },
        ]
    },
    'occ-welder': {
        occupationId: 'occ-welder',
        nodes: [
            { id: 'weld-1', name: 'Beaded Seams', description: 'Stronger metal bonds.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'weld-2', name: 'Plate Reinforcement', description: 'Extra protection for cars.', pos: { x: -150, y: -180 }, dependencies: ['weld-1'], type: 'passive' },
            { id: 'weld-3', name: 'Precision Torch', description: 'Fine cuts for advanced tech.', pos: { x: 150, y: -180 }, dependencies: ['weld-1'], type: 'passive' },
            { id: 'weld-4', name: 'Heat Resistance', description: 'Work longer at high temps.', pos: { x: -150, y: -60 }, dependencies: ['weld-2'], type: 'passive' },
            { id: 'weld-5', name: 'Armor Smithing', description: 'Craft heavy metal gear.', pos: { x: 150, y: -60 }, dependencies: ['weld-3'], type: 'passive' },
            { id: 'weld-6', name: 'Blast Shield', description: 'Massive explosion resistance.', pos: { x: 0, y: 60 }, dependencies: ['weld-4', 'weld-5'], type: 'stat' },
            { id: 'weld-7', name: 'Molten Core', description: 'Reflect burning damage.', pos: { x: 0, y: 180 }, dependencies: ['weld-6'], type: 'passive' },
            { id: 'weld-8', name: 'Flash Forge', description: 'Instant equipment repair.', pos: { x: -120, y: 300 }, dependencies: ['weld-7'], type: 'active' },
            { id: 'weld-9', name: 'Master Craftsman', description: 'Indestructible metalwork.', pos: { x: 120, y: 300 }, dependencies: ['weld-7'], type: 'passive' },
        ]
    },
    'occ-scrapper': {
        occupationId: 'occ-scrapper',
        nodes: [
            { id: 'scr-1', name: 'Junkyard Sight', description: 'Identify valuable scrap.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'scr-2', name: 'Efficient Stripping', description: 'Get more from dismantling.', pos: { x: -150, y: -180 }, dependencies: ['scr-1'], type: 'passive' },
            { id: 'scr-3', name: 'Deep Salvage', description: 'Reach hidden caches.', pos: { x: 150, y: -180 }, dependencies: ['scr-1'], type: 'passive' },
            { id: 'scr-4', name: 'Component Recovery', description: 'Rare parts are more common.', pos: { x: -150, y: -60 }, dependencies: ['scr-2'], type: 'passive' },
            { id: 'scr-5', name: 'Hazardous Scrap', description: 'Handle radioactive parts.', pos: { x: 150, y: -60 }, dependencies: ['scr-3'], type: 'passive' },
            { id: 'scr-6', name: 'Hoarders Dream', description: 'Massive inventory for parts.', pos: { x: 0, y: 60 }, dependencies: ['scr-4', 'scr-5'], type: 'passive' },
            { id: 'scr-7', name: 'Resource Cycle', description: 'Refund 20% on all builds.', pos: { x: 0, y: 180 }, dependencies: ['scr-6'], type: 'passive' },
            { id: 'scr-8', name: 'Scrap Storm', description: 'AoE metal shrapnel attack.', pos: { x: -120, y: 300 }, dependencies: ['scr-7'], type: 'active' },
            { id: 'scr-9', name: 'King of Ash', description: 'Infinite salvage potential.', pos: { x: 120, y: 300 }, dependencies: ['scr-7'], type: 'passive' },
        ]
    },
    'occ-builder': {
        occupationId: 'occ-builder',
        nodes: [
            { id: 'bld-1', name: 'Foundation Work', description: 'Solid start for projects.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'bld-2', name: 'Rapid Construction', description: 'Build 20% faster.', pos: { x: -150, y: -180 }, dependencies: ['bld-1'], type: 'passive' },
            { id: 'bld-3', name: 'Material Efficiency', description: 'Use 15% less resources.', pos: { x: 150, y: -180 }, dependencies: ['bld-1'], type: 'passive' },
            { id: 'bld-4', name: 'Modular Design', description: 'Upgrade buildings cheaper.', pos: { x: -150, y: -60 }, dependencies: ['bld-2'], type: 'passive' },
            { id: 'bld-5', name: 'Heavy Lifting', description: 'Increased carry capacity.', pos: { x: 150, y: -60 }, dependencies: ['bld-3'], type: 'stat' },
            { id: 'bld-6', name: 'Master Foreman', description: 'Bonus to all team builders.', pos: { x: 0, y: 60 }, dependencies: ['bld-4', 'bld-5'], type: 'passive' },
            { id: 'bld-7', name: 'Reinforced Walls', description: 'Buildings gain massive HP.', pos: { x: 0, y: 180 }, dependencies: ['bld-6'], type: 'passive' },
            { id: 'bld-8', name: 'Instant Shelter', description: 'Create temporary cover.', pos: { x: -120, y: 300 }, dependencies: ['bld-7'], type: 'active' },
            { id: 'bld-9', name: 'World Maker', description: 'Construct legendary buildings.', pos: { x: 120, y: 300 }, dependencies: ['bld-7'], type: 'passive' },
        ]
    },
    'occ-farmer': {
        occupationId: 'occ-farmer',
        nodes: [
            { id: 'farm-1', name: 'Soil Preparation', description: 'Coax life from the ash.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'farm-2', name: 'Water Rationing', description: 'Irrigation efficiency.', pos: { x: -150, y: -180 }, dependencies: ['farm-1'], type: 'passive' },
            { id: 'farm-3', name: 'Hardy Strains', description: 'Increased crop yield.', pos: { x: 150, y: -180 }, dependencies: ['farm-1'], type: 'passive' },
            { id: 'farm-4', name: 'Pest Control', description: 'Protect against mutated locusts.', pos: { x: -150, y: -60 }, dependencies: ['farm-2'], type: 'passive' },
            { id: 'farm-5', name: 'Natural Fertilizer', description: 'Faster crop growth.', pos: { x: 150, y: -60 }, dependencies: ['farm-3'], type: 'passive' },
            { id: 'farm-6', name: 'Master Harvester', description: 'Bonus food from all nodes.', pos: { x: 0, y: 60 }, dependencies: ['farm-4', 'farm-5'], type: 'passive' },
            { id: 'farm-7', name: 'Sustainable Growth', description: 'Reduce world scarcity impact.', pos: { x: 0, y: 180 }, dependencies: ['farm-6'], type: 'passive' },
            { id: 'farm-8', name: 'Bountiful Feast', description: 'Massive party morale boost.', pos: { x: -120, y: 300 }, dependencies: ['farm-7'], type: 'active' },
            { id: 'farm-9', name: 'Nature Tamer', description: 'Control the wild ash plants.', pos: { x: 120, y: 300 }, dependencies: ['farm-7'], type: 'passive' },
        ]
    },
    'occ-shepherd': {
        occupationId: 'occ-shepherd',
        nodes: [
            { id: 'shep-1', name: 'Flock Guidance', description: 'Manage small herds.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'shep-2', name: 'Vigilant Watch', description: 'Predator detection.', pos: { x: -150, y: -180 }, dependencies: ['shep-1'], type: 'passive' },
            { id: 'shep-3', name: 'Herding Dogs', description: 'Passive group protection.', pos: { x: 150, y: -180 }, dependencies: ['shep-1'], type: 'passive' },
            { id: 'shep-4', name: 'Wild Call', description: 'Attract stray animals.', pos: { x: -150, y: -60 }, dependencies: ['shep-2'], type: 'active' },
            { id: 'shep-5', name: 'Wool Processing', description: 'Bonus trade materials.', pos: { x: 150, y: -60 }, dependencies: ['shep-3'], type: 'passive' },
            { id: 'shep-6', name: 'Alpha Shepherd', description: 'Increased animal efficiency.', pos: { x: 0, y: 60 }, dependencies: ['shep-4', 'shep-5'], type: 'passive' },
            { id: 'shep-7', name: 'Animal Bond', description: 'Lower morale loss with pets.', pos: { x: 0, y: 180 }, dependencies: ['shep-6'], type: 'passive' },
            { id: 'shep-8', name: 'Stampede', description: 'AoE trample damage ability.', pos: { x: -120, y: 300 }, dependencies: ['shep-7'], type: 'active' },
            { id: 'shep-9', name: 'Spirit of the Pack', description: 'Permanent group stat buff.', pos: { x: 120, y: 300 }, dependencies: ['shep-7'], type: 'passive' },
        ]
    },
    'occ-livestock-keeper': {
        occupationId: 'occ-livestock-keeper',
        nodes: [
            { id: 'live-1', name: 'Barn Management', description: 'Maintain animal health.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'live-2', name: 'Selective Breeding', description: 'Stronger draft animals.', pos: { x: -150, y: -180 }, dependencies: ['live-1'], type: 'passive' },
            { id: 'live-3', name: 'Milking Routine', description: 'Passive food generation.', pos: { x: 150, y: -180 }, dependencies: ['live-1'], type: 'passive' },
            { id: 'live-4', name: 'Veterinary Basics', description: 'Heal animals manually.', pos: { x: -150, y: -60 }, dependencies: ['live-2'], type: 'passive' },
            { id: 'live-5', name: 'Butchery', description: 'Maximized meat yield.', pos: { x: 150, y: -60 }, dependencies: ['live-3'], type: 'passive' },
            { id: 'live-6', name: 'Ranch Master', description: 'Increased carry cap from animals.', pos: { x: 0, y: 60 }, dependencies: ['live-4', 'live-5'], type: 'passive' },
            { id: 'live-7', name: 'Stable Morale', description: 'Animals never panic.', pos: { x: 0, y: 180 }, dependencies: ['live-6'], type: 'passive' },
            { id: 'live-8', name: 'Grand Exhibition', description: 'Huge settlement trade bonus.', pos: { x: -120, y: 300 }, dependencies: ['live-7'], type: 'active' },
            { id: 'live-9', name: 'Lord of the Stables', description: 'Animals are invulnerable.', pos: { x: 120, y: 300 }, dependencies: ['live-7'], type: 'passive' },
        ]
    },
    'occ-tailor': {
        occupationId: 'occ-tailor',
        nodes: [
            { id: 'tail-1', name: 'Stitch Work', description: 'Basic fabric repair.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'tail-2', name: 'Reinforced Seams', description: 'Armor lasts 25% longer.', pos: { x: -150, y: -180 }, dependencies: ['tail-1'], type: 'passive' },
            { id: 'tail-3', name: 'Fashionable Scraps', description: 'Boost charisma via looks.', pos: { x: 150, y: -180 }, dependencies: ['tail-1'], type: 'stat' },
            { id: 'tail-4', name: 'Utility Pockets', description: 'Carry more small items.', pos: { x: -150, y: -60 }, dependencies: ['tail-2'], type: 'passive' },
            { id: 'tail-5', name: 'Camouflage Stitches', description: 'Reduced heat from stealth.', pos: { x: 150, y: -60 }, dependencies: ['tail-3'], type: 'passive' },
            { id: 'tail-6', name: 'Master Weaver', description: 'Craft superior light armor.', pos: { x: 0, y: 60 }, dependencies: ['tail-4', 'tail-5'], type: 'passive' },
            { id: 'tail-7', name: 'Thermal Insulation', description: 'Resist cold and ash storms.', pos: { x: 0, y: 180 }, dependencies: ['tail-6'], type: 'passive' },
            { id: 'tail-8', name: 'Invisibility Cloak', description: 'Temporary total stealth.', pos: { x: -120, y: 300 }, dependencies: ['tail-7'], type: 'active' },
            { id: 'tail-9', name: 'Drape of the Ancients', description: 'Indestructible legendary gear.', pos: { x: 120, y: 300 }, dependencies: ['tail-7'], type: 'passive' },
        ]
    },
    'occ-carpenter': {
        occupationId: 'occ-carpenter',
        nodes: [
            { id: 'carp-1', name: 'Woodworking', description: 'Work with salvaged timber.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'carp-2', name: 'Joint Mastery', description: 'Structures are more rigid.', pos: { x: -150, y: -180 }, dependencies: ['carp-1'], type: 'passive' },
            { id: 'carp-3', name: 'Tool Carving', description: 'Craft better wooden tools.', pos: { x: 150, y: -180 }, dependencies: ['carp-1'], type: 'passive' },
            { id: 'carp-4', name: 'Furniture Building', description: 'Increase rest efficiency.', pos: { x: -150, y: -60 }, dependencies: ['carp-2'], type: 'passive' },
            { id: 'carp-5', name: 'Barricade Expert', description: 'Wooden walls gain armor.', pos: { x: 150, y: -60 }, dependencies: ['carp-3'], type: 'passive' },
            { id: 'carp-6', name: 'Master Joiner', description: 'Buildings cost 30% less wood.', pos: { x: 0, y: 60 }, dependencies: ['carp-4', 'carp-5'], type: 'passive' },
            { id: 'carp-7', name: 'Wooden Fortress', description: 'Unlock legendary fortifications.', pos: { x: 0, y: 180 }, dependencies: ['carp-6'], type: 'passive' },
            { id: 'carp-8', name: 'Splinter Trap', description: 'Deploy explosive wood spikes.', pos: { x: -120, y: 300 }, dependencies: ['carp-7'], type: 'active' },
            { id: 'carp-9', name: 'Tree Singer', description: 'Regrow wood from ash.', pos: { x: 120, y: 300 }, dependencies: ['carp-7'], type: 'passive' },
        ]
    },
    'occ-tanner': {
        occupationId: 'occ-tanner',
        nodes: [
            { id: 'tan-1', name: 'Hide Stripping', description: 'Preserve skin quality.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'tan-2', name: 'Curing Salts', description: 'Leather lasts indefinitely.', pos: { x: -150, y: -180 }, dependencies: ['tan-1'], type: 'passive' },
            { id: 'tan-3', name: 'Leather Hardening', description: 'Boost armor value.', pos: { x: 150, y: -180 }, dependencies: ['tan-1'], type: 'passive' },
            { id: 'tan-4', name: 'Trophy Hunter', description: 'Bonus trade value from hides.', pos: { x: -150, y: -60 }, dependencies: ['tan-2'], type: 'passive' },
            { id: 'tan-5', name: 'Saddle Smith', description: 'Increased vehicle cargo cap.', pos: { x: 150, y: -60 }, dependencies: ['tan-3'], type: 'passive' },
            { id: 'tan-6', name: 'Master Skinner', description: 'Maximum leather yield.', pos: { x: 0, y: 60 }, dependencies: ['tan-4', 'tan-5'], type: 'passive' },
            { id: 'tan-7', name: 'Primal Protection', description: 'Immunity to poison damage.', pos: { x: 0, y: 180 }, dependencies: ['tan-6'], type: 'passive' },
            { id: 'tan-8', name: 'Beast Roar', description: 'Stun enemies with a cape flourish.', pos: { x: -120, y: 300 }, dependencies: ['tan-7'], type: 'active' },
            { id: 'tan-9', name: 'Leather King', description: 'Craft mythical elder dragon gear.', pos: { x: 120, y: 300 }, dependencies: ['tan-7'], type: 'passive' },
        ]
    },
    'occ-baker': {
        occupationId: 'occ-baker',
        nodes: [
            { id: 'bak-1', name: 'Dough Kneading', description: 'Efficient flour usage.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'bak-2', name: 'Preservative Bake', description: 'Rations last 2x longer.', pos: { x: -150, y: -180 }, dependencies: ['bak-1'], type: 'passive' },
            { id: 'bak-3', name: 'Aromatic Crust', description: 'Morale boost when eating.', pos: { x: 150, y: -180 }, dependencies: ['bak-1'], type: 'passive' },
            { id: 'bak-4', name: 'Travel Cakes', description: 'Reduced travel fatigue.', pos: { x: -150, y: -60 }, dependencies: ['bak-2'], type: 'passive' },
            { id: 'bak-5', name: 'Fortified Flour', description: 'Restore health when eating.', pos: { x: 150, y: -60 }, dependencies: ['bak-3'], type: 'passive' },
            { id: 'bak-6', name: 'Master Boulanger', description: 'Craft high-tier meals.', pos: { x: 0, y: 60 }, dependencies: ['bak-4', 'bak-5'], type: 'passive' },
            { id: 'bak-7', name: 'Communal Oven', description: 'Huge settlement morale buff.', pos: { x: 0, y: 180 }, dependencies: ['bak-6'], type: 'passive' },
            { id: 'bak-8', name: 'Sugar Rush', description: 'Temporary agility boost.', pos: { x: -120, y: 300 }, dependencies: ['bak-7'], type: 'active' },
            { id: 'bak-9', name: 'Bread of Life', description: 'Full heal upon consumption.', pos: { x: 120, y: 300 }, dependencies: ['bak-7'], type: 'passive' },
        ]
    },
    'occ-miller': {
        occupationId: 'occ-miller',
        nodes: [
            { id: 'mill-1', name: 'Grindstone Maintenance', description: 'Sustainable processing.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'mill-2', name: 'Fine Grinding', description: '20% more yield from grain.', pos: { x: -150, y: -180 }, dependencies: ['mill-1'], type: 'passive' },
            { id: 'mill-3', name: 'Ore Crushing', description: 'Extract rare minerals.', pos: { x: 150, y: -180 }, dependencies: ['mill-1'], type: 'passive' },
            { id: 'mill-4', name: 'Water Powered', description: 'Reduce manual labor cost.', pos: { x: -150, y: -60 }, dependencies: ['mill-2'], type: 'passive' },
            { id: 'mill-5', name: 'Industrial Scale', description: 'Process mass quantities.', pos: { x: 150, y: -60 }, dependencies: ['mill-3'], type: 'passive' },
            { id: 'mill-6', name: 'Master Miller', description: 'Zero processing waste.', pos: { x: 0, y: 60 }, dependencies: ['mill-4', 'mill-5'], type: 'passive' },
            { id: 'mill-7', name: 'Supply Chain Guru', description: 'Trade value of flour doubled.', pos: { x: 0, y: 180 }, dependencies: ['mill-6'], type: 'passive' },
            { id: 'mill-8', name: 'Heavy Stones', description: 'Deploy crushing trap.', pos: { x: -120, y: 300 }, dependencies: ['mill-7'], type: 'active' },
            { id: 'mill-9', name: 'Eternal Grind', description: 'Infinite resource processing.', pos: { x: 120, y: 300 }, dependencies: ['mill-7'], type: 'passive' },
        ]
    },
    'occ-blacksmith': {
        occupationId: 'occ-blacksmith',
        nodes: [
            { id: 'smith-1', name: 'Hammer Work', description: 'Basic metal shaping.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'smith-2', name: 'Temper Steel', description: 'Blades stay sharp longer.', pos: { x: -150, y: -180 }, dependencies: ['smith-1'], type: 'passive' },
            { id: 'smith-3', name: 'Heavy Forging', description: 'Craft heavy weaponry.', pos: { x: 150, y: -180 }, dependencies: ['smith-1'], type: 'passive' },
            { id: 'smith-4', name: 'Heat Treatment', description: 'Armor gains fire resist.', pos: { x: -150, y: -60 }, dependencies: ['smith-2'], type: 'passive' },
            { id: 'smith-5', name: 'Engraved Tools', description: 'Tools gain durability.', pos: { x: 150, y: -60 }, dependencies: ['smith-3'], type: 'passive' },
            { id: 'smith-6', name: 'Master Smith', description: 'Unlock legendary blueprints.', pos: { x: 0, y: 60 }, dependencies: ['smith-4', 'smith-5'], type: 'passive' },
            { id: 'smith-7', name: 'Indestructible Bond', description: 'Repairs are permanent.', pos: { x: 0, y: 180 }, dependencies: ['smith-6'], type: 'passive' },
            { id: 'smith-8', name: 'Dragon Slaying Edge', description: 'Massive damage vs mammals.', pos: { x: -120, y: 300 }, dependencies: ['smith-7'], type: 'active' },
            { id: 'smith-9', name: 'God of the Anvil', description: 'Craft mythical ash-weapons.', pos: { x: 120, y: 300 }, dependencies: ['smith-7'], type: 'passive' },
        ]
    },
    'occ-accountant': {
        occupationId: 'occ-accountant',
        nodes: [
            { id: 'acc-1', name: 'Ledger Audit', description: 'Spot resource leaks.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'acc-2', name: 'Budget Allocation', description: 'Bonus to settlement funds.', pos: { x: -150, y: -180 }, dependencies: ['acc-1'], type: 'passive' },
            { id: 'acc-3', name: 'Market Analysis', description: 'Better retail prices.', pos: { x: 150, y: -180 }, dependencies: ['acc-1'], type: 'passive' },
            { id: 'acc-4', name: 'Fiscal discipline', description: 'Reduce daily costs by 15%.', pos: { x: -150, y: -60 }, dependencies: ['acc-2'], type: 'passive' },
            { id: 'acc-5', name: 'Tax Collector', description: 'Passive income from NPCs.', pos: { x: 150, y: -60 }, dependencies: ['acc-3'], type: 'passive' },
            { id: 'acc-6', name: 'Master Treasurer', description: 'Infinite wealth tracking.', pos: { x: 0, y: 60 }, dependencies: ['acc-4', 'acc-5'], type: 'passive' },
            { id: 'acc-7', name: 'Economic Stability', description: 'Immunity to inflation.', pos: { x: 0, y: 180 }, dependencies: ['acc-6'], type: 'passive' },
            { id: 'acc-8', name: 'Market Crash', description: 'Force traders to drop prices.', pos: { x: -120, y: 300 }, dependencies: ['acc-7'], type: 'active' },
            { id: 'acc-9', name: 'The Golden Hand', description: 'Infinite trade resources.', pos: { x: 120, y: 300 }, dependencies: ['acc-7'], type: 'passive' },
        ]
    },
    'occ-logistician': {
        occupationId: 'occ-logistician',
        nodes: [
            { id: 'log-1', name: 'Route Optimization', description: 'Shorter travel times.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'log-2', name: 'Fuel Management', description: '10% more map distance.', pos: { x: -150, y: -180 }, dependencies: ['log-1'], type: 'passive' },
            { id: 'log-3', name: 'Supply Drop', description: 'Receive random items.', pos: { x: 150, y: -180 }, dependencies: ['log-1'], type: 'active' },
            { id: 'log-4', name: 'Emergency Reroute', description: 'Avoid dangerous encounters.', pos: { x: -150, y: -60 }, dependencies: ['log-2'], type: 'active' },
            { id: 'log-5', name: 'Chain of Command', description: 'Increased crew efficiency.', pos: { x: 150, y: -60 }, dependencies: ['log-3'], type: 'passive' },
            { id: 'log-6', name: 'Master of Flow', description: 'Zero travel time penalties.', pos: { x: 0, y: 60 }, dependencies: ['log-4', 'log-5'], type: 'passive' },
            { id: 'log-7', name: 'Global Network', description: 'Instant trade between hubs.', pos: { x: 0, y: 180 }, dependencies: ['log-6'], type: 'passive' },
            { id: 'log-8', name: 'The Wayfinder', description: 'Reveal all hidden routes.', pos: { x: -120, y: 300 }, dependencies: ['log-7'], type: 'active' },
            { id: 'log-9', name: 'Architect of Ash', description: 'Terraform new routes.', pos: { x: 120, y: 300 }, dependencies: ['log-7'], type: 'passive' },
        ]
    },
    'occ-steward': {
        occupationId: 'occ-steward',
        nodes: [
            { id: 'stew-1', name: 'Housekeeping', description: 'Maintain camp hygiene.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'stew-2', name: 'Conflict Resolution', description: 'Internal trust bonus.', pos: { x: -150, y: -180 }, dependencies: ['stew-1'], type: 'passive' },
            { id: 'stew-3', name: 'Resource Rationing', description: 'Food last 20% longer.', pos: { x: 150, y: -180 }, dependencies: ['stew-1'], type: 'passive' },
            { id: 'stew-4', name: 'Moral Duty', description: 'Increase party morale floor.', pos: { x: -150, y: -60 }, dependencies: ['stew-2'], type: 'passive' },
            { id: 'stew-5', name: 'Stewardship', description: 'Settlement tax efficiency.', pos: { x: 150, y: -60 }, dependencies: ['stew-3'], type: 'passive' },
            { id: 'stew-6', name: 'Master of the House', description: 'Maximized camp comforts.', pos: { x: 0, y: 60 }, dependencies: ['stew-4', 'stew-5'], type: 'passive' },
            { id: 'stew-7', name: 'Eternal Vigil', description: 'Immunity to surprise attacks.', pos: { x: 0, y: 180 }, dependencies: ['stew-6'], type: 'passive' },
            { id: 'stew-8', name: 'State Visit', description: 'Total faction trust reset.', pos: { x: -120, y: 300 }, dependencies: ['stew-7'], type: 'active' },
            { id: 'stew-9', name: 'High Lord/Lady', description: 'Complete settlement control.', pos: { x: 120, y: 300 }, dependencies: ['stew-7'], type: 'passive' },
        ]
    },
    'occ-archivist': {
        occupationId: 'occ-archivist',
        nodes: [
            { id: 'arch-1', name: 'Data Recovery', description: 'Recover old world files.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'arch-2', name: 'Linguistic expert', description: 'Decipher any code.', pos: { x: -150, y: -180 }, dependencies: ['arch-1'], type: 'passive' },
            { id: 'arch-3', name: 'Historical Context', description: 'Increased XP from lore.', pos: { x: 150, y: -180 }, dependencies: ['arch-1'], type: 'passive' },
            { id: 'arch-4', name: 'Terminal Hack', description: 'Bypass tech security.', pos: { x: -150, y: -60 }, dependencies: ['arch-2'], type: 'active' },
            { id: 'arch-5', name: 'Memory Bank', description: 'Store extra map data.', pos: { x: 150, y: -60 }, dependencies: ['arch-3'], type: 'passive' },
            { id: 'arch-6', name: 'Grand Librarian', description: 'Infinite lore access.', pos: { x: 0, y: 60 }, dependencies: ['arch-4', 'arch-5'], type: 'passive' },
            { id: 'arch-7', name: 'Pattern Recognition', description: 'See future events early.', pos: { x: 0, y: 180 }, dependencies: ['arch-6'], type: 'passive' },
            { id: 'arch-8', name: 'Rewriting History', description: 'Reset one faction standing.', pos: { x: -120, y: 300 }, dependencies: ['arch-7'], type: 'active' },
            { id: 'arch-9', name: 'Living Archive', description: 'Immunity to forgetting skills.', pos: { x: 120, y: 300 }, dependencies: ['arch-7'], type: 'passive' },
        ]
    },
    'occ-warehouse-manager': {
        occupationId: 'occ-warehouse-manager',
        nodes: [
            { id: 'whm-1', name: 'Inventory Sorting', description: 'Tidier bag space.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'whm-2', name: 'Stacking Mastery', description: 'Carry 50% more items.', pos: { x: -150, y: -180 }, dependencies: ['whm-1'], type: 'stat' },
            { id: 'whm-3', name: 'Climate Control', description: 'Items never rot.', pos: { x: 150, y: -180 }, dependencies: ['whm-1'], type: 'passive' },
            { id: 'whm-4', name: 'Stockpile', description: 'Emergency item delivery.', pos: { x: -150, y: -60 }, dependencies: ['whm-2'], type: 'active' },
            { id: 'whm-5', name: 'Safe Storage', description: 'Items cannot be stolen.', pos: { x: 150, y: -60 }, dependencies: ['whm-3'], type: 'passive' },
            { id: 'whm-6', name: 'Master of Bulk', description: 'Infinite inventory capacity.', pos: { x: 0, y: 60 }, dependencies: ['whm-4', 'whm-5'], type: 'passive' },
            { id: 'whm-7', name: 'Supply Chain Bond', description: 'Items weight 0.', pos: { x: 0, y: 180 }, dependencies: ['whm-6'], type: 'passive' },
            { id: 'whm-8', name: 'The Great Cache', description: 'Spawn an end-game chest.', pos: { x: -120, y: 300 }, dependencies: ['whm-7'], type: 'active' },
            { id: 'whm-9', name: 'God of Greed', description: 'Steal any item without detection.', pos: { x: 120, y: 300 }, dependencies: ['whm-7'], type: 'passive' },
        ]
    },
    'occ-operations-manager': {
        occupationId: 'occ-operations-manager',
        nodes: [
            { id: 'ops-1', name: 'Standard Procedures', description: 'Unified team workflow.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'ops-2', name: 'Project Planning', description: 'Faster team building.', pos: { x: -150, y: -180 }, dependencies: ['ops-1'], type: 'passive' },
            { id: 'ops-3', name: 'Risk Management', description: 'Less crew deaths.', pos: { x: 150, y: -180 }, dependencies: ['ops-1'], type: 'passive' },
            { id: 'ops-4', name: 'Strategic Reserve', description: 'Bonus action points.', pos: { x: -150, y: -60 }, dependencies: ['ops-2'], type: 'stat' },
            { id: 'ops-5', name: 'KPI Tracking', description: 'Maximize crew XP.', pos: { x: 150, y: -60 }, dependencies: ['ops-3'], type: 'passive' },
            { id: 'ops-6', name: 'Master of Operations', description: 'Infinite action potential.', pos: { x: 0, y: 60 }, dependencies: ['ops-4', 'ops-5'], type: 'passive' },
            { id: 'ops-7', name: 'Systemic Harmony', description: 'Zero internal conflict.', pos: { x: 0, y: 180 }, dependencies: ['ops-6'], type: 'passive' },
            { id: 'ops-8', name: 'The Board Meeting', description: 'Temporary god-mode for crew.', pos: { x: -120, y: 300 }, dependencies: ['ops-7'], type: 'active' },
            { id: 'ops-9', name: 'CEO of Ash', description: 'Global influence mastery.', pos: { x: 120, y: 300 }, dependencies: ['ops-7'], type: 'passive' },
        ]
    },
    'occ-medic': {
        occupationId: 'occ-medic',
        nodes: [
            { id: 'med-1', name: 'Field Medicine', description: 'Stabilize wounds in combat.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'med-2', name: 'Surgical Precision', description: 'Healing is 25% more effective.', pos: { x: -150, y: -180 }, dependencies: ['med-1'], type: 'passive' },
            { id: 'med-3', name: 'Pharmacology', description: 'Craft advanced meds.', pos: { x: 150, y: -180 }, dependencies: ['med-1'], type: 'passive' },
            { id: 'med-4', name: 'Trauma Specialist', description: 'Revive downed allies.', pos: { x: -150, y: -60 }, dependencies: ['med-2'], type: 'active' },
            { id: 'med-5', name: 'Pain Management', description: 'Reduce morale loss from pain.', pos: { x: 150, y: -60 }, dependencies: ['med-3'], type: 'passive' },
            { id: 'med-6', name: 'Master Surgeon', description: 'Zero failure chance in surgery.', pos: { x: 0, y: 60 }, dependencies: ['med-4', 'med-5'], type: 'passive' },
            { id: 'med-7', name: 'Miracle Worker', description: 'Passive health regen for party.', pos: { x: 0, y: 180 }, dependencies: ['med-6'], type: 'passive' },
            { id: 'med-8', name: 'Defibrillate', description: 'Bring back a dead character.', pos: { x: -120, y: 300 }, dependencies: ['med-7'], type: 'active' },
            { id: 'med-9', name: 'Angel of the Wastes', description: 'Invulnerability for party (5s).', pos: { x: 120, y: 300 }, dependencies: ['med-7'], type: 'active' },
        ]
    },
    'occ-nurse': {
        occupationId: 'occ-nurse',
        nodes: [
            { id: 'nur-1', name: 'Caregiver Instinct', description: 'Monitor vital signs.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'nur-2', name: 'Hygiene Protocols', description: 'Reduced disease chance.', pos: { x: -150, y: -180 }, dependencies: ['nur-1'], type: 'passive' },
            { id: 'nur-3', name: 'Long-term Care', description: 'Faster injury recovery.', pos: { x: 150, y: -180 }, dependencies: ['nur-1'], type: 'passive' },
            { id: 'nur-4', name: 'Sterilization', description: 'Infections are 50% less likely.', pos: { x: -150, y: -60 }, dependencies: ['nur-2'], type: 'passive' },
            { id: 'nur-5', name: 'Psych Support', description: 'Morale recovery bonus.', pos: { x: 150, y: -60 }, dependencies: ['nur-3'], type: 'stat' },
            { id: 'nur-6', name: 'Chief Nurse', description: 'Maximum party health ceiling.', pos: { x: 0, y: 60 }, dependencies: ['nur-4', 'nur-5'], type: 'passive' },
            { id: 'nur-7', name: 'Sanctuary Protocols', description: 'Immunity to status effects in camp.', pos: { x: 0, y: 180 }, dependencies: ['nur-6'], type: 'passive' },
            { id: 'nur-8', name: 'Rapid Triage', description: 'Instant full heal for one ally.', pos: { x: -120, y: 300 }, dependencies: ['nur-7'], type: 'active' },
            { id: 'nur-9', name: 'Nightingale Legacy', description: 'Party never gets sick.', pos: { x: 120, y: 300 }, dependencies: ['nur-7'], type: 'passive' },
        ]
    },
    'occ-preacher': {
        occupationId: 'occ-preacher',
        nodes: [
            { id: 'pre-1', name: 'Oratory', description: 'Speak with conviction.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'pre-2', name: 'False Hope', description: 'Temporary morale shield.', pos: { x: -150, y: -180 }, dependencies: ['pre-1'], type: 'active' },
            { id: 'pre-3', name: 'Divine Wrath', description: 'Intimidate enemies via scripture.', pos: { x: 150, y: -180 }, dependencies: ['pre-1'], type: 'passive' },
            { id: 'pre-4', name: 'Martyrdom', description: 'Buff party when you take damage.', pos: { x: -150, y: -60 }, dependencies: ['pre-2'], type: 'passive' },
            { id: 'pre-5', name: 'Static Prophecies', description: 'Know future encounters.', pos: { x: 150, y: -60 }, dependencies: ['pre-3'], type: 'passive' },
            { id: 'pre-6', name: 'High Priest', description: 'Massive faction reputation gain.', pos: { x: 0, y: 60 }, dependencies: ['pre-4', 'pre-5'], type: 'passive' },
            { id: 'pre-7', name: 'Holy Ground', description: 'Enemies cannot enter your camp.', pos: { x: 0, y: 180 }, dependencies: ['pre-6'], type: 'passive' },
            { id: 'pre-8', name: 'Ascension', description: 'Cure all mental trauma.', pos: { x: -120, y: 300 }, dependencies: ['pre-7'], type: 'active' },
            { id: 'pre-9', name: 'The Voice of Ash', description: 'Charm any NPC instantly.', pos: { x: 120, y: 300 }, dependencies: ['pre-7'], type: 'passive' },
        ]
    },
    'occ-teacher': {
        occupationId: 'occ-teacher',
        nodes: [
            { id: 'tea-1', name: 'Instruction', description: 'Improved learning speed.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'tea-2', name: 'History Lessons', description: 'Increased XP from lore.', pos: { x: -150, y: -180 }, dependencies: ['tea-1'], type: 'passive' },
            { id: 'tea-3', name: 'Skill Drill', description: 'Passive skill point accumulation.', pos: { x: 150, y: -180 }, dependencies: ['tea-1'], type: 'passive' },
            { id: 'tea-4', name: 'Critical Thinking', description: 'Chance to auto-solve puzzles.', pos: { x: -150, y: -60 }, dependencies: ['tea-2'], type: 'passive' },
            { id: 'tea-5', name: 'Group Study', description: 'Party-wide XP bonus.', pos: { x: 150, y: -60 }, dependencies: ['tea-3'], type: 'passive' },
            { id: 'tea-6', name: 'Master Scholar', description: 'Zero fail chance on knowledge checks.', pos: { x: 0, y: 60 }, dependencies: ['tea-4', 'tea-5'], type: 'passive' },
            { id: 'tea-7', name: 'Ancient Wisdom', description: 'Unlock forbidden tech.', pos: { x: 0, y: 180 }, dependencies: ['tea-6'], type: 'passive' },
            { id: 'tea-8', name: 'Eureka Moment', description: 'Instantly unlock a talent.', pos: { x: -120, y: 300 }, dependencies: ['tea-7'], type: 'active' },
            { id: 'tea-9', name: 'Sage of the Wastes', description: 'No level cap for party.', pos: { x: 120, y: 300 }, dependencies: ['tea-7'], type: 'passive' },
        ]
    },
    'occ-entertainer': {
        occupationId: 'occ-entertainer',
        nodes: [
            { id: 'ent-1', name: 'Showmanship', description: 'Draw a crowd.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'ent-2', name: 'Jester Tactics', description: 'Distract enemies in combat.', pos: { x: -150, y: -180 }, dependencies: ['ent-1'], type: 'active' },
            { id: 'ent-3', name: 'Inspiring Ballad', description: 'Small morale regen.', pos: { x: 150, y: -180 }, dependencies: ['ent-1'], type: 'passive' },
            { id: 'ent-4', name: 'Slapstick', description: 'Cause enemies to stumble.', pos: { x: -150, y: -60 }, dependencies: ['ent-2'], type: 'passive' },
            { id: 'ent-5', name: 'Celebrity Status', description: 'Get free items from fans.', pos: { x: 150, y: -60 }, dependencies: ['ent-3'], type: 'passive' },
            { id: 'ent-6', name: 'Master Performer', description: 'Maximized morale floor.', pos: { x: 0, y: 60 }, dependencies: ['ent-4', 'ent-5'], type: 'passive' },
            { id: 'ent-7', name: 'Crowd Control', description: 'Hypnotize groups of NPCs.', pos: { x: 0, y: 180 }, dependencies: ['ent-6'], type: 'passive' },
            { id: 'ent-8', name: 'The Standing Ovation', description: 'Total party heal via morale.', pos: { x: -120, y: 300 }, dependencies: ['ent-7'], type: 'active' },
            { id: 'ent-9', name: 'Living Legend', description: 'Invulnerability while dancing.', pos: { x: 120, y: 300 }, dependencies: ['ent-7'], type: 'passive' },
        ]
    },
    'occ-mediator': {
        occupationId: 'occ-mediator',
        nodes: [
            { id: 'mdt-1', name: 'Active Listening', description: 'Understand hidden motives.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'mdt-2', name: 'Compromise', description: 'Shared faction standing.', pos: { x: -150, y: -180 }, dependencies: ['mdt-1'], type: 'passive' },
            { id: 'mdt-3', name: 'Golden Rule', description: 'Charisma bonus.', pos: { x: 150, y: -180 }, dependencies: ['mdt-1'], type: 'stat' },
            { id: 'mdt-4', name: 'Non-Aggression', description: 'Pacify hostile animals.', pos: { x: -150, y: -60 }, dependencies: ['mdt-2'], type: 'active' },
            { id: 'mdt-5', name: 'Diplomatic Immunity', description: 'Cannot be arrested.', pos: { x: 150, y: -60 }, dependencies: ['mdt-3'], type: 'passive' },
            { id: 'mdt-6', name: 'Grand Arbitrator', description: 'Resolve world wars.', pos: { x: 0, y: 60 }, dependencies: ['mdt-4', 'mdt-5'], type: 'passive' },
            { id: 'mdt-7', name: 'Neutral Ground', description: 'Safe zone creation anywhere.', pos: { x: 0, y: 180 }, dependencies: ['mdt-6'], type: 'passive' },
            { id: 'mdt-8', name: 'Universal Peace', description: 'End all combat encounters.', pos: { x: -120, y: 300 }, dependencies: ['mdt-7'], type: 'active' },
            { id: 'mdt-9', name: 'God of Treaty', description: 'Rewrite faction laws.', pos: { x: 120, y: 300 }, dependencies: ['mdt-7'], type: 'passive' },
        ]
    },
    'occ-scout': {
        occupationId: 'occ-scout',
        nodes: [
            { id: 'sct-1', name: 'Binocular Focus', description: 'Spot POIs from 2x distance.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'sct-2', name: 'Stealth Coating', description: 'Reduced heat while scouting.', pos: { x: -150, y: -180 }, dependencies: ['sct-1'], type: 'passive' },
            { id: 'sct-3', name: 'Terrain Familiarity', description: 'Ignore movement penalties.', pos: { x: 150, y: -180 }, dependencies: ['sct-1'], type: 'passive' },
            { id: 'sct-4', name: 'Shadow Scout', description: 'Permanent invisibility when still.', pos: { x: -150, y: -60 }, dependencies: ['sct-2'], type: 'passive' },
            { id: 'sct-5', name: 'Danger Sense', description: 'Detect ambushes before they occur.', pos: { x: 150, y: -60 }, dependencies: ['sct-3'], type: 'passive' },
            { id: 'sct-6', name: 'Ghost of the Trail', description: 'Zero heat generated by travel.', pos: { x: 0, y: 60 }, dependencies: ['sct-4', 'sct-5'], type: 'passive' },
            { id: 'sct-7', name: 'Advanced Recon', description: 'Reveal exact enemy numbers.', pos: { x: 0, y: 180 }, dependencies: ['sct-6'], type: 'passive' },
            { id: 'sct-8', name: 'Flares', description: 'Illuminate huge map areas.', pos: { x: -120, y: 300 }, dependencies: ['sct-7'], type: 'active' },
            { id: 'sct-9', name: 'Eye in the Sky', description: 'Total map reveal ability.', pos: { x: 120, y: 300 }, dependencies: ['sct-7'], type: 'active' },
        ]
    },
    'occ-navigator': {
        occupationId: 'occ-navigator',
        nodes: [
            { id: 'nav-1', name: 'Star Mapping', description: 'Navigate by the heavens.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'nav-2', name: 'Fuel Efficiency', description: '20% less consumption during travel.', pos: { x: -150, y: -180 }, dependencies: ['nav-1'], type: 'passive' },
            { id: 'nav-3', name: 'Dead Reckoning', description: 'Never get lost in storms.', pos: { x: 150, y: -180 }, dependencies: ['nav-1'], type: 'passive' },
            { id: 'nav-4', name: 'Shortcuts', description: 'Reduce travel distance by 15%.', pos: { x: -150, y: -60 }, dependencies: ['nav-2'], type: 'passive' },
            { id: 'nav-5', name: 'Storm Chaser', description: 'Gain speed in bad weather.', pos: { x: 150, y: -60 }, dependencies: ['nav-3'], type: 'passive' },
            { id: 'nav-6', name: 'Master Navigator', description: 'Instant travel between known nodes.', pos: { x: 0, y: 60 }, dependencies: ['nav-4', 'nav-5'], type: 'passive' },
            { id: 'nav-7', name: 'Pathfinder Resolve', description: 'Zero morale loss during travel.', pos: { x: 0, y: 180 }, dependencies: ['nav-6'], type: 'passive' },
            { id: 'nav-8', name: 'Warp Drive (Mental)', description: 'Jump to any visible node.', pos: { x: -120, y: 300 }, dependencies: ['nav-7'], type: 'active' },
            { id: 'nav-9', name: 'The Guiding Light', description: 'Party never takes environmental damage.', pos: { x: 120, y: 300 }, dependencies: ['nav-7'], type: 'passive' },
        ]
    },
    'occ-driver': {
        occupationId: 'occ-driver',
        nodes: [
            { id: 'drv-1', name: 'Wheel Mastery', description: 'Basic vehicle handling.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'drv-2', name: 'Drift Turn', description: 'Evasion bonus for vehicles.', pos: { x: -150, y: -180 }, dependencies: ['drv-1'], type: 'passive' },
            { id: 'drv-3', name: 'Nitro Boost', description: 'Temporary speed ability.', pos: { x: 150, y: -180 }, dependencies: ['drv-1'], type: 'active' },
            { id: 'drv-4', name: 'Ramming Speed', description: 'Vehicle damage bonus.', pos: { x: -150, y: -60 }, dependencies: ['drv-2'], type: 'passive' },
            { id: 'drv-5', name: 'Stunt Driver', description: 'Ignore steep terrain.', pos: { x: 150, y: -60 }, dependencies: ['drv-3'], type: 'passive' },
            { id: 'drv-6', name: 'King of the Road', description: 'Max speed potential.', pos: { x: 0, y: 60 }, dependencies: ['drv-4', 'drv-5'], type: 'passive' },
            { id: 'drv-7', name: 'Machine Bond', description: 'Vehicle health auto-regens.', pos: { x: 0, y: 180 }, dependencies: ['drv-6'], type: 'passive' },
            { id: 'drv-8', name: 'Hard Brake', description: 'Instant stop & pulse protection.', pos: { x: -120, y: 300 }, dependencies: ['drv-7'], type: 'active' },
            { id: 'drv-9', name: 'Indestructible Rig', description: 'Vehicle cannot be destroyed.', pos: { x: 120, y: 300 }, dependencies: ['drv-7'], type: 'passive' },
        ]
    },
    'occ-convoy-operator': {
        occupationId: 'occ-convoy-operator',
        nodes: [
            { id: 'cvo-1', name: 'Convoy Lead', description: 'Manage multiple vehicles.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'cvo-2', name: 'Fleet Repair', description: 'Heal all vehicles at once.', pos: { x: -150, y: -180 }, dependencies: ['cvo-1'], type: 'active' },
            { id: 'cvo-3', name: 'Distribution Pack', description: 'Shared inventory space.', pos: { x: 150, y: -180 }, dependencies: ['cvo-1'], type: 'passive' },
            { id: 'cvo-4', name: 'Escort Protocols', description: 'Bonus defense for weak cars.', pos: { x: -150, y: -60 }, dependencies: ['cvo-2'], type: 'passive' },
            { id: 'cvo-5', name: 'Fuel Siphoning', description: 'Move fuel between cars.', pos: { x: 150, y: -60 }, dependencies: ['cvo-3'], type: 'active' },
            { id: 'cvo-6', name: 'Fleet Commander', description: 'Massive convoy speed boost.', pos: { x: 0, y: 60 }, dependencies: ['cvo-4', 'cvo-5'], type: 'passive' },
            { id: 'cvo-7', name: 'Unified Shield', description: 'Shared armor for all cars.', pos: { x: 0, y: 180 }, dependencies: ['cvo-6'], type: 'passive' },
            { id: 'cvo-8', name: 'The Grand Concourse', description: 'Immunity to all travel hazards.', pos: { x: -120, y: 300 }, dependencies: ['cvo-7'], type: 'passive' },
            { id: 'cvo-9', name: 'Lord of the Road', description: 'Enemies flee from the convoy.', pos: { x: 120, y: 300 }, dependencies: ['cvo-7'], type: 'passive' },
        ]
    },
    'occ-courier': {
        occupationId: 'occ-courier',
        nodes: [
            { id: 'cou-1', name: 'Delivery Instinct', description: 'Know the fastest routes.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'cou-2', name: 'Light Stepper', description: 'Reduced heat while moving.', pos: { x: -150, y: -180 }, dependencies: ['cou-1'], type: 'passive' },
            { id: 'cou-3', name: 'Rush Delivery', description: 'Speed boost ability.', pos: { x: 150, y: -180 }, dependencies: ['cou-1'], type: 'active' },
            { id: 'cou-4', name: 'Parcel Protection', description: 'Items cannot be damaged.', pos: { x: -150, y: -60 }, dependencies: ['cou-2'], type: 'passive' },
            { id: 'cou-5', name: 'Endurance Runner', description: 'Zero fatigue from walking.', pos: { x: 150, y: -60 }, dependencies: ['cou-3'], type: 'stat' },
            { id: 'cou-6', name: 'Master Messenger', description: 'Double rewards from contracts.', pos: { x: 0, y: 60 }, dependencies: ['cou-4', 'cou-5'], type: 'passive' },
            { id: 'cou-7', name: 'The Mail Must Go Through', description: 'Immunity to weather slows.', pos: { x: 0, y: 180 }, dependencies: ['cou-6'], type: 'passive' },
            { id: 'cou-8', name: 'Quick Shot', description: 'Instant attack during travel.', pos: { x: -120, y: 300 }, dependencies: ['cou-7'], type: 'active' },
            { id: 'cou-9', name: 'Wind Runner', description: 'Infinite movement speed.', pos: { x: 120, y: 300 }, dependencies: ['cou-7'], type: 'passive' },
        ]
    },
    'occ-smuggler': {
        occupationId: 'occ-smuggler',
        nodes: [
            { id: 'smg-1', name: 'Hidden Compartments', description: 'Hide items from scans.', pos: { x: 0, y: -300 }, type: 'passive' },
            { id: 'smg-2', name: 'Bribery', description: 'Pay off guards to bypass zones.', pos: { x: -150, y: -180 }, dependencies: ['smg-1'], type: 'active' },
            { id: 'smg-3', name: 'Dark Routes', description: 'Find underground paths.', pos: { x: 150, y: -180 }, dependencies: ['smg-1'], type: 'passive' },
            { id: 'smg-4', name: 'Counterfeit Data', description: 'Fake credentials for tech.', pos: { x: -150, y: -60 }, dependencies: ['smg-2'], type: 'passive' },
            { id: 'smg-5', name: 'Black Market Bond', description: 'Access to illegal traders.', pos: { x: 150, y: -60 }, dependencies: ['smg-3'], type: 'passive' },
            { id: 'smg-6', name: 'King of the Shadows', description: 'Zero heat generated EVER.', pos: { x: 0, y: 60 }, dependencies: ['smg-4', 'smg-5'], type: 'passive' },
            { id: 'smg-7', name: 'Evasion Master', description: 'Evasion increased by 40%.', pos: { x: 0, y: 180 }, dependencies: ['smg-6'], type: 'passive' },
            { id: 'smg-8', name: 'Ghost Slip', description: 'Phase through a hostile node.', pos: { x: -120, y: 300 }, dependencies: ['smg-7'], type: 'active' },
            { id: 'smg-9', name: 'The Silk Road', description: 'Infinite trade profit potential.', pos: { x: 120, y: 300 }, dependencies: ['smg-7'], type: 'passive' },
        ]
    }
};
