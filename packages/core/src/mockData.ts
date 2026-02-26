
import { ResourceType, Node, CrewMember, Resources, Trait, Occupation, OccupationCategory, Skill } from './types';

// ── Combat Skills ──

export const ALL_SKILLS: Skill[] = [
  {
    id: 'slash', name: 'Slash', description: 'A quick melee strike.', icon: '🗡️',
    apCost: 3, minRange: 1, maxRange: 1, areaType: 'single', areaSize: 0,
    targetType: 'enemy', damage: 10, cooldown: 0, effectType: 'physical',
  },
  {
    id: 'power-strike', name: 'Power Strike', description: 'Heavy two-handed blow dealing massive damage.', icon: '⚔️',
    apCost: 5, minRange: 1, maxRange: 1, areaType: 'single', areaSize: 0,
    targetType: 'enemy', damage: 20, cooldown: 2, effectType: 'physical',
  },
  {
    id: 'first-aid', name: 'First Aid', description: 'Patch up wounds, restoring HP.', icon: '🩹',
    apCost: 3, minRange: 0, maxRange: 0, areaType: 'single', areaSize: 0,
    targetType: 'self', healing: 15, cooldown: 2, effectType: 'support',
  },
  {
    id: 'fireball', name: 'Fireball', description: 'Hurl a ball of flame at range 2-4. Hits a 1-cell radius.', icon: '🔥',
    apCost: 4, minRange: 2, maxRange: 4, areaType: 'circle', areaSize: 1,
    targetType: 'cell', damage: 14, cooldown: 1, effectType: 'magical',
  },
  {
    id: 'shove', name: 'Shove', description: 'Push an adjacent enemy back 2 cells.', icon: '🫸',
    apCost: 2, minRange: 1, maxRange: 1, areaType: 'single', areaSize: 0,
    targetType: 'enemy', damage: 3, cooldown: 1, effectType: 'physical', pushDistance: 2,
  },
  {
    id: 'quick-shot', name: 'Quick Shot', description: 'Fast ranged attack at low cost.', icon: '🏹',
    apCost: 2, minRange: 2, maxRange: 3, areaType: 'single', areaSize: 0,
    targetType: 'enemy', damage: 6, cooldown: 0, effectType: 'physical',
  },
  {
    id: 'war-cry', name: 'War Cry', description: 'Intimidate enemies in a 2-cell radius around you.', icon: '📯',
    apCost: 4, minRange: 0, maxRange: 0, areaType: 'circle', areaSize: 2,
    targetType: 'self', damage: 5, cooldown: 3, effectType: 'physical',
  },
  {
    id: 'healing-pulse', name: 'Healing Pulse', description: 'Heal allies in a cross area up to range 3.', icon: '💚',
    apCost: 4, minRange: 0, maxRange: 3, areaType: 'cross', areaSize: 1,
    targetType: 'cell', healing: 20, cooldown: 2, effectType: 'support',
  },
  {
    id: 'piercing-shot', name: 'Piercing Shot', description: 'A powerful shot that hits 3 cells in a line.', icon: '☄️',
    apCost: 5, minRange: 1, maxRange: 4, areaType: 'line', areaSize: 3,
    targetType: 'cell', damage: 18, cooldown: 2, effectType: 'physical',
  },
];

export const INITIAL_RESOURCES: Resources = {
  [ResourceType.FOOD]: 20,
  [ResourceType.WATER]: 15,
  [ResourceType.FUEL]: 30,
  [ResourceType.PARTS]: 5,
  [ResourceType.AMMO]: 10,
  [ResourceType.MEDS]: 3,
};

