
Core pitch
You run a caravan crossing a dead zone, hopping between nodes (settlements, ruins, checkpoints, cult camps). Each node is a contained “episode” where you must trade, negotiate, scout, or fight to keep moving.
The AI GM is responsible for:
Generating the node, factions present, and the local market.
Simulating hard constraints: food, water, fuel, ammo, medicine, morale, and trust.
Running a rumor economy where information is a tradable resource, but often noisy or weaponized.
The loop (tight, repeatable, Hordes-like tension)
Borrow the “day budget” feel from Die2Nite (action points, hard deadline, consequences) but adapt it to travel.
Per node:
Arrive with a status snapshot (supplies, injuries, morale, trust, heat).
Choose 2–4 actions before “Nightfall” (a turn limit):
• Trade
• Recruit or dismiss
• Scout
• Repair
• Negotiate contract
• Extort, steal, sabotage (high risk)
Nightfall resolution:
• Ambush risk, internal conflict, desertion, raid, weather damage
Depart to next node:
• Spend fuel and time
• Random travel event roll (storm, bandits, breakdown, shortcut offer)
This creates the same structural pressure that made Hordes-style games work: scarcity plus time pressure plus other humans (or simulated agents) doing unpredictable things.
Systems that make it “a game” and not “AI improv”
3.1 Resources (hard state)
Minimum viable set:
Food (calories)
Water
Fuel
Parts (repairs)
Ammo
Meds
Plus 3 soft meters:
Morale (caravan-wide)
Trust (leader ↔ crew)
Heat (how much attention you attract)
Everything the GM says must reconcile with these numbers. No handwaving.
3.2 Crew as constraints
Crew are not “characters”, they are modifiers that constrain choices:
• Roles: driver, mechanic, medic, scout, negotiator, muscle
• Traits: greedy, loyal, addicted, traumatized, idealist, paranoid
• Needs: daily consumption, personal agenda, breaking point
The GM should surface friction as dilemmas, not lore dumps:
“Mechanic demands extra water or refuses to patch the radiator tonight.”
3.3 The betrayal mechanic (your Hordes homage)
Hordes is explicitly “survival, unity, treachery.”
Make betrayal a rational option, not a random twist.
Implementation:
• Every crew member has a hidden “Self Preservation Index” and “Attachment”.
• When morale or supplies drop, SP rises.
• Betrayal triggers only when a threshold is crossed AND an opportunity exists (unguarded stash, rival faction offer, scapegoat moment).
This makes treachery legible and avoids “AI being arbitrary”.
The rumor economy (the signature system)
Rumors are items with attributes, not just text.
Each rumor has:
Topic: “fuel depot”, “bandit toll”, “safe route”, “cult patrols”
Location binding: which nodes it references
Freshness: decays per travel step
Accuracy probability: 0.1 to 0.9
Bias vector: who benefits if you believe it
Verification cost: how many actions or resources to validate
Payload: what it changes (prices, ambush risk, shortcut, faction attitude)
How it plays:
• You can buy rumors, sell rumors, trade rumors for supplies, or plant rumors.
• Some factions specialize:
• Traders sell high-volume low-accuracy chatter
• Scouts sell expensive high-accuracy intel
• Cults sell “truth” that manipulates you into their route
• You can “compile” 3 weak rumors into a stronger hypothesis if they triangulate.
Win condition impact:
You do not win by fighting. You win by knowing what is real sooner than the world kills you.
Node design (so content generation stays coherent)
Every node is generated from a template + parameters.
Node template fields:
Node type: settlement, ruins, refinery, tunnel pass, river crossing, military outpost
Local scarcity: what is cheap vs expensive
Dominant faction: who controls violence
Special rule: curfew, rationing, mandatory tribute, no guns, quarantine
Threat clock: what goes wrong if you linger
Opportunity: unique item, rare crew, repair bay, map fragment
This lets the GM generate variety while staying inside rails.
A clear “campaign” structure (progression)
You need a macro goal beyond “survive forever”.
Pick one:
Reach “The Coast” in 12 hops.
Deliver a vaccine cooler that must stay cold (fuel tradeoff).
Escort a witness to a tribunal (heat constantly rises).
Build a moving community: recruit families, turn the caravan into a convoy.
Progression:
• Vehicle upgrades (storage, armor, fuel efficiency, hidden compartments)
• Reputation with factions (discounts, escorts, bounties)
• Map knowledge (unlocks safer paths and rumor verification bonuses)
Web UI (minimal but sufficient)
A clean one-page layout:
Left column: Map with nodes (clickable), route preview, travel cost
Center: GM chat log + choice buttons (primary interaction)
Right: Caravan sheet
• Resources
• Crew cards (traits, loyalty, condition)
• Rumor inventory (with confidence bars)
Key design rule:
Free-text is allowed, but every turn ends with the player selecting 1 action from a bounded set. That keeps the GM enforceable.
How to run the AI GM without it hallucinating mechanics
You want a two-layer GM:
Layer A: Deterministic simulator (your code)
• Updates numbers: consumption, travel cost, dice rolls, thresholds
• Validates legality: can you repair without parts, can you travel without fuel
Layer B: Narrative GM (the model)
• Explains the outcome
• Portrays factions and crew
• Proposes options consistent with simulator outputs
Practical approach:
Your code computes “state delta”.
You feed the model: previous state, delta, and constraints.
The model outputs:
• A short narrative
• 3–6 next legal actions
• Updated rumors introduced at this node (as structured data)
MVP scope (buildable)
Week 1 level MVP:
15 node types, 6 factions, 40 rumor templates
Resources + morale + trust + heat
One vehicle with 5 upgrade slots
20 travel events, 30 node events
Rumor items with accuracy, decay, and verification
If you want, I can write the concrete JSON schemas for:
• GameState
• Node
• Faction
• CrewMember
• Rumor
• EventOutcome
and a “GM contract” prompt that forces the model to emit structured outputs only.
Also tell me which direction you prefer for tone:
gritty serious
dark comedic
surreal mystic
cold procedural (like an ops log)
I’ll lock the content generation style to that and draft the first 20 nodes plus the faction roster.
Okay love it, but instead of only having it be an oregon trail i want it to be a game sort of like hordes die2night and oregon trail apocalypse edition mixxed so that there is a wide variety of gameplay, and also plays like a proper RPG for the player and be multiplayer
To combine Hordes/Die2Nite, Oregon Trail–style travel, and a proper RPG with multiplayer, you need to shift the design from a single caravan journey into a shared survival world where caravans, towns, and players interact in cycles.
The core idea: a persistent wasteland server where each day is a strategic turn, but inside that turn, players experience personal RPG scenes.
Below is a coherent structure that merges all three inspirations.
Core Concept
Working title: Ash Caravan
A persistent post-apocalyptic world where players:
Control a character (RPG layer).
Belong to or lead a caravan or settlement (strategy layer).
Survive in a daily time cycle with scarcity and social tension (Hordes layer).
Travel across a hostile map with procedural events (Oregon Trail layer).
The AI acts as:
Game master for events, rumors, factions, and NPCs.
Simulation engine for economy, danger, and social consequences.
The Three-Layer Gameplay Structure
Layer 1: Personal RPG (character-level)
Every player has:
Stats: Strength, Agility, Wits, Empathy, Endurance.
Skills: mechanics, combat, scouting, medicine, trading, stealth.
Traits: paranoid, loyal, greedy, addict, visionary, etc.
Equipment: weapons, tools, clothing, relics.
What you do personally:
Explore ruins.
Duel or ambush.
Interrogate NPCs.
Sneak into rival caravans.
Negotiate contracts.
Craft or repair items.
This gives the “proper RPG” feeling.
Layer 2: Caravan or Town (group-level)
Players can:
Join a caravan.
Join a settlement.
Lead one themselves.
Group mechanics:
Shared resources (food, water, ammo, fuel).
Construction (walls, garages, radio towers).
Assign roles:
Scout
Guard
Mechanic
Quartermaster
Diplomat
This is where Hordes-style social tension lives:
Resource disputes.
Voting on decisions.
Exile or execution.
Hoarding or theft.
Layer 3: World Map (strategic layer)
The world is a hex or node map:
Settlements.
Ruins.
Trade routes.
Storm zones.
Cult territories.
Caravans:
Travel between nodes.
Trade goods.
Spread rumors.
Escort players.
Raid others.
This gives the Oregon Trail survival and travel feeling.
The Time System (Die2Nite influence)
The world runs on a daily cycle.
Each day:
Players receive a fixed number of Action Points.
Example:
8 AP per day.
Actions cost:
Explore ruin: 2 AP
Craft: 1 AP
Travel: 3 AP
Guard duty: 2 AP
Interrogate NPC: 1 AP
Nightfall (server-wide event)
At a fixed real-world time:
Raids.
Creature attacks.
Mutant storms.
Internal sabotage.
Desertions.
Consequences:
Settlements without defenses suffer losses.
Caravans on the road face ambushes.
Hidden traitors may act.
This recreates the collective dread that made Hordes compelling.
The AI Game Master’s Role
The AI does not control numbers.
It controls events, rumors, NPCs, and social pressure.
AI responsibilities:
Generate node events.
Simulate factions.
Create contracts, quests, and betrayals.
Produce rumors and misinformation.
Narrate outcomes.
Deterministic engine (code):
Resource consumption.
Combat math.
Travel costs.
AP spending.
Probability rolls.
This separation prevents chaos.
Multiplayer Structure
Server model
Each server:
40 to 100 players.
One shared map.
One daily cycle.
Players can:
Form caravans.
Build settlements.
Betray each other.
Trade or raid.
When everyone dies or the world collapses:
The server resets.
A new world is generated.
New factions, terrain, and relics.
This mirrors the seasonal death-and-rebirth loop of Hordes.
Core Gameplay Loops
Solo loop (RPG)
Spend AP to explore, craft, trade, or talk.
Acquire items or rumors.
Decide whether to help or betray your group.
Prepare for night.
Caravan loop
Vote on route or objective.
Allocate resources.
Assign roles.
Travel or fortify.
Survive nightfall.
Settlement loop
Build defenses or workshops.
Send out expeditions.
Manage food and water.
Deal with internal politics.
Rumor Economy (central system)
Rumors become a multiplayer social weapon.
Examples:
“There’s a fuel depot north of the salt flats.”
“The Green Cult pays double for mechanics.”
“The town of Red Hollow executes outsiders.”
Rumor attributes:
Accuracy chance.
Source faction.
Decay over time.
Who benefits if believed.
Players can:
Buy rumors.
Sell rumors.
Forge rumors.
Verify rumors.
This creates:
Misinformation campaigns.
Ambush setups.
Political manipulation.
Factions (AI-driven)
The world contains dynamic factions:
Fuel Guild.
Scrap Nomads.
Cult of the Static Sun.
Remnant Military.
Water Syndicate.
Each faction:
Controls nodes.
Has attitudes toward players.
Offers contracts.
Spreads rumors.
Their behavior is AI-driven but rule-constrained.
Death and Legacy
To keep tension high:
Death is permanent for the character.
But you keep:
Reputation.
A small inheritance item.
Knowledge of rumors or map fragments.
This encourages risk while avoiding frustration.
Minimal Multiplayer MVP
If you want something buildable quickly:
MVP scope
1 server.
30 players.
1 settlement + surrounding ruins.
No caravans at first.
Daily AP cycle.
Night attacks.
Rumor system.
AI-generated events.
Basically:
Die2Nite + AI events, then add caravans and travel later.
Why this mix works
This structure gives:
Hordes: social survival, daily dread, betrayal.
Oregon Trail: travel, logistics, environmental hazards.
RPG: character progression, gear, personal decisions.
AI GM: infinite content and social manipulation.
It avoids:
Pure chat-based improv.
Endless travel with no social tension.
Static scripted worlds.
--
Start by creating the architecture and all components, separation of concern.
Make use of tailwind
Make sure CSS is centralised
Make sure that there are primitives for the UI components, so we dont create new components each time for a feature