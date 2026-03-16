# Ashtrail - Google Cloud Run Deployment Guide

This guide will help you deploy Ashtrail to Google Cloud Run in a new project for the hackathon.

## Prerequisites

- Google Cloud SDK (gcloud) installed and configured
- Active Google Cloud billing account
- Docker (for local testing, optional)

## Quick Deployment

Run the automated deployment script:

```bash
./deploy.sh
```

The script will:
1. Prompt you for a new GCP project ID and name
2. Ask for your billing account ID (or list available accounts)
3. Create the new project and link billing
4. Enable required APIs (Cloud Build, Cloud Run, Container Registry)
5. Build and deploy your application

## Manual Deployment

If you prefer to deploy manually:

### 1. Create a new GCP project

```bash
# Set your project details
export PROJECT_ID="ashtrail-hackathon-2024"
export PROJECT_NAME="Ashtrail Hackathon"
export BILLING_ACCOUNT="YOUR-BILLING-ACCOUNT-ID"

# Create project
gcloud projects create $PROJECT_ID --name="$PROJECT_NAME"

# Link billing
gcloud billing projects link $PROJECT_ID --billing-account=$BILLING_ACCOUNT

# Set as active project
gcloud config set project $PROJECT_ID
```

### 2. Enable required APIs

```bash
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    containerregistry.googleapis.com \
    artifactregistry.googleapis.com
```

### 3. Build and deploy

```bash
gcloud builds submit --config=cloudbuild.yaml
```

## Environment Variables

To set environment variables for your Cloud Run service:

```bash
gcloud run services update ashtrail-devtools \
    --region=us-central1 \
    --set-env-vars="GEMINI_API_KEY=your_key_here,GOOGLE_GENAI_API_KEY=your_key_here"
```

## Accessing Your Deployment

After deployment, get your service URL:

```bash
gcloud run services describe ashtrail-devtools \
    --region=us-central1 \
    --format='value(status.url)'
```

## Viewing Logs

```bash
gcloud run logs read ashtrail-devtools --region=us-central1 --limit=50
```

## Updating the Deployment

To redeploy after making changes:

```bash
gcloud builds submit --config=cloudbuild.yaml
```

## Cost Management

Cloud Run charges based on:
- Request count
- CPU and memory usage during request processing
- Container instance time

To minimize costs:
- Set appropriate memory limits (currently 2Gi)
- Configure max instances (currently 10)
- Use the free tier (2 million requests/month)

## Troubleshooting

### Build fails
- Check that all dependencies are properly specified
- Verify Rust and Bun versions in Dockerfile
- Review build logs: `gcloud builds log <BUILD_ID>`

### Service won't start
- Check logs: `gcloud run logs read ashtrail-devtools --region=us-central1`
- Verify PORT environment variable is being used
- Ensure all required files are included (check .gcloudignore)

### API errors
- Verify GEMINI_API_KEY is set correctly
- Check that Vertex AI API is enabled if using music generation
- Review service account permissions

## Security Notes

- The service is deployed with `--allow-unauthenticated` for hackathon demo purposes
- For production, consider adding authentication
- Never commit API keys or credentials to the repository
- Use Secret Manager for sensitive configuration

## Additional Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud Build Documentation](https://cloud.google.com/build/docs)
- [Gemini API Documentation](https://ai.google.dev/docs)
