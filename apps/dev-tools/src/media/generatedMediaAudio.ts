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

export function isGeneratedMediaAudioResult(value: unknown): value is GeneratedMediaAudioResult {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    const artifact = candidate.artifact as Record<string, unknown> | undefined;
    const transcript = candidate.transcript as Record<string, unknown> | undefined;
    return artifact?.type === "generated_media_audio"
        && typeof transcript?.finalResponseText === "string";
}
