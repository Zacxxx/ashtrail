import { GameState } from '@ashtrail/core';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || '/api';

function apiUrl(path: string): string {
  const base = API_BASE.endsWith('/') ? API_BASE.slice(0, -1) : API_BASE;
  return `${base}${path}`;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`API ${response.status}: ${details || 'Request failed'}`);
  }

  return response.json() as Promise<T>;
}

export async function iterateNarrativeViaApi(state: GameState, action: string): Promise<string> {
  const data = await postJson<{ text?: string }>('/gm/iterate-narrative', { state, action });
  return data.text || '';
}

export async function architectInitialLoreViaApi(characterName: string, history: string): Promise<string | null> {
  const data = await postJson<{ text?: string }>('/gm/architect-initial-lore', { characterName, history });
  return data.text || null;
}

export async function enhanceAppearancePromptViaApi(params: Record<string, string>): Promise<string> {
  const data = await postJson<{ text?: string }>('/gm/enhance-appearance-prompt', { params });
  return data.text || '';
}

export async function generateCharacterPortraitViaApi(prompt: string): Promise<string | null> {
  const data = await postJson<{ dataUrl?: string | null }>('/gm/generate-character-portrait', { prompt });
  return data.dataUrl || null;
}