export const ALL_TRAITS: Trait[] = [
  // Age-based Intrinsic Traits (Applied based on character age)
  { id: 'age-juvenile', name: 'Juvenile', description: 'Underdeveloped frame but high energy. +1 Agility, -1 Strength.', cost: 0, type: 'neutral', effects: [{ type: 'STAT_MODIFIER', target: 'agility', value: 1 }, { type: 'STAT_MODIFIER', target: 'strength', value: -1 }] },
  { id: 'age-elder', name: 'Elder', description: 'Decades of survival. +1 Wisdom, -1 Endurance.', cost: 0, type: 'neutral', effects: [{ type: 'STAT_MODIFIER', target: 'wisdom', value: 1 }, { type: 'STAT_MODIFIER', target: 'endurance', value: -1 }] },
  { id: 'age-prime', name: 'In Prime', description: 'Peak physical condition. No inherent penalties.', cost: 0, type: 'neutral' },

  // --- POSITIVE TRAITS ---
  { id: 't-hardy', name: 'Hardy', description: 'A rugged constitution that refuses to break. +15 Max HP.', cost: 10, type: 'positive', effects: [{ type: 'STAT_MODIFIER', target: 'maxHp', value: 15, trigger: 'passive' }] },
  { id: 't-scrapper', name: 'Expert Scrapper', description: 'You know where the high-grade components are hidden. +25% Parts found.', cost: 8, type: 'positive' },
  { id: 't-field-medic', name: 'Field Medic', description: 'Basic anatomy knowledge is a rarity. Medicine is 50% more effective.', cost: 12, type: 'positive' },
  { id: 't-streetwise', name: 'Streetwise', description: 'You speak the language of the low-life. Rumors you hear are 20% more likely to be accurate.', cost: 6, type: 'positive' },
  { id: 't-lead-foot', name: 'Lead Foot', description: 'You can squeeze every drop of torque out of a rusted engine. -10% Fuel cost for travel.', cost: 9, type: 'positive' },
  { id: 't-vigilant', name: 'Vigilant', description: 'You sleep with one eye open. -50% Chance of being ambushed during Nightfall.', cost: 11, type: 'positive' },
  { id: 't-nimble', name: 'Nimble', description: 'Quick reflexes honed by dodging falling debris. +10% Evasion in combat.', cost: 7, type: 'positive', effects: [{ type: 'COMBAT_BONUS', target: 'evasion', value: 10, trigger: 'passive' }] },
  { id: 't-scholar', name: 'Pre-Ash Scholar', description: 'You can actually read the old manuals. +15% XP Gain.', cost: 10, type: 'positive' },
  { id: 't-stout', name: 'Stout', description: 'Broad shoulders meant for heavy lifting. +20% Inventory capacity.', cost: 6, type: 'positive' },
  { id: 't-survivalist', name: 'Survivalist', description: 'You can make a feast out of a handful of dirt. -20% Daily resource consumption.', cost: 12, type: 'positive' },
  { id: 't-marksman', name: 'Marksman', description: 'Steady hands and a cold heart. +10% Accuracy with ranged weapons.', cost: 8, type: 'positive' },
  { id: 't-tinker', name: 'Master Tinker', description: 'You can fix a radiator with a gum wrapper. Repair actions cost 50% less Parts.', cost: 11, type: 'positive' },
  { id: 't1', name: 'Keen Sight', description: 'Exceptional visual acuity. Easier to spot distant POIs.', cost: 8, type: 'positive' },
  { id: 't3', name: 'Thick Skinned', description: 'Less likely to bleed from minor wounds and environment hazards.', cost: 10, type: 'positive' },
  { id: 't9', name: 'Iron Gut', description: 'Massive resistance to food poisoning and radiation sickness from water.', cost: 6, type: 'positive' },
  { id: 't15', name: 'Lucky', description: 'Small chance for critical failures to be ignored or loot to be doubled.', cost: 8, type: 'positive' },
  { id: 't21', name: 'Silver Tongue', description: 'Charisma that works even in the Ash. Better rates with all traders.', cost: 7, type: 'positive' },
  { id: 't22', name: 'Bushwhacker', description: 'Deals 20% extra damage when initiating combat from stealth.', cost: 9, type: 'positive' },
  { id: 't-pathfinder', name: 'Pathfinder', description: 'Instinct for forgotten routes. Travel encounters are 25% less likely, and map discovery range is increased.', cost: 9, type: 'positive' },
  { id: 't-scavenger-instinct', name: "Scavenger's Instinct", description: 'Knows where to dig. Containers have a small chance to yield rare materials.', cost: 8, type: 'positive' },
  { id: 't-crisis-manager', name: 'Crisis Manager', description: 'Remains calm under pressure. Party morale drops 30% slower during emergencies.', cost: 10, type: 'positive' },
  { id: 't-ghost-walker', name: 'Ghost Walker', description: 'Moves like drifting ash. Stealth actions generate 20% less Heat.', cost: 7, type: 'positive' },
  { id: 't-quartermaster', name: 'Quartermaster', description: 'Inventory is war. Supplies spoil 50% slower and stack more efficiently.', cost: 11, type: 'positive' },
  { id: 't-battlefield-surgeon', name: 'Battlefield Surgeon', description: 'Improvised surgery expert. Healing in combat restores 20% more HP.', cost: 10, type: 'positive' },
  { id: 't-salvage-engineer', name: 'Salvage Engineer', description: 'Nothing is truly broken. Destroyed equipment yields extra parts.', cost: 8, type: 'positive' },
  { id: 't-negotiator', name: 'Negotiator', description: 'Always finds common ground. Conflict events have a chance to be resolved peacefully.', cost: 9, type: 'positive' },

  // --- NEGATIVE TRAITS ---
  { id: 't-frail', name: 'Frail', description: 'A weak frame plagued by old injuries. -15 Max HP.', cost: -10, type: 'negative', effects: [{ type: 'STAT_MODIFIER', target: 'maxHp', value: -15, trigger: 'passive' }] },
  { id: 't-anemic', name: 'Anemic', description: 'Wounds take a long time to clot. Bleeding effects last twice as long.', cost: -8, type: 'negative' },
  { id: 't-chem-reliant', name: 'Chem-Reliant', description: 'The Ash is too much to bear sober. Morale drops 2x faster if Meds are empty.', cost: -12, type: 'negative' },
  { id: 't-loud', name: 'Heavy Stepper', description: 'You lack the grace for subtlety. Increases Heat generated by actions by 15%.', cost: -6, type: 'negative' },
  { id: 't-jittery', name: 'Jittery', description: 'The constant hum of the Dead Zone gets to you. -10% Ranged accuracy.', cost: -7, type: 'negative' },
  { id: 't-hoarder', name: 'Sentimental Hoarder', description: 'You can\'t bear to leave anything behind. Inventory weight increases by 15%.', cost: -6, type: 'negative' },
  { id: 't-night-blind', name: 'Night Blind', description: 'Your eyes never adjusted to the dark. Heavy penalties to all actions during Nightfall.', cost: -8, type: 'negative' },
  { id: 't41', name: 'Deaf', description: 'Cannot hear sounds. Massive penalty to surprise attacks and noise detection.', cost: -12, type: 'negative' },
  { id: 't52', name: 'Limper', description: 'A permanent leg injury. 20% slower travel speed on foot.', cost: -7, type: 'negative' },
  { id: 't54', name: 'Ash-Lung', description: 'A chronic, rattling cough that can alert nearby hostiles.', cost: -6, type: 'negative' },
  { id: 't50', name: 'Cowardly', description: 'Quickly becomes panicked when HP drops below 40%.', cost: -4, type: 'negative' },
  { id: 't48', name: 'Clumsy', description: '10% chance to fail complex manual tasks and waste resources.', cost: -5, type: 'negative' },
  { id: 't-pacifist-neg', name: 'Pacifist', description: 'You hate the sight of blood. -20% Melee damage.', cost: -5, type: 'negative' },
  { id: 't-paranoid', name: 'Paranoid', description: 'Trusts no one. Crew Trust decays slowly over time.', cost: -7, type: 'negative' },
  { id: 't-fragile-mind', name: 'Fragile Mind', description: 'Nightmares of the old world. Morale recovers 40% slower.', cost: -9, type: 'negative' },
  { id: 't-rust-allergy', name: 'Rust Allergy', description: 'Chemical sensitivity. Using damaged equipment sometimes causes HP loss.', cost: -6, type: 'negative' },
  { id: 't-tunnel-vision', name: 'Tunnel Vision', description: 'Obsessive focus. Misses secondary objectives more often.', cost: -5, type: 'negative' },
  { id: 't-reckless-loader', name: 'Reckless Loader', description: 'Careless with supplies. Ammo and tools are consumed 15% faster.', cost: -7, type: 'negative' },
  { id: 't-nomadic-restlessness', name: 'Nomadic Restlessness', description: 'Cannot stay still. Penalties when remaining too long in one settlement.', cost: -6, type: 'negative' },
  { id: 't-static-whispers', name: 'Static Whispers', description: 'Hears voices in radio static. Random morale fluctuations.', cost: -5, type: 'negative' },
  { id: 't-brittle-bones', name: 'Brittle Bones', description: 'Old fractures never healed. Takes extra damage from falls and impacts.', cost: -8, type: 'negative' },

  // --- NEUTRAL TRAITS ---
  { id: 't-nomad', name: 'Wasteland Nomad', description: 'The road is your only home. +1 Agility while traveling, -1 Wisdom while in settlements.', cost: 0, type: 'neutral' },
  { id: 't-urbanite', name: 'Former Urbanite', description: 'You miss the concrete jungle. +1 Wisdom in settlements, -1 Endurance on the road.', cost: 0, type: 'neutral' },
  { id: 't-mercenary', name: 'Mercenary Heart', description: 'Loyalty is bought, not earned. +10 Morale when Resources are high, -10 Trust from crew.', cost: 0, type: 'neutral' },
  { id: 't-zealot', name: 'Static Zealot', description: 'You hear god in the white noise. Immune to Fear effects, -10% XP Gain.', cost: 0, type: 'neutral' },
  { id: 't-martyr', name: 'Selfless Martyr', description: 'You’d die for the group. +10 Crew Morale when you take damage, but you lose 2x more Morale when resting.', cost: 0, type: 'neutral' },
  { id: 't-pragmatist', name: 'Cold Pragmatist', description: 'Utility above all. +5% Trade efficiency, -1 Charisma.', cost: 0, type: 'neutral' },
  { id: 't-daredevil', name: 'Reckless Daredevil', description: 'Danger is the only thing that makes you feel alive. +10% Crit chance, +10% Damage received.', cost: 0, type: 'neutral' },
  { id: 't-stoic', name: 'Stoic Outcast', description: 'The world broke you long ago. Immune to Morale shifts (positive or negative).', cost: 0, type: 'neutral' },
  { id: 't-cynic', name: 'Bitter Cynic', description: 'You’ve seen it all before. +1 Intelligence, -10% Trust gain with new crew members.', cost: 0, type: 'neutral' },
  { id: 't-hermit', name: 'Solitary Hermit', description: 'Company is a curse. +1 Endurance when solo, -1 Agility when in a crew.', cost: 0, type: 'neutral' },
  { id: 't82', name: 'Talkative', description: 'Enjoys socializing with crew. Boosts others morale slightly, but uses 10% more water.', cost: 0, type: 'neutral' },
  { id: 't83', name: 'Rad-Scars', description: 'Obvious physical mutations. Intimidates enemies, but traders are more wary of you.', cost: 0, type: 'neutral' },
  { id: 't88', name: 'Mysterious', description: 'Rarely shares details. Harder for enemies to read you, but crew trust grows slowly.', cost: 0, type: 'neutral' },
  { id: 't90', name: 'Perfectionist', description: 'Diligent and precise. Better crafting quality, but tasks take 25% longer.', cost: 0, type: 'neutral' },
  { id: 't91', name: 'Superstitious', description: 'Avoids "cursed" ruins. Randomly refuses certain dangerous actions.', cost: 0, type: 'neutral' },
  { id: 't92', name: 'Nocturnal', description: 'Alert at night, sluggish by day. Inverts the standard Day/Night penalties.', cost: 0, type: 'neutral' },
  { id: 't94', name: 'Curious', description: 'Driven to investigate. Reveals POIs easier, but generates more Heat.', cost: 0, type: 'neutral' },
  { id: 't96', name: 'Optimist', description: 'Finds hope in ash. Higher Morale floor, but takes longer to realize a situation is fatal.', cost: 0, type: 'neutral' },
  { id: 't98', name: 'Nostalgic', description: 'Collects Old World relics. High sanity, but easily distracted in ruins.', cost: 0, type: 'neutral' },
  { id: 't-chronicler', name: 'Chronicler', description: 'Documents everything. Extra lore and journal entries, slight XP bonus from discoveries.', cost: 0, type: 'neutral' },
  { id: 't-lone-strategist', name: 'Lone Strategist', description: 'Plans better alone. Tactical bonuses when separated from crew.', cost: 0, type: 'neutral' },
  { id: 't-ash-born', name: 'Ash-Born', description: 'Adapted to toxic zones. Radiation resistance increased, but normal zones feel dull.', cost: 0, type: 'neutral' },
  { id: 't-relic-seeker', name: 'Relic Seeker', description: 'Obsessed with Old World tech. Special POIs appear more often.', cost: 0, type: 'neutral' },
  { id: 't-ritualist', name: 'Ritualist', description: 'Performs daily rites. Minor morale buff if routines are respected.', cost: 0, type: 'neutral' },
  { id: 't-crowd-chameleon', name: 'Crowd Chameleon', description: 'Blends into any group. Reduced penalties in hostile settlements.', cost: 0, type: 'neutral' },
  { id: 't-risk-accountant', name: 'Risk Accountant', description: 'Calculates odds constantly. Crit chance and failure chance both slightly increased.', cost: 0, type: 'neutral' },
  { id: 't-bonded-companion', name: 'Bonded Companion', description: 'Forms strong attachment. Gains buffs near one specific crew member, heavy debuff if separated.', cost: 0, type: 'neutral' },
];

