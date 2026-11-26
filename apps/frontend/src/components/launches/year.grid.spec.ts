import { buildYearGrid, textColorOn } from './year.grid';

const utcDay = (date: string) => date.slice(0, 10);
const row = (date: string, pipelineId: string | null = null, color: string | null = null) => ({
  date,
  pipelineId,
  pipelineColor: color,
});
const day = (rows: any[], date: string, dayKey = utcDay) =>
  buildYearGrid(rows, 2026, dayKey)
    .flatMap((m) => m.days)
    .find((d) => d.date === date)!;

describe('buildYearGrid', () => {
  it('has a row per month with the right number of days, leap years included', () => {
    const months = buildYearGrid([], 2026, utcDay);
    expect(months).toHaveLength(12);
    expect(months[1].days).toHaveLength(28);
    expect(months[3].days).toHaveLength(30);
    expect(buildYearGrid([], 2028, utcDay)[1].days).toHaveLength(29);
  });

  it('counts one post per row and gives one circle per pipeline', () => {
    const d = day(
      [
        row('2026-03-05T08:00:00Z', 'a', '#ff0000'),
        row('2026-03-05T08:00:00Z', 'a', '#ff0000'),
        row('2026-03-05T09:00:00Z', 'b', '#00ff00'),
      ],
      '2026-03-05'
    );
    expect(d.total).toBe(3);
    expect(d.circles).toEqual([
      { pipelineId: 'a', color: '#ff0000', count: 2 },
      { pipelineId: 'b', color: '#00ff00', count: 1 },
    ]);
  });

  it('shares one circle between posts without a pipeline and puts it last', () => {
    const d = day(
      [row('2026-03-05T08:00:00Z'), row('2026-03-05T09:00:00Z', 'a', '#ff0000'), row('2026-03-05T10:00:00Z')],
      '2026-03-05'
    );
    expect(d.circles.map((c) => [c.pipelineId, c.count])).toEqual([
      ['a', 1],
      [null, 2],
    ]);
  });

  it('puts a post on the day the client buckets it to', () => {
    const plusTwo = (date: string) =>
      new Date(new Date(date).getTime() + 2 * 3600000).toISOString().slice(0, 10);
    const rows = [row('2026-03-05T23:30:00Z')];
    expect(day(rows, '2026-03-05').total).toBe(1);
    expect(day(rows, '2026-03-06', plusTwo).total).toBe(1);
    expect(day(rows, '2026-03-05', plusTwo).total).toBe(0);
  });

  it('ignores rows from other years', () => {
    expect(day([row('2027-03-05T08:00:00Z')], '2026-03-05').total).toBe(0);
  });

  it('scales four levels to the busiest day and leaves empty days at 0', () => {
    const many = (date: string, n: number) =>
      Array.from({ length: n }, () => row(`${date}T08:00:00Z`));
    const rows = [
      ...many('2026-01-01', 12),
      ...many('2026-01-02', 1),
      ...many('2026-01-03', 4),
      ...many('2026-01-04', 7),
      ...many('2026-01-05', 10),
    ];
    const levels = ['01', '02', '03', '04', '05', '06'].map(
      (n) => day(rows, `2026-01-${n}`).level
    );
    expect(levels).toEqual([4, 1, 2, 3, 4, 0]);
  });
});

describe('textColorOn', () => {
  it('picks readable text and falls back to white', () => {
    expect(textColorOn('#ffff00')).toBe('#000000');
    expect(textColorOn('#112233')).toBe('#ffffff');
    expect(textColorOn(null)).toBe('#ffffff');
    expect(textColorOn('red')).toBe('#ffffff');
  });
});
