
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Button, Card, ProgressBar, Stack, Badge, Container, Input, Select, Tooltip } from '../../UI/Primitives';
import {
  Player,
  Stats,
  Trait,
  Occupation,
  OccupationCategory,
  ALL_TRAITS,
  ALL_OCCUPATIONS,
  MOCK_TALENT_TREES,
  generateCharacterPortrait,
  enhanceAppearancePrompt
} from '@ashtrail/core';

interface CharacterCreationScreenProps {
  onComplete: (player: Player) => void;
  onBack: () => void;
}

type CreationTab = 'IDENTITY' | 'TRAITS' | 'STATS';

const APPEARANCE_SELECTORS = {
  build: [
    'Wiry', 'Gaunt', 'Athletic', 'Stocky', 'Large', 'Emaciated', 'Muscular', 'Broad-shouldered',
    'Slight', 'Towering', 'Compact', 'Brawny', 'Skeletal', 'Barrel-chested', 'Hunched', 'Lithe',
    'Robust', 'Fragile', 'V-Taper', 'Willowy', 'Square-set', 'Sinewy', 'Obese', 'Underfed', 'Endomorphic'
  ],
  skinTone: [
    'Ash-stained', 'Pale', 'Tanned', 'Leathery', 'Mottled', 'Ebony', 'Olive', 'Sun-bleached',
    'Ruddy', 'Pallid', 'Sallow', 'Greyish-blue', 'Bronzed', 'Porcelain', 'Nut-brown', 'Ashen',
    'Jaundiced', 'Deep Copper', 'Coal-dust Grey', 'Translucent'
  ],
  skinDetails: [
    'Clean', 'Radiation Welts', 'Chemical Burns', 'Lacerated', 'Dust-caked', 'Pockmarked',
    'Freckled', 'Leathery', 'Vitiligo', 'Fresh Stitches', 'Surgical Scars', 'Radiation Glow (Faint)',
    'Sun-damaged', 'Deep Wrinkles', 'Oil-stained', 'Calloused', 'Mottled Discoloration', 'Glass Shards Embedded',
    'Treated Keloids', 'Peeling Burn'
  ],
  height: [
    'Extremely Short', 'Diminutive', 'Short', 'Average', 'Tall', 'Imposing', 'Giant',
    'Lanky', 'Stunted', 'Compact', 'Towering', 'Medium-build'
  ],
  posture: [
    'Wary', 'Erect', 'Slouching', 'Limping', 'Rigid', 'Prowling', 'Stooped', 'Languid',
    'Predatory', 'Defeated', 'Unstable', 'Graceful', 'Asymmetrical', 'Shuffling', 'Alert'
  ],
  faceShape: [
    'Sharp', 'Craggy', 'Round', 'Square', 'Gaunt', 'Symmetrical', 'Oval', 'Heart-shaped',
    'Long', 'Chiseled', 'Diamond', 'Battered', 'Flat', 'High Cheekbones', 'Receding Chin'
  ],
  eyes: [
    'Sunken', 'Piercing Blue', 'Amber', 'Icy Grey', 'Bloodshot', 'Cataract-white', 'Emerald',
    'Deep Brown', 'One-eyed', 'Clouded', 'Glassy', 'Cybernetic (Red)', 'Cybernetic (Green)',
    'Hazel', 'Violet', 'Mismatched', 'Milky', 'Nervous', 'Hollow', 'Staring'
  ],
  hairStyle: [
    'Buzzcut', 'Matted & Long', 'Shaved', 'Wild Mane', 'Top-knot', 'Braided', 'Receding',
    'Bald', 'Mohawk', 'Matted Dreads', 'Clean-cut', 'Greasy Mullet', 'Pompadour (Faded)',
    'Shaved Sides', 'Wispy Strands', 'Tangled Mess', 'Asymmetrical Cut', 'Short & Neat'
  ],
  hairColor: [
    'Black', 'Ash-grey', 'Pure White', 'Sandy', 'Salt & Pepper', 'Bleached Blonde',
    'Rusty Red', 'Deep Brown', 'Iron Grey', 'Silver', 'Charcoal', 'Dirty Blonde', 'Sunset Orange'
  ],
  facialHair: [
    'Clean-shaven', '5-o-clock Shadow', 'Goatee', 'Bushy Beard', 'Unkempt Scruff',
    'Braided Beard', 'None', 'Handlebar Mustache', 'Sideburns', 'Van Dyke', 'Mutton Chops',
    'Thin Stubble', 'Scruffy Patchy', 'Wild Growth'
  ],
  gearWear: [
    'Rust-flecked', 'Grimy', 'Ripped', 'Blood-stained', 'Dusty', 'Pristine (Rare)',
    'Patched-up', 'Oil-slicked', 'Acid-pitted', 'Sun-faded', 'Sand-blasted', 'Smell of Smoke'
  ],
  accessory: [
    'Gas Mask', 'Military Goggles', 'Hooded Cowl', 'Cracked Respirator', 'Leather Eye Patch',
    'Frayed Shemagh', 'None', 'Electronic Visor', 'Necklace of Teeth', 'Bone Earring',
    'Torn Bandana', 'Dog Tags', 'Utility Belt', 'Mechanical Arm-brace', 'Woven Charm', 'Welder Mask'
  ],
  markings: [
    'Burn Scars', 'Acid Marks', 'Faded Tattoos', 'Lacerations', 'Tribal Branding', 'None',
    'Mechanical Port', 'Surgical Scars', 'Slave Branded', 'War Paint', 'Symbol of the Static Sun',
    'Hexagonal Tattoos', 'Chemical Stain', 'Barbed Wire Scar'
  ]
};

