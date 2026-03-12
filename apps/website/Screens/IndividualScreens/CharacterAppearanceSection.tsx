import React, { useEffect, useRef, useState } from "react";
import { Button } from "../../UI/Primitives";

export const APPEARANCE_SELECTORS = {
  build: [
    "Wiry", "Gaunt", "Athletic", "Stocky", "Large", "Emaciated", "Muscular", "Broad-shouldered",
    "Slight", "Towering", "Compact", "Brawny", "Skeletal", "Barrel-chested", "Hunched", "Lithe",
    "Robust", "Fragile", "V-Taper", "Willowy", "Square-set", "Sinewy", "Obese", "Underfed", "Endomorphic"
  ],
  skinTone: [
    "Ash-stained", "Pale", "Tanned", "Leathery", "Mottled", "Ebony", "Olive", "Sun-bleached",
    "Ruddy", "Pallid", "Sallow", "Greyish-blue", "Bronzed", "Porcelain", "Nut-brown", "Ashen",
    "Jaundiced", "Deep Copper", "Coal-dust Grey", "Translucent"
  ],
  skinDetails: [
    "Clean", "Radiation Welts", "Chemical Burns", "Lacerated", "Dust-caked", "Pockmarked",
    "Freckled", "Leathery", "Vitiligo", "Fresh Stitches", "Surgical Scars", "Radiation Glow (Faint)",
    "Sun-damaged", "Deep Wrinkles", "Oil-stained", "Calloused", "Mottled Discoloration", "Glass Shards Embedded",
    "Treated Keloids", "Peeling Burn"
  ],
  height: [
    "Extremely Short", "Diminutive", "Short", "Average", "Tall", "Imposing", "Giant",
    "Lanky", "Stunted", "Compact", "Towering", "Medium-build"
  ],
  posture: [
    "Wary", "Erect", "Slouching", "Limping", "Rigid", "Prowling", "Stooped", "Languid",
    "Predatory", "Defeated", "Unstable", "Graceful", "Asymmetrical", "Shuffling", "Alert"
  ],
  faceShape: [
    "Sharp", "Craggy", "Round", "Square", "Gaunt", "Symmetrical", "Oval", "Heart-shaped",
    "Long", "Chiseled", "Diamond", "Battered", "Flat", "High Cheekbones", "Receding Chin"
  ],
  eyes: [
    "Sunken", "Piercing Blue", "Amber", "Icy Grey", "Bloodshot", "Cataract-white", "Emerald",
    "Deep Brown", "One-eyed", "Clouded", "Glassy", "Cybernetic (Red)", "Cybernetic (Green)",
    "Hazel", "Violet", "Mismatched", "Milky", "Nervous", "Hollow", "Staring"
  ],
  hairStyle: [
    "Buzzcut", "Matted & Long", "Shaved", "Wild Mane", "Top-knot", "Braided", "Receding",
    "Bald", "Mohawk", "Matted Dreads", "Clean-cut", "Greasy Mullet", "Pompadour (Faded)",
    "Shaved Sides", "Wispy Strands", "Tangled Mess", "Asymmetrical Cut", "Short & Neat"
  ],
  hairColor: [
    "Black", "Ash-grey", "Pure White", "Sandy", "Salt & Pepper", "Bleached Blonde",
    "Rusty Red", "Deep Brown", "Iron Grey", "Silver", "Charcoal", "Dirty Blonde", "Sunset Orange"
  ],
  facialHair: [
    "Clean-shaven", "5-o-clock Shadow", "Goatee", "Bushy Beard", "Unkempt Scruff",
    "Braided Beard", "None", "Handlebar Mustache", "Sideburns", "Van Dyke", "Mutton Chops",
    "Thin Stubble", "Scruffy Patchy", "Wild Growth"
  ],
  gearWear: [
    "Rust-flecked", "Grimy", "Ripped", "Blood-stained", "Dusty", "Pristine (Rare)",
    "Patched-up", "Oil-slicked", "Acid-pitted", "Sun-faded", "Sand-blasted", "Smell of Smoke"
  ],
  accessory: [
    "Gas Mask", "Military Goggles", "Hooded Cowl", "Cracked Respirator", "Leather Eye Patch",
    "Frayed Shemagh", "None", "Electronic Visor", "Necklace of Teeth", "Bone Earring",
    "Torn Bandana", "Dog Tags", "Utility Belt", "Mechanical Arm-brace", "Woven Charm", "Welder Mask"
  ],
  markings: [
    "Burn Scars", "Acid Marks", "Faded Tattoos", "Lacerations", "Tribal Branding", "None",
    "Mechanical Port", "Surgical Scars", "Slave Branded", "War Paint", "Symbol of the Static Sun",
    "Hexagonal Tattoos", "Chemical Stain", "Barbed Wire Scar"
  ]
} as const;

export type AppearanceSelectorKey = keyof typeof APPEARANCE_SELECTORS;
export type AppearanceSelectors = Record<AppearanceSelectorKey, string>;

