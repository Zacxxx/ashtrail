export interface DemoStepOneGenerateRequest {
    prompt?: string | null;
    songDurationSeconds?: number | null;
}

export interface DemoStepOneSelectionRequest {
    sourceJobId: string;
    worldTitle: string;
    baseLoreText: string;
    optionId: string;
    optionTitle: string;
    optionPromptSeed: string;
}

export const DEMO_STEP_ONE_DEFAULT_REQUEST: DemoStepOneGenerateRequest = {
    prompt: [
        "Create the first Ashtrail demo beat as one coordinated interleaved generation package.",
        "Generate a seamless equirectangular alien planetary texture for a rotating globe seen from orbit.",
        "Generate concise world-introduction lore for a cinematic game demo panel.",
        "Generate a matching instrumental song cue for this same world-introduction beat.",
        "Keep image, lore, and music coherent, atmospheric, and clearly part of one unified scene package.",
    ].join(" "),
    songDurationSeconds: 18,
};

export const DEMO_STEP_ONE_INTRO_LINES = [
    "Ashtrail demonstrates interleaved content generation for a video-game context.",
    "One coordinated generation pass is assembling image, lore, and music into a synchronized world-introduction package.",
    "To tell a story you must have a world...",
    "Everybody deserves it's own planet, here is yours."
];

export const DEMO_STEP_ONE_DIRECTION_PROMPT = "Choose the direction that should define this world.";
