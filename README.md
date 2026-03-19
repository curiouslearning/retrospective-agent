# retrospective-agent
Overview

The Retrospective Agent is an automation tool for Agile Product Managers or Development Leads for creating focused and useful Retrospective documents in Google Docs from Jira data.

Retrospective Agent:

Fetches Jira issues for a specified epic

Builds a timeline for executives

Computes team insights (cycle time and throughput)

Generates retrospective talking points by giving examples of tasks that:

✅ What went well (<= 5 day cycle time)

⚠️ What didn’t go as planned (>5 day cycle time)

🔁 What to do differently next time

Writes everything into a formatted Google Doc

This helps teams run faster, more consistent, and more data-informed retrospectives.

Tech Stack

Node.js (ESM)

TypeScript

Express

Jira REST API

Google Docs API

Zod (validation)

date-fns / date-fns-tz (time handling)

Getting Started
1. Clone the repo
git clone https://github.com/YOUR_ORG/retrospective-agent.git
cd retrospective-agent
2. Install dependencies
npm install
3. Create .env file from example

This repo includes a template environment file:

.env.example

Copy it to create your local environment config:

cp .env.example .env

3a. Fill in required values

Open .env and populate the following:

JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=your_jira_api_token

GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REFRESH_TOKEN=your_google_refresh_token

For reference, your .env.example file should look like:

PORT=3000
JIRA_BASE_URL=
JIRA_EMAIL=
JIRA_API_TOKEN=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_REFRESH_TOKEN=
EDITOR_EMAIL=
DEFAULT_TIMEZONE=

Notes

Never commit your real .env file (it should already be in .gitignore)

.env.example is safe to commit and should always reflect required variables

If something isn’t working, double-check:

No extra quotes around values

No trailing spaces

Tokens are fully copied

4. Build the project
npm run build

Compiles TypeScript → dist/

Run production build
npm start

Runs compiled code from dist/index.js

Project Structure
src/
  index.ts                      # Entry point (Express server / orchestration)
  utils/
    buildRetrospective.ts       # Core retrospective generation logic
  integrations/
    jira.ts                     # Jira API integration
    google.ts                   # Google Docs integration

5. Jira Setup

You’ll need a Jira API token to read ticket data.

Steps

Go to:
https://id.atlassian.com/manage-profile/security/api-tokens

Click Create API token

Name it (e.g. retrospective-agent)

Copy the token

Use in .env
JIRA_BASE_URL=https://my_organization_name.atlassian.net
JIRA_EMAIL=you@my_organization_name.com
JIRA_API_TOKEN=your_token_here

6. Google Docs Setup

This project writes retrospectives to Google Docs using OAuth.

1. Create Google Cloud Project

https://console.cloud.google.com/

Create or select a project

2. Enable APIs

Enable:

Google Docs API

Google Drive API

3. Create OAuth Credentials

Go to APIs & Services → Credentials

Click Create Credentials → OAuth Client ID

Choose:

Desktop App

Copy:

Client ID → GOOGLE_CLIENT_ID

Client Secret → GOOGLE_CLIENT_SECRET

4. Generate Refresh Token
Option A — If you add a helper script (recommended long-term)

You can create a small auth script and run it with:

npx tsx src/auth.ts
Option B — OAuth Playground (quickest)

Go to: https://developers.google.com/oauthplayground

Click ⚙️ and enable "Use your own OAuth credentials"

Add scopes:

https://www.googleapis.com/auth/documents

https://www.googleapis.com/auth/drive

Authorize

Exchange code for tokens

Copy the refresh_token

Add to .env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...

How It Works
1. Jira Integration (jira.ts)

Fetches sprint issues

Extracts:

Status transitions

Created / completed timestamps

2. Retrospective Builder (buildRetrospective.ts)

Transforms raw Jira data into:

Timeline

Bullet point insights

Structured retro sections

3. Google Docs Integration (google.ts)

Creates or updates a document

Inserts formatted content:

Headings

Bullet points

Sections