import "dotenv/config";

export const config = {
    PORT: Number(process.env.PORT || 3000),

    JIRA_BASE_URL: process.env.JIRA_BASE_URL!,
    JIRA_EMAIL: process.env.JIRA_EMAIL!,
    JIRA_API_TOKEN: process.env.JIRA_API_TOKEN!,

    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID!,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET!,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI!,
    GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN!,

    EDITOR_EMAIL: process.env.EDITOR_EMAIL!,
    DEFAULT_TIMEZONE: process.env.DEFAULT_TIMEZONE || "America/Chicago",

    SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL || ""
};