export const ALL_OCCUPATIONS: Occupation[] = [
  // --- SECURITY ---
  { id: 'occ-soldier', name: 'Soldier', category: 'SECURITY', shortDescription: 'Trained combatant with military discipline.', description: 'Served in an organized fighting force before the collapse. Knows formations, weapon maintenance, and how to follow orders under fire. Discipline is second nature.', perks: ['Increased accuracy under suppressive fire', 'Faster weapon handling', 'Bonus morale in combat situations'] },
  { id: 'occ-guard', name: 'Guard', category: 'SECURITY', shortDescription: 'Watchman who kept settlements safe.', description: 'Stood post at settlement gates, watchtowers, and supply depots. Trained to spot threats early and hold ground. Reliable but not aggressive.', perks: ['Earlier detection of incoming threats', 'Reduced ambush chance at camp', 'Bonus to defensive positioning'] },
  { id: 'occ-militia', name: 'Militia Member', category: 'SECURITY', shortDescription: 'Civilian fighter defending the community.', description: 'Not a professional soldier, but picked up a weapon when it mattered. Learned to fight from necessity, not training. Good instincts, rough technique.', perks: ['Bonus morale when defending settlements', 'Slightly faster melee attacks', 'Crew rallies faster after losses'] },
  { id: 'occ-mercenary', name: 'Mercenary', category: 'SECURITY', shortDescription: 'Gun for hire with no allegiance.', description: 'Fought for whoever paid the most. Experienced in varied combat scenarios and hostile negotiations. Loyalty lasts as long as the contract.', perks: ['Bonus rewards from combat contracts', 'Intimidation bonuses in negotiations', 'Adapts faster to new weapons'] },
  { id: 'occ-bounty-hunter', name: 'Bounty Hunter', category: 'SECURITY', shortDescription: 'Relentless tracker who hunts for pay.', description: 'Tracked fugitives and high-value targets across the wasteland. Methodical, patient, and precise. Knew every shortcut and hiding spot.', perks: ['Enhanced tracking of hostiles', 'Bonus rewards from bounty contracts', 'Reduced Heat decay time'] },
  { id: 'occ-caravan-guard', name: 'Caravan Guard', category: 'SECURITY', shortDescription: 'Defensive specialist for convoys.', description: 'Rode shotgun on trade caravans across the Ashtrails. Experienced in ambush defense and convoy tactics. Keeps moving, keeps watching.', perks: ['Reduced ambush chance during travel', 'Crew takes less damage on the road', 'Faster threat response time'] },
  { id: 'occ-reformed-raider', name: 'Reformed Raider', category: 'SECURITY', shortDescription: 'Former outlaw who changed sides.', description: 'Used to take from others to survive. Knows raider tactics from the inside: ambush points, weaknesses, and how they think. Trying to do better now.', perks: ['Predicts raider ambush patterns', 'Bonus loot from hostile camps', 'Intimidation from reputation'] },

  // --- TECHNICAL ---
  { id: 'occ-mechanic', name: 'Mechanic', category: 'TECHNICAL', shortDescription: 'Keeps machines running with scrap.', description: 'Maintained vehicles, generators, and pumps with whatever parts were available. Understands every bolt and wire. Grease under the nails is permanent.', perks: ['Vehicle repairs cost 40% less parts', 'Chance to salvage broken equipment', 'Fuel efficiency increased'] },
  { id: 'occ-engineer', name: 'Engineer', category: 'TECHNICAL', shortDescription: 'Designs and builds from old-world blueprints.', description: 'One of the few who can still read pre-war schematics. Designed fortifications, water systems, and power rigs. Invaluable and knows it.', perks: ['Crafting yields bonus items', 'Can repair advanced tech', 'Fortification building is faster'] },
  { id: 'occ-electrician', name: 'Electrician', category: 'TECHNICAL', shortDescription: 'Wires circuits and restores power.', description: 'Specialized in electrical systems: wiring, generators, solar panels, and jury-rigged batteries. Kept the lights on when everything else failed.', perks: ['Can restore power at abandoned sites', 'Electronic locks easier to bypass', 'Reduced resource cost for tech crafting'] },
  { id: 'occ-welder', name: 'Welder', category: 'TECHNICAL', shortDescription: 'Joins metal and reinforces structures.', description: 'Fused scrap into armor plating, vehicle frames, and barricades. Steady hands, intense focus, and tolerance for heat. Every settlement needs one.', perks: ['Vehicle and armor repairs are faster', 'Barricade construction costs less', 'Bonus durability on repaired equipment'] },
  { id: 'occ-scrapper', name: 'Scrapper', category: 'TECHNICAL', shortDescription: 'Dismantles everything for usable parts.', description: 'Expert at breaking down machines, ruins, and wreckage into reusable components. Sees value where others see trash. Efficient and thorough.', perks: ['Extra parts from dismantling', 'Identifies valuable salvage faster', 'Reduced weight of collected scrap'] },
  { id: 'occ-builder', name: 'Builder', category: 'TECHNICAL', shortDescription: 'Constructs shelters and infrastructure.', description: 'Built walls, roofs, and foundations from whatever was at hand. Concrete, scrap, mud—it all works. Slow and methodical, but the result stands.', perks: ['Settlement structures cost less resources', 'Buildings have increased durability', 'Construction time reduced'] },

  // --- CRAFT ---
  { id: 'occ-farmer', name: 'Farmer', category: 'CRAFT', shortDescription: 'Grows food in irradiated soil.', description: 'Coaxed crops from contaminated ground through trial, error, and stubbornness. Understands seasons, soil, and water rationing. Patience is the real skill.', perks: ['Food spoils 50% slower', 'Chance to find extra food in the wild', 'Higher morale in settlements'] },
  { id: 'occ-shepherd', name: 'Shepherd', category: 'CRAFT', shortDescription: 'Tends and protects livestock herds.', description: 'Managed small herds of mutated livestock across open terrain. Knows animal behavior, grazing patterns, and predator signs. Calm and watchful.', perks: ['Food production bonus at settlements', 'Early warning of nearby wildlife threats', 'Trade value of animal goods increased'] },
  { id: 'occ-livestock-keeper', name: 'Livestock Keeper', category: 'CRAFT', shortDescription: 'Breeds and maintains working animals.', description: 'Raised draft animals and breeding stock for settlements. Understands veterinary basics, feeding schedules, and the value of healthy animals.', perks: ['Caravan carry capacity increased', 'Animal-based food lasts longer', 'Bonus resources from animal husbandry'] },
  { id: 'occ-tailor', name: 'Tailor', category: 'CRAFT', shortDescription: 'Repairs and crafts clothing and gear.', description: 'Stitched together clothes, packs, and light armor from salvaged fabric and leather. Functional fashion for a dead world. Every stitch counts.', perks: ['Clothing and light armor repairs cheaper', 'Crafted gear has bonus durability', 'Cold and exposure resistance slightly increased'] },
  { id: 'occ-carpenter', name: 'Carpenter', category: 'CRAFT', shortDescription: 'Shapes wood into tools and structures.', description: 'Worked with salvaged timber and scrap wood to build furniture, tool handles, and structural supports. One of the oldest surviving trades.', perks: ['Wooden construction costs reduced', 'Tool crafting yields extra items', 'Settlement comfort bonus'] },
  { id: 'occ-tanner', name: 'Tanner', category: 'CRAFT', shortDescription: 'Processes hides into usable leather.', description: 'Turned raw animal hides into leather for armor, bags, and trade goods. Unpleasant work, but the results are durable and valuable.', perks: ['Leather goods sell for more', 'Armor crafting material costs reduced', 'Crafted leather gear lasts longer'] },
  { id: 'occ-baker', name: 'Baker', category: 'CRAFT', shortDescription: 'Turns grain into bread and rations.', description: 'Ran a communal oven and turned scarce flour into something resembling bread. Morale booster and calorie provider. Simple but essential work.', perks: ['Food crafting yields extra rations', 'Settlement morale bonus from meals', 'Reduced food consumption for the party'] },
  { id: 'occ-miller', name: 'Miller', category: 'CRAFT', shortDescription: 'Processes grain and raw materials.', description: 'Operated hand-cranked mills and grinding stations to process grain, bone meal, and raw ore. Tedious, physical labor that keeps the supply chain moving.', perks: ['Raw material processing is faster', 'Bonus yield from grain and ore', 'Reduced waste from resource processing'] },
  { id: 'occ-blacksmith', name: 'Blacksmith', category: 'CRAFT', shortDescription: 'Forges metal into weapons and tools.', description: 'Hammered scrap metal into blades, tools, and reinforcement plates over a salvaged forge. Strong, precise, and in high demand everywhere.', perks: ['Weapon and tool crafting costs reduced', 'Forged items have bonus damage or durability', 'Can repair metal equipment in the field'] },

  // --- ADMIN ---
  { id: 'occ-accountant', name: 'Accountant', category: 'ADMIN', shortDescription: 'Tracks resources and manages budgets.', description: 'Kept ledgers and tracked supply flows for settlements and trading posts. Knows exactly where every unit of food, fuel, and ammo went. Numbers don\'t lie.', perks: ['Resource tracking is more accurate', 'Trade deals yield 10% more value', 'Waste from resource management reduced'] },
  { id: 'occ-logistician', name: 'Logistician', category: 'ADMIN', shortDescription: 'Plans supply routes and distribution.', description: 'Organized supply chains between settlements. Planned routes, scheduled deliveries, and managed shortages before they became crises. Efficiency is survival.', perks: ['Travel route planning costs less fuel', 'Supply deliveries arrive faster', 'Reduced resource spoilage during transport'] },
  { id: 'occ-steward', name: 'Steward', category: 'ADMIN', shortDescription: 'Manages settlement operations daily.', description: 'Ran the day-to-day operations of a settlement. Assigned work shifts, resolved disputes, and made sure the water pump stayed running. Unglamorous but vital.', perks: ['Settlement productivity increased', 'Crew task assignments are more efficient', 'Daily resource consumption slightly reduced'] },
  { id: 'occ-archivist', name: 'Archivist', category: 'ADMIN', shortDescription: 'Preserves records and old-world knowledge.', description: 'Catalogued salvaged documents, maps, and technical manuals. One of the few who still values written knowledge. Memory of the world before the Ash.', perks: ['Lore discoveries yield extra XP', 'Can decipher old-world terminals and documents', 'Map accuracy improved'] },
  { id: 'occ-warehouse-manager', name: 'Warehouse Manager', category: 'ADMIN', shortDescription: 'Organizes storage and inventory systems.', description: 'Managed stockpiles and storage facilities for communities. Knew exactly what was in every crate and how long it would last. Order in chaos.', perks: ['Inventory capacity increased 20%', 'Items degrade slower in storage', 'Faster access to stored supplies'] },
  { id: 'occ-operations-manager', name: 'Operations Manager', category: 'ADMIN', shortDescription: 'Coordinates teams and complex projects.', description: 'Oversaw multi-team operations: construction projects, defense coordination, and resource extraction. Sees the big picture and keeps everyone aligned.', perks: ['Crew efficiency bonus on group tasks', 'Project completion times reduced', 'Better coordination during emergencies'] },

  // --- SOCIAL ---
  { id: 'occ-medic', name: 'Medic', category: 'SOCIAL', shortDescription: 'Trained healer with practical skills.', description: 'Learned medicine from old textbooks and hard experience. Stitched wounds, set bones, and rationed antibiotics. Not a doctor, but close enough to matter.', perks: ['Healing items 30% more effective', 'Chance to save a crew member from death', 'Meds consumption reduced'] },
  { id: 'occ-nurse', name: 'Nurse', category: 'SOCIAL', shortDescription: 'Provides ongoing care and recovery support.', description: 'Tended to the sick and recovering in makeshift clinics. Focused on long-term care, hygiene, and preventing infection. Quiet dedication that saves lives.', perks: ['Recovery speed from injuries increased', 'Disease and infection chance reduced', 'Crew morale bonus when healing'] },
  { id: 'occ-preacher', name: 'Preacher', category: 'SOCIAL', shortDescription: 'Speaks hope into a godless world.', description: 'Offered words of comfort and meaning in a world that had lost both. Whether sincere or strategic, people gathered to listen. Hope is a resource too.', perks: ['Crew morale recovers faster', 'Chance to de-escalate hostile encounters', 'Settlement reputation gains increased'] },
  { id: 'occ-teacher', name: 'Teacher', category: 'SOCIAL', shortDescription: 'Educates others and passes on knowledge.', description: 'Taught children and adults basic literacy, math, and survival skills. Knowledge transfer is the only thing that prevents complete regression. Patient and persistent.', perks: ['XP gain increased for the whole party', 'Crew learns new skills faster', 'Lore and discovery rewards increased'] },
  { id: 'occ-entertainer', name: 'Entertainer', category: 'SOCIAL', shortDescription: 'Lifts spirits with stories and songs.', description: 'Played music, told stories, or performed for crowds in settlement squares and campfires. Kept people laughing when there was nothing to laugh about.', perks: ['Party morale floor increased', 'Better prices at bars and taverns', 'Crew trust grows faster'] },
  { id: 'occ-mediator', name: 'Mediator', category: 'SOCIAL', shortDescription: 'Resolves conflicts between people and factions.', description: 'Stepped between feuding parties and found common ground. Trusted by multiple factions to be fair. Words prevent more deaths than weapons.', perks: ['Faction disputes resolved more favorably', 'Crew internal conflicts reduced', 'Diplomatic options appear more often'] },

  // --- FIELD ---
  { id: 'occ-scout', name: 'Scout', category: 'FIELD', shortDescription: 'Eyes and ears of every expedition.', description: 'Moved ahead of groups to map terrain, mark hazards, and report back. Light on their feet, sharp-eyed, and comfortable alone in hostile territory.', perks: ['Map discovery range doubled', 'Reduced encounter danger on roads', 'POIs revealed earlier'] },
  { id: 'occ-navigator', name: 'Navigator', category: 'FIELD', shortDescription: 'Charts routes through dangerous terrain.', description: 'Read landmarks, stars, and weather patterns to guide caravans through the wasteland. Knew which paths were safe and which ones had been claimed by the Ash.', perks: ['Travel fuel costs reduced 20%', 'Reduced chance of getting lost', 'Weather prediction bonuses'] },
  { id: 'occ-driver', name: 'Driver', category: 'FIELD', shortDescription: 'Operates vehicles across harsh terrain.', description: 'Drove trucks, rigs, and salvaged vehicles across broken roads and open wasteland. Knows engine sounds, tire pressure by feel, and how to drift around debris.', perks: ['Vehicle speed increased', 'Fuel consumption reduced while driving', 'Better handling in hazardous terrain'] },
  { id: 'occ-convoy-operator', name: 'Convoy Operator', category: 'FIELD', shortDescription: 'Manages multi-vehicle convoys.', description: 'Coordinated multiple vehicles moving in formation across dangerous routes. Managed spacing, communication, and emergency stops. Keeps the column alive.', perks: ['Convoy travel speed increased', 'Reduced breakdown chance for all vehicles', 'Better resource distribution during travel'] },
  { id: 'occ-courier', name: 'Courier', category: 'FIELD', shortDescription: 'Delivers messages and packages fast.', description: 'Ran deliveries between outposts on foot or light vehicle. Speed and reliability were everything. Knew every shortcut and dead drop in the region.', perks: ['Travel time between known locations reduced', 'Bonus rewards from delivery contracts', 'Less likely to be intercepted on routes'] },
  { id: 'occ-smuggler', name: 'Smuggler', category: 'FIELD', shortDescription: 'Moves contraband through danger zones.', description: 'Transported illegal or restricted goods through checkpoints and hostile territory. Connected to underground networks and always had an exit plan.', perks: ['Reduced Heat from illegal actions', 'Hidden stash slots in inventory', 'Faster travel through tunnels and back routes'] },
];

