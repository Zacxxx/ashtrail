# Deploy Ashtrail properly (free tiers): server + website

This setup keeps Gemini keys on the server only.

- `apps/server`: deploy to **Cloud Run** (free tier quotas)
- `apps/website`: deploy to **Firebase Hosting Spark** (free)

## 0) Prerequisites

- Bun, Node.js, Docker
- `gcloud` CLI logged in
- `firebase-tools` installed (`npm i -g firebase-tools`)
- A Google Cloud project with billing enabled (needed for Cloud Run usage, still has free tier)

## 1) Enable APIs (one-time)

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

## 2) Deploy `apps/server` to Cloud Run

Set values:

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="us-central1"
export SERVICE_NAME="ashtrail-gm-api"
export GOOGLE_GENAI_API_KEY="your_real_key"
```

Build container from repo root using `apps/server/Dockerfile`:

```bash
gcloud builds submit \
  --project "$PROJECT_ID" \
  --tag "gcr.io/$PROJECT_ID/$SERVICE_NAME:latest" \
  -f apps/server/Dockerfile \
  .
```

Deploy image to Cloud Run:

```bash
gcloud run deploy "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --image "gcr.io/$PROJECT_ID/$SERVICE_NAME:latest" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars "GOOGLE_GENAI_API_KEY=$GOOGLE_GENAI_API_KEY"
```

Get the service URL:

```bash
export API_BASE_URL="$(gcloud run services describe "$SERVICE_NAME" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')/api"
echo "$API_BASE_URL"
```

## 3) Configure website to use Cloud Run API

Create/update root `.env.local`:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SUPABASE_CHARACTER_BUCKET=public-assets
VITE_API_BASE_URL=https://your-cloud-run-url/api
```

Do **not** put `GOOGLE_GENAI_API_KEY` in website env.

## 4) Deploy `apps/website` to Firebase Hosting (Spark)

Create Firebase project (Spark) in console, then:

```bash
cp .firebaserc.example .firebaserc
# edit .firebaserc -> set your firebase project id
firebase login
firebase deploy --only hosting
```

`firebase.json` already builds and publishes only website:

- `bun run build:website`
- publish directory: `apps/website/dist`

## 5) Local development

Run server + website together:

```bash
bun run dev:website:full
```

The Vite dev server proxies `/api/*` to local server `http://127.0.0.1:8788`.
