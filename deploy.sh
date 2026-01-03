#!/bin/bash

# Configuration
PROJECT_ID="gen-lang-client-0725532671"  # REPLACE THIS
APP_NAME="doctect"
REGION="us-central1"
REPO_NAME="doctect-repo" # You might need to create this in Artifact Registry first

# 1. Access Google Cloud
echo "Logging in to Google Cloud..."
gcloud auth login
gcloud config set project $PROJECT_ID

# 2. Enable Services (if not already enabled)
echo "Enabling necessary services..."
gcloud services enable run.googleapis.com artifactregistry.googleapis.com

# 2b. Create Artifact Registry Repository (if not exists)
echo "Ensuring Artifact Registry repository exists..."
gcloud artifacts repositories create $REPO_NAME \
    --repository-format=docker \
    --location=$REGION \
    --description="Docker repository for Doctect" \
    || echo "Repository $REPO_NAME likely already exists, skipping creation."

# 3. Authenticate Docker (Explicit Login for sudo)
echo "Configuring Docker authentication..."
# gcloud auth configure-docker ${REGION}-docker.pkg.dev
# We use explicit login because sudo docker cannot see user's gcloud credential helper
gcloud auth print-access-token | sudo docker login -u oauth2accesstoken --password-stdin https://${REGION}-docker.pkg.dev

# 4. Build, Tag and Push Image
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${APP_NAME}:latest"

echo "Building Docker image..."
sudo docker build -t ${APP_NAME}:latest .

echo "Tagging image as $IMAGE_URI..."
sudo docker tag ${APP_NAME}:latest $IMAGE_URI

echo "Pushing image..."
sudo docker push $IMAGE_URI

# 5. Deploy to Cloud Run
echo "Deploying to Cloud Run..."
# Load environment variables from .env
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Fallback prompts if sensitive vars are missing
if [ -z "$GOOGLE_CLIENT_ID" ]; then
    read -p "Enter your Google Client ID: " GOOGLE_CLIENT_ID
fi

if [ -z "$GOOGLE_CLIENT_SECRET" ]; then
    read -p "Enter your Google Client Secret: " GOOGLE_CLIENT_SECRET
fi

if [ -z "$ADMIN_EMAILS" ]; then
    read -p "Enter Admin Emails (comma separated) for Cloud Run: " ADMIN_EMAILS
fi

if [ -z "$DATABASE_URL" ]; then
    read -p "Enter Database URL (Postgres/Neon) [Leave empty for local SQLite]: " DATABASE_URL
fi

gcloud run deploy $APP_NAME \
  --image $IMAGE_URI \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID \
  --set-env-vars GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET \
  --set-env-vars ADMIN_EMAILS="$ADMIN_EMAILS" \
  --set-env-vars DATABASE_URL="$DATABASE_URL" \
# Get the deployed URL
SERVICE_URL=$(gcloud run services describe $APP_NAME --platform managed --region $REGION --format 'value(status.url)')

echo "Service URL: $SERVICE_URL"

# Determine URLs for env vars
# If CLIENT_URL is already set (e.g. from .env), use it. Otherwise use the Service URL.
FINAL_CLIENT_URL=${CLIENT_URL:-$SERVICE_URL}
FINAL_BETTER_AUTH_URL=${BETTER_AUTH_URL:-"${FINAL_CLIENT_URL}/api/auth"}

echo "Configuring Service with URLs:"
echo "  CLIENT_URL: $FINAL_CLIENT_URL"

# Escape commas in TRUSTED_ORIGINS by replacing them with pipes (|)
# This avoids gcloud's comma delimiter issue entirely.
SAFE_TRUSTED_ORIGINS=$(echo "$TRUSTED_ORIGINS" | tr ',' '|')

# Check if keys are loaded
if [ -z "$GOOGLE_CLIENT_ID" ]; then
  echo "WARNING: GOOGLE_CLIENT_ID is empty"
else
  echo "GOOGLE_CLIENT_ID loaded (length: ${#GOOGLE_CLIENT_ID})"
fi

# Step 1: Explicitly remove BETTER_AUTH_URL if it exists
echo "Removing BETTER_AUTH_URL to allow dynamic domain inference..."
gcloud run services update $APP_NAME \
  --platform managed \
  --region $REGION \
  --remove-env-vars BETTER_AUTH_URL || echo "BETTER_AUTH_URL was not present or could not be removed (ignoring)."

# Step 2: Update all other environment variables
echo "Updating environment variables..."
gcloud run services update $APP_NAME \
  --platform managed \
  --region $REGION \
  --set-env-vars CLIENT_URL="$FINAL_CLIENT_URL" \
  --set-env-vars TRUSTED_ORIGINS="$SAFE_TRUSTED_ORIGINS" \
  --set-env-vars GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  --set-env-vars GOOGLE_CLIENT_SECRET="$GOOGLE_CLIENT_SECRET" \
  --set-env-vars ADMIN_EMAILS="$ADMIN_EMAILS" \
  --set-env-vars DATABASE_URL="$DATABASE_URL"

echo "Deployment complete!"
echo "App is live at: $FINAL_CLIENT_URL"
if [ "$FINAL_CLIENT_URL" != "$SERVICE_URL" ]; then
    echo "(Mapped to custom domain)"
fi
