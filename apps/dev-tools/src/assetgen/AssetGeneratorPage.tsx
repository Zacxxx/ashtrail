import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Slider, Card, CardHeader, CardContent, Modal } from "@ashtrail/ui";
import { GameRegistry, type Character, type DirectionalSpriteBinding } from "@ashtrail/core";
import { useActiveWorld } from "../hooks/useActiveWorld";
import { useEcologyData } from "../ecology/useEcologyData";
import { buildCharacterBuilderRoute, buildEcologyRoute } from "../lib/routes";
import { useJobs } from "../jobs/useJobs";
import { useTrackedJobLauncher } from "../jobs/useTrackedJobLauncher";
import {
    isGeneratedMediaAudioResult,
    type GeneratedMediaAudioResult,
    type GeneratedMediaStatus,
} from "../media/generatedMediaAudio";
import { SyncedNarratedVideoPlayer } from "../media/SyncedNarratedVideoPlayer";
import {
    isGeneratedMediaVideoResult,
    type GeneratedMediaVideoResult,
} from "../media/generatedMediaVideo";

// Presets removed; reference image serves as style
const API_BASE = "http://127.0.0.1:8787";

interface BatchIcon {
    filename: string;
    prompt: string;
    stylePrompt?: string;
    itemPrompt?: string;
    url: string;
}

interface BatchManifest {
    batchId: string;
    batchName: string;
    createdAt: string;
    icons: BatchIcon[];
}

interface BatchTexture {
    filename: string;
    prompt: string;
    stylePrompt?: string;
    itemPrompt?: string;
    url: string;
    // Game Asset Metadata
    metadata?: {
        isNatural?: boolean;
        isPassable?: boolean;
        isHidden?: boolean;
        moveEfficiency?: number;
        fertility?: number;
    };
}

interface TextureBatchManifest {
    batchId: string;
    batchName: string;
    createdAt: string;
    category: string;
    subCategory?: string;
    textures: BatchTexture[];
    // Optional global metadata for the batch
    gameAsset?: {
        type: "building" | "terrain" | "vegetation";
        ecologyLink?: {
            kind: "flora" | "fauna" | "biome" | "character";
            id: string;
        };
        grouping?: {
            type: "biome" | "structure" | "exploration-kit" | "block-palette";
            name: string;
            description?: string;
        };
    };
}

interface TextureBatchSummary {
    batchId: string;
    batchName: string;
    textureCount: number;
    createdAt: string;
    category: string;
    subCategory?: string;
    gameAsset?: TextureBatchManifest["gameAsset"];
    thumbnailUrl: string | null;
}

interface DirectionalSpriteFrame {
    direction: "north" | "south" | "east" | "west";
    url: string;
}

interface SpriteLinkTarget {
    kind: "character" | "fauna";
    id: string;
}

interface GeneratedSpriteSet {
    spriteId: string;
    prompt: string;
    stylePrompt: string;
    itemPrompt: string;
    actorType: "animal" | "monster" | "human" | "mutant" | "construct";
    mode: "directional-set" | "illustration";
    previewUrl: string;
    directions: DirectionalSpriteFrame[];
    illustrationUrl?: string | null;
    target?: SpriteLinkTarget | null;
}

interface SpriteBatchManifest {
    batchId: string;
    batchName: string;
    createdAt: string;
    spriteType: GeneratedSpriteSet["actorType"];
    mode: GeneratedSpriteSet["mode"];
    includesIllustration?: boolean;
    target?: SpriteLinkTarget | null;
    worldId?: string | null;
    sourceEntityType?: string | null;
    sourceEntityId?: string | null;
    biomeIds: string[];
    sprites: GeneratedSpriteSet[];
}

interface SpriteBatchSummary {
    batchId: string;
    batchName: string;
    createdAt: string;
    spriteType: GeneratedSpriteSet["actorType"];
    mode: GeneratedSpriteSet["mode"];
    includesIllustration?: boolean;
    spriteCount: number;
    target?: SpriteLinkTarget | null;
    thumbnailUrl: string | null;
}

interface GeneratedSongClip {
    clipId: string;
    filename: string;
    title: string;
    prompt: string;
    normalizedPrompt: string;
    negativePrompt: string;
    url: string;
    mimeType: string;
    durationSeconds: number;
    sampleRateHz: number;
    variantIndex: number;
    category: string;
}

interface SongBatchManifest {
    batchId: string;
    batchName: string;
    createdAt: string;
    category: string;
    genre: string;
    moods: string[];
    instrumentation: string[];
    tempo: string;
    rhythmicFeel: string;
    soundscape: string;
    productionStyle: string;
    negativePrompt: string;
    globalDirection: string;
    clips: GeneratedSongClip[];
}

interface SongBatchSummary {
    batchId: string;
    batchName: string;
    createdAt: string;
    category: string;
    clipCount: number;
    thumbnailUrl: string | null;
}

interface BatchSummary {
    batchId: string;
    batchName: string;
    iconCount: number;
    createdAt: string;
    thumbnailUrl: string | null;
}

interface AssetPackGrouping {
    type: "biome" | "structure" | "exploration-kit" | "block-palette";
    name: string;
    description?: string;
}

interface PackTexturePointer {
    batchId: string;
    filename: string;
    url: string;
    metadata?: any;
}

interface PackSpritePointer {
    batchId: string;
    spriteId: string;
    url: string;
}

interface AssetPackManifest {
    packId: string;
    name: string;
    description?: string;
    createdAt: string;
    grouping?: AssetPackGrouping;
    textures: PackTexturePointer[];
    sprites: PackSpritePointer[];
}

type AssetGeneratorTab = "icons" | "battlemaps" | "world-assets" | "game-assets" | "ecology-illustrations" | "sprites" | "songs" | "videos" | "packs";

const SONG_GENRE_OPTIONS = [
    "cinematic",
    "dark ambient",
    "post-apocalyptic",
    "orchestral",
    "electronic",
    "industrial",
    "folk",
    "tribal",
    "hybrid score",
] as const;

const SONG_MOOD_OPTIONS = [
    "tense",
    "melancholic",
    "mysterious",
    "hopeful",
    "uneasy",
    "heroic",
    "haunting",
    "warm",
    "aggressive",
] as const;

const SONG_INSTRUMENT_OPTIONS = [
    "synth drones",
    "strings",
    "piano",
    "processed guitar",
    "tribal percussion",
    "industrial hits",
    "choir pads",
    "bass pulses",
    "field recordings",
] as const;

function mediaStatusTone(status: GeneratedMediaStatus): string {
    switch (status) {
        case "success":
            return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
        case "partial_success":
            return "border-amber-500/30 bg-amber-500/10 text-amber-100";
        default:
            return "border-red-500/30 bg-red-500/10 text-red-100";
    }
}

function buildPendingMediaResult(title: string, stage: string, status: "queued" | "running" | "completed" | "failed" | "cancelled"): GeneratedMediaAudioResult {
    return {
        artifact: {
            type: "generated_media_audio",
            status: status === "failed" ? "error" : "partial_success",
            audio: null,
            image: null,
            metadata: {
                title,
                description: stage,
                intent: "scene support",
                tags: [status === "failed" ? "error" : "pending"],
            },
            warnings: status === "failed" ? ["The media job failed before returning a complete artifact."] : ["The media job is still packaging the unified artifact."],
        },
        transcript: {
            model: "pending",
            logicalToolName: "generatemedia.audio",
            apiToolName: "generatemedia.audio",
            toolCalled: status !== "queued",
            thoughtSignatureDetected: false,
            finalResponseText: stage,
        },
    };
}

function buildPendingMediaVideoResult(title: string, stage: string, status: "queued" | "running" | "completed" | "failed" | "cancelled"): GeneratedMediaVideoResult {
    return {
        artifact: {
            type: "generated_media_video",
            status: status === "failed" ? "error" : "partial_success",
            video: null,
            poster: null,
            narration: null,
            metadata: {
                title,
                description: stage,
                intent: "scene support",
                tags: [status === "failed" ? "error" : "pending"],
            },
            warnings: status === "failed" ? ["The media video job failed before returning a complete artifact."] : ["The media video job is still packaging the unified artifact."],
        },
        transcript: {
            model: "pending",
            logicalToolName: "generatemedia.video",
            apiToolName: "generatemedia.video",
            toolCalled: status !== "queued",
            thoughtSignatureDetected: false,
            finalResponseText: stage,
        },
    };
}

const IconCard = React.memo(function IconCard({
    icon,
    lastRefreshedAt,
    setHoveredIcon,
    downloadIcon,
    setAssigningIcon,
    startEditingIcon
}: {
    icon: BatchIcon;
    lastRefreshedAt: number;
    setHoveredIcon: (icon: BatchIcon | null) => void;
    downloadIcon: (url: string) => void;
    setAssigningIcon: (icon: BatchIcon | null) => void;
    startEditingIcon: (icon: BatchIcon) => void;
}) {
    return (
        <div
            className="group relative flex flex-col items-center justify-start bg-[#0f1520] border border-white/5 rounded-lg p-2 hover:border-[#E6E6FA]/20 transition-all h-full"
            onMouseEnter={() => setHoveredIcon(icon)}
            onMouseLeave={() => setHoveredIcon(null)}
        >
            {/* Download */}
            <button
                onClick={() => downloadIcon(icon.url)}
                className="opacity-0 group-hover:opacity-100 absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-md bg-white/10 backdrop-blur-md text-white border border-white/10 hover:bg-[#E6E6FA] hover:text-[#070b12] transition-all z-20"
                title="Download Icon"
            >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
            </button>

            {/* Icon image */}
            <div className="relative mb-2 flex-shrink-0 group/img shadow-xl shadow-black/40 rounded-md overflow-hidden">
                <img
                    src={`${icon.url}?t=${lastRefreshedAt}`}
                    alt={icon.prompt}
                    className="w-14 h-14 relative z-10"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover/img:opacity-100 transition-opacity" />
            </div>

            {/* Prompt label */}
            <div className="flex-1 flex flex-col items-center w-full">
                <p className="text-[9px] text-gray-400 text-center leading-tight line-clamp-2 w-full font-mono mb-2 px-0.5 min-h-[2.2em]">
                    {icon.itemPrompt || icon.prompt}
                </p>
                <div className="flex gap-1.5 w-full mt-auto">
                    <button
                        onClick={() => setAssigningIcon(icon)}
                        className="flex-1 group/btn relative py-1.5 rounded-md bg-white/[0.03] border border-white/10 transition-all hover:bg-emerald-500/10 hover:border-emerald-500/30 overflow-hidden"
                        title="Assign..."
                    >
                        <div className="flex items-center justify-center gap-1 text-[8px] text-[#E6E6FA]/80 group-hover/btn:text-emerald-400 font-black uppercase tracking-widest relative z-10 transition-colors">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            SET
                        </div>
                    </button>
                    <button
                        onClick={() => startEditingIcon(icon)}
                        className="flex-1 group/btn relative py-1.5 rounded-md bg-white/[0.03] border border-white/10 transition-all hover:bg-[#E6E6FA]/10 hover:border-[#E6E6FA]/30 overflow-hidden"
                        title="Reroll"
                    >
                        <div className="flex items-center justify-center gap-1 text-[8px] text-[#E6E6FA]/80 font-black uppercase tracking-widest relative z-10">
                            <svg className="w-3 h-3 group-hover/btn:rotate-180 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            REROLL
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
});

const CHARACTER_SPRITE_TYPE_MAP: Record<string, GeneratedSpriteSet["actorType"] | null> = {
    Human: "human",
    Monster: "monster",
    Mutant: "mutant",
    Construct: "construct",
    Animal: null,
};

function getCharacterSpriteType(character: Character | null | undefined): GeneratedSpriteSet["actorType"] | null {
    if (!character) return null;
    return CHARACTER_SPRITE_TYPE_MAP[character.type] ?? null;
}

function buildDirectionalBinding(batchId: string, sprite: GeneratedSpriteSet): DirectionalSpriteBinding {
    const directions = sprite.directions.reduce(
        (acc, frame) => {
            acc[frame.direction] = frame.url;
            return acc;
        },
        {
            north: sprite.previewUrl,
            south: sprite.previewUrl,
            east: sprite.previewUrl,
            west: sprite.previewUrl,
        } as DirectionalSpriteBinding["directions"],
    );

    return {
        batchId,
        spriteId: sprite.spriteId,
        actorType: sprite.actorType,
        previewUrl: sprite.previewUrl,
        directions,
    };
}

const TextureCard = React.memo(function TextureCard({
    texture,
    lastRefreshedAt,
    setHoveredTexture,
    downloadTexture,
    startEditingTexture,
    updateMetadata,
    isSelected,
    onToggleSelect
}: {
    texture: BatchTexture;
    lastRefreshedAt: number;
    setHoveredTexture: (texture: BatchTexture | null) => void;
    downloadTexture: (url: string) => void;
    startEditingTexture: (texture: BatchTexture) => void;
    updateMetadata?: (filename: string, metadata: any) => void;
    isSelected?: boolean;
    onToggleSelect?: (filename: string) => void;
}) {
    const isBuilding = texture.metadata?.hasOwnProperty("isPassable");
    const isTerrain = texture.metadata?.hasOwnProperty("moveEfficiency");

    return (
        <div
            className={`group relative flex flex-col bg-[#0f1520] border rounded-lg p-2 transition-all ${isSelected
                ? "border-[#E6E6FA] ring-1 ring-[#E6E6FA]/30 bg-[#E6E6FA]/5"
                : "border-white/5 hover:border-[#E6E6FA]/20"
                }`}
            onMouseEnter={() => setHoveredTexture(texture)}
            onMouseLeave={() => setHoveredTexture(null)}
        >
            {/* Selection Checkbox */}
            <div
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelect?.(texture.filename);
                }}
                className={`absolute top-1.5 left-1.5 w-6 h-6 flex items-center justify-center rounded-md cursor-pointer z-30 transition-all border ${isSelected
                    ? "bg-[#E6E6FA] border-[#E6E6FA] text-[#070b12]"
                    : "bg-black/40 border-white/10 text-transparent hover:border-white/30 group-hover:text-white/20"
                    }`}
            >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
            </div>
            {/* Download */}
            <button
                onClick={() => downloadTexture(texture.url)}
                className="opacity-0 group-hover:opacity-100 absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center rounded-md bg-white/10 backdrop-blur-md text-white border border-white/10 hover:bg-[#E6E6FA] hover:text-[#070b12] transition-all z-20"
                title="Download Texture"
            >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
            </button>

            {/* Texture image */}
            <div className="relative mb-2 aspect-square shadow-xl shadow-black/40 rounded-md overflow-hidden bg-black/20 text-center flex items-center justify-center">
                <img
                    src={`${texture.url}?t=${lastRefreshedAt}`}
                    alt={texture.prompt}
                    className="max-w-full max-h-full object-contain relative z-10"
                />
            </div>

            {/* Label & Actions */}
            <div className="flex flex-col gap-1.5">
                <p className="text-[9px] text-gray-400 leading-tight line-clamp-1 font-mono px-0.5">
                    {texture.itemPrompt || texture.prompt}
                </p>

                {/* Metadata Badges */}
                {texture.metadata && (
                    <div className="flex flex-wrap gap-1 mb-0.5">
                        <button
                            onClick={() => updateMetadata?.(texture.filename, { ...texture.metadata, isHidden: !texture.metadata?.isHidden })}
                            className={`px-1 py-0.5 rounded text-[6px] font-black uppercase tracking-tighter transition-all ${texture.metadata?.isHidden ? "bg-amber-500/20 text-amber-400" : "bg-blue-500/20 text-blue-400"} `}
                        >
                            {texture.metadata?.isHidden ? "HIDDEN" : "VISIBLE"}
                        </button>
                        {isBuilding && (
                            <>
                                <button
                                    onClick={() => updateMetadata?.(texture.filename, { ...texture.metadata, isPassable: !texture.metadata?.isPassable })}
                                    className={`px-1 py-0.5 rounded text-[6px] font-black uppercase tracking-tighter transition-all ${texture.metadata.isPassable ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"} `}
                                >
                                    {texture.metadata.isPassable ? "PASS" : "BLOK"}
                                </button>
                            </>
                        )}
                        {isTerrain && (
                            <>
                                <button
                                    onClick={() => {
                                        const newVal = ((texture.metadata.moveEfficiency || 1.0) + 0.5) % 2.5;
                                        updateMetadata?.(texture.filename, { ...texture.metadata, moveEfficiency: newVal || 0.5 });
                                    }}
                                    className="px-1 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-400 text-[6px] font-black uppercase tracking-tighter transition-colors"
                                    title="Cycle Efficiency (0.5 - 2.0)"
                                >
                                    E:{(texture.metadata.moveEfficiency || 1.0).toFixed(1)}
                                </button>
                                <button
                                    onClick={() => {
                                        const newVal = ((texture.metadata.fertility || 1.0) + 0.5) % 2.5;
                                        updateMetadata?.(texture.filename, { ...texture.metadata, fertility: newVal || 0.5 });
                                    }}
                                    className="px-1 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-400 text-[6px] font-black uppercase tracking-tighter transition-colors"
                                    title="Cycle Fertility (0.0 - 2.0)"
                                >
                                    F:{(texture.metadata.fertility || 1.0).toFixed(1)}
                                </button>
                            </>
                        )}
                        <button
                            onClick={() => updateMetadata?.(texture.filename, { ...texture.metadata, isNatural: !texture.metadata.isNatural })}
                            className={`px-1 py-0.5 rounded text-[6px] font-black uppercase tracking-tighter transition-all ${texture.metadata.isNatural ? "bg-emerald-500/10 text-emerald-600" : "bg-purple-500/10 text-purple-600"} `}
                        >
                            {texture.metadata.isNatural ? "NAT" : "ART"}
                        </button>
                    </div>
                )}

                <button
                    onClick={() => startEditingTexture(texture)}
                    className="w-full group/btn relative py-1 rounded-md bg-white/[0.03] border border-white/10 transition-all hover:bg-[#E6E6FA]/10 hover:border-[#E6E6FA]/30 overflow-hidden"
                    title="Reroll"
                >
                    <div className="flex items-center justify-center gap-1 text-[8px] text-[#E6E6FA]/80 font-black uppercase tracking-widest relative z-10">
                        <svg className="w-2.5 h-2.5 group-hover/btn:rotate-180 transition-transform duration-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        REROLL
                    </div>
                </button>
            </div>
        </div>
    );
});

