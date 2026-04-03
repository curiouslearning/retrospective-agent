# GCP Architecture: Retrospective Agent

This document explains how the Retrospective Agent is built and deployed on Google Cloud Platform (GCP). It's written for developers who are new to GCP and want to understand not just *what* we use, but *why* and *how it all fits together*.

---

## The Big Picture

When you visit the app in your browser, here's what's actually happening behind the scenes:

```
Your Browser
    │
    │  HTTPS request
    ▼
Google Cloud Run  ←──── receives request, runs our Node.js app
    │
    ├── Google Secret Manager  (reads secrets at startup)
    ├── Google Docs / Drive API  (writes retrospective docs)
    ├── Google Cloud Storage  (stores document links)
    └── Google OAuth2  (verifies your identity)
```

When a developer pushes code to GitHub:

```
GitHub (push to main)
    │
    ▼
Cloud Build  ──► builds Docker image ──► pushes to Artifact Registry ──► deploys to Cloud Run
```

---

## Cloud Run

### What it is

Cloud Run is Google's managed container platform. You give it a Docker image and it runs it for you — no servers to manage, no VMs to configure. It automatically handles scaling, restarts, and HTTPS.

### How we use it

Our app is packaged as a Docker image (defined in `Dockerfile`). Cloud Run runs that image as a container. When a request comes in, Cloud Run routes it to a running instance of the container. If traffic increases, Cloud Run spins up more instances automatically. If there's no traffic, it scales down to zero (and you're not charged).

### Key things to know about Cloud Run

**It's stateless.** Each request might be handled by a different container instance. This is why we can't store sessions in memory — if instance A sets a session and the next request goes to instance B, instance B has no idea about that session. This is why we use a cookie-based session (the session data lives in the browser, not the server).

**TLS terminates at the load balancer.** Even though users access the app over HTTPS, the traffic *inside* GCP between the load balancer and our container is plain HTTP. This is why our session cookie uses `secure: false` — the container never sees an HTTPS request, so a secure-only cookie would never get set. The connection is still encrypted end-to-end from the user's perspective.

**The PORT environment variable.** Cloud Run automatically injects a `PORT` environment variable telling our app which port to listen on (default 8080). Our app reads this via `process.env.PORT`.

**Environment variables vs Secrets.** A small number of non-sensitive deployment values (`BASE_URL`, `NODE_ENV`, `TZ`) are set as environment variables on the Cloud Run service by `cloudbuild.yaml` at deploy time. Developers don't need to set these locally — the code has sensible defaults (e.g. `BASE_URL` falls back to `http://localhost:8080`). Sensitive values (API keys, passwords) always go in Secret Manager, never in environment variables.

### Where to find it in GCP Console

**Cloud Run → retrospective-agent**

Here you can see running revisions, logs, environment variables, and traffic configuration.

---

## Cloud Build

### What it is

Cloud Build is Google's CI/CD service. It watches your GitHub repository and automatically runs a pipeline when you push code.

### How we use it

We have a file called `cloudbuild.yaml` in the root of the repo. This defines three steps that run in order every time code is pushed to `main`:

**Step 1 — Build:** Takes our source code and builds a Docker image from the `Dockerfile`. The image is tagged with the Git commit SHA (a unique identifier for that exact version of the code) so we always know which code is running.

