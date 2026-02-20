
import React, { useState, useEffect } from 'react';
import {
  GameState,
  Player,
  Node,
  ResourceType,
  INITIAL_RESOURCES,
  MAP_NODES,
  INITIAL_CREW
} from '@ashtrail/core';

// Screens
import { MenuScreen } from './Screens/IndividualScreens/MenuScreen';
import { CharacterCreationScreen } from './Screens/IndividualScreens/CharacterCreationScreen';
import { LoreIntroScreen } from './Screens/IndividualScreens/LoreIntroScreen';
import { InteractionScreen } from './Screens/IndividualScreens/InteractionScreen';
import { WorldMapScreen } from './Screens/IndividualScreens/WorldMapScreen';
import { LocationMapScreen } from './Screens/IndividualScreens/LocationMapScreen';
import { CombatScreen } from './Screens/IndividualScreens/CombatScreen';
import { CharacterSheet } from './Screens/IndividualScreens/CharacterSheet';
import { QuestLog } from './Screens/IndividualScreens/QuestLog';
import { SettingsScreen } from './Screens/IndividualScreens/SettingsScreen';

// UI Components
import { GameClock } from './UI/GameClock';

// Engine & Logic
import {
  consumeResources,
  updateCrewTension,
  iterateNarrative,
  architectInitialLore
} from '@ashtrail/core';

const SERVER_START_TIME = Date.now() - (45 * 60 * 1000);

