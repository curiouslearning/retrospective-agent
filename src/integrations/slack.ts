import { config } from "../config.js";

export async function sendSlackNotification(message: {
    epicKey: string;
    epicSummary: string;
    documentUrl: string;
    boardName: string;
}) {
    if (!config.SLACK_WEBHOOK_URL) {
        console.warn("SLACK_WEBHOOK_URL not configured, skipping Slack notification");
        return;
    }

    const text = `🎉 New Retrospective Document Generated!\n\n*Epic:* ${message.epicKey} - ${message.epicSummary}\n*Board:* ${message.boardName}\n*Document:* ${message.documentUrl}`;

    const payload = {
        text,
        blocks: [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "🎉 New Retrospective Document"
                }
            },
            {
                type: "section",
                fields: [
                    {
                        type: "mrkdwn",
                        text: `*Epic:*\n<${config.JIRA_BASE_URL}/browse/${message.epicKey}|${message.epicKey}>`
                    },
                    {
                        type: "mrkdwn",
                        text: `*Board:*\n${message.boardName}`
                    }
                ]
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: `*Summary:* ${message.epicSummary}`
                }
            },
            {
                type: "actions",
                elements: [
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Open Retrospective Doc"
                        },
                        url: message.documentUrl,
                        style: "primary"
                    }
                ]
            }
        ]
    };

    try {
        const response = await fetch(config.SLACK_WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error("Failed to send Slack notification:", await response.text());
        }
    } catch (error) {
        console.error("Error sending Slack notification:", error);
    }
}
