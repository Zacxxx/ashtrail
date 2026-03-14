# Dev Tools Backend (Rust)

This backend powers `/worldgen`, generation history, image jobs, and local asset/supabase sync.

## Environment Variables

### Required for Gemini features

`GEMINI_API_KEY`
- Required for image/text generation endpoints.
- If missing, model catalog still returns but models are marked unavailable.

### Required for Lyria / Vertex AI song generation

`VERTEX_API_KEY`
- Optional.
- If present, backend tries a simpler Vertex API key flow first for `lyria-002`.
- If that fails and OAuth config is also present, backend falls back to the service-account flow.

`VERTEX_PROJECT_ID`
- Required for the OAuth/service-account flow.
- Optional if `VERTEX_API_KEY` works for your setup.

`GOOGLE_APPLICATION_CREDENTIALS`
- Required for the OAuth/service-account flow.
- Must point to a service-account JSON key file used for Vertex AI OAuth.

`VERTEX_LOCATION`
- Optional.
- Default: `us-central1`

`VERTEX_LYRIA_MODEL`
- Optional.
- Default: `lyria-002`

### Image model registry (worldgen province refinement)

`AI_IMAGE_MODELS`
- Optional. Comma-separated model entries.
- Entry format: `model_id|Display Label`
- Example:
  `gemini-3.1-flash-image-preview|Nano Banana 2,gemini-3-pro-image-preview|Gemini 3 Pro Image Preview`
- If omitted/invalid, backend falls back to built-in defaults.

`AI_IMAGE_DEFAULT_MODEL`
- Optional. Must match one `model_id` present in `AI_IMAGE_MODELS`.
- If missing or invalid, first configured model is used.

`AI_IMAGE_FALLBACK_CHAIN`
- Optional. Comma-separated ordered model IDs used after the selected/default model fails.
- Example:
  `gemini-3-pro-image-preview,gemini-2.5-flash-image`
- If omitted, backend auto-derives fallbacks from configured models (excluding default).

### Province refinement job protection

`WORLDGEN_REFINE_MAX_CONCURRENT`
- Optional integer, minimum `1`.
- Default: `1`
- Controls max concurrent refine jobs actively calling models.

`WORLDGEN_REFINE_MAX_QUEUE`
- Optional integer, minimum `0`.
- Default: `3`
- Controls how many queued refine jobs are accepted beyond active concurrency.
- Requests exceeding `max_concurrent + max_queue` are rejected with `429`.

### Supabase sync (optional)

`SUPABASE_URL`  
`SUPABASE_SERVICE_ROLE_KEY`  
`SUPABASE_BUCKET`  
`SUPABASE_STORAGE_PREFIX` (optional, default `ashtrail`)

## Example `.env.local`

```env
GEMINI_API_KEY=your_key
VERTEX_API_KEY=your_vertex_api_key
VERTEX_PROJECT_ID=your_gcp_project
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
VERTEX_LOCATION=us-central1
VERTEX_LYRIA_MODEL=lyria-002

AI_IMAGE_MODELS=gemini-3.1-flash-image-preview|Nano Banana 2,gemini-3-pro-image-preview|Gemini 3 Pro Image Preview,gemini-2.5-flash-image|Gemini 2.5 Flash Image
AI_IMAGE_DEFAULT_MODEL=gemini-3.1-flash-image-preview
AI_IMAGE_FALLBACK_CHAIN=gemini-3-pro-image-preview,gemini-2.5-flash-image

WORLDGEN_REFINE_MAX_CONCURRENT=1
WORLDGEN_REFINE_MAX_QUEUE=3
```
