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
- Google OAuth2 (browser login)
- Google Cloud Secret Manager
- Google Cloud Storage
- Google Cloud Run
- Slack Webhooks (optional)
- Chart.js (analytics)

------------------------------------------------------------------------

## Authentication

The app uses **Google OAuth2** for browser access. When a user visits the app, they are redirected to a Google login prompt. After signing in, their email is checked against an allowlist stored in Secret Manager (`retrospective-allowed-emails`). Only listed emails are granted access.

Sessions are maintained via a signed cookie (8-hour expiry). The `/health` endpoint is exempt from authentication so Cloud Run can probe it freely.

### Adding or Removing Users

Update the `retrospective-allowed-emails` secret with a comma-separated list of email addresses:

```bash
echo -n "user1@example.com,user2@example.com" | \
  gcloud secrets versions add retrospective-allowed-emails \
  --project=gdl-reader-dev --data-file=-
```

Changes take effect on the next container startup (i.e. after the next deploy or Cloud Run scale event). To force immediate effect, redeploy:

```bash
gcloud run deploy retrospective-agent --region=us-east1 --project=gdl-reader-dev \
  --image=us-east1-docker.pkg.dev/gdl-reader-dev/gdl-reader/retrospective-agent:latest
```

### OAuth Consent Screen

The OAuth app is configured as **External** with **Testing** status in GCP, which supports up to 100 users. Each allowed user must also be added to the test user list in:

**APIs & Services → OAuth consent screen → Test users**

------------------------------------------------------------------------

## Developer Setup

### 1. Install Node.js

Download and install Node.js 20+ from https://nodejs.org

### 2. Install the gcloud CLI

Download and install from https://cloud.google.com/sdk/docs/install, then initialize:

```bash
gcloud init
```

Sign in with your Google account when prompted.

### 3. Request GCP Access

Ask a project admin to grant your Google account access to `gdl-reader-dev`:

```bash
# Admin runs this — replace with the new dev's email
gcloud projects add-iam-policy-binding gdl-reader-dev \
  --member="user:devname@example.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 4. Authenticate Locally

Required once per machine so the app can read secrets from Secret Manager:

```bash
gcloud auth application-default login
```

### 5. Enable Google APIs for Local Development

Required once per developer:

```bash
gcloud services enable docs.googleapis.com drive.googleapis.com
```

### 6. Add Localhost Redirect URI

In **GCP Console → APIs & Services → Credentials → OAuth 2.0 Client ID**, add:

```
http://localhost:8080/auth/callback
```

### 7. Clone and Run

```bash
git clone https://github.com/curiouslearning/retrospective-agent.git
cd retrospective-agent
npm install
npm run dev
```

Navigate to `http://localhost:8080` — you will be prompted to sign in with Google.

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
| `retrospective-oauth-client-id` | Google OAuth2 client ID for browser login |
| `retrospective-oauth-client-secret` | Google OAuth2 client secret for browser login |
| `retrospective-session-secret` | Random string used to sign session cookies |
| `retrospective-allowed-emails` | Comma-separated list of emails permitted to access the app |

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

Deployment is automated via Cloud Build. Any push to `main` triggers a build and deploy to Cloud Run.

To deploy manually:

```bash
gcloud run deploy retrospective-agent \
  --image=us-east1-docker.pkg.dev/gdl-reader-dev/gdl-reader/retrospective-agent:latest \
  --region=us-east1 \
  --platform=managed \
  --no-allow-unauthenticated \
  --project=gdl-reader-dev
```

The `BASE_URL` environment variable must be set on the Cloud Run service and must match the authorized redirect URI registered in the OAuth Client ID:

```bash
gcloud run services update retrospective-agent \
  --region=us-east1 \
  --set-env-vars BASE_URL=https://retrospective-agent-959872421018.us-east1.run.app \
  --project=gdl-reader-dev
```

------------------------------------------------------------------------

## Slack Integration (Optional)

1. Go to https://api.slack.com/apps → Create New App → From scratch
2. Go to Incoming Webhooks → Toggle ON → Add New Webhook → select a channel
3. Add the webhook URL to the `retrospective-slack-webhook` secret