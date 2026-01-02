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
read -p "Enter your Google Client ID: " GOOGLE_CLIENT_ID
read -p "Enter your Google Client Secret: " GOOGLE_CLIENT_SECRET

read -p "Enter Admin Emails (comma separated) for Cloud Run: " ADMIN_EMAILS

gcloud run deploy $APP_NAME \
  --image $IMAGE_URI \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID \
  --set-env-vars GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET \
  --set-env-vars ADMIN_EMAILS="$ADMIN_EMAILS" \
  --set-env-vars CLIENT_URL="https://${APP_NAME}-9677729296.us-central1.run.app" \
  --set-env-vars BETTER_AUTH_URL="https://${APP_NAME}-9677729296.us-central1.run.app/api/auth"

echo "Deployment complete! Note: You might need to update CLIENT_URL and BETTER_AUTH_URL env vars in the Cloud Run console once you know the exact URL assigned by Google."
