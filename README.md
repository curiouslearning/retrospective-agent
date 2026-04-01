# retrospective-agent

## Overview

The **Retrospective Agent** is an automation tool for Agile Product Managers or Development Leads for creating focused and useful Retrospective documents in Google Docs from Jira data.

**✨ Features a web interface** - No command-line knowledge required! Simply open the web UI, view your ongoing epics, and generate retrospectives with a single click.

### What It Does

- Fetches Jira issues for an epic 
- Builds a timeline for executives
- Computes team insights (cycle time and throughput)
- Generates retrospective talking points by giving examples of tasks that:
  - ✅ What went well (<= 5 day cycle time)
  - ⚠️ What didn't go as planned (>5 day cycle time)
  - 🔁 What to try differently next time (based on the above)
- Writes everything into a formatted Google Doc
- Stores generated document links for easy access
- Optional: Sends Slack notifications when docs are created

This helps teams run faster, more consistent, and more data-informed retrospectives.


------------------------------------------------------------------------

## Quick Start

### 1. Start the server

```bash
npm run dev
```

### 2. Open the Web UI

Navigate to `http://localhost:3000` in your browser.

### 3. Generate Retrospectives

The web interface will:
- Automatically load all ongoing epics from your Jira board
- Show which epics already have retrospective documents
- Display progress bars showing epic completion percentage
- Let you generate new retrospectives with a single click
- Display links to the generated Google Docs

### 4. View Analytics (Optional)

Click "View Analytics" to see:
- Historical cycle time trends (weekly, bi-weekly, monthly)
- Average cycle times over time
- Task completion counts
- Performance metrics for your team

### Alternative: API Command

You can also generate retrospectives via curl:

```bash
curl -X POST http://localhost:3000/run \
  -H "Content-Type: application/json" \
  -d '{"board_name":"assessment js","epic_key":"AJ-581"}'
```

------------------------------------------------------------------------

## Tech Stack

-   Node.js (ESM)
-   TypeScript
-   Express (with web UI)
-   Jira REST API
-   Google Docs API
-   Slack Webhooks (optional)
-   Chart.js (for analytics visualization)
-   File-based storage (JSON)
-   date-fns / date-fns-tz

------------------------------------------------------------------------

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_ORGANIZATION/retrospective-agent.git
cd retrospective-agent
```

### 2. Install dependencies

```bash
npm install
```

------------------------------------------------------------------------

## Environment Setup

### 1. Create .env from example

```bash
cp .env.example .env
```

### 2. Fill in required values

#### Jira Configuration
```env
JIRA_BASE_URL=https://your_organization.atlassian.net
JIRA_EMAIL=your-email@your_organization.com
JIRA_API_TOKEN=your_jira_api_token
```

#### Google OAuth Configuration
```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_REFRESH_TOKEN=your_google_refresh_token
EDITOR_EMAIL=your-email@your_organization.com
```

#### Optional: Slack Integration
```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

Leave `SLACK_WEBHOOK_URL` empty if you don't want Slack notifications.

------------------------------------------------------------------------

## Running the App

### Development mode

```bash
npm run dev
```

Server will start at `http://localhost:3000`

### Build

```bash
npm run build
```

### Run production

```bash
npm start
```

------------------------------------------------------------------------

## Project Structure

```
src/
 ├── index.ts                      # Entry point (Express server with web UI + analytics)
 ├── config.ts                     # Environment configuration
 ├── storage.ts                    # File-based storage for retrospectives
 ├── types.ts                      # TypeScript type definitions
 ├── tools/
 │   └── buildRetrospective.ts     # Core retrospective generation logic
 ├── integrations/
 │   ├── jira.ts                   # Jira API integration
 │   ├── google.ts                 # Google Docs integration and styling
 │   └── slack.ts                  # Slack notification integration (optional)
 └── domain/
     ├── analytics.ts              # Analytics and aggregation logic
     ├── cycleTime.ts              # Cycle time calculation logic
     └── workingDays.ts            # Working days utilities

retrospectives.json                # Generated docs storage (auto-created)
```