const App: React.FC = () => {
  const [state, setState] = useState<GameState>({
    screen: 'MENU',
    day: 1,
    ap: 8,
    maxAp: 8,
    player: {
      name: 'UNKNOWN',
      age: 25,
      gender: 'UNDETERMINED',
      history: '',
      appearancePrompt: '',
      traits: [],
      stats: { strength: 3, agility: 3, intelligence: 3, wisdom: 3, endurance: 3, charisma: 3 },
      hp: 25,
      maxHp: 25,
      xp: 0,
      level: 1,
      inventory: []
    },
    resources: INITIAL_RESOURCES,
    heat: 5,
    location: MAP_NODES[0],
    crew: INITIAL_CREW,
    quests: [
      { id: 'q1', title: 'Find the Coast', description: 'Reach salt water to cleanse the lungs.', status: 'active', rewards: ['500 XP'] }
    ],
    history: [{ type: 'narrative', content: 'SYSTEM: Uplink established. Awaiting deployment...', timestamp: Date.now() }]
  });

  const [isLoading, setIsLoading] = useState(false);
  const [architectedLore, setArchitectedLore] = useState<string | null>(null);

  const addLog = (content: string, type: 'narrative' | 'system' | 'action' = 'narrative') => {
    setState(prev => ({
      ...prev,
      history: [...prev.history, { type, content, timestamp: Date.now() }]
    }));
  };

  const handleAction = async (actionType: string) => {
    if (state.ap <= 0 && actionType !== 'END_DAY') {
      addLog("STRESS ALERT: AP reservoir empty. Rest required.", 'system');
      return;
    }

    if (actionType === 'COMBAT') {
      setState(prev => ({
        ...prev,
        screen: 'COMBAT',
        combat: {
          enemyName: 'Dust Marauder',
          enemyHp: 40,
          enemyMaxHp: 40,
          log: ['Hostile contact verified. Defensive stance active.']
        }
      }));
      return;
    }

    setIsLoading(true);
    let nextState = { ...state, resources: { ...state.resources }, history: [...state.history] };

    if (actionType === 'END_DAY') {
      nextState.day += 1;
      nextState.ap = nextState.maxAp;
      nextState.resources = consumeResources(nextState.resources, nextState.crew.length);
      nextState.crew = updateCrewTension(nextState.crew, nextState.resources);
      addLog(`CYCLE_END: Orbital shift confirmed. Day ${nextState.day} begins.`, 'system');
    } else {
      nextState.ap -= 1;
      addLog(`${actionType}`, 'action');
    }

    const narrative = await iterateNarrative(nextState, actionType);
    nextState.history.push({ type: 'narrative', content: narrative, timestamp: Date.now() });

    setState(nextState);
    setIsLoading(false);
  };

  const navigateTo = (node: Node) => {
    setState(prev => ({
      ...prev,
      location: node,
      destination: undefined,
      screen: 'LOCATION_MAP',
      ap: Math.max(0, prev.ap - 3)
    }));
    addLog(`NAV_UPLINK: Sector shift to ${node.name}.`, 'system');
  };

  const handleCharCreation = async (p: Player) => {
    setIsLoading(true);
    const lore = await architectInitialLore(p.name, p.history);
    setArchitectedLore(lore);
    setState(s => ({ ...s, player: p, screen: 'LORE_INTRO' }));
    setIsLoading(false);
  };

  const renderScreen = () => {
    switch (state.screen) {
      case 'MENU':
        return (
          <MenuScreen
            onStart={() => setState(s => ({ ...s, screen: 'CHARACTER_CREATION' }))}
            onSettings={() => setState(s => ({ ...s, screen: 'SETTINGS' }))}
            onManageCharacters={() => setState(s => ({ ...s, screen: 'CHARACTER_SHEET' }))}
            hasCharacter={state.player.name !== 'UNKNOWN'}
            serverStartTime={SERVER_START_TIME}
          />
        );
      case 'CHARACTER_CREATION':
        return <CharacterCreationScreen onComplete={handleCharCreation} />;
      case 'LORE_INTRO':
        return <LoreIntroScreen architectedContent={architectedLore} onContinue={() => setState(s => ({ ...s, screen: 'LOCATION_MAP' }))} />;
      case 'SETTINGS':
        return <SettingsScreen onBack={() => setState(s => ({ ...s, screen: 'MENU' }))} />;
      case 'COMBAT':
        return (
          <CombatScreen
            state={state}
            onAttack={() => {
              setState(prev => {
                if (!prev.combat) return prev;
                const dmg = 5 + prev.player.stats.strength;
                const enemyDmg = 4;
                const newEnemyHp = Math.max(0, prev.combat.enemyHp - dmg);
                if (newEnemyHp === 0) {
                  return {
                    ...prev,
                    screen: 'LOCATION_MAP',
                    combat: undefined,
                    player: { ...prev.player, xp: prev.player.xp + 100 },
                    history: [...prev.history, { type: 'system', content: 'COMBAT_RESOLVED: Target neutralized.', timestamp: Date.now() }]
                  };
                }
                return {
                  ...prev,
                  player: { ...prev.player, hp: Math.max(0, prev.player.hp - enemyDmg) },
                  combat: {
                    ...prev.combat,
                    enemyHp: newEnemyHp,
                    log: [...prev.combat.log, `LOG: Hit for ${dmg}.`, `LOG: Received ${enemyDmg}.`]
                  }
                };
              });
            }}
            onFlee={() => setState(s => ({ ...s, screen: 'LOCATION_MAP', combat: undefined }))}
          />
        );
      case 'WORLD_MAP':
        return <WorldMapScreen state={state} onNavigate={navigateTo} onSetDestination={(n) => setState(s => ({ ...s, destination: n }))} />;
      case 'LOCATION_MAP':
        return <LocationMapScreen state={state} onSelectPOI={(poi) => {
          setState(s => ({ ...s, screen: 'INTERACTION' }));
          handleAction(`EXPLORE_${poi}`);
        }} />;
      case 'CHARACTER_SHEET':
        return <CharacterSheet state={state} />;
      case 'QUEST_LOG':
        return <QuestLog state={state} />;
      case 'INTERACTION':
      default:
        return <InteractionScreen state={state} onAction={handleAction} isLoading={isLoading} />;
    }
  };

  if (['MENU', 'CHARACTER_CREATION', 'LORE_INTRO', 'SETTINGS'].includes(state.screen)) {
    return renderScreen();
  }

  return (
    <div className="h-screen w-full flex flex-col bg-zinc-950 text-zinc-300 overflow-hidden font-sans">
      <header className="h-16 border-b border-zinc-800 bg-zinc-900/95 backdrop-blur-md flex items-center px-6 justify-between shrink-0 z-20">
        <div className="flex items-center gap-8">
          <button onClick={() => setState(s => ({ ...s, screen: 'MENU' }))} className="font-black italic tracking-tighter text-lg text-white mono uppercase hover:text-orange-500 transition-colors">
            ASHTRAIL
          </button>
          <nav className="flex gap-6">
            {['LOCATION_MAP', 'INTERACTION', 'WORLD_MAP', 'CHARACTER_SHEET', 'QUEST_LOG'].map(id => (
              <button key={id} onClick={() => setState(s => ({ ...s, screen: id as any }))} className={`text-[10px] mono uppercase font-bold tracking-[0.2em] transition-all ${state.screen === id ? 'text-orange-500 border-b border-orange-500 pb-2' : 'text-zinc-500 hover:text-zinc-300'}`}>
                {id.replace('_', ' ')}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex gap-6 items-center">
          <GameClock
            serverStartTime={SERVER_START_TIME}
            onNightfall={() => addLog("EMERGENCY: Nightfall protocols initialized. Secure sector immediately.", "system")}
          />

          <div className="h-8 w-px bg-zinc-800" />

          <div className="flex flex-col items-end">
            <span className="text-[9px] text-zinc-500 uppercase mono">AP_RES</span>
            <div className="flex gap-1">
              {Array.from({ length: state.maxAp }).map((_, i) => (
                <div key={i} className={`h-3 w-1.5 rounded-sm transition-all duration-300 ${i < state.ap ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.4)]' : 'bg-zinc-800'}`} />
              ))}
            </div>
          </div>
          <div className="flex gap-4 border-l border-zinc-800 pl-4">
            {(Object.entries(state.resources) as [ResourceType, number][]).slice(0, 3).map(([type, amount]) => (
              <div key={type} className="flex flex-col items-center">
                <span className="text-[8px] text-zinc-600 uppercase mono">{type}</span>
                <span className={`text-xs mono font-black ${amount < 5 ? 'text-red-500' : 'text-zinc-200'}`}>{amount}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-6 relative">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/asfalt-dark.png')] opacity-10 pointer-events-none" />
        <div className="relative h-full z-10 animate-in fade-in duration-500">
          {renderScreen()}
        </div>
      </main>

      <footer className="h-8 bg-zinc-950 border-t border-zinc-800 flex items-center px-6 justify-between text-[9px] text-zinc-600 mono uppercase tracking-[0.2em] shrink-0">
        <div className="flex gap-6">
          <span className="text-zinc-400">{state.player.name}</span>
          <span className="text-zinc-800">//</span>
          <span>{state.location.name}</span>
          <span className="text-zinc-800">//</span>
          <span className={state.heat > 50 ? 'text-red-500 animate-pulse' : ''}>HEAT: {state.heat}%</span>
        </div>
        <div className="flex gap-6 items-center">
          <div className="flex gap-2 items-center">
            <div className="w-1 h-1 rounded-full bg-orange-500 animate-ping" />
            <span className="text-orange-900">PERSISTENT_SHARD_01</span>
          </div>
          <span>v0.6.5-DENSE-PROFILE</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
