
import { GoogleGenAI } from "@google/genai";


// Initialize with environmental API Key
// We use a safe check to avoid crashing the module load if the key is missing in the browser
const getApiKey = () => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY || "";
  }
  return "";
};

const apiKey = getApiKey();
export const ai = new GoogleGenAI({ apiKey: apiKey || "MISSING_API_KEY" });


export const GM_MODELS = {
  narrative: 'gemini-3-flash-preview',
  complex: 'gemini-3-pro-preview',
  image: 'gemini-2.5-flash-image'
};

export const GM_BASE_INSTRUCTION = `
You are the "Director" — a Lead Game Master Agent for the Ashtrail Multimodal RPG. 
This project is a TECHNICAL SHOWCASE for the Gemini Live Agent Challenge (Creative Storyteller Track).

YOUR CORE DIRECTIVE:
Prove that AI can eliminate the 'static content' problem of RPGs.
Every NPC, every quest, and every narrative beat must be PROCEDURALLY MANIFESTED based on the player's unique state.

CORE PRINCIPLES:
1. MULTIMODAL REASONING: Your prose provides the sensory data for our image synthesis pipelines. Be vivid and gritty.
2. RESOURCE GROUNDING: Reconcile your narrative with the Player's resources (Food, Water, Fuel). If AP is low, the prose should feel physically taxing.
3. DIRECTOR LOGS: Occasionally include internal reasoning snippets in brackets, like [DIRECTOR_LOG: Synthesizing social friction due to low Trust].
4. PROCEDURAL SOCIAL AGENTS: Generate NPCs with distinct neural traits and agendas. Do not use generic dialogue trees.

TONE:
Clinical, gritty, and survival-focused. Think "Post-Apocalyptic System Log."
`;