export const DEFAULT_APPEARANCE_SELECTORS: AppearanceSelectors = {
  build: "Wiry",
  skinTone: "Ash-stained",
  skinDetails: "Clean",
  height: "Average",
  posture: "Wary",
  faceShape: "Sharp",
  eyes: "Sunken",
  hairStyle: "Buzzcut",
  hairColor: "Black",
  facialHair: "5-o-clock Shadow",
  gearWear: "Grimy",
  accessory: "None",
  markings: "None"
};

const CustomDropdown: React.FC<{
  value: string;
  options: readonly string[];
  onChange: (val: string) => void;
  align?: "left" | "right";
}> = ({ value, options, onChange, align = "right" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex w-full items-center gap-2 py-1.5 text-sm font-black text-white transition-colors hover:text-orange-500 group ${align === "right" ? "justify-end" : "justify-start"}`}
      >
        <span className="truncate">{value}</span>
        <span className={`text-[8px] text-zinc-600 transition-transform duration-200 group-hover:text-orange-500 ${isOpen ? "rotate-180" : ""}`}>▼</span>
      </button>

      {isOpen && (
        <div className={`absolute top-full z-[100] mt-1 max-h-64 min-w-[160px] overflow-y-auto rounded-sm border border-zinc-800 bg-zinc-900 shadow-[0_0_30px_rgba(0,0,0,0.8)] custom-scrollbar animate-in fade-in zoom-in-95 duration-200 ${align === "right" ? "right-0" : "left-0"}`}>
          <div className="py-1">
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between border-b border-zinc-800/20 px-4 py-2.5 text-[11px] uppercase transition-all duration-150 last:border-0 ${opt === value ? "bg-orange-600/10 font-black text-orange-500" : "text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200"}`}
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

interface CharacterAppearanceSectionProps {
  appearanceSelectors: AppearanceSelectors;
  onAppearanceSelectorChange: (key: AppearanceSelectorKey, value: string) => void;
  appearancePrompt: string;
  onAppearancePromptChange: (value: string) => void;
  portraitUrl: string | null;
  isGeneratingPortrait: boolean;
  isSyncing: boolean;
  isProfileModified: boolean;
  onManifestIdentity: () => void;
  onRefreshPortrait: () => void;
  onOpenGallery?: () => void;
}

export const CharacterAppearanceSection: React.FC<CharacterAppearanceSectionProps> = ({
  appearanceSelectors,
  onAppearanceSelectorChange,
  appearancePrompt,
  onAppearancePromptChange,
  portraitUrl,
  isGeneratingPortrait,
  isSyncing,
  isProfileModified,
  onManifestIdentity,
  onRefreshPortrait,
  onOpenGallery,
}) => {
  const biometricRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (biometricRef.current) {
      biometricRef.current.style.height = "auto";
      const nextHeight = Math.min(biometricRef.current.scrollHeight, 180);
      biometricRef.current.style.height = `${nextHeight}px`;
      biometricRef.current.style.overflowY = biometricRef.current.scrollHeight > 180 ? "auto" : "hidden";
    }
  }, [appearancePrompt]);

  return (
    <div className="flex h-full min-h-[820px] flex-row overflow-hidden animate-in fade-in duration-500">
      <div className="flex w-[520px] min-h-0 flex-col pr-10">
        <div className="min-h-0 flex-1 overflow-y-auto pr-2 custom-scrollbar">
          <div className="space-y-4">
            <div className="divide-y divide-zinc-800/30 rounded-sm border border-zinc-800/50 bg-zinc-900/30">
              <div className="space-y-4 p-5">
                <label className="block text-[11px] font-black uppercase tracking-[0.28em] text-zinc-500">02 // Appearance</label>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                  {Object.entries(APPEARANCE_SELECTORS).map(([key, options]) => (
                    <div key={key} className="group flex min-h-[64px] flex-col justify-center gap-1.5 py-1">
                      <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-zinc-600 group-hover:text-zinc-400">{key.replace(/([A-Z])/g, " $1")}</span>
                      <CustomDropdown
                        value={appearanceSelectors[key as AppearanceSelectorKey]}
                        options={options}
                        onChange={(value) => onAppearanceSelectorChange(key as AppearanceSelectorKey, value)}
                        align="left"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 pt-7">
          <Button
            variant="accent"
            onClick={onManifestIdentity}
            className="group relative w-full overflow-hidden border-l-4 border-orange-500 py-5 text-sm font-black tracking-[0.42em] shadow-[0_0_30px_rgba(234,88,12,0.15)] hover:shadow-[0_0_40px_rgba(234,88,12,0.25)]"
            isLoading={isSyncing || isGeneratingPortrait}
          >
            <div className="absolute inset-x-0 bottom-0 h-[1px] bg-white/20" />
            {isGeneratingPortrait || isSyncing ? "Generating..." : "generate your character"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden pl-10">
        <div className="group relative flex h-[560px] min-h-[560px] shrink-0 flex-col overflow-hidden rounded-sm border border-zinc-800 bg-zinc-950/50">
          <div className="absolute left-0 right-0 top-0 z-10 flex justify-between border-b border-zinc-800 bg-zinc-900/80 px-4 py-1.5 text-[9px] uppercase text-zinc-500 transition-colors group-hover:bg-zinc-900">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" />
              <span>Visualization</span>
            </div>
            <div className="flex items-center gap-3">
              {onOpenGallery && (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenGallery();
                  }}
                  className="flex items-center text-[9px] font-black uppercase tracking-widest text-zinc-400 transition-all hover:text-zinc-200"
                >
                  gallery
                </button>
              )}
              {portraitUrl && (
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    onRefreshPortrait();
                  }}
                  disabled={isGeneratingPortrait}
                  className={`flex items-center text-[9px] font-black uppercase tracking-widest text-orange-500 transition-all hover:text-orange-400 disabled:opacity-50 ${isProfileModified ? "animate-pulse text-orange-300 drop-shadow-[0_0_5px_rgba(249,115,22,0.5)]" : ""}`}
                >
                  regenerate
                </button>
              )}
              <span className={portraitUrl ? "text-green-500" : "text-zinc-700"}>
                {portraitUrl ? "Generated" : "No Signal"}
              </span>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] p-8">
            {portraitUrl ? (
              <div className="group relative h-full w-full overflow-hidden rounded-sm border border-zinc-800/50 bg-black/40 p-2 shadow-[0_0_50px_rgba(0,0,0,0.6)]">
                <img src={portraitUrl} alt="Portrait" className="h-full w-full animate-in object-contain duration-1000 fade-in zoom-in" />
                <div className="absolute inset-x-0 bottom-0 translate-y-2 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                  <span className="text-[9px] font-black uppercase tracking-widest text-orange-400">IDENTITY CONFIRMED</span>
                </div>
              </div>
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center rounded-sm border border-dashed border-zinc-800/40 bg-black/30 text-center">
                <div className="relative mx-auto flex h-24 w-24 animate-[pulse_4s_infinite] items-center justify-center rounded-full border-2 border-dashed border-zinc-900 opacity-20">
                  <span className="text-3xl text-zinc-800">?</span>
                </div>
                <p className="text-[9px] uppercase tracking-widest text-zinc-700 animate-pulse">Waiting for generation...</p>
              </div>
            )}
          </div>

          {(isSyncing || isGeneratingPortrait) && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/85 backdrop-blur-sm">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-orange-500 border-t-transparent shadow-[0_0_15px_rgba(234,88,12,0.4)]" />
              <span className="text-xs font-black uppercase tracking-[0.2em] text-orange-500 animate-pulse">Synthesizing User Data...</span>
            </div>
          )}
        </div>

        <div className="group relative flex min-h-[280px] flex-1 flex-col overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900/30 p-6">
          <div className="pointer-events-none absolute right-0 top-0 -mr-16 -mt-16 h-32 w-32 bg-orange-600/5 blur-[80px] transition-all group-hover:bg-orange-600/10" />
          <label className="mb-3 flex items-center justify-between border-b border-orange-900/40 pb-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-orange-500/80">
            <div className="flex items-center gap-2">
              <span className="h-2 w-1 bg-orange-500" />
              <span>Profile</span>
            </div>
            {!appearancePrompt ? (
              <span className="text-[9px] uppercase text-zinc-800">Awaiting Link</span>
            ) : (
              <div className="flex flex-col items-end gap-1">
                <span className="text-[8px] uppercase tracking-widest text-zinc-600 opacity-50 transition-opacity group-hover:opacity-100">editable profile</span>
                {isProfileModified && (
                  <span className="rounded-sm bg-orange-500/10 px-1 text-[8px] font-black uppercase tracking-wider text-orange-500 animate-pulse">
                    [ please press regenerate ]
                  </span>
                )}
              </div>
            )}
          </label>
          <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto pr-2">
            {appearancePrompt ? (
              <textarea
                ref={biometricRef}
                value={appearancePrompt}
                onChange={(event) => onAppearancePromptChange(event.target.value)}
                onInput={(event) => {
                  const target = event.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  const nextHeight = Math.min(target.scrollHeight, 180);
                  target.style.height = `${nextHeight}px`;
                  target.style.overflowY = target.scrollHeight > 180 ? "auto" : "hidden";
                }}
                className="custom-scrollbar w-full resize-none overflow-y-hidden bg-transparent text-xs italic leading-relaxed text-zinc-400 outline-none transition-colors duration-700 animate-in slide-in-from-bottom-2 fade-in focus:text-white"
                placeholder="Refine biometric data..."
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-sm border border-dashed border-zinc-900">
                <span className="text-[9px] italic uppercase tracking-widest text-zinc-800">Initializing Link...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
