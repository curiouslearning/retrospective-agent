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

export async function getAllProjects() {
    const result = await jira(`/rest/api/3/project`);
    
    return result.map((project: any) => ({
        key: project.key,
        name: project.name,
        id: project.id
    }));
}

export async function getEpicProgress(epicKey: string) {
    const result = await jira(`/rest/api/3/search/jql`, "POST", {
        jql: `parent = "${epicKey}"`,
        maxResults: 1000,
        fields: ["status"]
    });

    const total = result.issues.length;
    if (total === 0) {
        return { total: 0, completed: 0, percentage: 0 };
    }

    const completed = result.issues.filter(
        (issue: any) => issue.fields.status.name === "Done"
    ).length;

    return {
        total,
        completed,
        percentage: Math.round((completed / total) * 100)
    };
}

export async function getOngoingEpics(projectKey: string) {
    const result = await jira(`/rest/api/3/search/jql`, "POST", {
        jql: `project = "${projectKey}" AND issuetype = Epic AND status != Done ORDER BY created DESC`,
        maxResults: 100,
        fields: ["summary", "status", "key"]
    });

    const epics = result.issues.map((issue: any) => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name
    }));

    // Get progress for each epic
    const epicsWithProgress = await Promise.all(
        epics.map(async (epic) => {
            const progress = await getEpicProgress(epic.key);
            return {
                ...epic,
                progress
            };
        })
    );

    return epicsWithProgress;
}

export async function getCompletedIssuesWithCycleTime(projectKey: string, daysBack: number = 30) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);
    const formattedDate = sinceDate.toISOString().split('T')[0];

    const result = await jira(`/rest/api/3/search/jql`, "POST", {
        jql: `project = "${projectKey}" AND status = Done AND statusCategoryChangedDate >= "${formattedDate}" AND issuetype != Epic ORDER BY statusCategoryChangedDate DESC`,
        maxResults: 1000,
        fields: ["summary", "created", "resolutiondate", "issuetype"]
    });

    return result.issues.map((issue: any) => ({
        key: issue.key,
        summary: issue.fields.summary,
        issueType: issue.fields.issuetype.name,
        created: issue.fields.created,
        completed: issue.fields.resolutiondate
    }));
}