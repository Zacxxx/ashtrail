export type GeneratedMediaStatus = "success" | "partial_success" | "error";

export interface GeneratedMediaAudioAsset {
    url: string;
    durationSeconds: number;
    mimeType: string;
}

export interface GeneratedMediaImageAsset {
    url: string;
    mimeType: string;
}

export interface GeneratedMediaMetadata {
    title: string;
    description: string;
    intent: string;
    tags: string[];
}

export interface GeneratedMediaAudioArtifact {
    type: "generated_media_audio";
    status: GeneratedMediaStatus;
    audio?: GeneratedMediaAudioAsset | null;
    image?: GeneratedMediaImageAsset | null;
    metadata: GeneratedMediaMetadata;
    warnings?: string[];
}

export interface InterleavedTranscript {
    model: string;
    logicalToolName: string;
    apiToolName: string;
    toolCalled: boolean;
    thoughtSignatureDetected: boolean;
    toolArguments?: Record<string, unknown> | null;
    finalResponseText: string;
}

export interface GeneratedMediaAudioResult {
    artifact: GeneratedMediaAudioArtifact;
    transcript: InterleavedTranscript;
}

export interface DemoStepOneArtifact {
    type: "demo_step_one_interleaved";
    status: GeneratedMediaStatus;
    audio?: GeneratedMediaAudioAsset | null;
    image?: GeneratedMediaImageAsset | null;
    loreText: string;
    metadata: GeneratedMediaMetadata;
    storyOptions: DemoStepOneStoryOption[];
    warnings?: string[];
}

export interface DemoStepOneResult {
    artifact: DemoStepOneArtifact;
    transcript: InterleavedTranscript;
}

export interface DemoStepOneStoryOption {
    id: string;
    title: string;
    promptSeed: string;
}

export interface DemoStepOneSelectionArtifact {
    type: "demo_step_one_selection";
    status: GeneratedMediaStatus;
    selectedOptionId: string;
    selectedOptionTitle: string;
    additionalLoreParagraphs: string[];
    warnings?: string[];
}

export interface DemoStepOneSelectionResult {
    artifact: DemoStepOneSelectionArtifact;
    transcript: InterleavedTranscript;
}

export interface DemoStepTwoStats {
    strength: number;
    agility: number;
    intelligence: number;
    wisdom: number;
    endurance: number;
    charisma: number;
}

export interface DemoStepTwoWeapon {
    id: string;
    name: string;
    description: string;
    rarity: string;
    weaponType: string;
    weaponRange: number;
    baseDamage: number;
}

export interface DemoStepTwoSkill {
    id: string;
    name: string;
    description: string;
    apCost: number;
    minRange: number;
    maxRange: number;
    cooldown: number;
    effectType: string;
}

export interface DemoStepTwoCharacterPackage {
    id: string;
    name: string;
    age: number;
    gender: string;
    level: number;
    title: string;
    faction: string;
    occupationName: string;
    location: string;
    appearancePrompt: string;
    stats: DemoStepTwoStats;
    weapon: DemoStepTwoWeapon;
    uniqueSkills: DemoStepTwoSkill[];
    loreText: string;
}

export interface DemoStepTwoAssetRef {
    url: string;
    mimeType: string;
}

export interface DemoStepTwoArtifact {
    type: "demo_step_two_interleaved";
    status: GeneratedMediaStatus;
    worldId?: string | null;
    character: DemoStepTwoCharacterPackage;
    portrait?: DemoStepTwoAssetRef | null;
    voice?: DemoStepTwoAssetRef | null;
    warnings?: string[];
}

export interface DemoStepTwoResult {
    artifact: DemoStepTwoArtifact;
    rawJson: Record<string, unknown>;
}

export function isGeneratedMediaAudioResult(value: unknown): value is GeneratedMediaAudioResult {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    const artifact = candidate.artifact as Record<string, unknown> | undefined;
    const transcript = candidate.transcript as Record<string, unknown> | undefined;
    return artifact?.type === "generated_media_audio"
        && typeof transcript?.finalResponseText === "string";
}

export function isDemoStepOneResult(value: unknown): value is DemoStepOneResult {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    const artifact = candidate.artifact as Record<string, unknown> | undefined;
    const transcript = candidate.transcript as Record<string, unknown> | undefined;
    return artifact?.type === "demo_step_one_interleaved"
        && typeof artifact?.loreText === "string"
        && Array.isArray(artifact?.storyOptions)
        && typeof transcript?.finalResponseText === "string";
}

export function isDemoStepOneSelectionResult(value: unknown): value is DemoStepOneSelectionResult {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    const artifact = candidate.artifact as Record<string, unknown> | undefined;
    const transcript = candidate.transcript as Record<string, unknown> | undefined;
    return artifact?.type === "demo_step_one_selection"
        && Array.isArray(artifact?.additionalLoreParagraphs)
        && typeof transcript?.finalResponseText === "string";
}

export function isDemoStepTwoResult(value: unknown): value is DemoStepTwoResult {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    const artifact = candidate.artifact as Record<string, unknown> | undefined;
    const character = artifact?.character as Record<string, unknown> | undefined;
    return artifact?.type === "demo_step_two_interleaved"
        && typeof character?.name === "string"
        && typeof character?.loreText === "string";
}
