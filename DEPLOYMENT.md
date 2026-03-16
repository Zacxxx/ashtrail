# Ashtrail - Google Cloud Run Deployment Guide

This guide will help you deploy Ashtrail to Google Cloud Run in a new project.

## Prerequisites

- Google Cloud CLI (`gcloud`) installed and authenticated
- A Google Cloud billing account
- Docker (Cloud Build will handle the build)

## Quick Deploy (Fish Shell)

```fish
chmod +x deploy.fish
./deploy.fish
```

## Quick Deploy (Bash/Zsh)

```bash
chmod +x deploy.sh
./deploy.sh
```

## Manual Deployment Steps (Fish Shell)

If you prefer to run commands manually or need more control:

### 1. Set your variables

```fish
set PROJECT_ID "ashtrail-hackathon-2024"  # Change this to your desired project ID
set PROJECT_NAME "Ashtrail Hackathon"
set REGION "us-central1"
```

### 2. List billing accounts and set one

```fish
gcloud billing accounts list
set BILLING_ACCOUNT "YOUR-BILLING-ACCOUNT-ID"  # Copy from the list above
```

### 3. Create and configure the project

```fish
# Create project
gcloud projects create $PROJECT_ID --name="$PROJECT_NAME"

# Link billing
gcloud billing projects link $PROJECT_ID --billing-account=$BILLING_ACCOUNT

# Set as active project
gcloud config set project $PROJECT_ID
```

### 4. Enable required APIs

```fish
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    containerregistry.googleapis.com \
    artifactregistry.googleapis.com
```

### 5. Build and deploy

```fish
# This will build the Docker image and deploy to Cloud Run
gcloud builds submit --config=cloudbuild.yaml
```

### 6. Get your service URL

```fish
gcloud run services describe ashtrail-devtools --region=$REGION --format='value(status.url)'
```

## Environment Variables

To add environment variables to your Cloud Run service:

```fish
gcloud run services update ashtrail-devtools \
    --region=us-central1 \
    --set-env-vars="GEMINI_API_KEY=your_key_here,GOOGLE_GENAI_API_KEY=your_key_here"
```

## Useful Commands

### View logs

```fish
gcloud run logs read ashtrail-devtools --region=us-central1 --limit=50
```

### Update service configuration

```fish
# Increase memory
gcloud run services update ashtrail-devtools --region=us-central1 --memory=4Gi

# Increase CPU
gcloud run services update ashtrail-devtools --region=us-central1 --cpu=4

# Set max instances
gcloud run services update ashtrail-devtools --region=us-central1 --max-instances=20
```

### Redeploy after code changes

```fish
gcloud builds submit --config=cloudbuild.yaml
```

### Delete the service

```fish
gcloud run services delete ashtrail-devtools --region=us-central1
```

### Delete the entire project

```fish
gcloud projects delete $PROJECT_ID
```

## Troubleshooting

### Build fails with "permission denied"

Make sure Cloud Build has the necessary permissions:

```fish
set PROJECT_NUMBER (gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$PROJECT_NUMBER@cloudbuild.gserviceaccount.com" \
    --role="roles/run.admin"
```

### Service won't start

Check the logs:

```fish
gcloud run logs read ashtrail-devtools --region=us-central1 --limit=100
```

### Need to update environment variables

```fish
gcloud run services update ashtrail-devtools \
    --region=us-central1 \
    --update-env-vars="KEY=value"
```

## Cost Considerations

Cloud Run pricing is based on:
- CPU and memory allocation
- Request count
- Execution time

For the hackathon, the free tier should cover basic usage. Monitor your costs at:
https://console.cloud.google.com/billing

## Next Steps

After deployment:
1. Set your environment variables (especially API keys)
2. Test the deployment by visiting the service URL
3. Monitor logs for any issues
4. Configure custom domain if needed
