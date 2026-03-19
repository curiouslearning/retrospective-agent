import { config } from "../config.js";

const auth = Buffer.from(
    `${config.JIRA_EMAIL}:${config.JIRA_API_TOKEN}`
).toString("base64");

async function jira(path: string, method = "GET", body?: any) {
    const res = await fetch(`${config.JIRA_BASE_URL}${path}`, {
        method,
        headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: body ? JSON.stringify(body) : undefined
    });

    if (!res.ok) {
        throw new Error(await res.text());
    }

    return res.json();
}

export async function getEpicAndIssues(epicKey: string) {
    const epic = await jira(
        `/rest/api/3/issue/${epicKey}?fields=summary,description,status`
    );

    const issues = await jira(`/rest/api/3/search/jql`, "POST", {
        jql: `parent = "${epicKey}"`,
        maxResults: 100,
        fields: ["summary", "status", "reporter", "assignee", "issuetype", "parent"]
    });

    return {
        epic,
        issues: issues.issues
    };
}

export async function getTransitions(issueKey: string) {
    const data = await jira(
        `/rest/api/3/issue/${issueKey}/changelog`
    );

    const transitions: { to: string; at: string }[] = [];

    for (const h of data.values) {
        for (const item of h.items) {
            if (item.field === "status" || item.fieldId === "status") {
                transitions.push({
                    to: item.toString,
                    at: h.created
                });
            }
        }
    }

    return transitions;
}