const CustomDropdown: React.FC<{
  value: string;
  options: string[];
  onChange: (val: string) => void;
  align?: 'left' | 'right';
}> = ({ value, options, onChange, align = 'right' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 text-xs mono font-black text-white hover:text-orange-500 transition-colors py-1 group w-full ${align === 'right' ? 'justify-end' : 'justify-start'}`}
      >
        <span className="truncate">{value}</span>
        <span className={`text-[8px] text-zinc-600 group-hover:text-orange-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {isOpen && (
        <div className={`absolute top-full mt-1 z-[100] min-w-[160px] max-h-64 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-sm shadow-[0_0_30px_rgba(0,0,0,0.8)] custom-scrollbar animate-in fade-in zoom-in-95 duration-200 ${align === 'right' ? 'right-0' : 'left-0'}`}>
          <div className="py-1">
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-2 text-[10px] mono uppercase transition-all duration-150 flex items-center justify-between border-b border-zinc-800/20 last:border-0 ${opt === value
                  ? 'bg-orange-600/10 text-orange-500 font-black'
                  : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200'
                  }`}
              >
                <span>{opt}</span>
                {opt === value && <span className="text-[8px]">●</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const CharacterCreationScreen: React.FC<CharacterCreationScreenProps> = ({ onComplete, onBack }) => {
  const [activeTab, setActiveTab] = useState<CreationTab>('IDENTITY');
  const [name, setName] = useState('');
  const [age, setAge] = useState(25);
  const [gender, setGender] = useState('Male');

  // Advanced Appearance State
  const [appearanceSelectors, setAppearanceSelectors] = useState<Record<string, string>>({
    build: 'Wiry',
    skinTone: 'Ash-stained',
    skinDetails: 'Clean',
    height: 'Average',
    posture: 'Wary',
    faceShape: 'Sharp',
    eyes: 'Sunken',
    hairStyle: 'Buzzcut',
    hairColor: 'Black',
    facialHair: '5-o-clock Shadow',
    gearWear: 'Grimy',
    accessory: 'None',
    markings: 'None'
  });
  const [appearancePrompt, setAppearancePrompt] = useState('');
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [isGeneratingPortrait, setIsGeneratingPortrait] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isProfileModified, setIsProfileModified] = useState(false);

  // History State
  const [history, setHistory] = useState('');

  // Traits State
  const [traitSearch, setTraitSearch] = useState('');
  const [selectedTraits, setSelectedTraits] = useState<Trait[]>([]);
  const [traitPoints, setTraitPoints] = useState(15);

  // Stats State
  const [statsPoints, setStatsPoints] = useState(18); // Increased slightly for more stats
  const [stats, setStats] = useState<Stats>({
    strength: 3,
    agility: 3,
    intelligence: 3,
    wisdom: 3,
    endurance: 3,
    charisma: 3
  });

  // Occupation State
  const [selectedOccupation, setSelectedOccupation] = useState<Occupation | null>(null);
  const [occupationSearch, setOccupationSearch] = useState('');
  const [occupationCategory, setOccupationCategory] = useState<OccupationCategory | 'ALL'>('ALL');
  const [showTalentTree, setShowTalentTree] = useState(false);

  // Refs for auto-resize
  const biometricRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (biometricRef.current) {
      biometricRef.current.style.height = 'auto';
      // Limit growth to prevent pushing layout
      const nextHeight = Math.min(biometricRef.current.scrollHeight, 180);
      biometricRef.current.style.height = nextHeight + 'px';
      // Enable scroll if we hit the limit
      biometricRef.current.style.overflowY = biometricRef.current.scrollHeight > 180 ? 'auto' : 'hidden';
    }
  }, [appearancePrompt]);

  const handleAgeChange = (val: number) => {
    setAge(Math.max(18, val));
  };

  const intrinsicModifiers = useMemo(() => {
    const mods = [];
    if (age < 20) mods.push(ALL_TRAITS.find(t => t.id === 'age-juvenile')!);
    else if (age > 55) mods.push(ALL_TRAITS.find(t => t.id === 'age-elder')!);
    else mods.push(ALL_TRAITS.find(t => t.id === 'age-prime')!);
    return mods.filter(Boolean);
  }, [age]);

  useEffect(() => {
    if (gender === 'Female' && appearanceSelectors.facialHair !== 'None') {
      setAppearanceSelectors(prev => ({ ...prev, facialHair: 'None' }));
    }
  }, [gender]);

  const handleRefreshPortrait = async (specificText?: string) => {
    if (isGeneratingPortrait) return;
    setIsGeneratingPortrait(true);

    // HARMONIZATION: Combine core attributes from selectors with the narrative text
    const selectorsSummary = Object.entries(appearanceSelectors)
      .map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1')}: ${v}`)
      .join(', ');

    const contextPrompt = `A ${gender} wasteland explorer, aged ${age}. Overall characteristics: ${selectorsSummary}. Detailed appearance: ${specificText || appearancePrompt}`;

    const url = await generateCharacterPortrait(contextPrompt);
    if (url) {
      setPortraitUrl(url);
      setIsProfileModified(false);
    }
    setIsGeneratingPortrait(false);
  };

  const handleManifestIdentity = async () => {
    if (isSyncing || isGeneratingPortrait) return;

    // Step 1: Synthesize Narrative from Selectors
    setIsSyncing(true);
    const narrative = await enhanceAppearancePrompt({
      ...appearanceSelectors,
      age: age.toString(),
      gender: gender
    });
    setAppearancePrompt(narrative || '');
    setIsSyncing(false);

    // Step 2: Manifest Portrait using the new narrative
    if (narrative) {
      await handleRefreshPortrait(narrative);
    }
  };

  const filteredTraits = useMemo(() => {
    const searchLower = traitSearch.toLowerCase();
    const available = ALL_TRAITS.filter(t =>
      !t.id.startsWith('age-') &&
      !selectedTraits.some(st => st.id === t.id)
    );
    return {
      positive: available.filter(t => t.type === 'positive' && (t.name.toLowerCase().includes(searchLower) || t.description.toLowerCase().includes(searchLower))),
      negative: available.filter(t => t.type === 'negative' && (t.name.toLowerCase().includes(searchLower) || t.description.toLowerCase().includes(searchLower))),
      neutral: available.filter(t => t.type === 'neutral' && (t.name.toLowerCase().includes(searchLower) || t.description.toLowerCase().includes(searchLower)))
    };
  }, [traitSearch, selectedTraits]);

  const MAX_NEUTRAL_TRAITS = 3;
  const selectedNeutralCount = selectedTraits.filter(t => t.type === 'neutral' && !t.id.startsWith('age-')).length;

  const toggleTrait = (trait: Trait) => {
    const isSelected = selectedTraits.find(t => t.id === trait.id);
    if (isSelected) {
      setSelectedTraits(prev => prev.filter(t => t.id !== trait.id));
      setTraitPoints(prev => prev + trait.cost);
    } else {
      // Block neutral traits if limit reached
      if (trait.type === 'neutral' && selectedNeutralCount >= MAX_NEUTRAL_TRAITS) return;
      if (traitPoints >= trait.cost || trait.cost < 0) {
        setSelectedTraits(prev => [...prev, trait]);
        setTraitPoints(prev => prev - trait.cost);
      }
    }
  };

  const adjustStat = (stat: keyof Stats, delta: number) => {
    if (delta > 0 && statsPoints <= 0) return;
    if (delta < 0 && stats[stat] <= 1) return;
    setStats(prev => ({ ...prev, [stat]: prev[stat] + delta }));
    setStatsPoints(prev => prev - delta);
  };

  const isIdentityComplete = name.length > 1 && appearancePrompt.length > 5 && history.length > 10 && age >= 18;

  const handleSubmit = () => {
    if (age < 18) return;
    const finalTraits = [...selectedTraits, ...intrinsicModifiers];
    const finalStats = { ...stats };
    if (age < 20) { finalStats.agility += 1; finalStats.strength -= 1; }
    if (age > 55) { finalStats.wisdom += 1; finalStats.endurance -= 1; }

    onComplete({
      name,
      age,
      gender,
      history,
      appearancePrompt,
      portraitUrl: portraitUrl || undefined,
      stats: finalStats,
      traits: finalTraits,
      occupation: selectedOccupation || undefined,
      hp: 10 + finalStats.endurance * 5,
      maxHp: 10 + finalStats.endurance * 5,
      xp: 0,
      level: 1,
      inventory: []
    });
  };

  const TraitItem: React.FC<{ trait: Trait; active?: boolean }> = ({ trait, active }) => (
    <Tooltip content={trait.description}>
      <button
        onClick={() => toggleTrait(trait)}
        className={`w-full p-2 text-left border rounded-sm transition-all group flex items-center justify-between ${active
          ? 'bg-orange-600/20 border-orange-500 shadow-[inset_0_0_10px_rgba(249,115,22,0.1)]'
          : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'
          }`}
      >
        <span className={`font-bold text-[10px] uppercase mono ${active ? 'text-orange-400' : 'text-zinc-300'} truncate mr-2`}>
          {trait.name}
        </span>
        <Badge color={trait.type === 'positive' ? 'blue' : trait.type === 'negative' ? 'red' : 'zinc'}>
          {trait.cost > 0 ? `-${trait.cost}` : trait.cost < 0 ? `+${Math.abs(trait.cost)}` : '0'}
        </Badge>
      </button>
    </Tooltip>
  );

  return (
    <Container centered className="h-screen py-8 flex flex-col">
      <Card
        title="Wastelander Dossier Initialization"
        className="flex-1 overflow-hidden"
        headerAction={
          <div className="flex gap-1">
            {(['IDENTITY', 'TRAITS', 'STATS'] as CreationTab[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 text-[9px] mono uppercase font-bold tracking-widest border-b-2 transition-all ${activeTab === tab
                  ? 'text-orange-500 border-orange-500 bg-orange-500/5'
                  : 'text-zinc-600 border-transparent hover:text-zinc-400'
                  }`}
              >
                {tab === 'STATS' ? 'STATS & OCCUPATIONS' : tab}
              </button>
            ))}
          </div>
        }
      >
        <div className="flex flex-col h-full overflow-hidden">

          <div className="flex-1 overflow-hidden">
            {activeTab === 'IDENTITY' && (
              <div className="flex-1 flex flex-row overflow-hidden animate-in fade-in duration-500">
                {/* LEFT COLUMN: ALL INPUTS */}
                <div className="w-[420px] flex flex-col pr-6 border-r border-zinc-800/50 h-full min-h-0">
                  <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0">
                    <div className="space-y-4">
                      {/* Technical Input Panel */}
                      <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-sm divide-y divide-zinc-800/30">
                        {/* 1. Core Designation */}
                        <div className="p-3 space-y-3">
                          <div className="flex justify-between items-center">
                            <label className="text-[9px] uppercase text-zinc-500 mono font-black tracking-widest">01 // Designation</label>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[7px] mono text-zinc-600 uppercase">Wastelander Name</label>
                            <textarea
                              value={name}
                              onChange={(e) => setName(e.target.value.replace(/\n/g, ''))}
                              placeholder="NAME"
                              rows={1}
                              className="bg-transparent text-xl font-black italic mono text-white uppercase outline-none placeholder:text-zinc-800 w-full tracking-wider pr-4 resize-none overflow-hidden leading-tight"
                              onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = 'auto';
                                target.style.height = target.scrollHeight + 'px';
                              }}
                            />
                            <div className="h-px bg-orange-500/30 w-full" />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col">
                              <label className="text-[7px] mono text-zinc-600 uppercase">Age Record</label>
                              <div className="flex items-center gap-2 mt-1">
                                <button
                                  onClick={() => setAge(Math.max(18, age - 1))}
                                  className="w-5 h-5 flex items-center justify-center bg-zinc-950 border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-700 rounded-sm text-[10px] mono transition-colors"
                                >
                                  -
                                </button>
                                <span className="text-xs mono font-black text-white w-6 text-center">{age}</span>
                                <button
                                  onClick={() => setAge(age + 1)}
                                  className="w-5 h-5 flex items-center justify-center bg-zinc-950 border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-700 rounded-sm text-[10px] mono transition-colors"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                            <div className="flex flex-col">
                              <label className="text-[7px] mono text-zinc-600 uppercase">Gender Matrix</label>
                              <div className="mt-1">
                                <CustomDropdown
                                  value={gender}
                                  options={['Male', 'Female', 'Non-Binary', 'Undetermined']}
                                  onChange={setGender}
                                  align="left"
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* 2. Physical Vectors */}
                        <div className="p-3 space-y-2">
                          <label className="text-[9px] uppercase text-zinc-500 mono font-black tracking-widest block">02 // Appearance</label>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                            {Object.entries(APPEARANCE_SELECTORS).map(([key, options]) => (
                              <div key={key} className="flex flex-col gap-0.5 py-0.5 group">
                                <span className="text-[7px] mono uppercase text-zinc-600 group-hover:text-zinc-500">{key.replace(/([A-Z])/g, ' $1')}</span>
                                <CustomDropdown
                                  value={appearanceSelectors[key]}
                                  options={options}
                                  onChange={(val) => setAppearanceSelectors(prev => ({ ...prev, [key]: val }))}
                                  align="left"
                                />
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 3. Neural Backstory */}
                        <div className="p-3 space-y-2">
                          <label className="text-[9px] uppercase text-zinc-500 mono font-black tracking-widest block">03 // Backstory</label>
                          <textarea
                            value={history}
                            onChange={(e) => setHistory(e.target.value)}
                            placeholder="Document your origin..."
                            className="w-full bg-zinc-950/40 border border-zinc-800/40 p-2 text-zinc-400 mono text-xs focus:border-orange-900/30 outline-none rounded-sm resize-none custom-scrollbar leading-relaxed h-28 overflow-y-auto overflow-x-hidden"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* UNIFIED ACTION BUTTON - Aligned at bottom */}
                  <div className="pt-6 shrink-0">
                    <Button
                      variant="accent"
                      onClick={handleManifestIdentity}
                      className="w-full py-5 text-xs tracking-[0.5em] font-black border-l-4 border-orange-500 shadow-[0_0_30px_rgba(234,88,12,0.15)] hover:shadow-[0_0_40px_rgba(234,88,12,0.25)] relative overflow-hidden group"
                      isLoading={isSyncing || isGeneratingPortrait}
                    >
                      <div className="absolute inset-x-0 bottom-0 h-[1px] bg-white/20" />
                      {isGeneratingPortrait || isSyncing ? 'Generating...' : 'generate your character'}
                    </Button>
                  </div>
                </div>

                {/* RIGHT COLUMN: AI OUTPUTS (PORTRAIT & DESCRIPTION) */}
                <div className="flex-1 pl-6 flex flex-col gap-4 h-full min-h-0 overflow-hidden">
                  {/* Portrait Box - Larger and Main Focus */}
                  <div className="h-[380px] bg-zinc-950/50 border border-zinc-800 rounded-sm flex flex-col overflow-hidden relative group shrink-0">
                    <div className="absolute top-0 left-0 right-0 bg-zinc-900/80 px-4 py-1.5 border-b border-zinc-800 text-[9px] mono text-zinc-500 uppercase flex justify-between z-10 transition-colors group-hover:bg-zinc-900">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                        <span>Visualization</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {portraitUrl && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRefreshPortrait(); }}
                            disabled={isGeneratingPortrait}
                            className={`text-orange-500 hover:text-orange-400 font-black disabled:opacity-50 flex items-center transition-all mono uppercase text-[9px] tracking-widest ${isProfileModified ? 'animate-pulse text-orange-300 drop-shadow-[0_0_5px_rgba(249,115,22,0.5)]' : ''}`}
                          >
                            regenerate
                          </button>
                        )}
                        <span className={portraitUrl ? 'text-green-500' : 'text-zinc-700'}>
                          {portraitUrl ? 'Generated' : 'No Signal'}
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 flex items-center justify-center p-6 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
                      {portraitUrl ? (
                        <div className="w-full h-full relative group shadow-[0_0_50px_rgba(0,0,0,0.6)] border border-zinc-800/50 p-1">
                          <img src={portraitUrl} alt="Portrait" className="w-full h-full object-contain animate-in fade-in zoom-in duration-1000" />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                            <span className="text-[9px] mono text-orange-400 font-black tracking-widest">IDENTITY CONFIRMED</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center space-y-4">
                          <div className="w-24 h-24 border-2 border-zinc-900 border-dashed rounded-full flex items-center justify-center mx-auto opacity-20 relative animate-[pulse_4s_infinite]">
                            <span className="text-3xl text-zinc-800">?</span>
                          </div>
                          <p className="text-[9px] mono text-zinc-700 uppercase tracking-widest animate-pulse">Waiting for generation...</p>
                        </div>
                      )}
                    </div>

                    {(isSyncing || isGeneratingPortrait) && (
                      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center gap-4 z-50">
                        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(234,88,12,0.4)]" />
                        <span className="text-xs mono text-orange-500 font-black animate-pulse tracking-[0.2em] uppercase">Synthesizing User Data...</span>
                      </div>
                    )}
                  </div>

                  {/* Physical Description Output - EDITABLE */}
                  <div className="flex-1 bg-zinc-900/30 border border-zinc-800 rounded-sm p-5 relative flex flex-col group min-h-0 overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600/5 blur-[80px] -mr-16 -mt-16 pointer-events-none group-hover:bg-orange-600/10 transition-all" />
                    <label className="text-[10px] uppercase text-orange-500/80 mono font-black mb-3 tracking-[0.2em] border-b border-orange-900/40 pb-1.5 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="w-1 h-2 bg-orange-500" />
                        <span>Profile</span>
                      </div>
                      {!appearancePrompt ? (
                        <span className="text-zinc-800 text-[9px] uppercase">Awaiting Link</span>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[8px] text-zinc-600 mono uppercase opacity-50 group-hover:opacity-100 transition-opacity tracking-widest">editable profile</span>
                          {isProfileModified && (
                            <span className="text-[8px] text-orange-500 mono font-black animate-pulse uppercase tracking-wider bg-orange-500/10 px-1 rounded-sm">
                              [ please press regenerate ]
                            </span>
                          )}
                        </div>
                      )}
                    </label>
                    <div className="flex-1 flex flex-col overflow-y-auto min-h-0 custom-scrollbar pr-2">
                      {appearancePrompt ? (
                        <textarea
                          ref={biometricRef}
                          value={appearancePrompt}
                          onChange={(e) => {
                            setAppearancePrompt(e.target.value);
                            setIsProfileModified(true);
                          }}
                          onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = 'auto';
                            const nextHeight = Math.min(target.scrollHeight, 180);
                            target.style.height = nextHeight + 'px';
                            target.style.overflowY = target.scrollHeight > 180 ? 'auto' : 'hidden';
                          }}
                          className="w-full bg-transparent text-xs italic text-zinc-400 leading-relaxed mono resize-none outline-none custom-scrollbar animate-in slide-in-from-bottom-2 duration-700 focus:text-white transition-colors overflow-y-hidden"
                          placeholder="Refine biometric data..."
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center border border-zinc-900 border-dashed rounded-sm">
                          <span className="text-[9px] mono text-zinc-800 uppercase italic tracking-widest">Initializing Link...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'TRAITS' && (
              <div className="flex flex-col h-full overflow-hidden animate-in fade-in duration-500">
                <div className="flex justify-between items-center py-3 border-b border-zinc-800 shrink-0">
                  <div className="w-1/2">
                    <Input
                      placeholder="Search trait database..."
                      value={traitSearch}
                      onChange={(e) => setTraitSearch(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="bg-zinc-900 px-4 py-2 border border-zinc-800 rounded flex flex-col items-end">
                      <span className="text-[8px] text-zinc-500 mono uppercase">Neutral Slots</span>
                      <span className={`text-xl font-black mono leading-none ${selectedNeutralCount >= MAX_NEUTRAL_TRAITS ? 'text-red-500' : 'text-zinc-400'}`}>
                        {selectedNeutralCount}/{MAX_NEUTRAL_TRAITS}
                      </span>
                    </div>
                    <div className="bg-zinc-900 px-4 py-2 border border-zinc-800 rounded flex flex-col items-end">
                      <span className="text-[8px] text-zinc-500 mono uppercase">Budget Remaining</span>
                      <span className={`text-xl font-black mono leading-none ${traitPoints < 0 ? 'text-red-500' : 'text-orange-500'}`}>
                        {traitPoints}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 mt-4 space-y-8 custom-scrollbar">
                  <section className="space-y-3">
                    <h4 className="text-[10px] text-orange-500 mono font-bold uppercase tracking-widest flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-orange-500" />
                      Profiling ({selectedTraits.length})
                    </h4>
                    {selectedTraits.length === 0 ? (
                      <div className="p-8 border border-dashed border-zinc-800 rounded-sm text-center text-zinc-600 text-[10px] mono uppercase">
                        No traits selected.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        {selectedTraits.map(t => <TraitItem key={t.id} trait={t} active />)}
                      </div>
                    )}
                  </section>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <section className="space-y-3">
                      <h4 className="text-[9px] text-blue-400 mono font-bold uppercase tracking-widest border-b border-blue-900/30 pb-1">Positive Assets</h4>
                      <div className="space-y-1">
                        {filteredTraits.positive.map(t => <TraitItem key={t.id} trait={t} />)}
                      </div>
                    </section>
                    <section className="space-y-3">
                      <h4 className="text-[9px] text-red-400 mono font-bold uppercase tracking-widest border-b border-red-900/30 pb-1">Negative Liabilities</h4>
                      <div className="space-y-1">
                        {filteredTraits.negative.map(t => <TraitItem key={t.id} trait={t} />)}
                      </div>
                    </section>
                    <section className="space-y-3">
                      <h4 className="text-[9px] text-zinc-500 mono font-bold uppercase tracking-widest border-b border-zinc-800 pb-1 flex items-center justify-between">
                        <span>Neutral Profiles</span>
                        <span className={`text-[8px] ${selectedNeutralCount >= MAX_NEUTRAL_TRAITS ? 'text-red-500' : 'text-zinc-600'}`}>
                          {selectedNeutralCount}/{MAX_NEUTRAL_TRAITS}
                        </span>
                      </h4>
                      <div className="space-y-1">
                        {filteredTraits.neutral.map(t => <TraitItem key={t.id} trait={t} />)}
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'STATS' && (
              <div className="flex flex-col h-full animate-in fade-in duration-500">
                <div className="flex justify-between items-center py-3 border-b border-zinc-800 shrink-0">
                  <div />
                  <span className="text-sm text-orange-400 mono font-black">UNASSIGNED: {statsPoints}</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto py-4">
                    {(Object.entries(stats) as [keyof Stats, number][]).map(([stat, val]) => (
                      <div key={stat} className="group p-4 bg-zinc-900/40 border border-zinc-800 rounded-sm hover:border-zinc-700 transition-colors">
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-xs uppercase mono text-zinc-200 font-bold tracking-widest">{stat}</span>
                          <div className="flex items-center gap-4">
                            <button onClick={() => adjustStat(stat, -1)} className="w-8 h-8 flex items-center justify-center bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 rounded-sm transition-colors">-</button>
                            <span className="mono text-white font-black text-xl w-6 text-center">{val}</span>
                            <button onClick={() => adjustStat(stat, 1)} className="w-8 h-8 flex items-center justify-center bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 rounded-sm transition-colors">+</button>
                          </div>
                        </div>
                        <ProgressBar value={val} max={10} color="bg-orange-500" />
                      </div>
                    ))}
                  </div>

                  {/* OCCUPATION SECTION */}
                  <div className="max-w-4xl mx-auto mt-6 border-t border-zinc-800 pt-6">
                    <div className="flex justify-between items-center mb-4 gap-4">
                      <h4 className="text-xs text-orange-500 mono font-bold uppercase tracking-widest flex items-center gap-2 shrink-0">
                        <div className="w-1 h-1 rounded-full bg-orange-500" />
                        Occupation
                      </h4>
                      <div className="flex items-center gap-2 flex-1 justify-end">
                        <div className="flex gap-1">
                          {(['ALL', 'SECURITY', 'TECHNICAL', 'CRAFT', 'ADMIN', 'SOCIAL', 'FIELD'] as const).map(cat => (
                            <button
                              key={cat}
                              onClick={() => setOccupationCategory(cat)}
                              className={`px-2 py-1 text-[8px] mono uppercase font-bold tracking-wider border rounded-sm transition-all ${occupationCategory === cat
                                ? 'text-orange-500 border-orange-500/50 bg-orange-500/10'
                                : 'text-zinc-600 border-zinc-800 hover:text-zinc-400 hover:border-zinc-700'
                                }`}
                            >
                              {cat}
                            </button>
                          ))}
                        </div>
                        <div className="w-40">
                          <Input
                            placeholder="Search..."
                            value={occupationSearch}
                            onChange={(e) => setOccupationSearch(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    {selectedOccupation && (
                      <div className="mb-4 p-4 bg-orange-600/10 border border-orange-500 rounded-sm shadow-[inset_0_0_15px_rgba(249,115,22,0.08)] animate-in fade-in duration-300">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-xs mono font-black uppercase text-orange-400 tracking-widest">{selectedOccupation.name}</span>
                            <p className="text-[10px] mono text-zinc-400 mt-1">{selectedOccupation.description}</p>
                          </div>
                          <button
                            onClick={() => setSelectedOccupation(null)}
                            className="text-[9px] mono uppercase text-zinc-600 hover:text-red-500 font-black tracking-widest transition-colors"
                          >
                            remove
                          </button>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 items-center">
                          {selectedOccupation.perks.map((perk, i) => (
                            <span key={i} className="text-[8px] mono uppercase bg-orange-500/10 text-orange-400 px-2 py-1 rounded-sm border border-orange-900/30 tracking-wider">
                              {perk}
                            </span>
                          ))}
                          <button
                            onClick={() => setShowTalentTree(true)}
                            className="ml-auto text-[8px] mono uppercase bg-zinc-900 text-zinc-400 hover:text-orange-400 px-3 py-1 rounded-sm border border-zinc-800 hover:border-orange-500/50 transition-all font-black tracking-widest flex items-center gap-2 group"
                          >
                            <div className="w-1 h-1 bg-zinc-600 group-hover:bg-orange-500 rounded-full" />
                            View Talent Tree
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[240px] overflow-y-auto pr-2 custom-scrollbar">
                      {ALL_OCCUPATIONS
                        .filter(occ => {
                          const search = occupationSearch.toLowerCase();
                          const matchesSearch = occ.name.toLowerCase().includes(search) || occ.description.toLowerCase().includes(search);
                          const matchesCategory = occupationCategory === 'ALL' || occ.category === occupationCategory;
                          return matchesSearch && matchesCategory;
                        })
                        .map(occ => (
                          <Tooltip key={occ.id} content={`${occ.description} — ${occ.perks.join(' • ')}`}>
                            <button
                              onClick={() => setSelectedOccupation(selectedOccupation?.id === occ.id ? null : occ)}
                              className={`w-full p-3 text-left border rounded-sm transition-all group flex items-center justify-between ${selectedOccupation?.id === occ.id
                                ? 'bg-orange-600/20 border-orange-500 shadow-[inset_0_0_10px_rgba(249,115,22,0.1)]'
                                : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'
                                }`}
                            >
                              <span className={`font-bold text-[10px] uppercase mono tracking-wider ${selectedOccupation?.id === occ.id ? 'text-orange-400' : 'text-zinc-300'
                                }`}>
                                {occ.name}
                              </span>
                            </button>
                          </Tooltip>
                        ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between pt-6 border-t border-zinc-800 shrink-0">
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  if (activeTab === 'IDENTITY') {
                    onBack();
                  } else {
                    setActiveTab(activeTab === 'STATS' ? 'TRAITS' : 'IDENTITY');
                  }
                }}
              >
                {activeTab === 'IDENTITY' ? 'Back to Homescreen' : 'Previous Tab'}
              </Button>
            </div>

            <div className="flex gap-4 items-center">
              {activeTab === 'STATS' ? (
                <Button variant="accent" size="lg" onClick={handleSubmit} disabled={statsPoints > 0 || !isIdentityComplete || age < 18}>
                  Deploy to Wasteland
                </Button>
              ) : (
                <Button
                  variant="accent"
                  size="lg"
                  onClick={() => setActiveTab(activeTab === 'IDENTITY' ? 'TRAITS' : 'STATS')}
                  disabled={activeTab === 'IDENTITY' && !isIdentityComplete}
                >
                  Next Configuration
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Talent Tree Modal */}
      {showTalentTree && selectedOccupation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-500 p-4 md:p-8">
          <div className="w-full h-full max-w-5xl bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col shadow-[0_0_100px_rgba(0,0,0,1)] relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 opacity-[0.05] pointer-events-none"
              style={{ backgroundImage: 'radial-gradient(circle, #f97316 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-orange-500/10 blur-[120px] rounded-full pointer-events-none" />

            {/* Top Close Button (Abstract/Professional) */}
            <button
              onClick={() => setShowTalentTree(false)}
              className="absolute top-6 right-6 z-50 px-4 py-2 border border-zinc-800 text-zinc-500 hover:text-white hover:border-zinc-600 transition-all mono uppercase text-[10px] bg-zinc-950/50 backdrop-blur-md flex items-center gap-2 group"
            >
              <span className="group-hover:text-red-500 transition-colors">Close Terminal</span>
              <span className="text-[8px] opacity-30">[ESC]</span>
            </button>

            {/* Header: Large Circular Occupation Identity */}
            <div className="flex flex-col items-center pt-8 pb-4 shrink-0 relative z-20">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full border-4 border-zinc-800 bg-zinc-900 flex items-center justify-center overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)] group-hover:border-orange-500/50 transition-all duration-500">
                  {/* Occupation Placeholder Icon/Visual */}
                  <div className="text-4xl font-black text-zinc-700 select-none">{selectedOccupation.name.charAt(0)}</div>
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 to-transparent opacity-40" />
                </div>
                {/* Visual Ranking Ring */}
                <div className="absolute -inset-2 border border-orange-500/20 rounded-full animate-[spin_10s_linear_infinite]" />
              </div>
              <div className="mt-4 text-center">
                <h2 className="text-xl font-black mono text-zinc-100 uppercase tracking-[0.15em]">{selectedOccupation.name}</h2>
                <div className="text-orange-500 font-bold text-[9px] mono uppercase tracking-[0.3em] mt-1">Specialization Matrix</div>
              </div>
            </div>

            <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-zinc-950/20 py-10">
              <div className="w-full h-full relative overflow-y-auto overflow-x-hidden custom-scrollbar flex items-start justify-center pt-10">
                {/* Scaling Container for Tree */}
                <div className="relative min-w-[600px] min-h-[600px] flex items-center justify-center">
                  {/* Dependency Lines (SVG) */}
                  <svg className="absolute inset-0 pointer-events-none overflow-visible">
                    {MOCK_TALENT_TREES[selectedOccupation.id]?.nodes.map(node =>
                      node.dependencies?.map(depId => {
                        const depNode = MOCK_TALENT_TREES[selectedOccupation.id].nodes.find(n => n.id === depId);
                        if (!depNode) return null;
                        return (
                          <line
                            key={`${node.id}-${depId}`}
                            x1={`calc(50% + ${depNode.pos.x}px)`}
                            y1={`calc(50% + ${depNode.pos.y}px)`}
                            x2={`calc(50% + ${node.pos.x}px)`}
                            y2={`calc(50% + ${node.pos.y}px)`}
                            stroke="#18181b"
                            strokeWidth="3"
                          />
                        );
                      })
                    )}
                    {MOCK_TALENT_TREES[selectedOccupation.id]?.nodes.map(node =>
                      node.dependencies?.map(depId => {
                        const depNode = MOCK_TALENT_TREES[selectedOccupation.id].nodes.find(n => n.id === depId);
                        if (!depNode) return null;
                        return (
                          <line
                            key={`${node.id}-${depId}-inner`}
                            x1={`calc(50% + ${depNode.pos.x}px)`}
                            y1={`calc(50% + ${depNode.pos.y}px)`}
                            x2={`calc(50% + ${node.pos.x}px)`}
                            y2={`calc(50% + ${node.pos.y}px)`}
                            stroke="#27272a"
                            strokeWidth="1"
                            strokeDasharray="4 4"
                          />
                        );
                      })
                    )}
                  </svg>

                  {/* Talent Nodes */}
                  <div className="relative">
                    {MOCK_TALENT_TREES[selectedOccupation.id]?.nodes.map(node => (
                      <Tooltip key={node.id} content={
                        <div className="p-2 min-w-[180px]">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-orange-500 font-bold uppercase text-[10px]">{node.name}</span>
                            <span className="text-[8px] mono text-zinc-600 px-1 border border-zinc-800 rounded">{node.type}</span>
                          </div>
                          <div className="text-zinc-300 text-[9px] leading-snug">{node.description}</div>
                        </div>
                      }>
                        <div
                          className="absolute flex items-center justify-center"
                          style={{ left: node.pos.x, top: node.pos.y }}
                        >
                          <button
                            className={`w-14 h-14 -ml-7 -mt-7 rounded-full border-2 transition-all duration-300 flex items-center justify-center relative z-10 
                              ${node.id.includes('capstone')
                                ? 'border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.3)] bg-zinc-900'
                                : 'border-zinc-800 bg-zinc-900/80 hover:border-zinc-500 hover:bg-zinc-800'} 
                              group`}
                          >
                            <div className={`w-1.5 h-1.5 rotate-45 transform transition-all 
                              ${node.id.includes('capstone') ? 'bg-orange-500 shadow-[0_0_5px_#f97316]' : 'bg-zinc-700 group-hover:bg-zinc-400'}`} />

                            {/* Inner Circle Effect */}
                            <div className="absolute inset-1 rounded-full border border-zinc-800/50 pointer-events-none" />

                            {/* Rank Indicator (Bottom Right) */}
                            <div className="absolute -bottom-1 -right-1 min-w-[18px] h-[14px] bg-zinc-950 border border-zinc-800 px-1 flex items-center justify-center rounded-[2px] shadow-black shadow-sm">
                              <span className="text-[7px] mono font-bold text-zinc-500">0/1</span>
                            </div>

                            {/* Glow on hover */}
                            <div className="absolute inset-0 rounded-full bg-orange-500/10 opacity-0 group-hover:opacity-100 blur-md transition-opacity" />
                          </button>
                        </div>
                      </Tooltip>
                    ))}
                  </div>

                  {!MOCK_TALENT_TREES[selectedOccupation.id] && (
                    <div className="flex flex-col items-center gap-4 text-center">
                      <div className="w-20 h-20 rounded-full border border-dashed border-zinc-800 flex items-center justify-center text-zinc-800">
                        <span className="text-2xl">?</span>
                      </div>
                      <div className="text-zinc-700 mono uppercase text-[9px] tracking-[0.2em] max-w-[200px]">
                        Matrix structure undefined for {selectedOccupation.name} classification
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-zinc-900 bg-zinc-950/80 backdrop-blur-md shrink-0 flex justify-between items-center relative z-30">
              <div className="flex gap-2">
                <div className="flex flex-col">
                  <span className="text-[8px] mono text-zinc-600 uppercase">Available points</span>
                  <span className="text-sm mono font-black text-orange-500">00</span>
                </div>
              </div>
              <div className="text-center flex-1 max-w-sm px-4 text-zinc-700 mono uppercase text-[8px] leading-relaxed">
                NEURAL LINK STABLE // AUTHORIZED OVERRIDE // CLASSIFIED ACCESS ONLY
              </div>
              <div className="flex gap-4">
                <button className="px-4 py-2 bg-zinc-900 border border-zinc-800 text-zinc-600 mono uppercase text-[8px] font-black tracking-widest hover:bg-zinc-800 transition-colors">
                  Reset Matrix
                </button>
                <button className="px-4 py-2 bg-zinc-800 border border-zinc-700 text-zinc-100 opacity-50 cursor-not-allowed mono uppercase text-[8px] font-black tracking-widest">
                  Commit Evolution
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Container>
  );
};
