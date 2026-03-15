import type { GeneratedMediaStatus, GeneratedMediaImageAsset, GeneratedMediaMetadata, InterleavedTranscript } from "./generatedMediaAudio";

export interface GeneratedMediaVideoAsset {
    url: string;
    durationSeconds: number;
    mimeType: string;
    aspectRatio: string;
    resolution: string;
    keepVeoAudio: boolean;
}

export interface GeneratedMediaNarrationSegment {
    segmentId: string;
    startMs: number;
    endMs: number;
    text: string;
    audioUrl: string;
    mimeType: string;
    duckVideoTo: number;
}

export interface GeneratedMediaNarration {
    language: string;
    voiceName: string;
    script: string;
    segments: GeneratedMediaNarrationSegment[];
}

export interface GeneratedMediaVideoArtifact {
    type: "generated_media_video";
    status: GeneratedMediaStatus;
    video?: GeneratedMediaVideoAsset | null;
    poster?: GeneratedMediaImageAsset | null;
    narration?: GeneratedMediaNarration | null;
    metadata: GeneratedMediaMetadata;
    warnings?: string[];
}

export interface GeneratedMediaVideoResult {
    artifact: GeneratedMediaVideoArtifact;
    transcript: InterleavedTranscript;
}

export function isGeneratedMediaVideoResult(value: unknown): value is GeneratedMediaVideoResult {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    const artifact = candidate.artifact as Record<string, unknown> | undefined;
    const transcript = candidate.transcript as Record<string, unknown> | undefined;
    return artifact?.type === "generated_media_video"
        && typeof transcript?.finalResponseText === "string";
}
