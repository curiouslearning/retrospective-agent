import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { google } from "googleapis";

// ---------------------------------------------------------------------------
// GCP project — can also be set via GCP_PROJECT_ID env var if you ever move
// the service to a different project without rebuilding the image.
// ---------------------------------------------------------------------------
const GCP_PROJECT = process.env.GCP_PROJECT_ID ?? "gdl-reader-dev";

const secretClient = new SecretManagerServiceClient();

async function getSecret(name: string): Promise<string> {
    const fullName = `projects/${GCP_PROJECT}/secrets/${name}/versions/latest`;
    const [response] = await secretClient.accessSecretVersion({ name: fullName });
    const value = response.payload?.data?.toString();
    if (!value) throw new Error(`Secret "${name}" is empty or missing`);
    return value;
}

// ---------------------------------------------------------------------------
// Shape of the fully-loaded config.  Import this type wherever you need it.
// ---------------------------------------------------------------------------
export interface AppConfig {
    PORT: number;

    JIRA_BASE_URL: string;
    JIRA_EMAIL: string;
    JIRA_API_TOKEN: string;

    /** Authenticated Google JWT client — pass directly to googleapis calls */
    googleAuth: InstanceType<typeof google.auth.JWT>;

    GOOGLE_DRIVE_FOLDER_ID: string;

    DEFAULT_TIMEZONE: string;
    SLACK_WEBHOOK_URL: string;

    /** Cloud Storage bucket name for storing retrospectives.json */
    STORAGE_BUCKET: string;
}

// ---------------------------------------------------------------------------
// Call once at startup (in index.ts).  Throws fast if any required secret is
// missing so the Cloud Run container fails its health-check rather than
// silently serving broken responses.
// ---------------------------------------------------------------------------
// Module-level singleton — available to any module that imports { config }
// after loadConfig() has been awaited in index.ts startup.
export let config: AppConfig;

export async function loadConfig(): Promise<AppConfig> {
    // Fetch secrets in parallel to keep startup fast
    const [jiraApiToken, jiraBaseUrl, jiraEmail, serviceAccountJson, slackWebhookUrl, googleDriveFolderId, storageBucket, driveUser] =
        await Promise.all([
            getSecret("retrospective-jira-token"),
            getSecret("retrospective-jira-base-url"),
            getSecret("retrospective-jira-email"),
            getSecret("retrospective-service-account"),
            getSecret("retrospective-slack-webhook").catch(() => ""),
            getSecret("retrospective-drive-folder-id"),
            getSecret("retrospective-storage-bucket"),
            getSecret("retrospective-drive-user"),
        ]);

    const serviceAccount = JSON.parse(serviceAccountJson);

    const googleAuth = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: [
            "https://www.googleapis.com/auth/documents",
            "https://www.googleapis.com/auth/drive",
        ],
        subject: driveUser, // impersonate this Workspace user via domain-wide delegation
    });

    config = {
        PORT: Number(process.env.PORT ?? 8080), // Cloud Run default is 8080

        // Non-sensitive values stay as env vars on the Cloud Run service
        JIRA_BASE_URL: jiraBaseUrl,
        JIRA_EMAIL: jiraEmail,
        JIRA_API_TOKEN: jiraApiToken,

        googleAuth,

        GOOGLE_DRIVE_FOLDER_ID: googleDriveFolderId,

        DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE ?? "America/Chicago",
        SLACK_WEBHOOK_URL: slackWebhookUrl,

        STORAGE_BUCKET: storageBucket,
    };

    return config;
}