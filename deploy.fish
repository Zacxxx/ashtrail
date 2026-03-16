#!/usr/bin/env fish

# Deployment script for Ashtrail to Google Cloud Run (Fish shell version)
# This script creates a new GCP project and deploys the application

echo "🚀 Ashtrail - Google Cloud Run Deployment"
echo "=========================================="
echo ""

# Check if gcloud is installed
if not command -v gcloud &> /dev/null
    echo "❌ Error: gcloud CLI is not installed"
    echo "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
end

# Prompt for project details
read -P "Enter new GCP project ID (e.g., ashtrail-hackathon-2024): " PROJECT_ID
read -P "Enter project name (e.g., Ashtrail Hackathon): " PROJECT_NAME
read -P "Enter billing account ID (leave empty to list available accounts): " BILLING_ACCOUNT

# List billing accounts if not provided
if test -z "$BILLING_ACCOUNT"
    echo ""
    echo "📋 Available billing accounts:"
    gcloud billing accounts list
    echo ""
    read -P "Enter billing account ID from the list above: " BILLING_ACCOUNT
end

# Confirm before proceeding
echo ""
echo "📝 Deployment Configuration:"
echo "   Project ID: $PROJECT_ID"
echo "   Project Name: $PROJECT_NAME"
echo "   Billing Account: $BILLING_ACCOUNT"
echo "   Region: us-central1"
echo ""
read -P "Continue with deployment? (y/n): " CONFIRM

if test "$CONFIRM" != "y"
    echo "Deployment cancelled."
    exit 0
end

echo ""
echo "🔧 Creating new GCP project..."
gcloud projects create $PROJECT_ID --name="$PROJECT_NAME"; or echo "⚠️  Project might already exist, continuing..."

echo "💳 Linking billing account..."
gcloud billing projects link $PROJECT_ID --billing-account=$BILLING_ACCOUNT

echo "🔌 Setting active project..."
gcloud config set project $PROJECT_ID

echo "⚡ Enabling required APIs..."
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    containerregistry.googleapis.com \
    artifactregistry.googleapis.com

echo ""
echo "🏗️  Building and deploying to Cloud Run..."
echo "This may take several minutes..."
echo ""

# Build and deploy using Cloud Build
gcloud builds submit --config=cloudbuild.yaml

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Your application should be available at:"
gcloud run services describe ashtrail-devtools --region=us-central1 --format='value(status.url)'
echo ""
echo "📊 View logs:"
echo "   gcloud run logs read ashtrail-devtools --region=us-central1"
echo ""
echo "🔧 Manage service:"
echo "   https://console.cloud.google.com/run?project=$PROJECT_ID"
echo ""
