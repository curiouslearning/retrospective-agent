export function roundHalfUp(n: number): number {
  const floor = Math.floor(n);
  return n - floor >= 0.5 ? floor + 1 : floor;
}

function isWeekend(date: Date) {
  const d = date.getDay();
  return d === 0 || d === 6;
}

export function workingDaysBetween(start: Date, end: Date): number {
  let current = new Date(start);
  let total = 0;

  while (current < end) {
    const next = new Date(current);
    next.setDate(current.getDate() + 1);

    if (!isWeekend(current)) {
      const diff = Math.min(end.getTime(), next.getTime()) - current.getTime();
      total += diff;
    }

    current = next;
  }

  return total / (1000 * 60 * 60 * 24);
}