// One light row per post, as the year overview endpoint returns them.
export interface YearOverviewRow {
  date: string;
  pipelineId: string | null;
  pipelineColor: string | null;
}

export interface YearCircle {
  // the pipeline id, posts that did not come from a pipeline share one circle
  pipelineId: string | null;
  color: string | null;
  count: number;
}

export interface YearDay {
  date: string;
  total: number;
  circles: YearCircle[];
  // 0 for no posts, then 1 to 4 scaled to the busiest day of the year
  level: 0 | 1 | 2 | 3 | 4;
}

export interface YearMonth {
  month: number;
  days: YearDay[];
}

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

const pad = (value: number) => String(value).padStart(2, '0');

// The rows are bucketed by the day the client puts them on, so a post just
// before midnight UTC lands on the right local day.
export const buildYearGrid = (
  rows: YearOverviewRow[],
  year: number,
  dayKey: (date: string) => string
): YearMonth[] => {
  const perDay = new Map<string, Map<string | null, YearCircle>>();
  for (const row of rows) {
    const key = dayKey(row.date);
    const circles = perDay.get(key) || new Map<string | null, YearCircle>();
    const circle = circles.get(row.pipelineId) || {
      pipelineId: row.pipelineId,
      color: row.pipelineColor,
      count: 0,
    };
    circle.count += 1;
    circles.set(row.pipelineId, circle);
    perDay.set(key, circles);
  }

  const months = Array.from({ length: 12 }, (_, month) => ({
    month,
    days: Array.from({ length: daysInMonth(year, month) }, (_, index) => {
      const date = `${year}-${pad(month + 1)}-${pad(index + 1)}`;
      // pipelines in a fixed order, then the posts without a pipeline
      const circles = Array.from(perDay.get(date)?.values() || []).sort(
        (a, b) =>
          a.pipelineId === b.pipelineId
            ? 0
            : a.pipelineId === null
            ? 1
            : b.pipelineId === null
            ? -1
            : a.pipelineId < b.pipelineId
            ? -1
            : 1
      );
      return {
        date,
        total: circles.reduce((sum, circle) => sum + circle.count, 0),
        circles,
        level: 0 as YearDay['level'],
      };
    }),
  }));

  const busiest = Math.max(0, ...months.flatMap((m) => m.days.map((d) => d.total)));
  for (const day of months.flatMap((m) => m.days)) {
    day.level = day.total
      ? (Math.min(4, Math.ceil((day.total / busiest) * 4)) as YearDay['level'])
      : 0;
  }

  return months;
};

// Black or white, whichever reads better on the circle colour.
export const textColorOn = (color: string | null) => {
  const hex = /^#([0-9a-f]{6})$/i.exec(color || '')?.[1];
  if (!hex) {
    return '#ffffff';
  }
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#000000' : '#ffffff';
};
