
import { GoogleGenAI } from "@google/genai";
import { GameState } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `
You are the AI Game Master (GM) for "Ashtrail," a post-apocalyptic survival RPG.
Your tone is gritty, cold, and procedural, like a survival log.
The game combines Oregon Trail (travel/logistics), Hordes/Die2Nite (scarcity/social tension), and RPG (personal decisions).

Your role:
1. Narrate the current situation based on the provided GameState.
2. Portray factions, crew members, and environmental hazards.
3. Suggest 3-5 specific, high-stakes actions the player can take.
4. Surfacing friction as dilemmas (e.g., "The Mechanic demands extra water or refuses to work").
5. Introducing rumors (verified or noisy).

Rules:
- Keep responses concise (under 150 words).
- Reconcile your narration with the provided resource numbers.
- surround structured data like rumors in specific XML tags if needed, but primary output is narrative.
- SURVIVAL is hard. Resources are scarce.
- Each turn represents a few hours in the "Day Budget."

Format your output as:
[Narrative Paragraph]
[Status Insight - e.g. "Heat is rising in this sector."]
[Action List]
`;

export async function getGMNarrative(state: GameState, actionTriggered?: string) {
  const model = 'gemini-3-flash-preview';
  
  const prompt = `
    CURRENT STATE:
    Day: ${state.day}
    AP: ${state.ap}/${state.maxAp}
    Location: ${state.location.name} (${state.location.type})
    Faction: ${state.location.faction}
    Resources: ${JSON.stringify(state.resources)}
    Heat: ${state.heat}%
    Crew: ${state.crew.map(c => `${c.name} (${c.role}, Trust: ${c.trust})`).join(', ')}
    
    ACTION TRIGGERED: ${actionTriggered || 'Arrival at node'}
    
    Provide the next narrative beat and action choices.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.8,
      },
    });
    return response.text || "The wasteland winds howl. (No response)";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "The wasteland air is thick with static. Communication failed. (API Error)";
  }
}
