
import { ai, GM_MODELS, GM_BASE_INSTRUCTION } from '../main/gemini';
import { ALL_TRAITS } from '../../mockData';
import { Type } from '@google/genai';

export async function architectInitialLore(characterName: string, history: string) {
  const prompt = `
    ARCHITECT PROTOCOL: Generate a unique 3-paragraph lore introduction for a new survivor.
    Name: ${characterName}
    Backstory Summary: ${history}
    Include a specific regional rumor about the first node "Iron Gate Station".
  `;

  try {
    const response = await ai.models.generateContent({
      model: GM_MODELS.narrative,
      contents: prompt,
      config: {
        systemInstruction: GM_BASE_INSTRUCTION + " You are the World Architect. Establish the mission stakes.",
        temperature: 0.9,
      },
    });
    return response.text;
  } catch (e) {
    console.error("Architect Error:", e);
    return null;
  }
}

export async function enhanceAppearancePrompt(params: Record<string, string>) {
  const prompt = `
    Transform character appearance parameters into a gritty, atmospheric 2-sentence worded description for a post-apocalyptic survivor.
    
    Context:
    Gender: ${params.gender}
    Age: ${params.age}
    
    Physical Parameters:
    ${Object.entries(params).filter(([k]) => k !== 'gender' && k !== 'age').map(([k, v]) => `${k}: ${v}`).join(', ')}
    
    Return ONLY the description text. Focus on how the ash-filled world has weathered their specific features.
  `;

  try {
    const response = await ai.models.generateContent({
      model: GM_MODELS.narrative,
      contents: prompt,
      config: {
        systemInstruction: "You are a creative writer. Turn technical character attributes into immersive prose. Ensure gender and age are reflected in tone and vocabulary.",
        temperature: 0.7,
      },
    });
    return response.text;
  } catch (e) {
    console.error("Enhance Prompt Error:", e);
    return Object.values(params).join(', ');
  }
}

export async function analyzeHistoryForTraits(history: string) {
  const traitListStr = ALL_TRAITS.map(t => `${t.id}: ${t.name}`).join(', ');
  const prompt = `
    Analyze the following character history and suggest 5 suitable trait IDs from this list: [${traitListStr}]
    
    Character History:
    "${history}"
    
    Return only a JSON array of 5 string IDs.
  `;

  try {
    const response = await ai.models.generateContent({
      model: GM_MODELS.narrative,
      contents: prompt,
      config: {
        systemInstruction: "You are a RPG character builder. Analyze text and suggest matching traits from the provided list.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      },
    });
    const ids = JSON.parse(response.text || '[]');
    return ALL_TRAITS.filter(t => ids.includes(t.id));
  } catch (e) {
    console.error("Trait Analysis Error:", e);
    return [];
  }
}

export async function generateCharacterPortrait(prompt: string) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { text: `A gritty, high-detail post-apocalyptic character portrait. Style: Realistic, atmospheric, cinematic lighting. Key Subject: ${prompt}` }
        ]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (e) {
    console.error("Portrait Generation Error:", e);
    return null;
  }
}