**Step 2 — Push:** Uploads the built image to Artifact Registry (Google's container image storage). The image lives at:
```
us-east1-docker.pkg.dev/gdl-reader-dev/gdl-reader/retrospective-agent:COMMIT_SHA
```

**Step 3 — Deploy:** Tells Cloud Run to update the service to use the newly pushed image. This is what actually makes the new code go live.

### Why commit SHA tagging matters

Using the commit SHA as the image tag means every deploy is traceable. If something breaks, you can look at Cloud Run's revision history, see exactly which commit SHA is running, and roll back to a previous image if needed. Using `:latest` as a tag would overwrite the previous image and make rollbacks harder.

### Where to find it in GCP Console

**Cloud Build → History** — shows every build, pass or fail, with logs.
**Cloud Build → Triggers** — shows what triggers a build (in our case, push to `main`).

---

## Secret Manager

### What it is

Secret Manager is Google's secure storage for sensitive values like API keys, passwords, and tokens. It encrypts values at rest and controls who can access them via IAM permissions.

### Why not just use environment variables for everything?

Environment variables are fine for non-sensitive config, but they have drawbacks for secrets:

- They're visible in the Cloud Run console to anyone with console access
- They require a redeploy to change
- There's no audit log of who accessed them

Secret Manager solves all three: values are encrypted, they can be updated without a redeploy (on next container start), and every access is logged.

### How we use it

Our app reads all secrets at startup in `src/config.ts` using the `loadConfig()` function. It fetches all secrets in parallel using `Promise.all()` so startup stays fast. If any secret is missing, the app crashes immediately with a clear error — this is intentional, so a misconfigured deployment fails fast rather than serving broken responses.

The secrets our app uses:

| Secret | What it's for |
|---|---|
| `retrospective-service-account` | Google service account JSON for writing Docs/Drive |
| `retrospective-jira-token` | API token to read Jira data |
| `retrospective-jira-base-url` | Your Jira organization URL |
| `retrospective-jira-email` | Email associated with the Jira token |
| `retrospective-drive-folder-id` | The Google Drive folder where docs get created |
| `retrospective-drive-user` | The Workspace user the service account impersonates |
| `retrospective-storage-bucket` | GCS bucket name for storing document links |
| `retrospective-slack-webhook` | Slack webhook URL for notifications (optional) |
| `retrospective-oauth-client-id` | Google OAuth2 client ID for browser login |
| `retrospective-oauth-client-secret` | Google OAuth2 client secret for browser login |
| `retrospective-session-secret` | Random string used to sign session cookies |
| `retrospective-allowed-emails` | Comma-separated list of emails allowed to access the app |

### Versioning

Every time you update a secret, Secret Manager creates a new version. The old version isn't deleted — it just becomes inactive. Our app always reads `versions/latest`, so updating a secret takes effect on the next container startup. To force it immediately, redeploy the service.

To update a secret:
```bash
echo -n 'new-value' | gcloud secrets versions add SECRET_NAME \
  --project=gdl-reader-dev --data-file=-
```

### Permissions

To read secrets, a Google account or service account needs the `roles/secretmanager.secretAccessor` role on the project. This is what the admin grants to new developers so they can run the app locally.

### Where to find it in GCP Console

**Secret Manager** — lists all secrets, their versions, and access logs.

---

## Google OAuth2 (Browser Authentication)

### What it is

OAuth2 is a standard protocol for letting users log in with their Google account without your app ever handling their password. Google handles the authentication; your app just receives confirmation of who the user is.

### How the flow works

1. User visits the app → `requireAuth` middleware checks for a session cookie → no cookie found → redirect to `/auth/login`
2. `/auth/login` generates a Google sign-in URL and redirects the browser to `accounts.google.com`
3. User signs in at Google (or picks their already-signed-in account)
4. Google redirects back to our app at `/auth/callback` with a short-lived authorization code
5. Our app exchanges that code with Google for the user's profile information (name and email)
6. We check the email against the `retrospective-allowed-emails` secret
7. If allowed: set a session cookie and redirect to `/`
8. If not allowed: redirect to `/auth/denied`

### Why we use the googleapis library directly

We initially tried `passport-google-oauth20` (a popular OAuth middleware library) but ran into issues with Cloud Run's stateless nature — passport relies on server-side session state to validate the OAuth `state` parameter, which doesn't survive across Cloud Run instances. By using Google's own `googleapis` library directly, we bypass that complexity entirely. The code in `src/middleware/auth.ts` handles the full OAuth flow in about 30 lines.

### The OAuth Client ID

The OAuth Client ID is a credential registered in GCP Console under **APIs & Services → Credentials**. It tells Google which application is requesting authentication. To use it, you register the URLs that Google is allowed to redirect back to (called "authorized redirect URIs"). Our registered URIs are:

- `https://retrospective-agent-959872421018.us-east1.run.app/auth/callback` (production)
- `http://localhost:8080/auth/callback` (local development, optional)

### Sessions

After a successful login, we store the user's email and name in an encrypted browser cookie using the `cookie-session` library. The cookie is signed with the `retrospective-session-secret` secret so it can't be tampered with. It expires after 7 days, after which the user needs to log in again.

Because the session lives in the cookie (in the browser), it works correctly across Cloud Run's multiple instances — every instance can read it because every instance has the same session secret.

---

## IAM and Service Accounts

### What is IAM?

IAM (Identity and Access Management) is GCP's permission system. Everything in GCP — reading a secret, deploying a Cloud Run service, writing to Cloud Storage — requires a permission. IAM controls who has which permissions.

There are two types of identities:
- **User accounts** — real people (`joberlander@curiouslearning.org`)
- **Service accounts** — robot accounts used by applications (`devops@gdl-reader-dev.iam.gserviceaccount.com`)

### Our service account

Our app runs as `devops@gdl-reader-dev.iam.gserviceaccount.com`. This service account has been granted:

- `roles/secretmanager.secretAccessor` — to read secrets
- `roles/storage.objectAdmin` — to read/write Cloud Storage
- Domain-wide delegation — allows it to impersonate a Workspace user for Google Docs/Drive API calls

When the app runs on Cloud Run, it automatically uses this service account's credentials. When you run the app locally, it uses your own credentials (from `gcloud auth application-default login`) instead.

---

## GCP Project

Everything described above lives in the GCP project **`gdl-reader-dev`** in region **`us-east1`** (Northern Virginia). A GCP project is essentially a billing and organizational boundary — all resources, permissions, and costs are scoped to it.

If you ever need to look something up in the console, make sure `gdl-reader-dev` is selected as the active project in the top navigation bar.
