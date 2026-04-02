import { getEpicAndIssues, getTransitions } from "../integrations/jira.js";
import { computeCycleTime } from "../domain/cycleTime.js";
import { createDoc } from "../integrations/google.js";
import { roundHalfUp } from "../domain/workingDays.js";
import type { AppConfig } from "../config.js";

// Only change from the original: `config` is accepted as a parameter and
// forwarded to `createDoc`.  All business logic is identical.

type Transition = {
    to: string;
    at: string;
};

type RetrospectiveIssue = {
    key: string;
    summary: string;
    cycle: number;
    firstInProgressAt: string;
    finalDoneAt: string;
};

const TEAM_MAP: Record<string, string> = {
    "assessment js": "Type Ninjas",
    "feed the monster": "Curious Creators",
    "platform devs in disguise": "Platform Devs in Disguise",
};

function getTeamName(boardName: string): string {
    return TEAM_MAP[boardName.toLowerCase()] || boardName;
}

function formatDateMMDDYYYY(date: Date): string {
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const yyyy = String(date.getFullYear());
    return `${mm}/${dd}/${yyyy}`;
}

function getCycleWindow(
    transitions: Transition[]
): { firstInProgressAt: string; finalDoneAt: string } | null {
    const sorted = [...transitions].sort(
        (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
    );

    const firstInProgress = sorted.find((t) => t.to === "In Progress");
    const doneEvents = sorted.filter((t) => t.to === "Done");

    if (!firstInProgress || doneEvents.length === 0) return null;

    return {
        firstInProgressAt: firstInProgress.at,
        finalDoneAt: doneEvents[doneEvents.length - 1].at,
    };
}

function diffCalendarDays(start: Date, end: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
}

function getDaysInYear(date: Date): number {
    const year = date.getFullYear();
    const isLeapYear =
        (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return isLeapYear ? 366 : 365;
}

function normalizeDescription(description: unknown): string {
    if (!description) return "";
    if (typeof description === "string") {
        return description.replace(/\r\n/g, "\n").trim();
    }
    if (typeof description !== "object") return "";

    function extractText(node: any): string {
        if (!node) return "";
        if (Array.isArray(node)) return node.map(extractText).join("");
        if (node.type === "text") return node.text ?? "";
        if (node.type === "hardBreak") return "\n";
        if (node.type === "paragraph") return extractText(node.content ?? []) + "\n";
        if (node.type === "doc") return extractText(node.content ?? []);
        if (node.content) return extractText(node.content);
        return "";
    }

    return extractText(description).replace(/\n{3,}/g, "\n\n").trim();
}

function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSectionBetween(
    text: string,
    startHeaders: string[],
    endHeaders: string[]
): string | null {
    const startPattern = startHeaders.map((h) => escapeRegex(h)).join("|");
    const endPattern = endHeaders.map((h) => escapeRegex(h)).join("|");

    const regex = new RegExp(
        `(?:^|\\n)(?:${startPattern})\\s*:?\\s*\\n?([\\s\\S]*?)(?=(?:\\n(?:${endPattern})\\s*:?)|$)`,
        "i"
    );

    const match = text.match(regex);
    if (!match || !match[1]) return null;
    const cleaned = match[1].trim();
    return cleaned.length > 0 ? cleaned : null;
}

function extractSectionToEnd(text: string, startHeaders: string[]): string | null {
    const startPattern = startHeaders.map((h) => escapeRegex(h)).join("|");

    const regex = new RegExp(
        `(?:^|\\n)(?:${startPattern})\\s*:?\\s*\\n?([\\s\\S]*)$`,
        "i"
    );

    const match = text.match(regex);
    if (!match || !match[1]) return null;
    const cleaned = match[1].trim();
    return cleaned.length > 0 ? cleaned : null;
}

export async function buildRetrospective({
    board_name,
    epic_key,
    config,
}: {
    board_name: string;
    epic_key: string;
    config: AppConfig;
}) {
    const { epic, issues } = await getEpicAndIssues(epic_key);

    const results: RetrospectiveIssue[] = [];

    for (const issue of issues) {
        const transitions = await getTransitions(issue.key);
        const cycle = computeCycleTime(transitions);
        const window = getCycleWindow(transitions);

        if (cycle !== null && window !== null) {
            results.push({
                key: issue.key,
                summary: issue.fields.summary,
                cycle,
                firstInProgressAt: window.firstInProgressAt,
                finalDoneAt: window.finalDoneAt,
            });
        }
    }

    const done = results;
    const avg =
        done.length > 0
            ? roundHalfUp(done.reduce((a, b) => a + b.cycle, 0) / done.length)
            : 0;

    const wentWell = done.filter((i) => i.cycle <= 5);
    const toInvestigate = done.filter((i) => i.cycle > 5);

    const wentWellText =
        wentWell.length > 0
            ? wentWell
                  .map((i) => `${i.key} - ${i.summary} (${i.cycle} working days)`)
                  .join("\n")
            : "None";

    const toInvestigateText =
        toInvestigate.length > 0
            ? toInvestigate
                  .map((i) => `${i.key} - ${i.summary} (${i.cycle} working days)`)
                  .join("\n")
            : "None";

    const subtitle = `Retrospective - ${formatDateMMDDYYYY(new Date())}`;

    let epicStartDate = "N/A";
    let epicEndDate = "N/A";
    let epicDurationDays = "N/A";
    let shareOfYear = "N/A";

    if (done.length > 0) {
        const start = new Date(
            Math.min(...done.map((i) => new Date(i.firstInProgressAt).getTime()))
        );
        const end = new Date(
            Math.max(...done.map((i) => new Date(i.finalDoneAt).getTime()))
        );

        epicStartDate = formatDateMMDDYYYY(start);
        epicEndDate = formatDateMMDDYYYY(end);

        const duration = diffCalendarDays(start, end);
        epicDurationDays = String(duration);

        const daysInYear = getDaysInYear(start);
        shareOfYear = `${((duration / daysInYear) * 100).toFixed(1)}%`;
    }

    const descriptionText = normalizeDescription(epic.fields.description);

    const businessValueText =
        extractSectionBetween(descriptionText, ["Business Value"], [
            "Strategic Objective",
            "Success Looks Like",
            "Success Measurement",
        ]) ?? "Not specified in epic description.";

    const successLooksLikeText =
        extractSectionToEnd(descriptionText, [
            "Success Looks Like",
            "Success Measurement",
        ]) ?? "Not specified in epic description.";

    const content = `${epic.fields.summary}
${subtitle}

TIMELINE
Epic Timeline: ${epicStartDate} - ${epicEndDate}
Duration: ${epicDurationDays} calendar days
Share of Year: ${shareOfYear}

TEAM STATS
Team Name: ${getTeamName(board_name)}
Average Cycle Time: ${avg} days
Throughput: ${done.length} tasks

Key Artifacts Generated:
[PM or Team Lead will manually fill out this section]

Business Value Created:
${businessValueText}

Success Looks Like:
${successLooksLikeText}

What Went Well:
Examples:
${wentWellText}

- 
- 
- 

What Didn't Go As Planned:
Examples:
${toInvestigateText}

- 
- 
- 

What Should We Do Differently Next Time:
- 
- 
- 
`;

    // Pass config through so createDoc can use the service-account auth client
    const doc = await createDoc(epic.fields.summary, content, config);

    return { document: doc };
}