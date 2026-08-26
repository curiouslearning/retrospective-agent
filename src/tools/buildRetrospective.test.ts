import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

vi.mock("../config.js", () => ({
    config: {
        JIRA_EMAIL: "test@example.com",
        JIRA_API_TOKEN: "token",
        JIRA_BASE_URL: "https://example.atlassian.net",
    },
}));

vi.mock("../integrations/jira.js", () => ({
    getEpicAndIssues: vi.fn(),
    getTransitions: vi.fn(),
}));

vi.mock("../integrations/google.js", () => ({
    createDoc: vi.fn().mockResolvedValue("https://docs.google.com/document/d/fake-doc-id/edit"),
    overwriteDoc: vi.fn().mockResolvedValue(undefined),
}));

import { buildRetrospective } from "./buildRetrospective.js";
import { getEpicAndIssues, getTransitions } from "../integrations/jira.js";
import { createDoc } from "../integrations/google.js";

function makeEpic(key: string) {
    return {
        key,
        fields: {
            summary: `Epic: ${key}`,
            description: null,
            status: { name: "In Progress" },
        },
    };
}

function makeIssue(key: string, assigneeDisplayName: string | null) {
    return {
        key,
        fields: {
            summary: `Task ${key}`,
            status: { name: "Done" },
            assignee: assigneeDisplayName ? { displayName: assigneeDisplayName } : null,
        },
    };
}

// Transitions yielding a 3-working-day cycle time (Mon → Thu)
const SHORT_TRANSITIONS = [
    { to: "In Progress", at: "2024-01-08T09:00:00.000Z" },
    { to: "Done",        at: "2024-01-11T17:00:00.000Z" },
];

// Transitions yielding a 7-working-day cycle time (Mon → next Wed)
const LONG_TRANSITIONS = [
    { to: "In Progress", at: "2024-01-08T09:00:00.000Z" },
    { to: "Done",        at: "2024-01-17T17:00:00.000Z" },
];

const MOCK_CONFIG = {} as any;

beforeEach(() => {
    vi.mocked(createDoc).mockResolvedValue("https://docs.google.com/document/d/fake-doc-id/edit");
});

afterEach(() => {
    vi.clearAllMocks();
});

describe("buildRetrospective — Content Team exclusion from cycle time and throughput", () => {
    it("excludes Content Team tasks from average cycle time and throughput", async () => {
        vi.mocked(getEpicAndIssues).mockResolvedValue({
            epic: makeEpic("BTT-100"),
            issues: [
                makeIssue("BTT-101", "Alice"),        // 3-day cycle, non-content-team
                makeIssue("BTT-102", "Content Team"),  // 7-day cycle, content team
            ],
        });
        vi.mocked(getTransitions).mockImplementation((key: string) => {
            if (key === "BTT-101") return Promise.resolve(SHORT_TRANSITIONS);
            if (key === "BTT-102") return Promise.resolve(LONG_TRANSITIONS);
            return Promise.resolve([]);
        });

        await buildRetrospective({ board_name: "Assessment JS", epic_key: "BTT-100", config: MOCK_CONFIG });

        const [, content] = vi.mocked(createDoc).mock.calls[0];
        // Throughput: only Alice's task
        expect(content).toContain("Throughput: 1 tasks");
        // Average cycle time: only Alice's 3-day task
        expect(content).toContain("Average Cycle Time: 3 days");
    });

    it("includes Content Team tasks in What Went Well / Didn't Go As Planned sections", async () => {
        vi.mocked(getEpicAndIssues).mockResolvedValue({
            epic: makeEpic("BTT-200"),
            issues: [
                makeIssue("BTT-201", "Alice"),        // 3-day → What Went Well
                makeIssue("BTT-202", "Content Team"),  // 7-day → Didn't Go As Planned
            ],
        });
        vi.mocked(getTransitions).mockImplementation((key: string) => {
            if (key === "BTT-201") return Promise.resolve(SHORT_TRANSITIONS);
            if (key === "BTT-202") return Promise.resolve(LONG_TRANSITIONS);
            return Promise.resolve([]);
        });

        await buildRetrospective({ board_name: "Assessment JS", epic_key: "BTT-200", config: MOCK_CONFIG });

        const [, content] = vi.mocked(createDoc).mock.calls[0];

        const wentWellSection = content.split("What Went Well:")[1].split("What Didn't Go As Planned:")[0];
        expect(wentWellSection).toContain("BTT-201");

        const didntGoSection = content.split("What Didn't Go As Planned:")[1];
        expect(didntGoSection).toContain("BTT-202");
    });

    it("shows cycle time for Content Team tasks in the Went Well / Didn't Go As Planned sections", async () => {
        vi.mocked(getEpicAndIssues).mockResolvedValue({
            epic: makeEpic("BTT-300"),
            issues: [
                makeIssue("BTT-301", "Content Team"),  // 3-day cycle → What Went Well
            ],
        });
        vi.mocked(getTransitions).mockResolvedValue(SHORT_TRANSITIONS);

        await buildRetrospective({ board_name: "Assessment JS", epic_key: "BTT-300", config: MOCK_CONFIG });

        const [, content] = vi.mocked(createDoc).mock.calls[0];
        // Listed with its cycle time
        expect(content).toContain("BTT-301 - Task BTT-301 (3 working days)");
        // But excluded from team stats
        expect(content).toContain("Throughput: 0 tasks");
        expect(content).toContain("Average Cycle Time: 0 days");
    });

    it("averages only non-Content-Team tasks when there are multiple assignees", async () => {
        // Alice: 3 days, Bob: 7 days → avg = 5; Content Team: 7 days (excluded)
        vi.mocked(getEpicAndIssues).mockResolvedValue({
            epic: makeEpic("BTT-400"),
            issues: [
                makeIssue("BTT-401", "Alice"),
                makeIssue("BTT-402", "Bob"),
                makeIssue("BTT-403", "Content Team"),
            ],
        });
        vi.mocked(getTransitions).mockImplementation((key: string) => {
            if (key === "BTT-401") return Promise.resolve(SHORT_TRANSITIONS);
            return Promise.resolve(LONG_TRANSITIONS);
        });

        await buildRetrospective({ board_name: "Assessment JS", epic_key: "BTT-400", config: MOCK_CONFIG });

        const [, content] = vi.mocked(createDoc).mock.calls[0];
        expect(content).toContain("Average Cycle Time: 5 days");
        expect(content).toContain("Throughput: 2 tasks");
    });

    it("includes tasks with a null (unassigned) assignee in cycle time and throughput", async () => {
        vi.mocked(getEpicAndIssues).mockResolvedValue({
            epic: makeEpic("BTT-500"),
            issues: [
                makeIssue("BTT-501", null),            // unassigned → included
                makeIssue("BTT-502", "Content Team"),   // excluded
            ],
        });
        vi.mocked(getTransitions).mockImplementation((key: string) => {
            if (key === "BTT-501") return Promise.resolve(SHORT_TRANSITIONS);
            if (key === "BTT-502") return Promise.resolve(LONG_TRANSITIONS);
            return Promise.resolve([]);
        });

        await buildRetrospective({ board_name: "Assessment JS", epic_key: "BTT-500", config: MOCK_CONFIG });

        const [, content] = vi.mocked(createDoc).mock.calls[0];
        expect(content).toContain("Throughput: 1 tasks");
        expect(content).toContain("Average Cycle Time: 3 days");
    });
});