export const FACTIONS = [
  'The Fuel Guild',
  'Scrap Nomads',
  'Cult of the Static Sun',
  'Remnant Military',
  'Water Syndicate',
  'The Dust Wraiths'
];

export const MAP_NODES: Node[] = [
  {
    id: 'start-001',
    name: 'Iron Gate Station',
    type: 'settlement',
    faction: 'The Fuel Guild',
    danger: 1,
    scarcity: [ResourceType.WATER, ResourceType.FOOD],
    abundance: [ResourceType.FUEL, ResourceType.PARTS],
    description: 'A fortified trading hub at the edge of the Dead Zone.',
    pois: [
      { id: 'poi-1', name: 'Guild Fuel Depot', type: 'market', description: 'The main pumping station. Fuel is plentiful here.' },
      { id: 'poi-2', name: 'The Rusty Radiator', type: 'npc', description: 'A crowded bar where caravans gather to swap rumors.' },
      { id: 'poi-3', name: 'Repair Bay 4', type: 'market', description: 'Standard maintenance facilities for heavy rigs.' }
    ]
  },
  {
    id: 'node-002',
    name: 'Sinking Refinery',
    type: 'refinery',
    faction: 'Scrap Nomads',
    danger: 3,
    scarcity: [ResourceType.MEDS],
    abundance: [ResourceType.FUEL],
    description: 'A massive structure partially submerged in the shifting sands.',
    pois: [
      { id: 'poi-4', name: 'The Overflow Pipes', type: 'hazard', description: 'Toxic runoff pools here. Dangerous but often contains lost scrap.' },
      { id: 'poi-5', name: 'Nomad Scrap Heap', type: 'market', description: 'A massive pile of junk where anything can be found for a price.' }
    ]
  },
  {
    id: 'node-003',
    name: 'Cleft Canyon Ruins',
    type: 'ruins',
    faction: 'None',
    danger: 6,
    scarcity: [ResourceType.FUEL],
    abundance: [ResourceType.PARTS, ResourceType.AMMO],
    description: 'Ancient concrete skeletons of a forgotten age.',
    pois: [
      { id: 'poi-6', name: 'Bank Vault 7', type: 'ruin', description: 'Untouched for decades. Guaranteed high-value relics inside.' },
      { id: 'poi-7', name: 'Canyon Sniper Nest', type: 'hazard', description: 'A strategic point overlooking the canyon floor.' }
    ]
  },
  {
    id: 'node-004',
    name: 'Silent Wells',
    type: 'outpost',
    faction: 'Water Syndicate',
    danger: 2,
    scarcity: [ResourceType.AMMO, ResourceType.FUEL],
    abundance: [ResourceType.WATER],
    description: 'A vital moisture collection point guarded by the Syndicate.',
    pois: [
      { id: 'poi-8', name: 'The Main Piston', type: 'landmark', description: 'A massive steam-driven pump that provides life to the sector.' },
      { id: 'poi-9', name: 'Water Barons Office', type: 'npc', description: 'Where deals are made. Highly secured.' }
    ]
  },
  {
    id: 'node-005',
    name: 'Obsidian Pass',
    type: 'tunnel',
    faction: 'The Dust Wraiths',
    danger: 8,
    scarcity: [ResourceType.FOOD],
    abundance: [ResourceType.MEDS],
    description: 'A dark, dangerous corridor through the mountainside.',
    pois: [
      { id: 'poi-10', name: 'The Narrow Throat', type: 'hazard', description: 'A natural choke point where ambushes are frequent.' }
    ]
  },
  {
    id: 'node-006',
    name: 'The Great Terminal',
    type: 'settlement',
    faction: 'Remnant Military',
    danger: 2,
    scarcity: [ResourceType.PARTS],
    abundance: [ResourceType.AMMO, ResourceType.FOOD],
    description: 'The last bastion of organized military presence in the sector.',
    pois: [
      { id: 'poi-11', name: 'Military Commissary', type: 'market', description: 'High-quality rations and standard military gear.' },
      { id: 'poi-12', name: 'Command Center Alpha', type: 'npc', description: 'Strategic oversight for the Remnant forces.' }
    ]
  },
];

