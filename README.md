# retrospective-agent

## Overview

The **Retrospective Agent** automates creation of Retrospective documents in Google Docs from Jira data, for Agile Product Managers and Development Leads.

### What It Does

- Fetches Jira issues for an epic
- Builds a timeline for executives
- Computes team insights (cycle time and throughput)
- Generates retrospective talking points:
  - ✅ What went well (<= 5 day cycle time)
  - ⚠️ What didn't go as planned (>5 day cycle time)
  - 🔁 What to try differently next time
- Writes everything into a formatted Google Doc in a shared Drive folder
- Stores generated document links in Google Cloud Storage
- Optional: Sends Slack notifications when docs are created

------------------------------------------------------------------------

## Tech Stack

- Node.js (ESM) + TypeScript
- Express (with web UI)
- Jira REST API
- Google Docs + Drive API (via service account)
- Google Cloud Secret Manager
- Google Cloud Storage
- Google Cloud Run
- Slack Webhooks (optional)
- Chart.js (analytics)

------------------------------------------------------------------------

## Developer Setup

### 1. Install Node.js

Download and install Node.js 20+ from https://nodejs.org

### 2. Install the gcloud CLI

Download and install from https://cloud.google.com/sdk/docs/install, then initialize:

```bash
gcloud init
```

Sign in with your `@curiouslearning.org` Google account when prompted.

### 3. Request GCP Access

Ask a project admin to grant your Google account access to `gdl-reader-dev`:

```bash
# Admin runs this — replace with the new dev's email
gcloud projects add-iam-policy-binding gdl-reader-dev \
  --member="user:devname@curiouslearning.org" \
  --role="roles/secretmanager.secretAccessor"
```

### 4. Authenticate Locally

Required once per machine so the app can read secrets from Secret Manager:

```bash
gcloud auth application-default login
```

### 5. Enable Google APIs for Local Development

Required once per developer — enables the Docs and Drive APIs under your local GCP quota:

```bash
gcloud services enable docs.googleapis.com drive.googleapis.com
```

### 6. Clone and Run

```bash
git clone https://github.com/YOUR_ORGANIZATION/retrospective-agent.git
cd retrospective-agent
npm install
npm run dev
```

Navigate to `http://localhost:8080`

------------------------------------------------------------------------

## Web UI

- Select a Jira project to load its ongoing epics
- View progress bars and existing retrospective links
- Generate a retrospective doc with one click
- Click **Analytics** for cycle time trends and throughput metrics

### API

```bash
curl -X POST http://localhost:8080/run \
  -H "Content-Type: application/json" \
  -d '{"board_name":"assessment js","epic_key":"AJ-581"}'
```

------------------------------------------------------------------------

## GCP Infrastructure

All secrets and infrastructure live in the `gdl-reader-dev` GCP project.

### Secrets (Google Cloud Secret Manager)

| Secret Name | Description |
|---|---|
| `retrospective-service-account` | Service account JSON for Google Docs/Drive |
| `retrospective-jira-token` | Atlassian API token |
| `retrospective-jira-base-url` | e.g. `https://your-org.atlassian.net` |
| `retrospective-jira-email` | Email of the Jira user the token belongs to |
| `retrospective-drive-folder-id` | Google Drive folder ID for generated docs |
| `retrospective-drive-user` | Workspace user the service account impersonates for Docs/Drive |
| `retrospective-storage-bucket` | GCS bucket name for storing document links |
| `retrospective-slack-webhook` | Slack webhook URL (optional) |

To update a secret:
```bash
echo -n 'new-value' | gcloud secrets versions add SECRET_NAME \
  --project=gdl-reader-dev --data-file=-
```

### Service Account

`devops@gdl-reader-dev.iam.gserviceaccount.com`

### Google Drive

Generated docs are placed in:
`https://drive.google.com/drive/folders/16KKP1VoD1gOfEjQ3I1zM8A351LaDY_gs`

The service account must have **Editor** access to this folder.

------------------------------------------------------------------------

## Deployment

```bash
gcloud run deploy retrospective-agent \
  --image=gcr.io/gdl-reader-dev/retrospective-agent:latest \
  --region=us-central1 \
  --platform=managed \
  --no-allow-unauthenticated \
  --service-account=devops@gdl-reader-dev.iam.gserviceaccount.com \
  --project=gdl-reader-dev
```

------------------------------------------------------------------------

## Slack Integration (Optional)

1. Go to https://api.slack.com/apps → Create New App → From scratch
2. Go to Incoming Webhooks → Toggle ON → Add New Webhook → select a channel
3. Add the webhook URL to the `retrospective-slack-webhook` secret