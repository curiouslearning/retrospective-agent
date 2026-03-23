# retrospective-agent
Overview

The **Retrospective Agent** is an automation tool for Agile Product Managers or Development Leads for creating focused and useful Retrospective documents in Google Docs from Jira data.

Retrospective Agent:

- Fetches Jira issues for an epic 
- Builds a timeline for executives
- Computes team insights (cycle time and throughput)
- Generates retrospective talking points by giving examples of tasks that:
  - ✅ What went well (<= 5 day cycle time)
  - ⚠️ What didn't go as planned (>5 day cycle time)
  - 🔁 What to try differently next time (based on the above)
- Writes everything into a formatted Google Doc specifically to the root of "My Drive" based on the epic name.

This helps teams run faster, more consistent, and more data-informed retrospectives.


------------------------------------------------------------------------

## Key Usage Commands

### 1. Running the app

npm run dev

### 2. Running a retrospective

In a second terminal window after running the app above, you'll want to run the following command:

`curl -X POST http://localhost:3000/run  -H "Content-Type: application/json"   -d '{"board_name":"[JIRA_BOARD_NAME_GOES_HERE]","epic_key":"[JIRA_EPIC_KEY_GOES_HERE]}'`

EXAMPLE: `curl -X POST http://localhost:3000/run  -H "Content-Type: application/json"   -d '{"board_name":"assessment js","epic_key":"AJ-581"}'`

------------------------------------------------------------------------

## Tech Stack

-   Node.js (ESM)
-   TypeScript
-   Express
-   Jira REST API
-   Google Docs API
-   Zod
-   date-fns / date-fns-tz

------------------------------------------------------------------------

## Getting Started

### 1. Clone the repo

`git clone https://github.com/YOUR_ORGANIZATION/retrospective-agent.git cd
retrospective-agent`

### 2. Install dependencies

`npm install`

------------------------------------------------------------------------

## Environment Setup

### 1. Create .env from example

`cp .env.example .env`

### 2. Fill in required values

`JIRA_BASE_URL=https://your_organization.atlassian.net`
`JIRA_EMAIL=your-email@your_organization.com JIRA_API_TOKEN=your_jira_api_token`

`GOOGLE_CLIENT_ID=your_google_client_id`
`GOOGLE_CLIENT_SECRET=your_google_client_secret`
`GOOGLE_REFRESH_TOKEN=your_google_refresh_token`

------------------------------------------------------------------------

## Running the App

### Development mode

`npm run dev`

### Build

`npm run build`

### Run production

`npm start`

------------------------------------------------------------------------

## Project Structure

src/
 * index.ts                      # Entry point (Express server / orchestration)
 * tools/
    * buildRetrospective.ts       # Core retrospective generation logic
 * integrations/
    * jira.ts                     # Jira API integration
    * google.ts                   # Google Docs integration

------------------------------------------------------------------------

## Jira Integration Setup

1.  Go to https://id.atlassian.com/manage-profile/security/api-tokens
2.  Create API token
3.  Copy into .env

------------------------------------------------------------------------

## Google Docs Integration Setup

1.  Create project in Google Cloud Console
2.  Enable Docs + Drive APIs
3.  Create OAuth credentials (Ben has a helper script to generate these if desired)
4.  Generate refresh token via OAuth Playground

------------------------------------------------------------------------

## Notes

-   Never commit .env
-   Ensure tokens are correct
-   Avoid hardcoding Google Docs indices