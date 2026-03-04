import {
  iterateNarrative
} from '../../../packages/core/src/game-master/worldbuilder/iteration';
import {
  architectInitialLore,
  enhanceAppearancePrompt,
  generateCharacterPortrait
} from '../../../packages/core/src/game-master/worldarchitect/story';

const PORT = Number(process.env.PORT || 8788);
const ALLOWED_ORIGIN = process.env.WEBSITE_ORIGIN || '*';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': ALLOWED_ORIGIN,
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization',
    },
  });
}

async function parseJson(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

Bun.serve({
  port: PORT,
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': ALLOWED_ORIGIN,
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'content-type,authorization',
        },
      });
    }

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return jsonResponse({ ok: true });
    }

    if (request.method === 'POST' && url.pathname === '/api/gm/iterate-narrative') {
      const body = await parseJson(request);
      if (!body?.state || typeof body?.action !== 'string') {
        return jsonResponse({ error: 'Invalid payload.' }, 400);
      }

      const text = await iterateNarrative(body.state, body.action);
      return jsonResponse({ text: text || '' });
    }

    if (request.method === 'POST' && url.pathname === '/api/gm/architect-initial-lore') {
      const body = await parseJson(request);
      if (typeof body?.characterName !== 'string' || typeof body?.history !== 'string') {
        return jsonResponse({ error: 'Invalid payload.' }, 400);
      }

      const text = await architectInitialLore(body.characterName, body.history);
      return jsonResponse({ text: text || '' });
    }

    if (request.method === 'POST' && url.pathname === '/api/gm/enhance-appearance-prompt') {
      const body = await parseJson(request);
      if (!body?.params || typeof body.params !== 'object') {
        return jsonResponse({ error: 'Invalid payload.' }, 400);
      }

      const text = await enhanceAppearancePrompt(body.params);
      return jsonResponse({ text: text || '' });
    }

    if (request.method === 'POST' && url.pathname === '/api/gm/generate-character-portrait') {
      const body = await parseJson(request);
      if (typeof body?.prompt !== 'string' || !body.prompt.trim()) {
        return jsonResponse({ error: 'Invalid payload.' }, 400);
      }

      const dataUrl = await generateCharacterPortrait(body.prompt);
      return jsonResponse({ dataUrl: dataUrl || null });
    }

    return jsonResponse({ error: 'Not found.' }, 404);
  },
});

console.log(`[ashtrail/server] listening on http://localhost:${PORT}`);
