import { workingDaysBetween, roundHalfUp } from "./workingDays.js";

export function computeCycleTime(transitions: { to: string; at: string }[]) {
  const sorted = transitions.sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );

  const start = sorted.find((t) => t.to === "In Progress");
  const doneEvents = sorted.filter((t) => t.to === "Done");

  if (!start || doneEvents.length === 0) return null;

  const end = doneEvents[doneEvents.length - 1];

  const days = workingDaysBetween(new Date(start.at), new Date(end.at));

  return roundHalfUp(days);
}