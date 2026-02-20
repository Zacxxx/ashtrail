
import { ai, GM_MODELS, GM_BASE_INSTRUCTION } from '../main/gemini';
import { GameState } from '../../types';

export async function iterateNarrative(state: GameState, action: string) {
  const prompt = `
    ITERATION PROTOCOL:
    Day: ${state.day}
    Location: ${state.location.name}
    Action: ${action}
    Resources: ${JSON.stringify(state.resources)}
    Heat: ${state.heat}%
    
    Describe the outcome of this action and suggest 3 subsequent operational paths.
  `;

  try {
    const response = await ai.models.generateContent({
      model: GM_MODELS.narrative,
      contents: prompt,
      config: {
        systemInstruction: GM_BASE_INSTRUCTION + " You are the World Builder. Focus on immediate consequences and resource scarcity.",
        temperature: 0.7,
      },
    });
    return response.text;
  } catch (e) {
    console.error("Builder Error:", e);
    return "Communication lost in the Ash. Static remains.";
  }
}
