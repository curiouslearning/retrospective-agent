import { computeCycleTime } from "./cycleTime.js";
import { getTransitions } from "../integrations/jira.js";

type CompletedIssue = {
    key: string;
    summary: string;
    issueType: string;
    created: string;
    completed: string;
};

type CycleTimeData = {
    key: string;
    cycleTime: number;
    completedDate: Date;
};

export async function calculateCycleTimesForIssues(issues: CompletedIssue[]): Promise<CycleTimeData[]> {
    const cycleTimeData: CycleTimeData[] = [];

    for (const issue of issues) {
        try {
            const transitions = await getTransitions(issue.key);
            const cycleTime = computeCycleTime(transitions);

            if (cycleTime !== null) {
                cycleTimeData.push({
                    key: issue.key,
                    cycleTime,
                    completedDate: new Date(issue.completed)
                });
            }
        } catch (error) {
            console.warn(`Failed to get cycle time for ${issue.key}:`, error);
        }
    }

    return cycleTimeData;
}

export function aggregateByWeek(data: CycleTimeData[]): { week: string; average: number; count: number }[] {
    const weekMap = new Map<string, { sum: number; count: number }>();

    data.forEach(item => {
        const weekStart = getWeekStart(item.completedDate);
        const weekKey = weekStart.toISOString().split('T')[0];

        if (!weekMap.has(weekKey)) {
            weekMap.set(weekKey, { sum: 0, count: 0 });
        }

        const week = weekMap.get(weekKey)!;
        week.sum += item.cycleTime;
        week.count += 1;
    });

    return Array.from(weekMap.entries())
        .map(([week, { sum, count }]) => ({
            week,
            average: Math.round((sum / count) * 10) / 10,
            count
        }))
        .sort((a, b) => a.week.localeCompare(b.week));
}

export function aggregateByBiWeek(data: CycleTimeData[]): { period: string; average: number; count: number }[] {
    const biWeekMap = new Map<string, { sum: number; count: number }>();

    data.forEach(item => {
        const biWeekStart = getBiWeekStart(item.completedDate);
        const biWeekKey = biWeekStart.toISOString().split('T')[0];

        if (!biWeekMap.has(biWeekKey)) {
            biWeekMap.set(biWeekKey, { sum: 0, count: 0 });
        }

        const period = biWeekMap.get(biWeekKey)!;
        period.sum += item.cycleTime;
        period.count += 1;
    });

    return Array.from(biWeekMap.entries())
        .map(([period, { sum, count }]) => ({
            period,
            average: Math.round((sum / count) * 10) / 10,
            count
        }))
        .sort((a, b) => a.period.localeCompare(b.period));
}

export function aggregateByMonth(data: CycleTimeData[]): { month: string; average: number; count: number }[] {
    const monthMap = new Map<string, { sum: number; count: number }>();

    data.forEach(item => {
        const monthKey = `${item.completedDate.getFullYear()}-${String(item.completedDate.getMonth() + 1).padStart(2, '0')}`;

        if (!monthMap.has(monthKey)) {
            monthMap.set(monthKey, { sum: 0, count: 0 });
        }

        const month = monthMap.get(monthKey)!;
        month.sum += item.cycleTime;
        month.count += 1;
    });

    return Array.from(monthMap.entries())
        .map(([month, { sum, count }]) => ({
            month,
            average: Math.round((sum / count) * 10) / 10,
            count
        }))
        .sort((a, b) => a.month.localeCompare(b.month));
}

function getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    return new Date(d.setDate(diff));
}

function getBiWeekStart(date: Date): Date {
    const weekStart = getWeekStart(date);
    const weekNumber = getWeekNumber(weekStart);
    
    // Round to even week numbers for bi-weekly periods
    const biWeekNumber = Math.floor(weekNumber / 2) * 2;
    
    const yearStart = new Date(weekStart.getFullYear(), 0, 1);
    const biWeekStart = new Date(yearStart);
    biWeekStart.setDate(yearStart.getDate() + (biWeekNumber * 7));
    
    return biWeekStart;
}

function getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
