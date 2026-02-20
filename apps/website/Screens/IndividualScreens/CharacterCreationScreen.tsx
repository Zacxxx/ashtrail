
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Button, Card, ProgressBar, Stack, Badge, Container, Input, Select, Tooltip } from '../../UI/Primitives';
import {
  Player,
  Stats,
  Trait,
  ALL_TRAITS,
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

  const handleGenerateProfileText = async () => {
    setIsSyncing(true);
    const narrative = await enhanceAppearancePrompt({
      ...appearanceSelectors,
      age: age.toString(),
      gender: gender
    });
    setAppearancePrompt(narrative || '');
    setIsSyncing(false);
  };

  const handleGeneratePortrait = async () => {
    if (!appearancePrompt) {
      await handleGenerateProfileText();
    }
    setIsGeneratingPortrait(true);
    const contextPrompt = `${gender}, aged ${age}. ${appearancePrompt}`;
    const url = await generateCharacterPortrait(contextPrompt);
    if (url) setPortraitUrl(url);
    setIsGeneratingPortrait(false);
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

  const toggleTrait = (trait: Trait) => {
    const isSelected = selectedTraits.find(t => t.id === trait.id);
    if (isSelected) {
      setSelectedTraits(prev => prev.filter(t => t.id !== trait.id));
      setTraitPoints(prev => prev + trait.cost);
    } else {
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
                {tab}
              </button>
            ))}
          </div>
        }
      >
        <div className="flex flex-col h-full overflow-hidden">

          <div className="flex-1 overflow-hidden">
            {activeTab === 'IDENTITY' && (
              <div className="flex h-full animate-in fade-in duration-500">
                <div className="w-2/5 flex flex-col border-r border-zinc-800 pr-6 overflow-hidden">
                  <div className="flex gap-4 shrink-0 mb-6 bg-zinc-900/40 p-3 border border-zinc-800/50 rounded-sm">
                    <div className="flex flex-col items-center gap-2 shrink-0">
                      <div className="relative group w-24 h-24">
                        {portraitUrl ? (
                          <img src={portraitUrl} alt="Portrait" className="w-full h-full border border-orange-500/50 grayscale rounded-sm shadow-xl object-cover" />
                        ) : (
                          <div className="w-full h-full bg-zinc-950 border border-dashed border-zinc-800 rounded-sm flex items-center justify-center opacity-40">
                            <span className="text-[8px] mono uppercase text-zinc-600">No Image</span>
                          </div>
                        )}
                      </div>
                      <Button
                        onClick={handleGeneratePortrait}
                        disabled={isGeneratingPortrait || !name || age < 18}
                        variant="accent"
                        size="sm"
                        className="w-24 h-6 text-[8px] font-black mono uppercase py-0"
                        isLoading={isGeneratingPortrait}
                      >
                        {isGeneratingPortrait ? '...' : 'GEN PORTRAIT'}
                      </Button>
                    </div>

                    <div className="flex-1 flex flex-col justify-start gap-4">
                      <div className="space-y-1">
                        <label className="text-[8px] mono text-zinc-600 uppercase">Wastelander Designation</label>
                        <textarea
                          value={name}
                          onChange={(e) => setName(e.target.value.replace(/\n/g, ''))}
                          placeholder="NAME"
                          rows={1}
                          className="bg-transparent text-2xl font-black italic mono text-white uppercase outline-none placeholder:text-zinc-800 w-full tracking-wider pr-4 resize-none overflow-hidden leading-[1.1]"
                          onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = 'auto';
                            target.style.height = target.scrollHeight + 'px';
                          }}
                        />
                        <div className="h-px bg-zinc-800 w-full opacity-50" />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col">
                          <label className="text-[8px] mono text-zinc-600 uppercase">Age</label>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => handleAgeChange(age - 1)}
                              className="w-5 h-6 flex items-center justify-center bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 rounded-sm text-[10px] mono transition-colors"
                            >
                              -
                            </button>
                            <span className="text-xs mono font-black text-white w-6 text-center">{age}</span>
                            <button
                              onClick={() => handleAgeChange(age + 1)}
                              className="w-5 h-6 flex items-center justify-center bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 rounded-sm text-[10px] mono transition-colors"
                            >
                              +
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <label className="text-[8px] mono text-zinc-600 uppercase">Gender</label>
                          <div className="mt-2 h-6">
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
                  </div>

                  <div className="flex-1 flex flex-col overflow-hidden">
                    <label className="text-[11px] uppercase text-zinc-500 mono font-bold mb-4 tracking-[0.2em] flex justify-between items-center border-b border-zinc-800 pb-2">
                      <span>Appearance Profile</span>
                      <Button variant="ghost" size="sm" onClick={handleGenerateProfileText} isLoading={isSyncing} className="h-6 px-3 text-[10px] text-orange-500 hover:text-orange-400">
                        {isSyncing ? 'Generating...' : 'Synthesize Profile'}
                      </Button>
                    </label>
                    <div className="flex-1 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                      {Object.entries(APPEARANCE_SELECTORS).map(([key, options]) => (
                        <div key={key} className="flex items-center justify-between gap-2 py-1 px-2 hover:bg-zinc-900/30 transition-colors group">
                          <span className="text-[11px] mono uppercase text-zinc-500 group-hover:text-zinc-400 shrink-0">{key.replace(/([A-Z])/g, ' $1')}</span>
                          <CustomDropdown
                            value={appearanceSelectors[key]}
                            options={options}
                            onChange={(val) => setAppearanceSelectors(prev => ({ ...prev, [key]: val }))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex-1 pl-6 flex flex-col overflow-hidden">
                  <div className="flex-1 flex flex-col overflow-hidden mb-6">
                    <label className="text-[11px] uppercase text-zinc-500 mono font-bold mb-4 tracking-[0.2em] border-b border-zinc-800 pb-2">Backstory Dossier</label>
                    <textarea
                      value={history}
                      onChange={(e) => setHistory(e.target.value)}
                      placeholder="Document your origin. Every entry influences your starting disposition..."
                      className="flex-1 bg-zinc-950/20 border border-zinc-900 p-4 text-zinc-300 mono text-sm focus:border-orange-900/50 outline-none rounded-sm resize-none custom-scrollbar leading-relaxed"
                    />
                  </div>

                  <div className="flex-1 flex flex-col overflow-hidden relative">
                    <label className="text-[11px] uppercase text-zinc-600 mono font-bold mb-4 tracking-[0.2em] border-b border-zinc-800 pb-2 flex justify-between">
                      <span>Physical Manifestation</span>
                      {!appearancePrompt && <span className="text-red-900 animate-pulse text-[10px] uppercase">Analysis Required</span>}
                    </label>
                    <textarea
                      value={appearancePrompt}
                      onChange={(e) => setAppearancePrompt(e.target.value)}
                      placeholder="Click 'Synthesize' to manifest physical data..."
                      className="flex-1 bg-zinc-900/20 p-4 rounded-sm border border-zinc-900 overflow-y-auto custom-scrollbar italic text-zinc-400 text-xs leading-relaxed resize-none outline-none focus:border-orange-900/40"
                    />
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
                  <div className="bg-zinc-900 px-4 py-2 border border-zinc-800 rounded flex flex-col items-end">
                    <span className="text-[8px] text-zinc-500 mono uppercase">Budget Remaining</span>
                    <span className={`text-xl font-black mono leading-none ${traitPoints < 0 ? 'text-red-500' : 'text-orange-500'}`}>
                      {traitPoints}
                    </span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 mt-4 space-y-8 custom-scrollbar">
                  <section className="space-y-3">
                    <h4 className="text-[10px] text-orange-500 mono font-bold uppercase tracking-widest flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-orange-500" />
                      Neural Profiling ({selectedTraits.length})
                    </h4>
                    {selectedTraits.length === 0 ? (
                      <div className="p-8 border border-dashed border-zinc-800 rounded-sm text-center text-zinc-600 text-[10px] mono uppercase">
                        No neural traits selected.
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
                      <h4 className="text-[9px] text-zinc-500 mono font-bold uppercase tracking-widest border-b border-zinc-800 pb-1">Neutral Profiles</h4>
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
    </Container>
  );
};