const SpriteCard = React.memo(function SpriteCard({
    sprite,
    lastRefreshedAt,
    onAssign,
    isSelected,
    onToggleSelect,
}: {
    sprite: GeneratedSpriteSet;
    lastRefreshedAt: number;
    onAssign: (sprite: GeneratedSpriteSet) => void;
    isSelected: boolean;
    onToggleSelect: (id: string) => void;
}) {
    return (
        <div className={`flex flex-col gap-3 rounded-xl border transition-all ${isSelected ? "border-[#E6E6FA] bg-[#E6E6FA]/10 shadow-[0_0_20px_rgba(230,230,250,0.1)]" : "border-white/10 bg-[#0f1520]"} p-3 relative group`}>
            <div
                onClick={() => onToggleSelect(sprite.spriteId)}
                className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full border-2 border-white/20 bg-black/40 flex items-center justify-center cursor-pointer hover:border-[#E6E6FA]/50 transition-all"
            >
                {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-[#E6E6FA]" />}
            </div>
            <div className="aspect-square overflow-hidden rounded-lg border border-white/10 bg-black/20">
                <img src={`${sprite.previewUrl}?t=${lastRefreshedAt}`} alt={sprite.prompt} className="h-full w-full object-contain" />
            </div>
            <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-white">{sprite.itemPrompt || sprite.prompt}</p>
                <p className="text-[9px] text-gray-500">{sprite.actorType} • {sprite.mode}</p>
            </div>
            {sprite.mode === "directional-set" && sprite.directions.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                    {sprite.directions.map((frame) => (
                        <div key={frame.direction} className="rounded-md border border-white/10 bg-[#0a0f14] p-1 text-center">
                            <img src={`${frame.url}?t=${lastRefreshedAt}`} alt={frame.direction} className="mx-auto h-12 w-12 object-contain" />
                            <p className="mt-1 text-[8px] uppercase tracking-widest text-gray-500">{frame.direction}</p>
                        </div>
                    ))}
                </div>
            )}
            {sprite.illustrationUrl && (
                <div className="rounded-md border border-white/10 bg-[#0a0f14] p-2">
                    <p className="mb-2 text-[8px] uppercase tracking-widest text-gray-500">Illustration</p>
                    <img src={`${sprite.illustrationUrl}?t=${lastRefreshedAt}`} alt={`${sprite.prompt} illustration`} className="mx-auto h-28 w-full rounded object-contain" />
                </div>
            )}
            <button
                onClick={() => onAssign(sprite)}
                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[10px] font-bold tracking-widest text-emerald-300 transition-all hover:bg-emerald-500/20"
            >
                BIND
            </button>
        </div>
    );
});

export function AssetGeneratorPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get("tab");
    const initialTab: AssetGeneratorTab =
        requestedTab === "battlemaps" || requestedTab === "world-assets" || requestedTab === "game-assets" || requestedTab === "ecology-illustrations" || requestedTab === "sprites" || requestedTab === "songs" || requestedTab === "videos" || requestedTab === "packs"
            ? requestedTab
            : "icons";
    const [activeTab, setActiveTab] = useState<AssetGeneratorTab>(initialTab);

    // ── Prompt State (Shared or separate depending on tab) ──
    const [stylePrompt, setStylePrompt] = useState("");
    const [iconListText, setIconListText] = useState("");
    const [batchName, setBatchName] = useState("");

    // ── Texture Specific State ──
    const [textureCategory, setTextureCategory] = useState("battle_assets");
    const [textureSubCategory, setTextureSubCategory] = useState("ground");

    // ── Settings ──
    const [temperature, setTemperature] = useState(0.4);
    const [textureVariations, setTextureVariations] = useState(4);

    // ── Reference Image State ──
    const [referenceImage, setReferenceImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Generation State ──
    const [isGenerating, setIsGenerating] = useState(false);
    const [genProgress, setGenProgress] = useState({ current: 0, total: 0 });
    const [error, setError] = useState<string | null>(null);

    // ── Confirmation Modal ──
    const [showConfirm, setShowConfirm] = useState(false);
    const [pendingPrompts, setPendingPrompts] = useState<string[]>([]);
    const [showReferenceImage, setShowReferenceImage] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    // ── Browse State ──
    const [batches, setBatches] = useState<BatchSummary[]>([]);
    const [textureBatches, setTextureBatches] = useState<TextureBatchSummary[]>([]);
    const [spriteBatches, setSpriteBatches] = useState<SpriteBatchSummary[]>([]);
    const [packs, setPacks] = useState<AssetPackManifest[]>([]);
    const [activeBatch, setActiveBatch] = useState<BatchManifest | null>(null);
    const [activeTextureBatch, setActiveTextureBatch] = useState<TextureBatchManifest | null>(null);
    const [activeSpriteBatch, setActiveSpriteBatch] = useState<SpriteBatchManifest | null>(null);
    const [activePack, setActivePack] = useState<AssetPackManifest | null>(null);
    const [hoveredIcon, setHoveredIcon] = useState<BatchIcon | null>(null);
    const [hoveredTexture, setHoveredTexture] = useState<BatchTexture | null>(null);
    const [selectedItems, setSelectedItems] = useState<string[]>([]); // filename or spriteId based
    const [assigningSprite, setAssigningSprite] = useState<GeneratedSpriteSet | null>(null);
    const [isAssigningSprite, setIsAssigningSprite] = useState(false);

    const handleTabChange = (tab: AssetGeneratorTab) => {
        setActiveTab(tab);
        if (tab === "ecology-illustrations") {
            setTextureSubCategory(assetTargetKind === "flora" || assetTargetKind === "fauna" ? assetTargetKind : "");
        }
        setActiveBatch(null);
        setActiveTextureBatch(null);
        setActiveSpriteBatch(null);
        setActiveMediaJobId(null);
        setActiveMediaResult(null);
        setActiveVideoJobId(null);
        setActiveVideoResult(null);
        setActivePack(null);
        setHoveredIcon(null);
        setHoveredTexture(null);
        setSelectedItems([]);
        setError(null);
        setGameAssetSubtype("");
        setIconListText("");
        const next = new URLSearchParams(searchParams);
        next.set("tab", tab);
        setSearchParams(next, { replace: true });
    };

    const toggleItemSelection = useCallback((id: string) => {
        setSelectedItems(prev =>
            prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
        );
    }, []);

    const selectAllItems = useCallback(() => {
        if (activeTab === "sprites") {
            if (!activeSpriteBatch) return;
            const allIds = activeSpriteBatch.sprites.map(s => s.spriteId);
            setSelectedItems(prev => prev.length === allIds.length ? [] : allIds);
        } else {
            if (!activeTextureBatch) return;
            const allFilenames = activeTextureBatch.textures.map(t => t.filename);
            setSelectedItems(prev => prev.length === allFilenames.length ? [] : allFilenames);
        }
    }, [activeTab, activeTextureBatch, activeSpriteBatch]);
    const filteredTextureBatches = useMemo(() => {
        if (activeTab === "icons") return [];
        return textureBatches.filter(batch => {
            if (activeTab === "battlemaps") {
                return ["battle_assets", "character", "item"].includes(batch.category);
            }
            if (activeTab === "world-assets") {
                return batch.category === "world_assets";
            }
            if (activeTab === "game-assets") {
                return batch.category === "game_assets";
            }
            if (activeTab === "ecology-illustrations") {
                return batch.category === "ecology_illustrations";
            }
            if (activeTab === "sprites") {
                return false;
            }
            if (activeTab === "songs" || activeTab === "videos") {
                return false;
            }
            return false;
        });
    }, [textureBatches, activeTab]);

    // ── Export State ──
    const [isExporting, setIsExporting] = useState(false);
    const [exportResult, setExportResult] = useState<{ totalIcons: number; totalBatches: number } | null>(null);

    // ── Rename State ──
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState("");
    const [isRenameSaving, setIsRenameSaving] = useState(false);

    // ── Single Icon Regeneration ──
    const [editingIconFilename, setEditingIconFilename] = useState<string | null>(null);
    const [editingTextureFilename, setEditingTextureFilename] = useState<string | null>(null);
    const [tempIconItem, setTempIconItem] = useState("");
    const [tempIconStyle, setTempIconStyle] = useState("");
    const [tempIconRefImage, setTempIconRefImage] = useState<string | null>(null);
    const [regeneratingIconFilename, setRegeneratingIconFilename] = useState<string | null>(null);
    const [regeneratingTextureFilename, setRegeneratingTextureFilename] = useState<string | null>(null);
    const [lastRefreshedAt, setLastRefreshedAt] = useState(Date.now());

    // ── Icon Assignment ──
    const [assigningIcon, setAssigningIcon] = useState<BatchIcon | null>(null);
    const [assignCategory, setAssignCategory] = useState<"traits" | "occupations" | "items" | "skills" | "characters">("items");
    const [assignEntityId, setAssignEntityId] = useState("");
    const [isAssigning, setIsAssigning] = useState(false);

    // ── Pack Assignment ──
    const [isAssigningPack, setIsAssigningPack] = useState(false);
    const [assigningPackId, setAssigningPackId] = useState<string | null>(null);
    const [tempPackGroupingName, setTempPackGroupingName] = useState("");
    const [tempPackGroupingType, setTempPackGroupingType] = useState<AssetPackGrouping["type"]>("biome");
    const [tempPackGroupingDescription, setTempPackGroupingDescription] = useState("");

    // ── Game Assets Specific State ──
    const [gameAssetType, setGameAssetType] = useState<"building" | "terrain" | "vegetation">("building");
    const [gameAssetSubtype, setGameAssetSubtype] = useState("");
    // Building Metadata
    const [isBuildingNatural, setIsBuildingNatural] = useState(false);
    const [isBuildingPassable, setIsBuildingPassable] = useState(false);
    const [isBuildingHidden, setIsBuildingHidden] = useState(false);
    const [moveEfficiency, setMoveEfficiency] = useState(1.0);
    const [fertility, setFertility] = useState(1.0);


    // Terrain Metadata
    const [isTerrainNatural, setIsTerrainNatural] = useState(true);
    const [terrainMoveEfficiency, setTerrainMoveEfficiency] = useState(1.0);
    const [terrainFertility, setTerrainFertility] = useState(1.0);
    // Grouping
    const [gameAssetGroupType, setGameAssetGroupType] = useState<NonNullable<NonNullable<TextureBatchManifest["gameAsset"]>["grouping"]>["type"]>("biome");
    const [gameAssetGroupName, setGameAssetGroupName] = useState("");
    const [selectedBiomeId, setSelectedBiomeId] = useState<string | null>(null);
    const [structureDescription, setStructureDescription] = useState("");
    const [spriteType, setSpriteType] = useState<GeneratedSpriteSet["actorType"]>("animal");
    const [spriteMode, setSpriteMode] = useState<GeneratedSpriteSet["mode"]>("directional-set");
    const [includeSpriteIllustration, setIncludeSpriteIllustration] = useState(false);
    const [spriteTargetKind, setSpriteTargetKind] = useState<"character" | "fauna" | "">("");
    const [spriteTargetId, setSpriteTargetId] = useState("");
    const [assetTargetKind, setAssetTargetKind] = useState<"flora" | "fauna" | "biome" | "character" | "">("");
    const [assetTargetId, setAssetTargetId] = useState("");
    const [assignSpriteTargetKind, setAssignSpriteTargetKind] = useState<"character" | "fauna">("character");
    const [assignSpriteTargetId, setAssignSpriteTargetId] = useState("");
    const [songCategory, setSongCategory] = useState<"ost" | "ambience" | "sfx">("ambience");
    const [songGenre, setSongGenre] = useState<string>("cinematic");
    const [songGenreCustom, setSongGenreCustom] = useState("");
    const [songMoods, setSongMoods] = useState<string[]>(["mysterious"]);
    const [songInstrumentation, setSongInstrumentation] = useState<string[]>(["synth drones"]);
    const [songTempo, setSongTempo] = useState<"very-slow" | "slow" | "medium" | "fast">("medium");
    const [songRhythmicFeel, setSongRhythmicFeel] = useState<"drone" | "pulse" | "driving" | "syncopated" | "free">("pulse");
    const [songSoundscape, setSongSoundscape] = useState("");
    const [songProductionStyle, setSongProductionStyle] = useState<"clean" | "wide" | "intimate" | "lo-fi" | "gritty">("wide");
    const [songNegativePrompt, setSongNegativePrompt] = useState("");
    const [songGlobalDirection, setSongGlobalDirection] = useState("");
    const [songDurationSeconds, setSongDurationSeconds] = useState(18);
    const [activeMediaJobId, setActiveMediaJobId] = useState<string | null>(null);
    const [activeMediaResult, setActiveMediaResult] = useState<GeneratedMediaAudioResult | null>(null);
    const [videoCategory, setVideoCategory] = useState<"cinematic" | "cutscene" | "trailer" | "lore">("cinematic");
    const [videoDurationSeconds, setVideoDurationSeconds] = useState<4 | 6 | 8>(8);
    const [videoAspectRatio, setVideoAspectRatio] = useState<"16:9" | "9:16">("16:9");
    const [videoVisualStyle, setVideoVisualStyle] = useState("cinematic");
    const [videoMoods, setVideoMoods] = useState<string[]>(["mysterious"]);
    const [videoCameraDirection, setVideoCameraDirection] = useState("slow cinematic push");
    const [videoNarrationIntent, setVideoNarrationIntent] = useState("introduce the scene");
    const [videoNarrationTone, setVideoNarrationTone] = useState("grave, cinematic");
    const [videoVoiceName, setVideoVoiceName] = useState("Charon");
    const [videoNegativePrompt, setVideoNegativePrompt] = useState("");
    const [videoGlobalDirection, setVideoGlobalDirection] = useState("");
    const [keepVeoAudio, setKeepVeoAudio] = useState(true);
    const [activeVideoJobId, setActiveVideoJobId] = useState<string | null>(null);
    const [activeVideoResult, setActiveVideoResult] = useState<GeneratedMediaVideoResult | null>(null);
    const [isSavingVideoToGallery, setIsSavingVideoToGallery] = useState(false);
    const [videoSaveNotice, setVideoSaveNotice] = useState<string | null>(null);
    const [videoSaveError, setVideoSaveError] = useState<string | null>(null);

    // ── Pack Management Modal State ──
    const [isAddToPackModalOpen, setIsAddToPackModalOpen] = useState(false);
    const [newPackName, setNewPackName] = useState("");
    const [isPackSaving, setIsPackSaving] = useState(false);

    const { activeWorldId } = useActiveWorld();
    const ecology = useEcologyData(activeWorldId);
    const { jobs, getJobDetail, waitForJob } = useJobs();
    const launchTrackedJob = useTrackedJobLauncher();

    const selectedBiome = useMemo(() =>
        ecology.bundle?.biomes?.find(b => b.id === selectedBiomeId) ?? null,
        [ecology.bundle?.biomes, selectedBiomeId]
    );

    const mediaAudioJobs = useMemo(
        () => jobs
            .filter((job) => job.tool === "generatemedia.audio")
            .sort((left, right) => right.updatedAt - left.updatedAt),
        [jobs],
    );
    const mediaVideoJobs = useMemo(
        () => jobs
            .filter((job) => job.tool === "generatemedia.video")
            .sort((left, right) => right.updatedAt - left.updatedAt),
        [jobs],
    );
    const activeMediaJob = useMemo(
        () => activeMediaJobId ? mediaAudioJobs.find((job) => job.jobId === activeMediaJobId) ?? null : null,
        [activeMediaJobId, mediaAudioJobs],
    );
    const activeVideoJob = useMemo(
        () => activeVideoJobId ? mediaVideoJobs.find((job) => job.jobId === activeVideoJobId) ?? null : null,
        [activeVideoJobId, mediaVideoJobs],
    );
    const activeVideoBatchId = useMemo(() => {
        const value = activeVideoResult?.transcript.toolArguments?.persistedVideoBatchId;
        return typeof value === "string" && value.trim().length > 0 ? value : null;
    }, [activeVideoResult]);

    const assignableCharacters = useMemo(
        () =>
            GameRegistry.getAllCharacters().filter((character) => getCharacterSpriteType(character) !== null),
        [lastRefreshedAt],
    );

    const faunaTargets = ecology.bundle?.fauna ?? [];
    const floraTarget = ecology.bundle?.flora.find((entry) => entry.id === assetTargetId) ?? null;
    const faunaTarget = ecology.bundle?.fauna.find((entry) => entry.id === spriteTargetId || entry.id === assetTargetId) ?? null;
    const currentSpriteTargetLabel = spriteTargetKind === "character"
        ? assignableCharacters.find((character) => character.id === spriteTargetId)?.name ?? spriteTargetId
        : faunaTargets.find((entry) => entry.id === spriteTargetId)?.name ?? spriteTargetId;

    // ── Parse prompts from textarea ──
    const parsePrompts = useCallback((): string[] => {
        if (activeTab === "songs" || activeTab === "videos") {
            const prompt = iconListText.trim();
            return prompt ? [prompt] : [];
        }

        const basePrompts = iconListText
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (activeTab === "icons" || activeTab === "sprites" || textureVariations <= 1) {
            return basePrompts;
        }

        // Duplicate each prompt based on the textureVariations count
        const duplicatedPrompts: string[] = [];
        basePrompts.forEach(prompt => {
            for (let i = 0; i < textureVariations; i++) {
                duplicatedPrompts.push(prompt);
            }
        });
        return duplicatedPrompts;
    }, [iconListText, activeTab, textureVariations]);

    // ── Load batches on mount ──
    const loadBatches = useCallback(async () => {
        try {
            const res = await fetch("/api/icons/batches");
            if (res.ok) {
                const data = await res.json();
                setBatches(data);
            }
        } catch {
            // silent
        }
    }, []);

    const loadTextureBatches = useCallback(async () => {
        try {
            const res = await fetch("/api/textures/batches");
            if (res.ok) {
                const data = await res.json();
                setTextureBatches(data);
            }
        } catch {
            // silent
        }
    }, []);

    const loadSpriteBatches = useCallback(async () => {
        try {
            const res = await fetch("/api/sprites/batches");
            if (res.ok) {
                const data = await res.json();
                setSpriteBatches(data);
            }
        } catch {
            // silent
        }
    }, []);

    const loadPacks = useCallback(async () => {
        try {
            const res = await fetch("/api/packs");
            if (res.ok) {
                const data = await res.json();
                setPacks(data);
            }
        } catch {
            // silent
        }
    }, []);

    useEffect(() => {
        loadBatches();
        loadTextureBatches();
        loadSpriteBatches();
        loadPacks();
    }, [loadBatches, loadTextureBatches, loadSpriteBatches, loadPacks]);

    useEffect(() => {
        const nextTab = searchParams.get("tab");
        if (nextTab === "packs") setActiveTab("packs");
        if (nextTab === "sprites") setActiveTab("sprites");
        if (nextTab === "songs") setActiveTab("songs");
        if (nextTab === "videos") setActiveTab("videos");
        if (nextTab === "game-assets") setActiveTab("game-assets");
        if (nextTab === "world-assets") setActiveTab("world-assets");
        if (nextTab === "ecology-illustrations") setActiveTab("ecology-illustrations");
        if (nextTab === "battlemaps") setActiveTab("battlemaps");
        if (nextTab === "icons") setActiveTab("icons");

        const nextSpriteType = searchParams.get("spriteType");
        if (nextSpriteType === "animal" || nextSpriteType === "monster" || nextSpriteType === "human" || nextSpriteType === "mutant" || nextSpriteType === "construct") {
            setSpriteType(nextSpriteType);
        }
        const nextMode = searchParams.get("mode");
        if (nextMode === "directional-set" || nextMode === "illustration") {
            setSpriteMode(nextMode);
        }
        setIncludeSpriteIllustration(searchParams.get("includeIllustration") === "1" || searchParams.get("includeIllustration") === "true");
        const targetKind = searchParams.get("targetKind");
        if (targetKind === "character" || targetKind === "fauna") {
            setSpriteTargetKind(targetKind);
        }
        const targetId = searchParams.get("targetId");
        if (targetId) {
            setSpriteTargetId(targetId);
            setAssetTargetId(targetId);
        }
        const assetKind = searchParams.get("targetKind");
        if (assetKind === "flora" || assetKind === "fauna" || assetKind === "biome" || assetKind === "character") {
            setAssetTargetKind(assetKind);
        }
        const requestedSubCategory = searchParams.get("subCategory");
        if (requestedSubCategory) {
            setTextureSubCategory(requestedSubCategory);
        } else if (nextTab === "ecology-illustrations") {
            setTextureSubCategory(assetKind === "flora" || assetKind === "fauna" ? assetKind : "");
        }
        const biomeId = searchParams.get("biomeId");
        if (biomeId) setSelectedBiomeId(biomeId);
        const batchId = searchParams.get("batchId");
        if (batchId) {
            if (nextTab === "sprites") {
                void selectSpriteBatch(batchId);
            } else if (nextTab === "icons") {
                void selectBatch(batchId);
            } else {
                void selectTextureBatch(batchId);
            }
        }
        if (searchParams.get("assetType") === "vegetation") {
            setGameAssetType("vegetation");
            setGameAssetSubtype("vegetation");
            setTextureSubCategory("ground");
            setGameAssetGroupType("biome");
        }
    }, [searchParams]);

    const refreshRegistry = useCallback(async () => {
        await GameRegistry.fetchFromBackend(API_BASE);
        setLastRefreshedAt(Date.now());
    }, []);

    const updateFloraAssetLinks = useCallback(async (batchId: string, field: "vegetationAssetBatchIds" | "illustrationAssetBatchIds", filename?: string) => {
        if (!ecology.bundle || assetTargetKind !== "flora" || !assetTargetId) return;
        const next = structuredClone(ecology.bundle);
        const target = next.flora.find((entry) => entry.id === assetTargetId);
        if (!target) return;
        target[field] = Array.from(new Set([...(target[field] ?? []), batchId]));
        if (field === "illustrationAssetBatchIds" && filename) {
            target.illustrationAssets = Array.from(
                new Map(
                    [...(target.illustrationAssets ?? []), { batchId, filename }].map((asset) => [`${asset.batchId}:${asset.filename}`, asset]),
                ).values(),
            );
        }
        await ecology.saveBundle(next);
    }, [assetTargetId, assetTargetKind, ecology]);

    const updateFaunaIllustrationLinks = useCallback(async (batchId: string, filename?: string) => {
        const targetId = assetTargetId || spriteTargetId;
        if (!ecology.bundle || !targetId) return;
        const next = structuredClone(ecology.bundle);
        const target = next.fauna.find((entry) => entry.id === targetId);
        if (!target) return;
        target.illustrationAssetBatchIds = Array.from(new Set([...(target.illustrationAssetBatchIds ?? []), batchId]));
        if (filename) {
            target.illustrationAssets = Array.from(
                new Map(
                    [...(target.illustrationAssets ?? []), { batchId, filename }].map((asset) => [`${asset.batchId}:${asset.filename}`, asset]),
                ).values(),
            );
        }
        await ecology.saveBundle(next);
    }, [assetTargetId, ecology, spriteTargetId]);

    const bindSpriteToTarget = useCallback(async (
        sprite: GeneratedSpriteSet,
        batchId: string,
        targetKind: "character" | "fauna",
        targetId: string,
    ) => {
        if (!targetId) return;
        const binding = buildDirectionalBinding(batchId, sprite);

        if (targetKind === "character") {
            await refreshRegistry();
            const character = GameRegistry.getAllCharacters().find((entry) => entry.id === targetId);
            if (!character) {
                throw new Error("Character target not found");
            }
            if (!getCharacterSpriteType(character)) {
                throw new Error("Only Monster, Human, Mutant, and Construct characters can receive exploration sprites");
            }
            const updatedCharacter: Character = {
                ...character,
                explorationSprite: binding,
            };
            const response = await fetch(`${API_BASE}/api/data/characters`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedCharacter),
            });
            if (!response.ok) {
                throw new Error(await response.text());
            }
            await refreshRegistry();
            return;
        }

        if (!ecology.bundle) {
            throw new Error("Ecology bundle is not loaded");
        }
        const next = structuredClone(ecology.bundle);
        const target = next.fauna.find((entry) => entry.id === targetId);
        if (!target) {
            throw new Error("Fauna target not found");
        }
        target.explorationSprite = binding;
        await ecology.saveBundle(next);
    }, [ecology, refreshRegistry]);

    const openAssignSpriteModal = useCallback(async (sprite: GeneratedSpriteSet) => {
        await refreshRegistry();
        setAssigningSprite(sprite);
        const defaultKind = (sprite.target?.kind === "character" || sprite.target?.kind === "fauna")
            ? sprite.target.kind
            : (spriteTargetKind || "character");
        const defaultId = sprite.target?.id || spriteTargetId || "";
        setAssignSpriteTargetKind(defaultKind);
        setAssignSpriteTargetId(defaultId);
    }, [refreshRegistry, spriteTargetId, spriteTargetKind]);

    // ── Image Upload Handling ──
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            // Extract just the base64 data part (remove "data:image/png;base64,")
            const base64Data = base64String.split(',')[1];
            setReferenceImage(base64Data);
        };
        reader.readAsDataURL(file);
    };

    const clearReferenceImage = () => {
        setReferenceImage(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    // ── Confirm step ──
    const handleGenerateClick = useCallback(() => {
        const prompts = parsePrompts();
        if (prompts.length === 0) return;
        setPendingPrompts(prompts);
        setShowConfirm(true);
    }, [parsePrompts]);

    // ── Actual generation ──
    const confirmAndGenerate = useCallback(async () => {
        setShowConfirm(false);
        if (pendingPrompts.length === 0) return;

        setIsGenerating(true);
        setGenProgress({ current: 0, total: pendingPrompts.length });
        setError(null);

        try {
            const payload: any = {
                prompts: pendingPrompts,
                stylePrompt: stylePrompt.trim(),
                temperature: temperature
            };
            if (referenceImage) {
                payload.base64Image = referenceImage;
            }
            if (batchName.trim()) {
                payload.batchName = batchName.trim();
            }

            if (activeTab === "icons") {
                const res = await fetch("/api/icons/generate-batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const msg = await res.text();
                    throw new Error(msg || `HTTP ${res.status} `);
                }
                const manifest: BatchManifest = await res.json();
                setActiveBatch(manifest);
                await loadBatches();
            } else if (activeTab === "sprites") {
                payload.spriteType = spriteType;
                payload.mode = spriteMode;
                payload.includeIllustration = spriteMode === "directional-set" ? includeSpriteIllustration : false;
                payload.worldId = activeWorldId;
                payload.sourceEntityType = spriteTargetKind || undefined;
                payload.sourceEntityId = spriteTargetId || undefined;
                payload.biomeIds = faunaTarget?.biomeIds ?? floraTarget?.biomeIds ?? (selectedBiomeId ? [selectedBiomeId] : []);
                if (spriteTargetKind && spriteTargetId) {
                    payload.target = {
                        kind: spriteTargetKind,
                        id: spriteTargetId,
                    };
                }

                const res = await fetch("/api/sprites/generate-batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const msg = await res.text();
                    throw new Error(msg || `HTTP ${res.status}`);
                }
                const manifest: SpriteBatchManifest = await res.json();
                setActiveSpriteBatch(manifest);
                await loadSpriteBatches();
                if ((manifest.mode === "illustration" || manifest.includesIllustration) && manifest.target?.kind === "fauna") {
                    await updateFaunaIllustrationLinks(manifest.batchId);
                }
                if (manifest.target && manifest.mode === "directional-set" && manifest.sprites.length === 1) {
                    await bindSpriteToTarget(manifest.sprites[0], manifest.batchId, manifest.target.kind as "character" | "fauna", manifest.target.id);
                }
            } else if (activeTab === "songs") {
                const genre = songGenre === "custom" ? songGenreCustom.trim() : songGenre;
                const style = [
                    genre,
                    songProductionStyle,
                    songInstrumentation.join(", "),
                    songTempo,
                    songRhythmicFeel,
                    songSoundscape.trim(),
                ].filter(Boolean).join(" | ");
                const intent = [
                    songGlobalDirection.trim(),
                    songNegativePrompt.trim() ? `avoid ${songNegativePrompt.trim()}` : "",
                ].filter(Boolean).join(" | ") || "scene support";

                const accepted = await launchTrackedJob<{ jobId: string }, Record<string, unknown>>({
                    url: "/api/media/audio/jobs",
                    request: {
                        prompt: pendingPrompts[0],
                        durationSeconds: songDurationSeconds,
                        style,
                        intent,
                        category: songCategory,
                        mood: songMoods.slice(0, 3).join(", "),
                    },
                    restore: {
                        route: "/devtools/asset-generator",
                        search: { tab: "songs" },
                        payload: { tab: "songs" },
                    },
                    metadata: {
                        category: songCategory,
                        durationSeconds: songDurationSeconds,
                    },
                    optimisticJob: {
                        kind: "interleaved.generatemedia.audio.v1",
                        title: "Generate Media Audio",
                        tool: "generatemedia.audio",
                        status: "queued",
                        currentStage: "Queued",
                    },
                });
                setActiveMediaJobId(accepted.jobId);
                const detail = await waitForJob(accepted.jobId);
                if (!isGeneratedMediaAudioResult(detail.result)) {
                    throw new Error(detail.error || "Media generation did not return a unified artifact");
                }
                setActiveMediaResult(detail.result);
                setSearchParams((previous) => {
                    const next = new URLSearchParams(previous);
                    next.set("tab", "songs");
                    next.set("jobId", accepted.jobId);
                    return next;
                }, { replace: true });
            } else if (activeTab === "videos") {
                const accepted = await launchTrackedJob<{ jobId: string }, Record<string, unknown>>({
                    url: "/api/media/video/jobs",
                    request: {
                        prompt: pendingPrompts[0],
                        durationSeconds: videoDurationSeconds,
                        aspectRatio: videoAspectRatio,
                        style: videoVisualStyle,
                        intent: videoNarrationIntent,
                        category: videoCategory,
                        mood: videoMoods.slice(0, 3).join(", "),
                        cameraDirection: videoCameraDirection,
                        narrationTone: videoNarrationTone,
                        narrationIntent: videoNarrationIntent,
                        voiceName: videoVoiceName,
                        negativePrompt: videoNegativePrompt,
                        globalDirection: videoGlobalDirection,
                        keepVeoAudio,
                    },
                    restore: {
                        route: "/devtools/asset-generator",
                        search: { tab: "videos" },
                        payload: { tab: "videos" },
                    },
                    metadata: {
                        category: videoCategory,
                        durationSeconds: videoDurationSeconds,
                        aspectRatio: videoAspectRatio,
                    },
                    optimisticJob: {
                        kind: "interleaved.generatemedia.video.v1",
                        title: "Generate Media Video",
                        tool: "generatemedia.video",
                        status: "queued",
                        currentStage: "Queued",
                    },
                });
                setActiveVideoJobId(accepted.jobId);
                const detail = await waitForJob(accepted.jobId);
                if (!isGeneratedMediaVideoResult(detail.result)) {
                    throw new Error(detail.error || "Media video generation did not return a unified artifact");
                }
                setActiveVideoResult(detail.result);
                setSearchParams((previous) => {
                    const next = new URLSearchParams(previous);
                    next.set("tab", "videos");
                    next.set("jobId", accepted.jobId);
                    return next;
                }, { replace: true });
            } else {
                payload.category = activeTab === "battlemaps"
                    ? textureCategory
                    : activeTab === "world-assets"
                        ? "world_assets"
                        : activeTab === "ecology-illustrations"
                            ? "ecology_illustrations"
                            : "game_assets";
                if (activeTab === "game-assets") {
                    payload.gameAsset = {
                        type: gameAssetType,
                        metadata: gameAssetType === "building" ? {
                            isNatural: isBuildingNatural,
                            isPassable: isBuildingPassable,
                            isHidden: isBuildingHidden
                        } : {
                            isNatural: isTerrainNatural,
                            moveEfficiency: terrainMoveEfficiency,
                            fertility: terrainFertility
                        },
                        ecologyLink: assetTargetKind && assetTargetId ? {
                            kind: assetTargetKind,
                            id: assetTargetId,
                        } : undefined,
                        grouping: {
                            type: gameAssetGroupType,
                            name: selectedBiome ? selectedBiome.name : gameAssetGroupName,
                            description: selectedBiome ? selectedBiome.description : structureDescription
                        }
                    };

                    // Enhance style prompt if biome is selected
                    if (selectedBiome) {
                        payload.stylePrompt = `(Biome context: ${selectedBiome.name} - ${selectedBiome.description}) ${payload.stylePrompt}`;
                    }
                }

                if (textureSubCategory) {
                    payload.subCategory = textureSubCategory;
                }
                const res = await fetch("/api/textures/generate-batch", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) {
                    const msg = await res.text();
                    throw new Error(msg || `HTTP ${res.status} `);
                }
                const manifest: TextureBatchManifest = await res.json();
                setActiveTextureBatch(manifest);
                await loadTextureBatches();
                if (activeTab === "game-assets" && gameAssetType === "vegetation") {
                    await updateFloraAssetLinks(manifest.batchId, "vegetationAssetBatchIds");
                }
                if (activeTab === "ecology-illustrations" && assetTargetKind === "fauna") {
                    await updateFaunaIllustrationLinks(manifest.batchId, manifest.textures[0]?.filename);
                }
                if ((activeTab === "world-assets" || activeTab === "ecology-illustrations") && assetTargetKind === "flora") {
                    await updateFloraAssetLinks(manifest.batchId, "illustrationAssetBatchIds", manifest.textures[0]?.filename);
                }
            }
        } catch (e: any) {
            setError(e.message || "Generation failed");
        } finally {
            setIsGenerating(false);
            setGenProgress({ current: 0, total: 0 });
        }
    }, [pendingPrompts, referenceImage, batchName, stylePrompt, temperature, activeTab, textureCategory, textureSubCategory, loadBatches, loadTextureBatches, loadSpriteBatches, gameAssetType, isBuildingNatural, isBuildingPassable, isBuildingHidden, isTerrainNatural, terrainMoveEfficiency, terrainFertility, gameAssetGroupType, gameAssetGroupName, structureDescription, selectedBiome, spriteType, spriteMode, includeSpriteIllustration, activeWorldId, spriteTargetKind, spriteTargetId, faunaTarget?.biomeIds, floraTarget?.biomeIds, selectedBiomeId, updateFaunaIllustrationLinks, bindSpriteToTarget, assetTargetKind, assetTargetId, updateFloraAssetLinks, songCategory, songGenre, songGenreCustom, songMoods, songInstrumentation, songTempo, songRhythmicFeel, songSoundscape, songProductionStyle, songNegativePrompt, songGlobalDirection, songDurationSeconds, videoDurationSeconds, videoAspectRatio, videoVisualStyle, videoCategory, videoMoods, videoCameraDirection, videoNarrationIntent, videoNarrationTone, videoVoiceName, videoNegativePrompt, videoGlobalDirection, keepVeoAudio, launchTrackedJob, setSearchParams, waitForJob]);

    // ── Load a batch ──
    const selectBatch = useCallback(async (batchId: string) => {
        try {
            const res = await fetch(`/api/icons/batches/${batchId}`);
            if (res.ok) {
                const data: BatchManifest = await res.json();
                setActiveBatch(data);
            }
        } catch {
            // silent
        }
    }, []);

    const selectTextureBatch = useCallback(async (batchId: string) => {
        try {
            const res = await fetch(`/api/textures/batches/${batchId}`);
            if (res.ok) {
                const data: TextureBatchManifest = await res.json();
                setActiveTextureBatch(data);
            }
        } catch {
            // silent
        }
    }, []);

    const selectSpriteBatch = useCallback(async (batchId: string) => {
        try {
            const res = await fetch(`/api/sprites/batches/${batchId}`);
            if (res.ok) {
                const data: SpriteBatchManifest = await res.json();
                setActiveSpriteBatch(data);
            }
        } catch {
            // silent
        }
    }, []);

    const selectMediaJob = useCallback(async (jobId: string) => {
        setActiveMediaJobId(jobId);
        const detail = await getJobDetail(jobId);
        if (detail && isGeneratedMediaAudioResult(detail.result)) {
            setActiveMediaResult(detail.result);
        } else {
            setActiveMediaResult(buildPendingMediaResult(
                detail?.title || "Generate Media Audio",
                detail?.currentStage || "Waiting for artifact",
                detail?.status || "queued",
            ));
        }
    }, [getJobDetail]);

    const selectVideoJob = useCallback(async (jobId: string) => {
        setActiveVideoJobId(jobId);
        setVideoSaveNotice(null);
        setVideoSaveError(null);
        const detail = await getJobDetail(jobId);
        if (detail && isGeneratedMediaVideoResult(detail.result)) {
            setActiveVideoResult(detail.result);
        } else {
            setActiveVideoResult(buildPendingMediaVideoResult(
                detail?.title || "Generate Media Video",
                detail?.currentStage || "Waiting for artifact",
                detail?.status || "queued",
            ));
        }
    }, [getJobDetail]);

    const saveVideoToGallery = useCallback(async () => {
        if (!activeVideoBatchId) {
            setVideoSaveError("This video package is not persisted yet.");
            return;
        }
        setIsSavingVideoToGallery(true);
        setVideoSaveNotice(null);
        setVideoSaveError(null);
        try {
            const res = await fetch(`/api/videos/batches/${activeVideoBatchId}/save`, {
                method: "POST",
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload?.error || "Video save to gallery failed");
            }
            setVideoSaveNotice(
                `Saved to gallery and synced to bucket - uploaded: ${payload.uploaded ?? 0}, skipped: ${payload.skipped ?? 0}, failed: ${payload.failed ?? 0}`,
            );
        } catch (e) {
            const message = e instanceof Error ? e.message : "Video save to gallery failed";
            setVideoSaveError(message);
        } finally {
            setIsSavingVideoToGallery(false);
        }
    }, [activeVideoBatchId]);

    useEffect(() => {
        if (activeTab !== "songs") return;
        const requestedJobId = searchParams.get("jobId");
        if (requestedJobId) {
            void selectMediaJob(requestedJobId);
            return;
        }
        if (!activeMediaJobId && mediaAudioJobs.length > 0) {
            void selectMediaJob(mediaAudioJobs[0].jobId);
        }
    }, [activeMediaJobId, activeTab, mediaAudioJobs, searchParams, selectMediaJob]);

    useEffect(() => {
        if (activeTab !== "videos") return;
        const requestedJobId = searchParams.get("jobId");
        if (requestedJobId) {
            void selectVideoJob(requestedJobId);
            return;
        }
        if (!activeVideoJobId && mediaVideoJobs.length > 0) {
            void selectVideoJob(mediaVideoJobs[0].jobId);
        }
    }, [activeTab, activeVideoJobId, mediaVideoJobs, searchParams, selectVideoJob]);

    const updateMetadata = useCallback(async (filename: string, metadata: any) => {
        if (!activeTextureBatch) return;

        try {
            const res = await fetch(`/api/textures/batches/${activeTextureBatch.batchId}/textures/${filename}/metadata`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ metadata }),
            });

            if (res.ok) {
                // Refresh manifest
                const mRes = await fetch(`/api/textures/batches/${activeTextureBatch.batchId}`);
                if (mRes.ok) {
                    const refreshed: TextureBatchManifest = await mRes.json();
                    setActiveTextureBatch(refreshed);
                }
            } else {
                const msg = await res.text();
                throw new Error(msg || `HTTP ${res.status}`);
            }
        } catch (e: any) {
            setError(e.message || "Failed to update metadata");
        }
    }, [activeTextureBatch]);

    const handleAddToPack = useCallback(async (packId: string) => {
        if (selectedItems.length === 0) return;

        setIsPackSaving(true);
        try {
            const targetPack = packs.find(p => p.packId === packId);
            if (!targetPack) throw new Error("Pack not found");

            let mergedTextures = [...targetPack.textures];
            let mergedSprites = [...targetPack.sprites];

            if (activeTab === "sprites") {
                if (!activeSpriteBatch) return;
                const batchId = activeSpriteBatch.batchId;
                const newSprites = selectedItems.map(spriteId => ({
                    batchId,
                    spriteId,
                    url: activeSpriteBatch.sprites.find(s => s.spriteId === spriteId)?.previewUrl || ""
                }));

                for (const s of newSprites) {
                    if (!mergedSprites.some(existing => existing.batchId === s.batchId && existing.spriteId === s.spriteId)) {
                        mergedSprites.push(s);
                    }
                }
            } else {
                if (!activeTextureBatch) return;
                const batchId = activeTextureBatch.batchId;
                const newTextures = selectedItems.map(filename => ({
                    batchId,
                    filename,
                    url: `/api/textures/${batchId}/${filename}`,
                    metadata: activeTextureBatch.textures.find(t => t.filename === filename)?.metadata || {}
                }));

                for (const t of newTextures) {
                    if (!mergedTextures.some(existing => existing.batchId === t.batchId && existing.filename === t.filename)) {
                        mergedTextures.push(t);
                    }
                }
            }

            const res = await fetch(`/api/packs/${packId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: targetPack.name,
                    description: targetPack.description,
                    grouping: targetPack.grouping,
                    textures: mergedTextures,
                    sprites: mergedSprites,
                }),
            });

            if (res.ok) {
                await loadPacks();
                setSelectedItems([]);
                setIsAddToPackModalOpen(false);
            } else {
                throw new Error(await res.text());
            }
        } catch (e: any) {
            console.error("Add to pack failed", e);
            setError(e.message || "Add to pack failed");
        } finally {
            setIsPackSaving(false);
        }
    }, [activeTextureBatch, activeSpriteBatch, activeTab, selectedItems, packs, loadPacks]);

    const handleCreatePack = useCallback(async () => {
        if (!newPackName.trim()) return;
        setIsPackSaving(true);
        try {
            const res = await fetch("/api/packs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: newPackName.trim() }),
            });
            if (res.ok) {
                await loadPacks();
                setNewPackName("");
            } else {
                throw new Error(await res.text());
            }
        } catch (e: any) {
            setError(e.message || "Create pack failed");
        } finally {
            setIsPackSaving(false);
        }
    }, [newPackName, loadPacks]);

    const handleAssignPackToGrouping = async () => {
        if (!assigningPackId) return;

        setIsPackSaving(true);
        try {
            const pack = packs.find(p => p.packId === assigningPackId);
            if (!pack) return;

            const res = await fetch(`${API_BASE}/api/packs/${assigningPackId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...pack,
                    grouping: {
                        type: tempPackGroupingType,
                        name: tempPackGroupingName,
                        description: tempPackGroupingDescription
                    }
                })
            });

            if (res.ok) {
                await loadPacks();
                setIsAssigningPack(false);
                setAssigningPackId(null);
            } else {
                throw new Error(await res.text());
            }
        } catch (err: any) {
            console.error("Failed to assign pack:", err);
            setError(err.message || "Failed to assign pack");
        } finally {
            setIsPackSaving(false);
        }
    };

    const downloadIcon = useCallback((url: string) => {
        const a = document.createElement("a");
        a.href = url;
        a.download = url.split("/").pop() || "icon.png";
        a.click();
    }, []);

    // ── Export icons to code ──
    const handleExport = useCallback(async () => {
        if (activeTab === "sprites") {
            setError("Sprite batches do not export through the code exporter.");
            return;
        }
        setIsExporting(true);
        setExportResult(null);
        try {
            const endpoint = activeTab === "icons" ? "/api/icons/export" : "/api/textures/export";
            const res = await fetch(endpoint, { method: "POST" });
            if (!res.ok) {
                const msg = await res.text();
                throw new Error(msg || `HTTP ${res.status}`);
            }
            const data = await res.json();
            setExportResult({
                totalIcons: data.totalIcons || data.totalTextures || 0,
                totalBatches: data.totalBatches
            });
            setTimeout(() => setExportResult(null), 4000);
        } catch (e: any) {
            setError(e.message || "Export failed");
        } finally {
            setIsExporting(false);
        }
    }, [activeTab]);

    // ── Rename batch ──
    const startRename = useCallback(() => {
        if (activeTab === "icons" && activeBatch) {
            setRenameValue(activeBatch.batchName || "");
            setIsRenaming(true);
        } else if ((activeTab === "battlemaps" || activeTab === "world-assets" || activeTab === "game-assets" || activeTab === "ecology-illustrations") && activeTextureBatch) {
            setRenameValue(activeTextureBatch.batchName || "");
            setIsRenaming(true);
        } else if (activeTab === "sprites" && activeSpriteBatch) {
            setRenameValue(activeSpriteBatch.batchName || "");
            setIsRenaming(true);
        }
    }, [activeTab, activeBatch, activeTextureBatch, activeSpriteBatch]);

    const cancelRename = useCallback(() => {
        setIsRenaming(false);
        setRenameValue("");
    }, []);

    const confirmRename = useCallback(async () => {
        const batch =
            activeTab === "icons" ? activeBatch :
                activeTab === "sprites" ? activeSpriteBatch :
                    activeTextureBatch;
        if (!batch || !renameValue.trim()) return;

        setIsRenameSaving(true);
        try {
            const endpoint = activeTab === "icons"
                ? `/api/icons/batches/${batch.batchId}/rename`
                : activeTab === "sprites"
                    ? `/api/sprites/batches/${batch.batchId}/rename`
                    : `/api/textures/batches/${batch.batchId}/rename`;

            const res = await fetch(endpoint, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newName: renameValue.trim() }),
            });
            if (res.ok) {
                if (activeTab === "icons") {
                    const data: BatchManifest = await res.json();
                    setActiveBatch(data);
                    await loadBatches();
                } else if (activeTab === "sprites") {
                    const data: SpriteBatchManifest = await res.json();
                    setActiveSpriteBatch(data);
                    await loadSpriteBatches();
                } else {
                    const data: TextureBatchManifest = await res.json();
                    setActiveTextureBatch(data);
                    await loadTextureBatches();
                }
                setIsRenaming(false);
                setRenameValue("");
            } else {
                const msg = await res.text();
                throw new Error(msg || `HTTP ${res.status}`);
            }
        } catch (e: any) {
            setError(e.message || "Rename failed");
        } finally {
            setIsRenameSaving(false);
        }
    }, [activeBatch, activeSpriteBatch, activeTextureBatch, renameValue, activeTab, loadBatches, loadSpriteBatches, loadTextureBatches]);

    // ── Regenerate Icon handler ──
    const handleRegenerateIcon = useCallback(async (icon: BatchIcon) => {
        const hasContent = tempIconItem.trim() || tempIconStyle.trim();
        if (!activeBatch || !hasContent) return;

        setRegeneratingIconFilename(icon.filename);
        try {
            const payload: any = {
                itemPrompt: tempIconItem.trim(),
                stylePrompt: tempIconStyle.trim(),
                temperature: temperature
            };

            // Priority: Local ref image > Global ref image
            if (tempIconRefImage) {
                payload.base64Image = tempIconRefImage;
            } else if (referenceImage) {
                payload.base64Image = referenceImage;
            }

            const res = await fetch(`/api/icons/batches/${activeBatch.batchId}/icons/${icon.filename}/regenerate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const msg = await res.text();
                throw new Error(msg || `HTTP ${res.status}`);
            }

            // Refresh only the manifest to get the new URL/prompt
            // We append a timestamp to the URL to force browser refresh if filename is same
            const mRes = await fetch(`/api/icons/batches/${activeBatch.batchId}`);
            if (mRes.ok) {
                const refreshed: BatchManifest = await mRes.json();
                setActiveBatch(refreshed);
                setLastRefreshedAt(Date.now());
            }
            setEditingIconFilename(null);
        } catch (e: any) {
            setError(e.message || "Regeneration failed");
        } finally {
            setRegeneratingIconFilename(null);
        }
    }, [activeBatch, tempIconItem, tempIconStyle, referenceImage]);

    const handleRegenerateTexture = useCallback(async (texture: BatchTexture) => {
        const hasContent = tempIconItem.trim() || tempIconStyle.trim();
        if (!activeTextureBatch || !hasContent) return;

        setRegeneratingTextureFilename(texture.filename);
        try {
            const payload: any = {
                itemPrompt: tempIconItem.trim(),
                stylePrompt: tempIconStyle.trim(),
                temperature: temperature
            };

            if (tempIconRefImage) {
                payload.base64Image = tempIconRefImage;
            } else if (referenceImage) {
                payload.base64Image = referenceImage;
            }

            const res = await fetch(`/api/textures/batches/${activeTextureBatch.batchId}/textures/${texture.filename}/regenerate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const msg = await res.text();
                throw new Error(msg || `HTTP ${res.status}`);
            }

            const mRes = await fetch(`/api/textures/batches/${activeTextureBatch.batchId}`);
            if (mRes.ok) {
                const refreshed: TextureBatchManifest = await mRes.json();
                setActiveTextureBatch(refreshed);
                setLastRefreshedAt(Date.now());
            }
            setEditingTextureFilename(null);
        } catch (e: any) {
            setError(e.message || "Regeneration failed");
        } finally {
            setRegeneratingTextureFilename(null);
        }
    }, [activeTextureBatch, tempIconItem, tempIconStyle, referenceImage, temperature]);

    const startEditingIcon = useCallback((icon: BatchIcon) => {
        setEditingIconFilename(icon.filename);
        setTempIconRefImage(null);
        if (icon.itemPrompt || icon.stylePrompt) {
            setTempIconItem(icon.itemPrompt || "");
            setTempIconStyle(icon.stylePrompt || "");
        } else {
            setTempIconItem("");
            setTempIconStyle(icon.prompt);
        }
    }, []);

    const startEditingTexture = useCallback((texture: BatchTexture) => {
        setEditingTextureFilename(texture.filename);
        setTempIconRefImage(null);
        if (texture.itemPrompt || texture.stylePrompt) {
            setTempIconItem(texture.itemPrompt || "");
            setTempIconStyle(texture.stylePrompt || "");
        } else {
            setTempIconItem("");
            setTempIconStyle(texture.prompt);
        }
    }, []);

    const handleLocalImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = (reader.result as string).split(",")[1];
            setTempIconRefImage(base64);
        };
        reader.readAsDataURL(file);
    };

    // ── Icon Assignment Handler ──
    useEffect(() => {
        if (assigningIcon) {
            GameRegistry.fetchFromBackend(API_BASE);
        }
    }, [assigningIcon]);

    useEffect(() => {
        if (assigningSprite) {
            void refreshRegistry();
        }
    }, [assigningSprite, refreshRegistry]);

    const getAvailableEntities = () => {
        switch (assignCategory) {
            case "traits": return GameRegistry.getAllTraits();
            case "occupations": return GameRegistry.getAllOccupations();
            case "items": return GameRegistry.getAllItems();
            case "skills": return GameRegistry.getAllSkills();
            case "characters": return GameRegistry.getAllCharacters();
            default: return [];
        }
    };

    const handleAssignIcon = async () => {
        if (!assigningIcon || !assignEntityId) return;
        setIsAssigning(true);
        setError(null);
        try {
            const entityArray = getAvailableEntities();
            const entity = (entityArray as any[]).find(e => e.id === assignEntityId);
            if (!entity) throw new Error("Entity not found");

            const updatedEntity = { ...entity, icon: assigningIcon.url };
            const endpoint = `/api/data/${assignCategory}`;

            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedEntity)
            });

            if (!res.ok) throw new Error(`Failed to assign icon: ${res.statusText}`);

            await GameRegistry.fetchFromBackend(API_BASE);
            setAssigningIcon(null);
            setAssignEntityId("");
        } catch (e: any) {
            setError(e.message || "Failed to assign icon");
        } finally {
            setIsAssigning(false);
        }
    };

    const handleAssignSprite = useCallback(async () => {
        if (!assigningSprite || !activeSpriteBatch || !assignSpriteTargetId) return;
        setIsAssigningSprite(true);
        setError(null);
        try {
            await bindSpriteToTarget(assigningSprite, activeSpriteBatch.batchId, assignSpriteTargetKind, assignSpriteTargetId);
            setAssigningSprite(null);
        } catch (e: any) {
            setError(e.message || "Failed to assign sprite");
        } finally {
            setIsAssigningSprite(false);
        }
    }, [activeSpriteBatch, assignSpriteTargetId, assignSpriteTargetKind, assigningSprite, bindSpriteToTarget]);

    // The raw line count (for UI display of pending items)
    const rawLineCount = iconListText.split("\n").filter(l => l.trim().length > 0).length;

    return (
        <div className="flex flex-col h-screen bg-[#070b12] text-gray-300 font-sans overflow-hidden">
            {/* ══ Tool-Specific Sub-Header ══ */}
            <div className="fixed top-16 left-0 right-0 z-30 bg-[#030508]/60 backdrop-blur-md border-b border-white/5 pointer-events-auto flex items-center justify-between px-6 h-12 shadow-2xl">
                <div className="flex items-center gap-4">
                    <h1 className="text-[10px] font-black tracking-[0.3em] text-white uppercase">ASSET GENERATOR</h1>

                    {/* Tab Switcher */}
                    <div className="flex items-center bg-white/5 p-1 rounded-lg border border-white/10 ml-4 scale-90">
                        <button
                            onClick={() => handleTabChange("icons")}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest transition-all ${activeTab === "icons"
                                ? "bg-[#E6E6FA]/20 text-[#E6E6FA] shadow-lg shadow-black/20"
                                : "text-gray-500 hover:text-gray-300"
                                }`}
                        >
                            ICONS
                        </button>
                        <button
                            onClick={() => handleTabChange("battlemaps")}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest transition-all ${activeTab === "battlemaps"
                                ? "bg-[#E6E6FA]/20 text-[#E6E6FA] shadow-lg shadow-black/20"
                                : "text-gray-500 hover:text-gray-300"
                                }`}
                        >
                            BATTLEMAPS
                        </button>
                        <button
                            onClick={() => handleTabChange("world-assets")}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest transition-all ${activeTab === "world-assets"
                                ? "bg-[#E6E6FA]/20 text-[#E6E6FA] shadow-lg shadow-black/20"
                                : "text-gray-500 hover:text-gray-300"
                                }`}
                        >
                            WORLD ASSETS
                        </button>
                        <button
                            onClick={() => handleTabChange("game-assets")}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest transition-all ${activeTab === "game-assets"
                                ? "bg-[#E6E6FA]/20 text-[#E6E6FA] shadow-lg shadow-black/20"
                                : "text-gray-500 hover:text-gray-300"
                                }`}
                        >
                            GAME ASSETS
                        </button>
                        <button
                            onClick={() => handleTabChange("ecology-illustrations")}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest transition-all ${activeTab === "ecology-illustrations"
                                ? "bg-[#E6E6FA]/20 text-[#E6E6FA] shadow-lg shadow-black/20"
                                : "text-gray-500 hover:text-gray-300"
                                }`}
                        >
                            ECOLOGY ILLUSTRATIONS
                        </button>
                        <button
                            onClick={() => handleTabChange("sprites")}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest transition-all ${activeTab === "sprites"
                                ? "bg-[#E6E6FA]/20 text-[#E6E6FA] shadow-lg shadow-black/20"
                                : "text-gray-500 hover:text-gray-300"
                                }`}
                        >
                            SPRITES
                        </button>
                        <button
                            onClick={() => handleTabChange("songs")}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest transition-all ${activeTab === "songs"
                                ? "bg-[#E6E6FA]/20 text-[#E6E6FA] shadow-lg shadow-black/20"
                                : "text-gray-500 hover:text-gray-300"
                                }`}
                        >
                            SONGS
                        </button>
                        <button
                            onClick={() => handleTabChange("videos")}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest transition-all ${activeTab === "videos"
                                ? "bg-[#E6E6FA]/20 text-[#E6E6FA] shadow-lg shadow-black/20"
                                : "text-gray-500 hover:text-gray-300"
                                }`}
                        >
                            VIDEOS
                        </button>
                        <button
                            onClick={() => handleTabChange("packs")}
                            className={`px-4 py-1.5 rounded-md text-[10px] font-bold tracking-widest transition-all ${activeTab === "packs"
                                ? "bg-[#E6E6FA]/20 text-[#E6E6FA] shadow-lg shadow-black/20"
                                : "text-gray-500 hover:text-gray-300"
                                }`}
                        >
                            PACKS
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-3 scale-90">
                    <button
                        onClick={handleExport}
                        disabled={isExporting || activeTab === "sprites" || activeTab === "songs" || activeTab === "videos" || (activeTab === "icons" ? batches.length === 0 : textureBatches.length === 0)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border transition-all text-[10px] font-bold tracking-[0.1em] ${isExporting
                            ? "border-white/5 bg-white/5 text-gray-500 cursor-wait"
                            : activeTab === "sprites" || activeTab === "songs" || activeTab === "videos" || (activeTab === "icons" ? batches.length === 0 : textureBatches.length === 0)
                                ? "border-white/5 bg-white/5 text-gray-600 cursor-not-allowed"
                                : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                            }`}
                    >
                        {isExporting ? "EXPORTING..." : "EXPORT TO CODE"}
                    </button>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 flex overflow-hidden pt-28">
                {/* ── Left Panel: Prompt & Settings (Hide for Packs) ── */}
                {activeTab !== "packs" && (
                    <aside className="w-[600px] shrink-0 border-r border-white/5 bg-[#0a0f16] flex flex-col p-4 overflow-hidden">
                        {/* Scrollable container for configuration sections */}
                        <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 mb-4">
                            {/* Prompts Section */}
                            <Card className="!bg-[#0f1520] !border-white/5 shrink-0">
                                <CardHeader className="!bg-transparent !border-white/5 !py-2.5">
                                    <h3 className="text-[9px] font-bold tracking-[0.15em] text-[#E6E6FA]">
                                        {activeTab === "icons" ? "PROMPTING" : activeTab === "ecology-illustrations" ? "ILLUSTRATION CONFIG" : activeTab === "songs" ? "MEDIA AUDIO CONFIG" : activeTab === "videos" ? "MEDIA VIDEO CONFIG" : "TEXTURE CONFIG"}
                                    </h3>
                                </CardHeader>
                                <CardContent className="space-y-3 max-h-[800px] overflow-y-auto">
                                    {activeTab === "songs" && (
                                        <div className="space-y-4">
                                            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                                                <p className="text-[8px] font-bold uppercase tracking-[0.15em] text-cyan-300">Gemini 3 Interleaved Demo</p>
                                                <p className="mt-1 text-[10px] text-gray-300">This flow demonstrates Gemini 3 function calling with one business tool that returns a unified media artifact: audio, image, title, description, and tags.</p>
                                            </div>
                                            <div>
                                                <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Category</label>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {(["ost", "ambience", "sfx"] as const).map((category) => (
                                                        <button
                                                            key={category}
                                                            onClick={() => setSongCategory(category)}
                                                            className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider border transition-all ${songCategory === category ? "bg-[#E6E6FA]/10 border-[#E6E6FA]/40 text-[#E6E6FA]" : "bg-white/[0.02] border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300"}`}
                                                        >
                                                            {category.toUpperCase()}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Style</label>
                                                    <select value={songGenre} onChange={(e) => setSongGenre(e.target.value)} className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-[#E6E6FA]/30">
                                                        {SONG_GENRE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                                                        <option value="custom">custom</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Duration</label>
                                                    <div className="rounded-lg border border-white/10 bg-[#080d14] px-3 py-3">
                                                        <Slider
                                                            min={5}
                                                            max={30}
                                                            step={1}
                                                            value={songDurationSeconds}
                                                            onChange={(value) => setSongDurationSeconds(Number(value))}
                                                        />
                                                        <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-widest text-gray-500">
                                                            <span>5s</span>
                                                            <span className="text-cyan-200">{songDurationSeconds}s</span>
                                                            <span>30s max</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Mood</label>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        {SONG_MOOD_OPTIONS.map((mood) => {
                                                            const selected = songMoods.includes(mood);
                                                            return (
                                                                <button
                                                                    key={mood}
                                                                    onClick={() => setSongMoods((current) => selected ? current.filter((value) => value !== mood) : current.length >= 3 ? [...current.slice(1), mood] : [...current, mood])}
                                                                    className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider border transition-all ${selected ? "bg-amber-500/10 border-amber-500/40 text-amber-200" : "bg-white/[0.02] border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300"}`}
                                                                >
                                                                    {mood}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Intent Notes</label>
                                                    <input type="text" value={songGlobalDirection} onChange={(e) => setSongGlobalDirection(e.target.value)} placeholder="combat opener, exploration bed, menu loop..." className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30" />
                                                    <label className="mt-3 block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Custom Style</label>
                                                    <input type="text" value={songGenreCustom} onChange={(e) => setSongGenreCustom(e.target.value)} placeholder="ruined desert western, corroded synth..." className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30" />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Texture Palette</label>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {SONG_INSTRUMENT_OPTIONS.map((instrument) => {
                                                            const selected = songInstrumentation.includes(instrument);
                                                            return (
                                                                <button
                                                                    key={instrument}
                                                                    onClick={() => setSongInstrumentation((current) => selected ? current.filter((value) => value !== instrument) : [...current, instrument])}
                                                                    className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider border transition-all ${selected ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-200" : "bg-white/[0.02] border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300"}`}
                                                                >
                                                                    {instrument}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Tempo</label>
                                                    <select value={songTempo} onChange={(e) => setSongTempo(e.target.value as typeof songTempo)} className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-[#E6E6FA]/30">
                                                        {(["very-slow", "slow", "medium", "fast"] as const).map((value) => <option key={value} value={value}>{value}</option>)}
                                                    </select>
                                                    <label className="mt-3 block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Rhythmic Feel</label>
                                                    <select value={songRhythmicFeel} onChange={(e) => setSongRhythmicFeel(e.target.value as typeof songRhythmicFeel)} className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-[#E6E6FA]/30">
                                                        {(["drone", "pulse", "driving", "syncopated", "free"] as const).map((value) => <option key={value} value={value}>{value}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Soundscape</label>
                                                    <input type="text" value={songSoundscape} onChange={(e) => setSongSoundscape(e.target.value)} placeholder="wind, ash, distant metal groans" className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30" />
                                                </div>
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Production Style</label>
                                                    <select value={songProductionStyle} onChange={(e) => setSongProductionStyle(e.target.value as typeof songProductionStyle)} className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-[#E6E6FA]/30">
                                                        {(["clean", "wide", "intimate", "lo-fi", "gritty"] as const).map((value) => <option key={value} value={value}>{value}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Constraints</label>
                                                <input type="text" value={songNegativePrompt} onChange={(e) => setSongNegativePrompt(e.target.value)} placeholder="avoid bright pop energy, avoid dialogue..." className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30" />
                                            </div>
                                        </div>
                                    )}
                                    {activeTab === "videos" && (
                                        <div className="space-y-4">
                                            <div className="rounded-lg border border-fuchsia-500/20 bg-fuchsia-500/5 p-3">
                                                <p className="text-[8px] font-bold uppercase tracking-[0.15em] text-fuchsia-300">Gemini 3 Interleaved Video</p>
                                                <p className="mt-1 text-[10px] text-gray-300">One business tool returns a unified cinematic package: video, poster, narration script, timed TTS segments, and metadata.</p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Category</label>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {(["cinematic", "cutscene", "trailer", "lore"] as const).map((category) => (
                                                            <button
                                                                key={category}
                                                                onClick={() => setVideoCategory(category)}
                                                                className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider border transition-all ${videoCategory === category ? "bg-fuchsia-500/10 border-fuchsia-500/40 text-fuchsia-200" : "bg-white/[0.02] border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300"}`}
                                                            >
                                                                {category.toUpperCase()}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Duration</label>
                                                    <select value={videoDurationSeconds} onChange={(event) => setVideoDurationSeconds(Number(event.target.value) as 4 | 6 | 8)} className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-fuchsia-400/40">
                                                        {[4, 6, 8].map((value) => <option key={value} value={value}>{value}s</option>)}
                                                    </select>
                                                    <label className="mt-3 block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Aspect Ratio</label>
                                                    <select value={videoAspectRatio} onChange={(event) => setVideoAspectRatio(event.target.value as "16:9" | "9:16")} className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 focus:outline-none focus:border-fuchsia-400/40">
                                                        {(["16:9", "9:16"] as const).map((value) => <option key={value} value={value}>{value}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Visual Style</label>
                                                    <input type="text" value={videoVisualStyle} onChange={(event) => setVideoVisualStyle(event.target.value)} placeholder="ruined neon realism, smoky tribal war..." className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-fuchsia-400/40" />
                                                </div>
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Camera Direction</label>
                                                    <input type="text" value={videoCameraDirection} onChange={(event) => setVideoCameraDirection(event.target.value)} placeholder="slow push through fire, rising drone..." className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-fuchsia-400/40" />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Mood / Emotion</label>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {SONG_MOOD_OPTIONS.map((mood) => {
                                                        const selected = videoMoods.includes(mood);
                                                        return (
                                                            <button
                                                                key={mood}
                                                                onClick={() => setVideoMoods((current) => selected ? current.filter((value) => value !== mood) : current.length >= 3 ? [...current.slice(1), mood] : [...current, mood])}
                                                                className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider border transition-all ${selected ? "bg-amber-500/10 border-amber-500/40 text-amber-200" : "bg-white/[0.02] border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300"}`}
                                                            >
                                                                {mood}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Narration Intent</label>
                                                    <input type="text" value={videoNarrationIntent} onChange={(event) => setVideoNarrationIntent(event.target.value)} placeholder="introduce danger, frame the raid..." className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-fuchsia-400/40" />
                                                </div>
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Narration Tone</label>
                                                    <input type="text" value={videoNarrationTone} onChange={(event) => setVideoNarrationTone(event.target.value)} placeholder="grave, legendary, intimate..." className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-fuchsia-400/40" />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Narrator Voice</label>
                                                    <input type="text" value={videoVoiceName} onChange={(event) => setVideoVoiceName(event.target.value)} placeholder="Charon" className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-fuchsia-400/40" />
                                                </div>
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Global Direction</label>
                                                    <input type="text" value={videoGlobalDirection} onChange={(event) => setVideoGlobalDirection(event.target.value)} placeholder="grim opener, no UI, no text overlays..." className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-fuchsia-400/40" />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Negative Prompt</label>
                                                    <input type="text" value={videoNegativePrompt} onChange={(event) => setVideoNegativePrompt(event.target.value)} placeholder="avoid comedy, avoid bright daylight..." className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-fuchsia-400/40" />
                                                </div>
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Keep Veo Audio Under Narration</label>
                                                    <button type="button" onClick={() => setKeepVeoAudio((current) => !current)} className={`mt-0.5 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs transition-all ${keepVeoAudio ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-white/10 bg-[#080d14] text-gray-400"}`}>
                                                        <span>{keepVeoAudio ? "enabled" : "disabled"}</span>
                                                        <span className="text-[9px] uppercase tracking-[0.18em]">{keepVeoAudio ? "on" : "off"}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {activeTab === "battlemaps" && (
                                        <>
                                            <div>
                                                <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">
                                                    Category
                                                </label>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {["battle_assets", "character", "item"].map((cat) => (
                                                        <button
                                                            key={cat}
                                                            onClick={() => setTextureCategory(cat)}
                                                            className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider border transition-all ${textureCategory === cat
                                                                ? "bg-[#E6E6FA]/10 border-[#E6E6FA]/40 text-[#E6E6FA]"
                                                                : "bg-white/[0.02] border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300"
                                                                }`}
                                                        >
                                                            {cat.replace("_", " ").toUpperCase()}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {textureCategory === "battle_assets" && (
                                                <div>
                                                    <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">
                                                        Sub-Category
                                                    </label>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        {["ground", "obstacle", "battlemap"].map((sub) => (
                                                            <button
                                                                key={sub}
                                                                onClick={() => setTextureSubCategory(sub)}
                                                                className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider border transition-all ${textureSubCategory === sub
                                                                    ? "bg-[#E6E6FA]/10 border-[#E6E6FA]/40 text-[#E6E6FA]"
                                                                    : "bg-white/[0.02] border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300"
                                                                    }`}
                                                            >
                                                                {sub.toUpperCase()}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {activeTab === "ecology-illustrations" && (
                                        <div>
                                            <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">
                                                Illustration Focus
                                            </label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {[
                                                    { id: "flora", label: "FLORA" },
                                                    { id: "fauna", label: "FAUNA" },
                                                    { id: "", label: "GENERAL" },
                                                ].map((option) => (
                                                    <button
                                                        key={option.label}
                                                        onClick={() => setTextureSubCategory(option.id)}
                                                        className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider border transition-all ${textureSubCategory === option.id
                                                            ? "bg-[#E6E6FA]/10 border-[#E6E6FA]/40 text-[#E6E6FA]"
                                                            : "bg-white/[0.02] border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300"
                                                            }`}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {activeTab === "sprites" && (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Sprite Type</label>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {(["animal", "monster", "human", "mutant", "construct"] as const).map((type) => (
                                                        <button
                                                            key={type}
                                                            onClick={() => setSpriteType(type)}
                                                            className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider border transition-all ${spriteType === type
                                                                ? "bg-[#E6E6FA]/10 border-[#E6E6FA]/40 text-[#E6E6FA]"
                                                                : "bg-white/[0.02] border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300"
                                                                }`}
                                                        >
                                                            {type.toUpperCase()}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">Output Mode</label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {(["directional-set", "illustration"] as const).map((mode) => (
                                                        <button
                                                            key={mode}
                                                            onClick={() => setSpriteMode(mode)}
                                                            className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider border transition-all ${spriteMode === mode
                                                                ? "bg-[#E6E6FA]/10 border-[#E6E6FA]/40 text-[#E6E6FA]"
                                                                : "bg-white/[0.02] border-white/5 text-gray-500 hover:border-white/20 hover:text-gray-300"
                                                                }`}
                                                        >
                                                            {mode === "directional-set" ? "DIRECTIONAL" : "ILLUSTRATION"}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className={`rounded-lg border p-3 ${spriteMode === "illustration" ? "border-white/5 bg-white/[0.02] opacity-60" : "border-white/10 bg-black/20"}`}>
                                                <div className="flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="text-[8px] uppercase tracking-widest text-gray-500">Companion Illustration</p>
                                                        <p className="mt-1 text-[10px] text-gray-400">Generate the reference illustration together with the directional sprite set.</p>
                                                    </div>
                                                    <button
                                                        onClick={() => spriteMode !== "illustration" && setIncludeSpriteIllustration((prev) => !prev)}
                                                        disabled={spriteMode === "illustration"}
                                                        className={`relative h-6 w-11 rounded-full transition-all ${includeSpriteIllustration ? "bg-emerald-500/40" : "bg-white/10"} ${spriteMode === "illustration" ? "cursor-not-allowed" : ""}`}
                                                    >
                                                        <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${includeSpriteIllustration ? "left-5.5" : "left-0.5"}`} />
                                                    </button>
                                                </div>
                                            </div>

                                            {(spriteTargetKind || spriteTargetId) && (
                                                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                                                    <p className="text-[8px] font-bold uppercase tracking-[0.15em] text-emerald-400">Target Binding</p>
                                                    <p className="mt-1 text-[10px] text-gray-300">
                                                        {spriteTargetKind || "unbound"} {currentSpriteTargetLabel ? `• ${currentSpriteTargetLabel}` : ""}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {activeTab !== "songs" && activeTab !== "videos" ? (
                                        <>
                                            <div>
                                                <label className="block text-[8px] text-gray-500 tracking-wider mb-1.5 uppercase">
                                                    {activeTab === "icons" ? "Global Modifier" : "Global Style Modifier"}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={stylePrompt}
                                                    onChange={(e) => setStylePrompt(e.target.value)}
                                                    placeholder={activeTab === "icons" ? "e.g. 'glowing dark-magic'" : "e.g. 'realistic metallic', 'stylized stone'"}
                                                    className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30 transition-colors font-mono"
                                                />
                                                <p className="text-[8px] text-gray-600 mt-1 uppercase tracking-wider">
                                                    Prefixed to every item in the list below.
                                                </p>
                                            </div>

                                            <div>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <label className="block text-[8px] text-gray-500 tracking-wider uppercase">
                                                        {activeTab === "icons" ? "Icon List" : activeTab === "battlemaps" ? "Battlemap List" : activeTab === "sprites" ? "Sprite Subject List" : activeTab === "ecology-illustrations" ? "Illustration Subject List" : "Asset List"}
                                                    </label>
                                                    <span className="text-[8px] text-[#E6E6FA] font-mono bg-[#E6E6FA]/10 px-1.5 py-0.5 rounded">
                                                        {rawLineCount} ITEMS
                                                    </span>
                                                </div>
                                                <textarea
                                                    value={iconListText}
                                                    onChange={(e) => setIconListText(e.target.value)}
                                                    placeholder={activeTab === "icons" ? "potion bottle\niron sword" : activeTab === "battlemaps" ? "cobblestone path\ndirt field" : activeTab === "sprites" ? "forest wolf\nash crawler" : activeTab === "ecology-illustrations" ? "emberhoof grazer natural-history plate\nash strider field-guide illustration" : "e.g. descriptive asset prompt"}
                                                    rows={4}
                                                    className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30 resize-none transition-colors font-mono leading-relaxed"
                                                />
                                            </div>
                                        </>
                                    ) : activeTab === "songs" ? (
                                        <>
                                            <div>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <label className="block text-[8px] text-gray-500 tracking-wider uppercase">Sound Brief</label>
                                                    <span className="text-[8px] text-[#E6E6FA] font-mono bg-[#E6E6FA]/10 px-1.5 py-0.5 rounded">
                                                        {iconListText.trim().length} CHARS
                                                    </span>
                                                </div>
                                                <textarea
                                                    value={iconListText}
                                                    onChange={(e) => setIconListText(e.target.value)}
                                                    placeholder={"A wind-scoured refinery ambience with slow metallic resonance, distant ash movement, and uneasy exploration tension."}
                                                    rows={5}
                                                    className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30 resize-none transition-colors font-mono leading-relaxed"
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div>
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <label className="block text-[8px] text-gray-500 tracking-wider uppercase">Video Brief</label>
                                                    <span className="text-[8px] text-[#E6E6FA] font-mono bg-[#E6E6FA]/10 px-1.5 py-0.5 rounded">
                                                        {iconListText.trim().length} CHARS
                                                    </span>
                                                </div>
                                                <textarea
                                                    value={iconListText}
                                                    onChange={(e) => setIconListText(e.target.value)}
                                                    placeholder={"A brutal night raid against tribal fighters, embers drifting through darkness, handheld advance, narrator framing the danger and momentum."}
                                                    rows={5}
                                                    className="w-full bg-[#080d14] border border-white/10 rounded-lg px-2.5 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-[#E6E6FA]/30 resize-none transition-colors font-mono leading-relaxed"
                                                />
                                            </div>
                                        </>
                                    )}


                                </CardContent>
                            </Card>
                            {/* Reference Image */}
                            {activeTab !== "songs" && activeTab !== "videos" && <Card className="!bg-[#0f1520] !border-white/5 shrink-0">
                                <CardHeader
                                    className="!bg-transparent !border-white/5 !py-2.5 flex flex-row items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
                                    onClick={() => setShowReferenceImage(!showReferenceImage)}
                                >
                                    <h3 className="text-[9px] font-bold tracking-[0.15em] text-[#E6E6FA]">REFERENCE IMAGE</h3>
                                    <svg className={`w-3 h-3 text-gray-500 transition-transform ${showReferenceImage ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </CardHeader>
                                {showReferenceImage && (
                                    <CardContent className="max-h-[160px] overflow-y-auto">
                                        <input
                                            type="file"
                                            accept="image/png, image/jpeg, image/webp"
                                            className="hidden"
                                            ref={fileInputRef}
                                            onChange={handleImageUpload}
                                        />

                                        {!referenceImage ? (
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="w-full h-20 border-2 border-dashed border-white/10 rounded-lg flex flex-col items-center justify-center gap-1.5 text-gray-500 hover:text-gray-300 hover:border-white/20 transition-all bg-white/[0.02]"
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                                <span className="text-[9px] tracking-widest font-bold">UPLOAD IMAGE</span>
                                            </button>
                                        ) : (
                                            <div className="relative w-full h-20 rounded-lg overflow-hidden border border-[#E6E6FA]/30 group">
                                                <img
                                                    src={`data:image/png;base64,${referenceImage}`}
                                                    alt="Reference"
                                                    className="w-full h-full object-cover blur-[2px] opacity-50"
                                                />
                                                <img
                                                    src={`data:image/png;base64,${referenceImage}`}
                                                    alt="Reference"
                                                    className="absolute inset-0 w-full h-full object-contain"
                                                />
                                                <button
                                                    onClick={clearReferenceImage}
                                                    className="absolute top-2 right-2 w-6 h-6 bg-black/50 backdrop-blur rounded text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80 hover:text-red-400"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>
                                        )}
                                        <p className="text-[8px] text-gray-600 mt-2 uppercase tracking-wider">
                                            Influences shape, color, and composition.
                                        </p>
                                    </CardContent>
                                )}
                            </Card>}

                            {/* Settings */}
                            {activeTab !== "songs" && activeTab !== "videos" && <Card className="!bg-[#0f1520] !border-white/5 shrink-0">
                                <CardHeader
                                    className="!bg-transparent !border-white/5 !py-2.5 flex flex-row items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
                                    onClick={() => setShowSettings(!showSettings)}
                                >
                                    <h3 className="text-[9px] font-bold tracking-[0.15em] text-[#E6E6FA]">SETTINGS</h3>
                                    <svg className={`w-3 h-3 text-gray-500 transition-transform ${showSettings ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </CardHeader>
                                {showSettings && (
                                    <CardContent className="space-y-3 max-h-[180px] overflow-y-auto">
                                        <Slider
                                            label="TEMPERATURE"
                                            value={temperature}
                                            min={0.1}
                                            max={1.0}
                                            step={0.1}
                                            format={(v) => v.toFixed(1)}
                                            onChange={setTemperature}
                                        />
                                        {activeTab === "battlemaps" && (
                                            <Slider
                                                label="VARIATIONS PER PROMPT"
                                                value={textureVariations}
                                                min={1}
                                                max={10}
                                                step={1}
                                                format={(v) => v.toString()}
                                                onChange={setTextureVariations}
                                            />
                                        )}
                                    </CardContent>
                                )}
                            </Card>}
                        </div>

                        {/* Pinned Action Area */}
                        <div className="shrink-0 pt-2 flex flex-col gap-2 border-t border-white/5">
                            <Button
                                onClick={handleGenerateClick}
                                disabled={rawLineCount === 0 || isGenerating}
                                className={`!w-full !py-3 !text-[11px] !font-bold !tracking-[0.2em] !rounded-lg transition-all ${isGenerating
                                    ? "!bg-[#E6E6FA]/10 !text-[#E6E6FA]/50 !cursor-wait"
                                    : "!bg-[#E6E6FA]/20 !text-[#E6E6FA] hover:!bg-[#E6E6FA]/30 !border !border-[#E6E6FA]/20"
                                    }`}
                            >
                                {isGenerating ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <span className="inline-block w-3 h-3 border-2 border-[#E6E6FA]/30 border-t-[#E6E6FA] rounded-full animate-spin" />
                                        GENERATING {genProgress.total} {activeTab.toUpperCase()}...
                                    </span>
                                ) : (
                                    activeTab === "songs"
                                        ? "GENERATE MEDIA ARTIFACT"
                                        : activeTab === "videos"
                                            ? "GENERATE VIDEO PACKAGE"
                                        : `⚡ BAKE ${rawLineCount > 0 ? rawLineCount : ""} ${activeTab === "icons" ? "ICON" : activeTab === "battlemaps" ? "BATTLEMAP" : activeTab === "sprites" ? "SPRITE" : activeTab === "ecology-illustrations" ? "ILLUSTRATION" : "ASSET"}${rawLineCount !== 1 ? "S" : ""}`
                                )}
                            </Button>

                            {error && (
                                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                                    {error}
                                </div>
                            )}
                        </div>
                    </aside>
                )}

                {/* ── Middle: Batch Browser ── */}
                <div className="w-[200px] shrink-0 border-r border-white/5 bg-[#080d14] overflow-y-auto">
                    <div className="p-3 border-b border-white/5">
                        <h3 className="text-[10px] font-bold tracking-[0.15em] text-gray-500 uppercase">
                            {activeTab === "icons" ? "Icon Batches" : activeTab === "battlemaps" ? "Battlemap Batches" : activeTab === "sprites" ? "Sprite Batches" : activeTab === "songs" ? "Media Jobs" : activeTab === "videos" ? "Video Jobs" : activeTab === "ecology-illustrations" ? "Illustration Batches" : "Asset Batches"}
                        </h3>
                    </div>
                    {activeTab === "icons" ? (
                        batches.length === 0 ? (
                            <div className="p-4 text-center text-[10px] text-gray-600 tracking-wider uppercase">
                                No Icon Batches
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {batches.map((batch) => (
                                    <button
                                        key={batch.batchId}
                                        onClick={() => selectBatch(batch.batchId)}
                                        className={`flex items-center gap-3 px-3 py-3 text-left border-b border-white/5 transition-all ${activeBatch?.batchId === batch.batchId
                                            ? "bg-[#E6E6FA]/10 border-l-2 !border-l-[#E6E6FA]/50"
                                            : "hover:bg-white/[0.03]"
                                            }`}
                                    >
                                        {/* Thumbnail */}
                                        {batch.thumbnailUrl ? (
                                            <img
                                                src={batch.thumbnailUrl}
                                                alt=""
                                                className="w-8 h-8 rounded border border-white/10 shrink-0 object-cover"
                                            />
                                        ) : (
                                            <div className="w-8 h-8 rounded border border-white/10 bg-white/5 shrink-0 flex items-center justify-center text-xs">🎨</div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[10px] font-bold text-gray-300 tracking-wider truncate">
                                                {batch.batchName || batch.batchId.substring(0, 8).toUpperCase()}
                                            </div>
                                            <div className="text-[9px] text-gray-600">
                                                {batch.iconCount} icon{batch.iconCount !== 1 ? "s" : ""} · {new Date(batch.createdAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )
                    ) : activeTab === "sprites" ? (
                        spriteBatches.length === 0 ? (
                            <div className="p-4 text-center text-[10px] text-gray-600 tracking-wider uppercase">
                                No Sprite Batches
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {spriteBatches.map((batch) => (
                                    <button
                                        key={batch.batchId}
                                        onClick={() => selectSpriteBatch(batch.batchId)}
                                        className={`flex items-center gap-3 px-3 py-3 text-left border-b border-white/5 transition-all ${activeSpriteBatch?.batchId === batch.batchId
                                            ? "bg-[#E6E6FA]/10 border-l-2 !border-l-[#E6E6FA]/50"
                                            : "hover:bg-white/[0.03]"
                                            }`}
                                    >
                                        {batch.thumbnailUrl ? (
                                            <img
                                                src={batch.thumbnailUrl}
                                                alt=""
                                                className="w-8 h-8 rounded border border-white/10 shrink-0 object-cover"
                                            />
                                        ) : (
                                            <div className="w-8 h-8 rounded border border-white/10 bg-white/5 shrink-0 flex items-center justify-center text-xs">🧬</div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[10px] font-bold text-gray-300 tracking-wider truncate">
                                                {batch.batchName || batch.batchId.substring(0, 8).toUpperCase()}
                                            </div>
                                            <div className="text-[8px] text-gray-500 uppercase tracking-[0.05em] mb-0.5">
                                                {batch.spriteType} · {batch.mode === "directional-set" ? "directional" : "illustration"}{batch.includesIllustration ? " + ref" : ""}
                                            </div>
                                            <div className="text-[9px] text-gray-600">
                                                {batch.spriteCount} sprites · {new Date(batch.createdAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )
                    ) : activeTab === "songs" ? (
                        mediaAudioJobs.length === 0 ? (
                            <div className="p-4 text-center text-[10px] text-gray-600 tracking-wider uppercase">
                                No Media Jobs
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {mediaAudioJobs.map((job) => (
                                    <button
                                        key={job.jobId}
                                        onClick={() => void selectMediaJob(job.jobId)}
                                        className={`flex items-center gap-3 px-3 py-3 text-left border-b border-white/5 transition-all ${activeMediaJobId === job.jobId
                                            ? "bg-[#E6E6FA]/10 border-l-2 !border-l-[#E6E6FA]/50"
                                            : "hover:bg-white/[0.03]"
                                            }`}
                                    >
                                        <div className="w-8 h-8 rounded border border-white/10 bg-white/5 shrink-0 flex items-center justify-center text-xs">AUDIO</div>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[10px] font-bold text-gray-300 tracking-wider truncate">
                                                {job.title}
                                            </div>
                                            <div className="text-[8px] text-gray-500 uppercase tracking-[0.05em] mb-0.5">
                                                {job.status} · {job.currentStage}
                                            </div>
                                            <div className="text-[9px] text-gray-600">
                                                {new Date(job.updatedAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )
                    ) : activeTab === "videos" ? (
                        mediaVideoJobs.length === 0 ? (
                            <div className="p-4 text-center text-[10px] text-gray-600 tracking-wider uppercase">
                                No Video Jobs
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {mediaVideoJobs.map((job) => (
                                    <button
                                        key={job.jobId}
                                        onClick={() => void selectVideoJob(job.jobId)}
                                        className={`flex items-center gap-3 px-3 py-3 text-left border-b border-white/5 transition-all ${activeVideoJobId === job.jobId
                                            ? "bg-[#E6E6FA]/10 border-l-2 !border-l-[#E6E6FA]/50"
                                            : "hover:bg-white/[0.03]"
                                            }`}
                                    >
                                        <div className="w-8 h-8 rounded border border-white/10 bg-white/5 shrink-0 flex items-center justify-center text-xs">VIDEO</div>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[10px] font-bold text-gray-300 tracking-wider truncate">
                                                {job.title}
                                            </div>
                                            <div className="text-[8px] text-gray-500 uppercase tracking-[0.05em] mb-0.5">
                                                {job.status} · {job.currentStage}
                                            </div>
                                            <div className="text-[9px] text-gray-600">
                                                {new Date(job.updatedAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )
                    ) : activeTab === "packs" ? (
                        packs.length === 0 ? (
                            <div className="p-4 text-center text-[10px] text-gray-600 tracking-wider uppercase">
                                No Packs Confirmed
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {packs.map((pack) => (
                                    <button
                                        key={pack.packId}
                                        onClick={() => setActivePack(pack)}
                                        className={`flex items-center gap-3 px-3 py-3 text-left border-b border-white/5 transition-all ${activePack?.packId === pack.packId
                                            ? "bg-[#E6E6FA]/10 border-l-2 !border-l-[#E6E6FA]/50"
                                            : "hover:bg-white/[0.03]"
                                            }`}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[10px] font-bold text-gray-300 tracking-wider truncate">
                                                {pack.name || pack.packId.substring(0, 8).toUpperCase()}
                                            </div>
                                            {pack.grouping && (
                                                <div className="text-[8px] text-gray-500 uppercase tracking-[0.05em] mb-0.5 truncate">
                                                    GROUP: {pack.grouping.name} ({pack.grouping.type})
                                                </div>
                                            )}
                                            <div className="text-[9px] text-gray-600">
                                                {pack.textures.length} txtrs, {pack.sprites.length} sprs
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )
                    ) : (
                        filteredTextureBatches.length === 0 ? (
                            <div className="p-4 text-center text-[10px] text-gray-600 tracking-wider uppercase">
                                No {activeTab.replace("-", " ").toUpperCase()} Batches
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {filteredTextureBatches.map((batch) => (
                                    <button
                                        key={batch.batchId}
                                        onClick={() => selectTextureBatch(batch.batchId)}
                                        className={`flex items-center gap-3 px-3 py-3 text-left border-b border-white/5 transition-all ${activeTextureBatch?.batchId === batch.batchId
                                            ? "bg-[#E6E6FA]/10 border-l-2 !border-l-[#E6E6FA]/50"
                                            : "hover:bg-white/[0.03]"
                                            }`}
                                    >
                                        {/* Thumbnail */}
                                        {batch.thumbnailUrl ? (
                                            <img
                                                src={batch.thumbnailUrl}
                                                alt=""
                                                className="w-8 h-8 rounded border border-white/10 shrink-0 object-cover"
                                            />
                                        ) : (
                                            <div className="w-8 h-8 rounded border border-white/10 bg-white/5 shrink-0 flex items-center justify-center text-xs">🖼️</div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[10px] font-bold text-gray-300 tracking-wider truncate">
                                                {batch.batchName || batch.batchId.substring(0, 8).toUpperCase()}
                                            </div>
                                            <div className="text-[8px] text-gray-500 uppercase tracking-[0.05em] mb-0.5">
                                                {batch.category.replace("_", " ")} {batch.subCategory ? `· ${batch.subCategory}` : ""}
                                            </div>
                                            <div className="text-[9px] text-gray-600">
                                                {batch.textureCount} txtrs · {new Date(batch.createdAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )
                    )}
                </div>

                {/* ── Right: Gallery ── */}
                <main className="flex-1 overflow-y-auto p-8 relative">
                    {activeTab === "packs" ? (
                        !activePack ? (
                            <div className="flex flex-col items-center justify-center h-full text-center">
                                <div className="text-6xl mb-6 opacity-30">📦</div>
                                <h2 className="text-lg font-bold text-gray-500 tracking-wider mb-4">ASSET PACKS</h2>
                                <p className="text-sm text-gray-600 max-w-sm mb-6">
                                    Packs are curated collections of Game Assets. You can review available Packs or manually assign items to them.
                                </p>
                                <div className="flex gap-2 bg-[#0f1520] p-4 rounded-xl border border-white/10 shadow-xl w-80">
                                    <input
                                        type="text"
                                        placeholder="New Pack Name..."
                                        value={newPackName}
                                        onChange={(e) => setNewPackName(e.target.value)}
                                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-[#E6E6FA]/50"
                                    />
                                    <button
                                        onClick={handleCreatePack}
                                        disabled={!newPackName.trim() || isPackSaving}
                                        className="px-4 py-2 bg-emerald-500/20 text-emerald-400 font-bold text-[10px] tracking-wider rounded-lg border border-emerald-500/30 hover:bg-emerald-500/30 transition-all disabled:opacity-50"
                                    >
                                        CREATE
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                                    <div>
                                        <h2 className="text-xl font-bold tracking-[0.1em] text-[#E6E6FA] mb-1">
                                            {activePack.name}
                                        </h2>
                                        <p className="text-[10px] text-gray-500 tracking-widest uppercase">
                                            {activePack.textures.length} TEXTURES · {activePack.sprites.length} SPRITES · CREATED {new Date(activePack.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => {
                                                setAssigningPackId(activePack.packId);
                                                setTempPackGroupingType(activePack.grouping?.type || "biome");
                                                setTempPackGroupingName(activePack.grouping?.name || "");
                                                setTempPackGroupingDescription(activePack.grouping?.description || "");
                                                setIsAssigningPack(true);
                                            }}
                                            className="px-4 py-1.5 bg-purple-500/20 text-purple-400 font-bold text-[10px] tracking-wider rounded-lg border border-purple-500/30 hover:bg-purple-500/30 transition-all"
                                        >
                                            ASSIGN GROUP
                                        </button>
                                        <button
                                            onClick={() => setActivePack(null)}
                                            className="text-[10px] tracking-wider text-gray-600 hover:text-gray-300 transition-colors"
                                        >
                                            CLOSE DEFAULT VIEW
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <h3 className="text-[12px] font-bold text-gray-400 tracking-widest border-b border-white/5 pb-2">TEXTURES IN PACK</h3>
                                    {activePack.textures.length === 0 ? (
                                        <p className="text-[10px] text-gray-600 italic">No textures in this pack.</p>
                                    ) : (
                                        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
                                            {activePack.textures.map((txt) => {
                                                let url = txt.url;
                                                if (url && url.includes("/api/textures/batches/")) {
                                                    url = url.replace("/api/textures/batches/", "/api/textures/").replace("/textures/", "/");
                                                }
                                                return (
                                                    <div key={txt.url} className="relative group rounded-xl overflow-hidden bg-black/40 border border-white/10 hover:border-[#E6E6FA]/40 transition-all shadow-lg aspect-square">
                                                        <img src={`${url}?w=256`} alt="" className="w-full h-full object-cover" />
                                                        <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                                                            <p className="text-[9px] text-white font-bold truncate">{txt.filename}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    <h3 className="text-[12px] font-bold text-gray-400 tracking-widest border-b border-white/5 pb-2">SPRITES IN PACK</h3>
                                    {activePack.sprites.length === 0 ? (
                                        <p className="text-[10px] text-gray-600 italic">No sprites in this pack.</p>
                                    ) : (
                                        <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
                                            {activePack.sprites.map((sprite) => {
                                                let url = sprite.url;
                                                if (url && url.includes("/api/sprites/batches/")) {
                                                    url = url.replace("/api/sprites/batches/", "/api/sprites/").replace("/sprites/", "/");
                                                }
                                                return (
                                                    <div key={sprite.spriteId} className="relative group rounded-xl overflow-hidden bg-black/40 border border-white/10 hover:border-[#E6E6FA]/40 transition-all shadow-lg aspect-square">
                                                        <img src={url} alt="" className="w-full h-full object-contain" />
                                                        <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                                                            <p className="text-[9px] text-white font-bold truncate">{sprite.spriteId.substring(0, 8)}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    ) : ((activeTab === "icons" && !activeBatch) || (activeTab === "sprites" && !activeSpriteBatch) || (activeTab === "songs" && !activeMediaJob) || (activeTab === "videos" && !activeVideoJob) || ((activeTab === "battlemaps" || activeTab === "world-assets" || activeTab === "game-assets" || activeTab === "ecology-illustrations") && !activeTextureBatch)) && !isGenerating ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="text-6xl mb-6 opacity-30">{activeTab === "icons" ? "🎨" : activeTab === "sprites" ? "🧬" : activeTab === "videos" ? "🎬" : "🖼️"}</div>
                            <h2 className="text-lg font-bold text-gray-500 tracking-wider mb-2">NO BATCH SELECTED</h2>
                            <p className="text-sm text-gray-600 max-w-sm">
                                {activeTab === "icons"
                                    ? "Enter an icon list (one item per line), add an optional style modifier or reference image, and click Generate."
                                    : activeTab === "sprites"
                                        ? "Enter one subject per line, choose a sprite type and mode, and generate a sprite batch."
                                    : activeTab === "songs"
                                        ? "Write one sound brief, launch the interleaved Gemini 3 job, and inspect the unified media artifact here."
                                        : activeTab === "videos"
                                            ? "Write one cinematic brief, launch the interleaved Gemini 3 job, and inspect the unified video package here."
                                        : activeTab === "ecology-illustrations"
                                            ? "Enter one ecology subject per line, add a guiding art direction if needed, and generate an illustration batch."
                                            : `Select a category, enter a texture list, and click Generate.`}
                            </p>
                        </div>
                    ) : (activeTab === "songs" && activeMediaJob) ? (
                        <div className="space-y-6">
                            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                                <div>
                                    <h2 className="text-[10px] font-bold tracking-[0.15em] text-gray-500">
                                        <span className="text-[#E6E6FA]">{activeMediaResult?.artifact.metadata.title || activeMediaJob.title}</span>
                                    </h2>
                                    <p className="mt-2 text-[9px] text-gray-500 uppercase tracking-widest">
                                        {activeMediaJob.status} · {activeMediaJob.currentStage}
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setActiveMediaJobId(null);
                                        setActiveMediaResult(null);
                                    }}
                                    className="text-[10px] tracking-wider text-gray-600 hover:text-gray-300 transition-colors"
                                >
                                    CLOSE
                                </button>
                            </div>

                            {activeMediaResult ? (
                                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                                    <div className="rounded-2xl border border-white/10 bg-[#0f1520] p-5 shadow-lg">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${mediaStatusTone(activeMediaResult.artifact.status)}`}>
                                                {activeMediaResult.artifact.status.replace("_", " ")}
                                            </span>
                                            {activeMediaResult.artifact.metadata.tags.map((tag) => (
                                                <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-gray-300">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                        <h3 className="mt-4 text-2xl font-black tracking-[0.04em] text-white">{activeMediaResult.artifact.metadata.title}</h3>
                                        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-300">{activeMediaResult.artifact.metadata.description}</p>
                                        {activeMediaResult.artifact.audio && (
                                            <div className="mt-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                                                <div className="mb-3 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-cyan-100">
                                                    <span>Audio Artifact</span>
                                                    <span>{activeMediaResult.artifact.audio.durationSeconds}s</span>
                                                </div>
                                                <audio controls preload="none" className="w-full">
                                                    <source src={activeMediaResult.artifact.audio.url} type={activeMediaResult.artifact.audio.mimeType} />
                                                </audio>
                                            </div>
                                        )}
                                        {activeMediaResult.transcript.finalResponseText && (
                                            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                                                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Gemini Final Response</div>
                                                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-200">{activeMediaResult.transcript.finalResponseText}</p>
                                            </div>
                                        )}
                                        {!!activeMediaResult.artifact.warnings?.length && (
                                            <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                                                {activeMediaResult.artifact.warnings.join(" ")}
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-5">
                                        {activeMediaResult.artifact.image && (
                                            <div className="rounded-2xl border border-white/10 bg-[#0f1520] p-4 shadow-lg">
                                                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Associated Image</div>
                                                <img
                                                    src={activeMediaResult.artifact.image.url}
                                                    alt={activeMediaResult.artifact.metadata.title}
                                                    className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 object-cover"
                                                />
                                            </div>
                                        )}
                                        <div className="rounded-2xl border border-white/10 bg-[#0f1520] p-4 shadow-lg">
                                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Interleaved Trace</div>
                                            <div className="mt-4 space-y-2 text-sm text-gray-300">
                                                <p><span className="text-gray-500">Model:</span> {activeMediaResult.transcript.model}</p>
                                                <p><span className="text-gray-500">Logical tool:</span> {activeMediaResult.transcript.logicalToolName}</p>
                                                <p><span className="text-gray-500">API tool:</span> {activeMediaResult.transcript.apiToolName}</p>
                                                <p><span className="text-gray-500">Thought signature:</span> {activeMediaResult.transcript.thoughtSignatureDetected ? "preserved" : "not detected"}</p>
                                                <p><span className="text-gray-500">Intent:</span> {activeMediaResult.artifact.metadata.intent}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-white/10 bg-[#0f1520] p-6">
                                    <div className="flex items-center gap-3">
                                        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${activeMediaJob.status === "failed" ? "border-red-500/30 bg-red-500/10 text-red-100" : activeMediaJob.status === "completed" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-cyan-500/30 bg-cyan-500/10 text-cyan-100"}`}>
                                            {activeMediaJob.status}
                                        </span>
                                        <span className="text-sm text-gray-400">{activeMediaJob.currentStage}</span>
                                    </div>
                                    {activeMediaJob.error && (
                                        <p className="mt-4 text-sm text-red-300">{activeMediaJob.error}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (activeTab === "videos" && activeVideoJob) ? (
                        <div className="space-y-6">
                            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                                <div>
                                    <h2 className="text-[10px] font-bold tracking-[0.15em] text-gray-500">
                                        <span className="text-[#E6E6FA]">{activeVideoResult?.artifact.metadata.title || activeVideoJob.title}</span>
                                    </h2>
                                    <p className="mt-2 text-[9px] text-gray-500 uppercase tracking-widest">
                                        {activeVideoJob.status} · {activeVideoJob.currentStage}
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setActiveVideoJobId(null);
                                        setActiveVideoResult(null);
                                    }}
                                    className="text-[10px] tracking-wider text-gray-600 hover:text-gray-300 transition-colors"
                                >
                                    CLOSE
                                </button>
                            </div>

                            {activeVideoResult ? (
                                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                                    <div className="rounded-2xl border border-white/10 bg-[#0f1520] p-5 shadow-lg">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${mediaStatusTone(activeVideoResult.artifact.status)}`}>
                                                {activeVideoResult.artifact.status.replace("_", " ")}
                                            </span>
                                            {activeVideoResult.artifact.metadata.tags.map((tag) => (
                                                <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-gray-300">
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                        <div className="mt-4 flex flex-wrap items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={() => void saveVideoToGallery()}
                                                disabled={isSavingVideoToGallery || !activeVideoBatchId}
                                                className={`rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-all ${isSavingVideoToGallery || !activeVideoBatchId
                                                    ? "cursor-not-allowed border-white/10 bg-white/5 text-gray-500"
                                                    : "border-emerald-500/30 bg-emerald-500/12 text-emerald-100 hover:bg-emerald-500/18"}`}
                                            >
                                                {isSavingVideoToGallery ? "Saving..." : "Save To Gallery + Bucket"}
                                            </button>
                                            {activeVideoBatchId && (
                                                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-gray-400">
                                                    {activeVideoBatchId}
                                                </span>
                                            )}
                                        </div>
                                        {videoSaveNotice && (
                                            <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                                                {videoSaveNotice}
                                            </div>
                                        )}
                                        {videoSaveError && (
                                            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
                                                {videoSaveError}
                                            </div>
                                        )}
                                        <h3 className="mt-4 text-2xl font-black tracking-[0.04em] text-white">{activeVideoResult.artifact.metadata.title}</h3>
                                        <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-300">{activeVideoResult.artifact.metadata.description}</p>
                                        {activeVideoResult.artifact.video && (
                                            <div className="mt-5 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4">
                                                <div className="mb-3 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-fuchsia-100">
                                                    <span>Video Package</span>
                                                    <span>{activeVideoResult.artifact.video.durationSeconds}s</span>
                                                </div>
                                                <SyncedNarratedVideoPlayer
                                                    videoUrl={activeVideoResult.artifact.video.url}
                                                    posterUrl={activeVideoResult.artifact.poster?.url}
                                                    durationSeconds={activeVideoResult.artifact.video.durationSeconds}
                                                    segments={activeVideoResult.artifact.narration?.segments || []}
                                                    keepVideoAudioDefault={activeVideoResult.artifact.video.keepVeoAudio}
                                                />
                                            </div>
                                        )}
                                        {activeVideoResult.transcript.finalResponseText && (
                                            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
                                                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Gemini Final Response</div>
                                                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-200">{activeVideoResult.transcript.finalResponseText}</p>
                                            </div>
                                        )}
                                        {!!activeVideoResult.artifact.warnings?.length && (
                                            <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                                                {activeVideoResult.artifact.warnings.join(" ")}
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-5">
                                        {activeVideoResult.artifact.poster && (
                                            <div className="rounded-2xl border border-white/10 bg-[#0f1520] p-4 shadow-lg">
                                                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Poster</div>
                                                <img
                                                    src={activeVideoResult.artifact.poster.url}
                                                    alt={activeVideoResult.artifact.metadata.title}
                                                    className="mt-4 w-full rounded-xl border border-white/10 bg-black/20 object-cover"
                                                />
                                            </div>
                                        )}
                                        <div className="rounded-2xl border border-white/10 bg-[#0f1520] p-4 shadow-lg">
                                            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">Interleaved Trace</div>
                                            <div className="mt-4 space-y-2 text-sm text-gray-300">
                                                <p><span className="text-gray-500">Model:</span> {activeVideoResult.transcript.model}</p>
                                                <p><span className="text-gray-500">Logical tool:</span> {activeVideoResult.transcript.logicalToolName}</p>
                                                <p><span className="text-gray-500">API tool:</span> {activeVideoResult.transcript.apiToolName}</p>
                                                <p><span className="text-gray-500">Thought signature:</span> {activeVideoResult.transcript.thoughtSignatureDetected ? "preserved" : "not detected"}</p>
                                                <p><span className="text-gray-500">Intent:</span> {activeVideoResult.artifact.metadata.intent}</p>
                                                <p><span className="text-gray-500">Narration:</span> {activeVideoResult.artifact.narration?.language || "n/a"} / {activeVideoResult.artifact.narration?.voiceName || "n/a"}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-white/10 bg-[#0f1520] p-6">
                                    <div className="flex items-center gap-3">
                                        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${activeVideoJob.status === "failed" ? "border-red-500/30 bg-red-500/10 text-red-100" : activeVideoJob.status === "completed" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100" : "border-cyan-500/30 bg-cyan-500/10 text-cyan-100"}`}>
                                            {activeVideoJob.status}
                                        </span>
                                        <span className="text-sm text-gray-400">{activeVideoJob.currentStage}</span>
                                    </div>
                                    {activeVideoJob.error && (
                                        <p className="mt-4 text-sm text-red-300">{activeVideoJob.error}</p>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (activeTab === "icons" && activeBatch) ? (
                        <div className="space-y-6">
                            {/* Batch Header */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    {isRenaming ? (
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={renameValue}
                                                onChange={(e) => setRenameValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") confirmRename();
                                                    if (e.key === "Escape") cancelRename();
                                                }}
                                                autoFocus
                                                className="bg-[#080d14] border border-[#E6E6FA]/30 rounded px-2 py-1 text-sm text-[#E6E6FA] font-mono focus:outline-none focus:border-[#E6E6FA]/60 w-48"
                                                placeholder="batch name..."
                                            />
                                            <button
                                                onClick={confirmRename}
                                                disabled={isRenameSaving || !renameValue.trim()}
                                                className="w-6 h-6 flex items-center justify-center rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-all disabled:opacity-30"
                                                title="Confirm"
                                            >
                                                {isRenameSaving ? (
                                                    <span className="inline-block w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                                                ) : (
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </button>
                                            <button
                                                onClick={cancelRename}
                                                className="w-6 h-6 flex items-center justify-center rounded bg-white/5 text-gray-400 hover:bg-white/10 transition-all"
                                                title="Cancel"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <h2 className="text-[10px] font-bold tracking-[0.15em] text-gray-500">
                                                <span className="text-[#E6E6FA]">{activeBatch.batchName || activeBatch.batchId.substring(0, 8).toUpperCase()}</span>
                                            </h2>
                                            <button
                                                onClick={startRename}
                                                className="w-5 h-5 flex items-center justify-center rounded bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300 transition-all"
                                                title="Rename batch"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                            </button>
                                        </>
                                    )}
                                    <p className="text-[9px] text-gray-600">
                                        {activeBatch.icons.length} icons · {new Date(activeBatch.createdAt).toLocaleString()}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setActiveBatch(null)}
                                    className="text-[10px] tracking-wider text-gray-600 hover:text-gray-300 transition-colors"
                                >
                                    CLOSE
                                </button>
                            </div>

                            {/* Icons Grid */}
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
                                {activeBatch.icons.map((icon, i) => (
                                    <IconCard
                                        key={`${icon.url}-${i}`}
                                        icon={icon}
                                        lastRefreshedAt={lastRefreshedAt}
                                        setHoveredIcon={setHoveredIcon}
                                        downloadIcon={downloadIcon}
                                        setAssigningIcon={setAssigningIcon}
                                        startEditingIcon={startEditingIcon}
                                    />
                                ))}
                            </div>

                            {/* Global Hover Preview - Moved to the far right and made smaller */}
                            {hoveredIcon && (
                                <div className="fixed top-1/2 right-8 -translate-y-1/2 z-[60] p-4 bg-[#0a0f16]/95 backdrop-blur-xl border border-[#E6E6FA]/20 rounded-xl shadow-2xl shadow-black pointer-events-none select-none">
                                    <div className="flex flex-col items-center">
                                        <img
                                            src={`${hoveredIcon.url}?t=${lastRefreshedAt}`}
                                            alt="preview"
                                            className="w-[256px] h-[256px] rounded-lg shadow-inner bg-black/20"
                                        />
                                        <p className="text-[10px] text-gray-400 text-center mt-4 max-w-[256px] font-mono leading-relaxed break-words whitespace-pre-wrap px-1">
                                            {hoveredIcon.prompt}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (activeTab === "sprites" && activeSpriteBatch) ? (
                        <div className="space-y-6">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3">
                                    {isRenaming ? (
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                value={renameValue}
                                                onChange={(e) => setRenameValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") confirmRename();
                                                    if (e.key === "Escape") cancelRename();
                                                }}
                                                autoFocus
                                                className="bg-[#080d14] border border-[#E6E6FA]/30 rounded px-2 py-1 text-sm text-[#E6E6FA] font-mono focus:outline-none focus:border-[#E6E6FA]/60 w-48"
                                                placeholder="batch name..."
                                            />
                                            <button
                                                onClick={confirmRename}
                                                disabled={isRenameSaving || !renameValue.trim()}
                                                className="w-6 h-6 flex items-center justify-center rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-all disabled:opacity-30"
                                                title="Confirm"
                                            >
                                                {isRenameSaving ? <span className="inline-block w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" /> : (
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </button>
                                            <button
                                                onClick={cancelRename}
                                                className="w-6 h-6 flex items-center justify-center rounded bg-white/5 text-gray-400 hover:bg-white/10 transition-all"
                                                title="Cancel"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div>
                                                <h2 className="text-[10px] font-bold tracking-[0.15em] text-gray-500">
                                                    <span className="text-[#E6E6FA]">{activeSpriteBatch.batchName || activeSpriteBatch.batchId.substring(0, 8).toUpperCase()}</span>
                                                </h2>
                                                <p className="mt-1 text-[9px] text-gray-600">
                                                    {activeSpriteBatch.spriteType} · {activeSpriteBatch.mode}{activeSpriteBatch.includesIllustration ? " + illustration" : ""} · {activeSpriteBatch.sprites.length} sprites
                                                </p>
                                                {(activeSpriteBatch.target || spriteTargetKind) && (
                                                    <p className="mt-2 text-[9px] uppercase tracking-widest text-emerald-400">
                                                        target: {(activeSpriteBatch.target?.kind || spriteTargetKind) ?? "unbound"} {(activeSpriteBatch.target?.id || spriteTargetId) ? `• ${activeSpriteBatch.target?.id || spriteTargetId}` : ""}
                                                    </p>
                                                )}
                                            </div>
                                            <button
                                                onClick={startRename}
                                                className="mt-1 w-5 h-5 flex items-center justify-center rounded bg-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300 transition-all"
                                                title="Rename batch"
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                            </button>
                                        </>
                                    )}
                                </div>
                                <div className="flex items-center gap-3">
                                    {(activeSpriteBatch.target?.kind === "fauna" || spriteTargetKind === "fauna") && (activeSpriteBatch.target?.id || spriteTargetId) && (
                                        <Link
                                            to={buildEcologyRoute({ tab: "fauna", id: activeSpriteBatch.target?.id || spriteTargetId })}
                                            className="text-[10px] tracking-wider text-emerald-400 hover:text-emerald-300 transition-colors"
                                        >
                                            OPEN IN ECOLOGY
                                        </Link>
                                    )}
                                    {(activeSpriteBatch.target?.kind === "character" || spriteTargetKind === "character") && (activeSpriteBatch.target?.id || spriteTargetId) && (
                                        <Link
                                            to={buildCharacterBuilderRoute({ id: activeSpriteBatch.target?.id || spriteTargetId, focus: "sprite" })}
                                            className="text-[10px] tracking-wider text-emerald-400 hover:text-emerald-300 transition-colors"
                                        >
                                            OPEN IN CHARACTER BUILDER
                                        </Link>
                                    )}
                                    <button
                                        onClick={() => setActiveSpriteBatch(null)}
                                        className="text-[10px] tracking-wider text-gray-600 hover:text-gray-300 transition-colors"
                                    >
                                        CLOSE
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 pb-20">
                                {activeSpriteBatch.sprites.map((sprite) => (
                                    <SpriteCard
                                        key={sprite.spriteId}
                                        sprite={sprite}
                                        lastRefreshedAt={lastRefreshedAt}
                                        onAssign={openAssignSpriteModal}
                                        isSelected={selectedItems.includes(sprite.spriteId)}
                                        onToggleSelect={toggleItemSelection}
                                    />
                                ))}
                            </div>
                        </div>
                    ) : (activeTab !== "icons" && activeTextureBatch && (
                        (activeTab === "battlemaps" && ["battle_assets", "character", "item"].includes(activeTextureBatch.category)) ||
                        (activeTab === "world-assets" && activeTextureBatch.category === "world_assets") ||
                        (activeTab === "game-assets" && activeTextureBatch.category === "game_assets") ||
                        (activeTab === "ecology-illustrations" && activeTextureBatch.category === "ecology_illustrations")
                    )) ? (
                        <div className="space-y-6">
                            {/* Texture Batch Header */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-[10px] font-bold tracking-[0.15em] text-gray-500">
                                        <span className="text-[#E6E6FA]">{activeTextureBatch.batchName || activeTextureBatch.batchId.substring(0, 8).toUpperCase()}</span>
                                    </h2>
                                    <p className="text-[9px] text-gray-400 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded">
                                        {activeTextureBatch.category.replace("_", " ")} {activeTextureBatch.subCategory ? `· ${activeTextureBatch.subCategory}` : ""}
                                    </p>
                                    <p className="text-[9px] text-gray-600">
                                        {activeTextureBatch.textures.length} textures · {new Date(activeTextureBatch.createdAt).toLocaleString()}
                                    </p>
                                    {activeTextureBatch.gameAsset?.grouping && (
                                        <div className="flex items-center gap-2 ml-4 px-3 py-1 bg-[#E6E6FA]/10 border border-[#E6E6FA]/20 rounded-full">
                                            <span className="text-[8px] font-black text-[#E6E6FA] uppercase tracking-widest">{activeTextureBatch.gameAsset.grouping.type}:</span>
                                            <span className="text-[10px] font-bold text-white">{activeTextureBatch.gameAsset.grouping.name}</span>
                                            {activeTextureBatch.gameAsset.grouping.description && (
                                                <span className="text-[8px] text-gray-500 italic truncate max-w-[200px]" title={activeTextureBatch.gameAsset.grouping.description}>
                                                    — {activeTextureBatch.gameAsset.grouping.description}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={() => setActiveTextureBatch(null)}
                                    className="text-[10px] tracking-wider text-gray-600 hover:text-gray-300 transition-colors"
                                >
                                    CLOSE
                                </button>
                            </div>

                            <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 pb-20">
                                {activeTextureBatch.textures.map((texture) => (
                                    <TextureCard
                                        key={texture.filename}
                                        texture={texture}
                                        lastRefreshedAt={lastRefreshedAt}
                                        setHoveredTexture={setHoveredTexture}
                                        downloadTexture={downloadIcon}
                                        startEditingTexture={startEditingTexture}
                                        updateMetadata={updateMetadata}
                                        isSelected={selectedItems.includes(texture.filename)}
                                        onToggleSelect={toggleItemSelection}
                                    />
                                ))}
                            </div>

                            {/* Global Hover Preview for Textures */}
                            {hoveredTexture && (
                                <div className="fixed top-1/2 right-8 -translate-y-1/2 z-[60] p-4 bg-[#0a0f16]/95 backdrop-blur-xl border border-[#E6E6FA]/20 rounded-xl shadow-2xl shadow-black pointer-events-none select-none">
                                    <div className="flex flex-col items-center">
                                        <img
                                            src={`${hoveredTexture.url}?t=${lastRefreshedAt}`}
                                            alt="preview"
                                            className="w-[320px] h-[320px] rounded-lg shadow-inner bg-black/20"
                                        />
                                        <p className="text-[10px] text-gray-400 text-center mt-4 max-w-[320px] font-mono leading-relaxed break-words whitespace-pre-wrap px-1">
                                            {hoveredTexture.itemPrompt || hoveredTexture.prompt}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Generating shimmer */
                        <div className="space-y-6">
                            <h2 className="text-[10px] font-bold tracking-[0.15em] text-gray-500">
                                GENERATING <span className="text-[#E6E6FA]">{genProgress.total}</span> {activeTab.toUpperCase()}...
                            </h2>
                            <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-3">
                                {Array.from({ length: genProgress.total }).map((_, i) => (
                                    <div
                                        key={`shimmer-${i}`}
                                        className="flex flex-col items-center bg-[#0f1520] border border-white/5 rounded-lg p-2 animate-pulse h-[110px]"
                                    >
                                        <div className="w-12 h-12 bg-white/5 rounded mb-2 flex-shrink-0" />
                                        <div className="w-full space-y-1.5">
                                            <div className="w-full h-1.5 bg-white/5 rounded" />
                                            <div className="w-2/3 h-1.5 bg-white/5 rounded mx-auto" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </main>

                {/* ── Selection Toolbar ── */}
                {
                    selectedItems.length > 0 && (
                        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-4 px-6 py-3 bg-[#0a0f16]/90 backdrop-blur-xl border border-[#E6E6FA]/30 rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <div className="flex items-center gap-2 pr-4 border-r border-white/10">
                                <span className="text-xl font-black text-[#E6E6FA]">{selectedItems.length}</span>
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Selected</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={selectAllItems}
                                    className="px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 text-[10px] font-bold tracking-wider hover:bg-white/5 transition-all"
                                >
                                    {(activeTab === "sprites" ? activeSpriteBatch && selectedItems.length === activeSpriteBatch.sprites.length : activeTextureBatch && selectedItems.length === activeTextureBatch.textures.length) ? "DESELECT ALL" : "SELECT ALL"}
                                </button>
                                <button
                                    onClick={() => setIsAddToPackModalOpen(true)}
                                    className="px-4 py-1.5 rounded-lg bg-[#E6E6FA] text-[#070b12] text-[10px] font-bold tracking-wider hover:bg-white transition-all flex items-center gap-2 shadow-lg shadow-[#E6E6FA]/10"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                    </svg>
                                    ADD TO PACK
                                </button>
                                <button
                                    onClick={() => setSelectedItems([])}
                                    className="p-1.5 rounded-lg text-gray-500 hover:text-white transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    )
                }

                {/* ── Confirmation Modal ── */}
                <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="CONFIRM BATCH GENERATION">
                    <div className="space-y-4 p-4">
                        <div className="flex items-center justify-between bg-[#0f1520] border border-white/5 rounded-lg p-4">
                            <div>
                                <p className="text-[10px] text-gray-500 tracking-wider mb-1">
                                    {activeTab === "icons" ? "ICONS TO GENERATE" : activeTab === "sprites" ? "SPRITES TO GENERATE" : activeTab === "songs" ? "MEDIA ARTIFACTS TO GENERATE" : activeTab === "videos" ? "VIDEO PACKAGES TO GENERATE" : "ASSETS TO GENERATE"}
                                </p>
                                <p className="text-3xl font-black text-[#E6E6FA]">{pendingPrompts.length}</p>
                            </div>
                            {referenceImage && activeTab !== "songs" && activeTab !== "videos" && (
                                <div className="text-right pl-4 border-l border-white/10">
                                    <p className="text-[10px] text-[#E6E6FA] tracking-wider mb-1">REF IMAGE</p>
                                    <img src={`data:image/png;base64,${referenceImage}`} className="w-8 h-8 rounded shrink-0 object-cover" alt="ref" />
                                </div>
                            )}
                        </div>

                        <div className="bg-[#0f1520] border border-white/5 rounded-lg p-3 max-h-[200px] overflow-y-auto">
                            <p className="text-[9px] text-gray-500 tracking-wider mb-2">FULL PROMPTS (MODIFIER + ITEM)</p>
                            {pendingPrompts.map((p, i) => (
                                <div key={i} className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0 overflow-hidden">
                                    <span className="text-[9px] text-gray-600 font-mono w-5 shrink-0 text-right">{i + 1}.</span>
                                    <span className="text-[10px] text-gray-300 font-mono whitespace-nowrap overflow-hidden text-ellipsis" title={p}>{p}</span>
                                </div>
                            ))}
                        </div>

                        {pendingPrompts.length > 10 && (
                            <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] tracking-wider">
                                ⚠ LARGE BATCH — THIS MAY TAKE SEVERAL MINUTES
                            </div>
                        )}

                        <div className="flex items-center gap-3 pt-2">
                            <button
                                onClick={() => setShowConfirm(false)}
                                className="flex-1 py-2.5 rounded-lg border border-white/10 text-gray-400 text-[11px] font-bold tracking-[0.15em] hover:bg-white/5 transition-all"
                            >
                                CANCEL
                            </button>
                            <button
                                onClick={confirmAndGenerate}
                                className="flex-1 py-2.5 rounded-lg bg-[#E6E6FA]/20 border border-[#E6E6FA]/30 text-[#E6E6FA] text-[11px] font-bold tracking-[0.15em] hover:bg-[#E6E6FA]/30 transition-all font-sans"
                            >
                                {activeTab === "songs"
                                    ? "LAUNCH INTERLEAVED MEDIA JOB"
                                    : activeTab === "videos"
                                        ? "LAUNCH INTERLEAVED VIDEO JOB"
                                    : `⚡ BAKE ${pendingPrompts.length} ${activeTab === "icons" ? "ICONS" : activeTab === "sprites" ? "SPRITES" : "TEXTURES"}`}
                            </button>
                        </div>
                    </div>
                </Modal>

                {/* ── Assign Icon Modal ── */}
                < Modal open={!!assigningIcon} onClose={() => setAssigningIcon(null)} title="ASSIGN SECURED ICON" >
                    <div className="space-y-6 p-4">
                        {assigningIcon && (
                            <div className="flex items-center gap-4 bg-[#0f1520] border border-white/10 rounded-lg p-4">
                                <img src={assigningIcon.url} alt="To Assign" className="w-16 h-16 rounded border border-white/10 shrink-0" />
                                <div>
                                    <h4 className="text-[10px] font-bold tracking-[0.15em] text-[#E6E6FA] mb-1">ICON TO ASSIGN</h4>
                                    <p className="text-[11px] font-mono text-gray-400">{assigningIcon.itemPrompt || assigningIcon.prompt}</p>
                                </div>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 tracking-[0.15em]">CATEGORY</label>
                                <select
                                    value={assignCategory}
                                    onChange={e => {
                                        setAssignCategory(e.target.value as any);
                                        setAssignEntityId("");
                                    }}
                                    className="w-full bg-[#080d14] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50 transition-colors"
                                >
                                    <option value="items">Items</option>
                                    <option value="skills">Skills</option>
                                    <option value="traits">Traits</option>
                                    <option value="occupations">Occupations</option>
                                    <option value="characters">Characters/Monsters</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 tracking-[0.15em]">ENTITY</label>
                                <select
                                    value={assignEntityId}
                                    onChange={e => setAssignEntityId(e.target.value)}
                                    className="w-full bg-[#080d14] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/50 transition-colors"
                                >
                                    <option value="" disabled>-- Select {assignCategory} --</option>
                                    {getAvailableEntities().map((e: any) => (
                                        <option key={e.id} value={e.id}>
                                            {e.name} ({e.id})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 pt-4">
                            <button
                                onClick={handleAssignIcon}
                                disabled={!assignEntityId || isAssigning}
                                className="w-full py-3 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold tracking-[0.2em] hover:bg-emerald-500/30 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                            >
                                {isAssigning ? (
                                    <>
                                        <span className="inline-block w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                                        ASSIGNING...
                                    </>
                                ) : (
                                    "CONFIRM BINDING"
                                )}
                            </button>
                            <button
                                onClick={() => setAssigningIcon(null)}
                                disabled={isAssigning}
                                className="w-full py-2.5 rounded-lg border border-white/5 text-gray-500 text-[10px] font-bold tracking-[0.1em] hover:bg-white/5 hover:text-gray-300 transition-all"
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                </Modal >

                <Modal open={!!assigningSprite} onClose={() => setAssigningSprite(null)} title="BIND SPRITE SET">
                    <div className="space-y-6 p-4">
                        {assigningSprite && (
                            <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-[#0f1520] p-4">
                                <img src={assigningSprite.previewUrl} alt="Sprite preview" className="h-16 w-16 rounded border border-white/10 object-contain" />
                                <div>
                                    <h4 className="text-[10px] font-bold tracking-[0.15em] text-[#E6E6FA]">SPRITE SET</h4>
                                    <p className="mt-1 text-[11px] text-gray-300">{assigningSprite.itemPrompt || assigningSprite.prompt}</p>
                                    <p className="mt-1 text-[9px] uppercase tracking-widest text-gray-500">{assigningSprite.actorType} • {assigningSprite.mode}</p>
                                </div>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 tracking-[0.15em]">TARGET TYPE</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(["character", "fauna"] as const).map((kind) => (
                                        <button
                                            key={kind}
                                            onClick={() => {
                                                setAssignSpriteTargetKind(kind);
                                                setAssignSpriteTargetId("");
                                            }}
                                            className={`rounded-lg border px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${assignSpriteTargetKind === kind
                                                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                                : "border-white/10 bg-white/[0.02] text-gray-500 hover:border-white/20 hover:text-gray-300"
                                                }`}
                                        >
                                            {kind}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 tracking-[0.15em]">TARGET ENTRY</label>
                                <select
                                    value={assignSpriteTargetId}
                                    onChange={(e) => setAssignSpriteTargetId(e.target.value)}
                                    className="w-full rounded-lg border border-white/10 bg-[#080d14] px-3 py-2 text-sm text-gray-200 focus:border-emerald-500/50 focus:outline-none"
                                >
                                    <option value="" disabled>
                                        {assignSpriteTargetKind === "character" ? "-- Select character --" : "-- Select fauna entry --"}
                                    </option>
                                    {(assignSpriteTargetKind === "character" ? assignableCharacters : faunaTargets).map((entry) => (
                                        <option key={entry.id} value={entry.id}>
                                            {entry.name} ({entry.id})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 pt-4">
                            <button
                                onClick={handleAssignSprite}
                                disabled={!assignSpriteTargetId || isAssigningSprite}
                                className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/20 py-3 text-[11px] font-bold tracking-[0.2em] text-emerald-300 transition-all hover:bg-emerald-500/30 disabled:opacity-30"
                            >
                                {isAssigningSprite ? "BINDING..." : "CONFIRM SPRITE BINDING"}
                            </button>
                            <button
                                onClick={() => setAssigningSprite(null)}
                                disabled={isAssigningSprite}
                                className="w-full rounded-lg border border-white/5 py-2.5 text-[10px] font-bold tracking-[0.1em] text-gray-500 transition-all hover:bg-white/5 hover:text-gray-300"
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                </Modal>

                <Modal open={isAddToPackModalOpen} onClose={() => setIsAddToPackModalOpen(false)} title="ADD SELECTED ASSETS TO PACK">
                    <div className="space-y-6 p-4">
                        <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-[#0f1520] p-4">
                            <div className="w-12 h-12 rounded bg-[#E6E6FA]/20 flex items-center justify-center text-xl">
                                {activeTab === "sprites" ? "🧬" : "🖼️"}
                            </div>
                            <div>
                                <h4 className="text-[10px] font-bold tracking-[0.15em] text-[#E6E6FA]">SELECTED ASSETS</h4>
                                <p className="mt-1 text-2xl font-black text-white">{selectedItems.length}</p>
                                <p className="text-[9px] uppercase tracking-widest text-gray-500">{activeTab === "sprites" ? "Sprites" : "Textures"} to add</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 tracking-[0.15em]">EXISTING PACKS</label>
                                <div className="max-h-[200px] overflow-y-auto pr-1 flex flex-col gap-1.5 custom-scrollbar">
                                    {packs.length === 0 ? (
                                        <p className="text-[10px] text-gray-600 italic py-2">No packs found. Create one below.</p>
                                    ) : (
                                        packs.map(pack => (
                                            <button
                                                key={pack.packId}
                                                onClick={() => handleAddToPack(pack.packId)}
                                                disabled={isPackSaving}
                                                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-[#E6E6FA]/30 transition-all text-left"
                                            >
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-300">{pack.name}</p>
                                                    <p className="text-[9px] text-gray-500">{pack.textures.length} textures · {pack.sprites.length} sprites</p>
                                                </div>
                                                <svg className="w-3.5 h-3.5 text-[#E6E6FA]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                </svg>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="pt-4 border-t border-white/5">
                                <label className="text-[10px] font-bold text-gray-500 tracking-[0.15em] mb-2 block">OR CREATE NEW PACK</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="New Pack Name..."
                                        value={newPackName}
                                        onChange={(e) => setNewPackName(e.target.value)}
                                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-[#E6E6FA]/50"
                                    />
                                    <button
                                        onClick={handleCreatePack}
                                        disabled={!newPackName.trim() || isPackSaving}
                                        className="px-4 py-2 bg-emerald-500/20 text-emerald-400 font-bold text-[10px] tracking-wider rounded-lg border border-emerald-500/30 hover:bg-emerald-500/30 transition-all disabled:opacity-50"
                                    >
                                        CREATE
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 pt-2">
                            <button
                                onClick={() => setIsAddToPackModalOpen(false)}
                                disabled={isPackSaving}
                                className="w-full rounded-lg border border-white/5 py-2.5 text-[10px] font-bold tracking-[0.1em] text-gray-500 transition-all hover:bg-white/5 hover:text-gray-300"
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                </Modal>

                <Modal open={isAddToPackModalOpen} onClose={() => setIsAddToPackModalOpen(false)} title="ADD SELECTED ASSETS TO PACK">
                    <div className="space-y-6 p-4">
                        <div className="flex items-center gap-4 rounded-lg border border-white/10 bg-[#0f1520] p-4">
                            <div className="w-12 h-12 rounded bg-[#E6E6FA]/20 flex items-center justify-center text-xl">
                                {activeTab === "sprites" ? "🧬" : "🖼️"}
                            </div>
                            <div>
                                <h4 className="text-[10px] font-bold tracking-[0.15em] text-[#E6E6FA]">SELECTED ASSETS</h4>
                                <p className="mt-1 text-2xl font-black text-white">{selectedItems.length}</p>
                                <p className="text-[9px] uppercase tracking-widest text-gray-500">{activeTab === "sprites" ? "Sprites" : "Textures"} to add</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 tracking-[0.15em]">EXISTING PACKS</label>
                                <div className="max-h-[200px] overflow-y-auto pr-1 flex flex-col gap-1.5 custom-scrollbar">
                                    {packs.length === 0 ? (
                                        <p className="text-[10px] text-gray-600 italic py-2">No packs found. Create one below.</p>
                                    ) : (
                                        packs.map(pack => (
                                            <button
                                                key={pack.packId}
                                                onClick={() => handleAddToPack(pack.packId)}
                                                disabled={isPackSaving}
                                                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-[#E6E6FA]/30 transition-all text-left"
                                            >
                                                <div>
                                                    <p className="text-[11px] font-bold text-gray-300">{pack.name}</p>
                                                    <p className="text-[9px] text-gray-500">{pack.textures.length} textures · {pack.sprites.length} sprites</p>
                                                </div>
                                                <svg className="w-3.5 h-3.5 text-[#E6E6FA]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                </svg>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="pt-4 border-t border-white/5">
                                <label className="text-[10px] font-bold text-gray-500 tracking-[0.15em] mb-2 block">OR CREATE NEW PACK</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="New Pack Name..."
                                        value={newPackName}
                                        onChange={(e) => setNewPackName(e.target.value)}
                                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-[#E6E6FA]/50"
                                    />
                                    <button
                                        onClick={handleCreatePack}
                                        disabled={!newPackName.trim() || isPackSaving}
                                        className="px-4 py-2 bg-emerald-500/20 text-emerald-400 font-bold text-[10px] tracking-wider rounded-lg border border-emerald-500/30 hover:bg-emerald-500/30 transition-all disabled:opacity-50"
                                    >
                                        CREATE
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 pt-2">
                            <button
                                onClick={() => setIsAddToPackModalOpen(false)}
                                disabled={isPackSaving}
                                className="w-full rounded-lg border border-white/5 py-2.5 text-[10px] font-bold tracking-[0.1em] text-gray-500 transition-all hover:bg-white/5 hover:text-gray-300"
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                </Modal>

                <Modal open={isAssigningPack} onClose={() => setIsAssigningPack(false)} title="ASSIGN PACK GROUPING">
                    <div className="space-y-6 p-4">
                        <div className="flex gap-4 p-4 bg-purple-500/5 border border-purple-500/10 rounded-2xl items-center">
                            <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center text-2xl">🏷️</div>
                            <div>
                                <h4 className="text-[10px] font-black tracking-widest text-purple-400 uppercase">System Linkage</h4>
                                <p className="text-xs text-gray-400 mt-1">This pack will be prioritized for the assigned grouping metadata.</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                <button
                                    onClick={() => setTempPackGroupingType("biome")}
                                    className={`py-3 rounded-xl border font-bold text-[10px] tracking-widest transition-all ${tempPackGroupingType === "biome" ? "bg-emerald-500 border-emerald-400 text-black shadow-lg shadow-emerald-500/10" : "bg-black/40 border-white/5 text-gray-500 hover:border-white/10"}`}
                                >
                                    BIOME
                                </button>
                                <button
                                    onClick={() => setTempPackGroupingType("structure")}
                                    className={`py-3 rounded-xl border font-bold text-[10px] tracking-widest transition-all ${tempPackGroupingType === "structure" ? "bg-amber-500 border-amber-400 text-black shadow-lg shadow-amber-500/10" : "bg-black/40 border-white/5 text-gray-500 hover:border-white/10"}`}
                                >
                                    STRUCTURE
                                </button>
                                <button
                                    onClick={() => setTempPackGroupingType("exploration-kit")}
                                    className={`py-3 rounded-xl border font-bold text-[10px] tracking-widest transition-all ${tempPackGroupingType === "exploration-kit" ? "bg-sky-500 border-sky-400 text-black shadow-lg shadow-sky-500/10" : "bg-black/40 border-white/5 text-gray-500 hover:border-white/10"}`}
                                >
                                    KIT
                                </button>
                                <button
                                    onClick={() => setTempPackGroupingType("block-palette")}
                                    className={`py-3 rounded-xl border font-bold text-[10px] tracking-widest transition-all ${tempPackGroupingType === "block-palette" ? "bg-orange-500 border-orange-400 text-black shadow-lg shadow-orange-500/10" : "bg-black/40 border-white/5 text-gray-500 hover:border-white/10"}`}
                                >
                                    PALETTE
                                </button>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 tracking-widest uppercase">Target Name</label>
                                <input
                                    type="text"
                                    value={tempPackGroupingName}
                                    onChange={e => setTempPackGroupingName(e.target.value)}
                                    placeholder={
                                        tempPackGroupingType === "biome"
                                            ? "e.g., Desert, Ashlands..."
                                            : tempPackGroupingType === "structure"
                                                ? "e.g., Outpost, Ruins..."
                                                : tempPackGroupingType === "exploration-kit"
                                                    ? "e.g., Frontier Settlement Kit..."
                                                    : "e.g., Ashstone Palette..."
                                    }
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-purple-500/50 outline-none transition-all"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 tracking-widest uppercase">Description</label>
                                <textarea
                                    value={tempPackGroupingDescription}
                                    onChange={e => setTempPackGroupingDescription(e.target.value)}
                                    placeholder="Optional architectural or ecological details..."
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:border-purple-500/50 outline-none transition-all min-h-[80px] resize-none"
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <button
                                onClick={handleAssignPackToGrouping}
                                disabled={!tempPackGroupingName.trim() || isPackSaving}
                                className="w-full py-4 bg-purple-500 hover:bg-purple-400 disabled:opacity-20 text-black font-black uppercase tracking-[0.2em] rounded-2xl text-[11px] transition-all shadow-lg shadow-purple-500/20"
                            >
                                {isPackSaving ? "SYNCING..." : "CONFIRM ASSIGNMENT"}
                            </button>
                            <button
                                onClick={() => setIsAssigningPack(false)}
                                className="w-full py-3 text-[10px] font-bold text-gray-600 hover:text-gray-400 tracking-widest transition-all uppercase"
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                </Modal>


                {/* ── Icon Regeneration Frameless Overlay ── */}
                {
                    (editingIconFilename || editingTextureFilename) && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                            <div className="relative w-[700px] bg-[#0a1120] rounded-[24px] border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden animate-in fade-in zoom-in duration-200">
                                {/* Close button - Top Right */}
                                <button
                                    onClick={() => {
                                        setEditingIconFilename(null);
                                        setEditingTextureFilename(null);
                                    }}
                                    className="absolute top-6 right-6 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all z-20"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>

                                <div className="flex p-10 gap-10">
                                    {/* Left Column */}
                                    <div className="w-[200px] shrink-0 space-y-8">
                                        <div className="relative aspect-square bg-[#E6E6FA]/5 rounded-[20px] border border-[#E6E6FA]/10 flex items-center justify-center overflow-hidden shadow-inner">
                                            <div className="absolute inset-0 bg-gradient-to-br from-[#E6E6FA]/10 to-transparent opacity-40" />
                                            <img
                                                src={(editingIconFilename
                                                    ? activeBatch?.icons.find(i => i.filename === editingIconFilename)?.url
                                                    : activeTextureBatch?.textures.find(t => t.filename === editingTextureFilename)?.url
                                                ) + `?t=${lastRefreshedAt}`}
                                                className="w-32 h-32 relative z-10 drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]"
                                                alt="Current"
                                            />
                                        </div>

                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 px-1">
                                                <div className="w-1 h-3 bg-emerald-500 rounded-full" />
                                                <label className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">Subject</label>
                                            </div>
                                            <input
                                                type="text"
                                                value={tempIconItem}
                                                onChange={(e) => setTempIconItem(e.target.value)}
                                                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-medium focus:outline-none focus:border-emerald-500/40 transition-all placeholder:text-white/10"
                                                placeholder="Item name..."
                                            />
                                        </div>
                                    </div>

                                    {/* Right Column */}
                                    <div className="flex-1 flex flex-col gap-8 pt-2">
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between px-1">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1 h-3 bg-[#E6E6FA] rounded-full" />
                                                    <label className="text-[10px] text-[#E6E6FA] font-black uppercase tracking-widest">Global Style</label>
                                                </div>
                                                <div className="relative">
                                                    <div
                                                        className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center cursor-pointer hover:border-[#E6E6FA]/40 hover:bg-white/10 transition-all shadow-lg overflow-hidden group/ref"
                                                        onClick={() => document.getElementById(`modal-ref-upload`)?.click()}
                                                    >
                                                        {(tempIconRefImage || referenceImage) ? (
                                                            <img src={`data:image/png;base64,${tempIconRefImage || referenceImage}`} className="w-full h-full object-cover" alt="ref" />
                                                        ) : (
                                                            <svg className="w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                    <input id="modal-ref-upload" type="file" className="hidden" onChange={handleLocalImageUpload} />
                                                </div>
                                            </div>
                                            <textarea
                                                value={tempIconStyle}
                                                onChange={(e) => setTempIconStyle(e.target.value)}
                                                className="w-full bg-[#070b12]/50 border border-white/10 rounded-2xl px-5 py-4 text-[12px] text-white/50 font-mono focus:outline-none focus:border-[#E6E6FA]/40 min-h-[160px] resize-none leading-relaxed transition-all shadow-inner custom-scrollbar"
                                                placeholder="Artistic parameters..."
                                            />
                                        </div>

                                        <div className="flex items-center justify-between pt-4">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-2 h-2 rounded-full ${tempIconItem.trim() ? 'bg-emerald-500 shadow-[0_0_100px_rgba(16,185,129,0.5)]' : 'bg-white/10'}`} />
                                                <span className="text-[9px] text-white/20 font-black uppercase tracking-[0.2em]">
                                                    {tempIconItem.trim() ? 'Ready' : 'Awaiting subject'}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    if (editingIconFilename) {
                                                        const icon = activeBatch?.icons.find(i => i.filename === editingIconFilename);
                                                        if (icon) handleRegenerateIcon(icon);
                                                    } else if (editingTextureFilename) {
                                                        const texture = activeTextureBatch?.textures.find(t => t.filename === editingTextureFilename);
                                                        if (texture) handleRegenerateTexture(texture);
                                                    }
                                                }}
                                                disabled={(editingIconFilename ? regeneratingIconFilename === editingIconFilename : regeneratingTextureFilename === editingTextureFilename) || !tempIconItem.trim()}
                                                className={`px-10 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.2em] transition-all ${(editingIconFilename ? regeneratingIconFilename === editingIconFilename : regeneratingTextureFilename === editingTextureFilename)
                                                    ? "bg-white/5 text-white/10 cursor-not-allowed"
                                                    : "bg-white text-[#070b12] hover:bg-[#E6E6FA] shadow-[0_10px_40px_rgba(255,255,255,0.1)] hover:-translate-y-0.5"
                                                    }`}
                                            >
                                                {(editingIconFilename ? regeneratingIconFilename === editingIconFilename : regeneratingTextureFilename === editingTextureFilename) ? "..." : "⚡ Regenerate"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }
            </div>
        </div>
    );
}
