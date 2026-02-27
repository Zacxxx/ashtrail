# Deploy `apps/website` to Google Firebase Hosting (Free Spark tier)

This setup deploys only the website client (`apps/website`) as a static SPA.

## 0) Prerequisites

- Node.js and Bun installed
- Google account with access to Firebase
- Firebase CLI (one-time):

```bash
npm i -g firebase-tools
```

## 1) Create a free Firebase project (Spark)

1. Open https://console.firebase.google.com/
2. Create Project
3. Keep **Spark (No-cost)** plan
4. Skip optional products for now (Analytics, etc.)

## 2) Configure this repo with your project id

From repo root (`/home/moebius/dev/projects/ashtrail`):

```bash
cp .firebaserc.example .firebaserc
```

Edit `.firebaserc` and replace:

- `your-firebase-project-id` -> your actual Firebase project id

## 3) Login once in CLI

```bash
firebase login
```

## 4) Set required frontend env vars

Because this is a static build, frontend env values are baked into JS at build time.

Create/update root `.env.local` with at least:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SUPABASE_CHARACTER_BUCKET=public-assets
```

Optional (if using Gemini directly in browser):

```env
GOOGLE_GENAI_API_KEY=...
```

## 5) Build + deploy only website hosting

```bash
firebase deploy --only hosting
```

This uses repo `firebase.json`:

- Builds `apps/website` via `bun run build:website`
- Publishes `apps/website/dist`
- Rewrites all routes to `index.html` (SPA)

## 6) Future deploys

After changes to website client:

```bash
firebase deploy --only hosting
```

## Notes / security

- Any key bundled into the frontend is public by definition.
- In this project, `GOOGLE_GENAI_API_KEY` can be embedded client-side by Vite config.
- For production security, route Gemini calls through `apps/server` and keep private keys server-side.