export const INITIAL_CREW: CrewMember[] = [
  { id: 'c1', name: 'Jaxon', role: 'driver', traits: ['Skilled', 'Paranoid'], morale: 80, trust: 70, spIndex: 20 },
  { id: 'c2', name: 'Miri', role: 'mechanic', traits: ['Efficient', 'Addicted'], morale: 65, trust: 60, spIndex: 30 },
  { id: 'c3', name: 'Kael', role: 'muscle', traits: ['Loyal', 'Traumatized'], morale: 75, trust: 85, spIndex: 10 },
];

export const WORLD_LORE = {
  intro: "The sky died fifty years ago. What remains is the Ash—a grey, choking shroud that claimed the cities and buried the oceans. Society didn't end with a bang, but a slow, rattling breath. Now, the world is a 'Dead Zone', connected only by the desperate routes of the Ashtrails.",
  mission: "This is a living, multimodal ecosystem governed by a Gemini-powered Game Master. We have replaced static assets with an intelligence that dynamically generates NPCs, branching quests, and complex social dialogues in real-time. Your journey is uniquely manifested—no two survivors see the same wasteland. Acknowledge your directive. Survive the Ash."
};

export const MOCK_NEARBY_PLAYERS = [
  { name: 'Drifter_X', level: 12, location: 'Iron Gate Station', status: 'Trading' },
  { name: 'Ash_Runner', level: 8, location: 'Iron Gate Station', status: 'Resting' },
  { name: 'Rust_King', level: 15, location: 'Iron Gate Station', status: 'Recruiting' },
  { name: 'Nomad_Sam', level: 4, location: 'Iron Gate Station', status: 'Exploring' },
];

export const MOCK_ACTIVITY_FEED = [
  "Drifter_X traded 10 Fuel for 5 Ammo.",
  "Ash_Runner escaped a skirmish near Sinking Refinery.",
  "New contract posted: Escort the Medic to Obsidian Pass.",
  "The Fuel Guild has increased prices at Iron Gate Station.",
];
