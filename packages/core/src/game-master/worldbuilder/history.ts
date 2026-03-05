import { ai, GM_MODELS, GM_BASE_INSTRUCTION } from '../main/gemini';

export interface HistoryContext {
    factions: string;
    worldLore: string;
    areas: string;
    previousEvents: { month: number; description: string }[];
}

export async function generateHistoryEvent(context: HistoryContext, action: string, month: number) {
    const previousEventsStr = context.previousEvents
        .slice(-3) // include up to the last 3 months for context
        .map(e => `Month ${e.month}: ${e.description}`)
        .join('\n');

    const prompt = `
    WORLD HISTORY PROTOCOL:
    Target Month: ${month}
    Factions in Play: ${context.factions}
    World Lore context: ${context.worldLore}
    Areas of Interest: ${context.areas}

    Previous Monthly Events:
    ${previousEventsStr || "None (Year 1, Month 1)"}

    Intended Action / Focus for Month ${month}: ${action}

    Generate the historical narrative for Month ${month} based on the action and the given context.
    Keep the response concise (1-2 short paragraphs) but highly evocative of a dark sci-fi or fantasy universe of Ashtrail. Focus on consequences, shifting power dynamics, or environmental changes.
  `;

    try {
        const response = await ai.models.generateContent({
            model: GM_MODELS.narrative,
            contents: prompt,
            config: {
                systemInstruction: GM_BASE_INSTRUCTION + " You are the Historian of Ashtrail. Document the timeline objectively but with a focus on dramatic shifts.",
                temperature: 0.8,
            },
        });
        return response.text;
    } catch (e) {
        console.error("Historian Error:", e);
        return "The timeline fractured. Records for this era are lost.";
    }
}