------------------------------------------------------------------------

## Jira Integration Setup

1.  Go to https://id.atlassian.com/manage-profile/security/api-tokens
2.  Create API token
3.  Copy into .env

------------------------------------------------------------------------

## Google Docs Integration Setup

1.  Create project in Google Cloud Console
2.  Enable Docs + Drive APIs
3.  Create OAuth credentials (Desktop application type)
4.  Run the token helper script to get your refresh token:
    ```bash
    npx tsx get-token.ts
    ```
5.  Follow the OAuth flow in your browser
6.  Copy the refresh token to your `.env` file

------------------------------------------------------------------------

## Slack Integration Setup (Optional)

To enable Slack notifications when retrospectives are generated:

1.  Go to https://api.slack.com/apps
2.  Click "Create New App" → "From scratch"
3.  Name it "Retrospective Bot" and select your workspace
4.  Go to "Incoming Webhooks" → Toggle ON
5.  Click "Add New Webhook to Workspace"
6.  Select the channel for notifications
7.  Copy the webhook URL to your `.env` file

**Note:** You need Slack admin permissions to create webhooks. If you don't have access, ask your Slack workspace admin.

------------------------------------------------------------------------

## Features

### Web Interface
The modern web UI provides:
- **Automatic Epic Loading** - View all ongoing (non-Done) epics from your Jira board
- **Progress Tracking** - Visual progress bars showing completion percentage for each epic
- **Status Tracking** - See which epics already have retrospective documents
- **One-Click Generation** - Generate retrospectives with a single button click
- **Quick Access** - Direct links to previously generated documents with timestamps
- **Smart UI** - Generate button is hidden once a document exists for an epic
- **Dynamic Project Loading** - Automatically loads all accessible Jira projects

### Analytics Dashboard
Historical performance metrics and trends:
- **Cycle Time Charts** - Visualize average cycle times over time
- **Multiple Views** - Weekly, bi-weekly, and monthly aggregations
- **Task Completion Trends** - Track throughput alongside cycle times
- **Team Performance Metrics** - Overall averages and latest period statistics
- **Interactive Charts** - Powered by Chart.js for smooth visualization
- **Flexible Time Periods** - View last 30, 60, 90, 180 days or full year

### Data Persistence
- All generated document links are stored in `retrospectives.json`
- Survives server restarts
- Shows generation timestamps
- Automatically created on first use

### Slack Notifications (Optional)
- Automatic notifications when documents are generated
- Rich formatting with clickable links to Jira and Google Docs
- Gracefully skips if not configured
- No errors if webhook is not set up

------------------------------------------------------------------------

## Troubleshooting

### Port 3000 already in use
If you see `EADDRINUSE` error, change the `PORT` in your `.env` file:
```env
PORT=3001
```

### Jira API errors
- Verify your `JIRA_BASE_URL` matches your Atlassian domain
- Ensure your API token is valid and not expired
- Check that your Jira email has access to the project

### Google Docs API errors
- Make sure Docs and Drive APIs are enabled in Google Cloud Console
- Verify your refresh token is valid (regenerate if needed using `get-token.ts`)
- Check that the authenticated Google account has permission to create documents

### Epics not loading
- Verify the project key (e.g., "AJ") matches your Jira project
- Ensure the JQL query permissions allow searching for epics
- Check the browser console for API error messages

### Slack notifications not working
- Verify the webhook URL is correctly set in `.env`
- Test the webhook URL manually with curl
- Remember: the app works fine without Slack configured

### Analytics taking a long time to load
- Analytics fetches historical data and calculates cycle times for all completed tasks
- Large projects with many completed issues may take 30-60 seconds to load
- Try reducing the time period (e.g., last 30 or 60 days instead of 180)
- Check the server console for progress logs

------------------------------------------------------------------------

## Notes

-   Never commit `.env` or `retrospectives.json` to version control
-   Ensure API tokens are correct and have proper permissions
-   The tool works without Slack configuration
-   Documents are created in the Google Drive of the authenticated user
-   `retrospectives.json` is automatically created on first use