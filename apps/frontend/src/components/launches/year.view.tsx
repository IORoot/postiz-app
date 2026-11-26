'use client';

import { FC, useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useCalendar } from '@gitroom/frontend/components/launches/calendar.context';
import { useYearOverview } from '@gitroom/frontend/components/launches/use.year.overview';
import {
  buildYearGrid,
  textColorOn,
  YearDay,
} from '@gitroom/frontend/components/launches/year.grid';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';

// heatmap colour by number of posts on the day: 0 is empty, 8 or more is the last colour
const HEAT_COLORS = [
  'transparent',
  '#3B82F6',
  '#22C55E',
  '#EAB308',
  '#F97316',
  '#D946EF',
  '#EF4444',
  '#B91C1C',
  '#450A0A',
];
const heatColor = (total: number) =>
  HEAT_COLORS[Math.min(total, HEAT_COLORS.length - 1)];
const COLUMNS = 'grid-cols-[44px_repeat(31,minmax(0,1fr))]';
// weekday layout: a month spans at most 6 weeks, so 37 columns of Mo..Su repeated
const WEEKDAY_COLUMNS = 'grid-cols-[44px_repeat(37,minmax(0,1fr))]';
// 2024-01-01 is a Monday
const weekdayLabel = (index: number) =>
  dayjs('2024-01-01').add(index, 'day').format('dd');
const Heatmap: FC<{
  months: ReturnType<typeof buildYearGrid>;
  openDay: (day: YearDay) => () => void;
}> = ({ months, openDay }) => {
  return (
    <div className="flex flex-col gap-[4px] min-w-[760px]">
      <div className={clsx('grid gap-[2px]', COLUMNS)}>
        <div />
        {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
          <div
            key={day}
            className="text-[9px] leading-[12px] text-center text-textColor/60"
          >
            {day}
          </div>
        ))}
      </div>
      {months.map(({ month, days }) => (
        <div
          key={month}
          className={clsx('grid gap-[2px] items-start', COLUMNS)}
        >
          <div className="text-[12px] font-[600] pt-[2px]">
            {dayjs().month(month).format('MMM')}
          </div>
          {days.map((day) => (
            <div
              key={day.date}
              title={`${day.date}: ${day.total}`}
              onClick={openDay(day)}
              className="cursor-pointer min-h-[28px] rounded-[4px] border border-newTableBorder hover:opacity-80"
              style={
                day.total
                  ? {
                      backgroundColor: heatColor(day.total),
                      borderColor: heatColor(day.total),
                    }
                  : undefined
              }
            />
          ))}
        </div>
      ))}
      <div className="flex items-center gap-[6px] text-[8px] leading-[8px] text-textColor/60">
        {HEAT_COLORS.map((color, total) => (
          <div key={total} className="flex items-center gap-[2px]">
            <div
              className="w-[8px] h-[8px] rounded-[1px] border border-newTableBorder"
              style={
                total
                  ? { backgroundColor: color, borderColor: color }
                  : undefined
              }
            />
            <span>
              {total === HEAT_COLORS.length - 1 ? `${total}+` : total}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const YearView: FC = () => {
  const t = useT();
  const { startDate, customer, setFilters } = useCalendar();
  const [layout, setLayout] = useState<'date' | 'weekday' | 'heatmap'>('date');
  const columns = layout === 'weekday' ? WEEKDAY_COLUMNS : COLUMNS;
  const year = newDayjs(startDate).year();
  const { data, isLoading } = useYearOverview(
    newDayjs(startDate).startOf('year').utc().format(),
    newDayjs(startDate).endOf('year').utc().format(),
    customer
  );

  const months = useMemo(
    () =>
      buildYearGrid(data || [], year, (date) =>
        dayjs.utc(date).local().format('YYYY-MM-DD')
      ),
    [data, year]
  );
  const today = newDayjs().format('YYYY-MM-DD');

  const openMonth = useCallback(
    (day: YearDay) => () => {
      const date = newDayjs(day.date);
      setFilters({
        startDate: date.startOf('month').format('YYYY-MM-DD'),
        endDate: date.endOf('month').format('YYYY-MM-DD'),
        display: 'month',
        customer,
      });
    },
    [customer, setFilters]
  );

  const openDay = useCallback(
    (day: YearDay) => () => {
      const date = newDayjs(day.date);
      setFilters({
        startDate: date.format('YYYY-MM-DD'),
        endDate: date.format('YYYY-MM-DD'),
        display: 'day',
        customer,
      });
    },
    [customer, setFilters]
  );

  return (
    <div
      className={clsx(
        'flex flex-col gap-[20px] flex-1 overflow-auto',
        isLoading && 'animate-pulse'
      )}
    >
      <div className="flex flex-row w-fit p-[4px] border border-newTableBorder rounded-[8px] text-[12px] font-[500]">
        {(['date', 'weekday', 'heatmap'] as const).map((value) => (
          <div
            key={value}
            onClick={() => setLayout(value)}
            className={clsx(
              'px-[10px] py-[4px] cursor-pointer text-center rounded-[6px]',
              layout === value && 'text-textItemFocused bg-boxFocused'
            )}
          >
            {value === 'date'
              ? t('by_date', 'By date')
              : value === 'weekday'
              ? t('by_weekday', 'By weekday')
              : t('heatmap', 'Heatmap')}
          </div>
        ))}
      </div>
      {layout === 'heatmap' ? (
        <Heatmap months={months} openDay={openDay} />
      ) : (
        <div
          className={clsx(
            'flex flex-col gap-[4px]',
            layout === 'weekday' ? 'min-w-[1000px]' : 'min-w-[760px]'
          )}
        >
          <div className={clsx('grid gap-[2px]', columns)}>
            <div />
            {layout === 'date'
              ? Array.from({ length: 31 }, (_, index) => index + 1).map(
                  (day) => (
                    <div
                      key={day}
                      className="text-[9px] leading-[12px] text-center text-textColor/60"
                    >
                      {day}
                    </div>
                  )
                )
              : Array.from({ length: 37 }, (_, index) => (
                  <div
                    key={index}
                    className="text-[9px] leading-[12px] text-center text-textColor/60"
                  >
                    {weekdayLabel(index % 7)}
                  </div>
                ))}
          </div>
          {months.map(({ month, days }) => (
            <div
              key={month}
              className={clsx('grid gap-[2px] items-stretch', columns)}
            >
              <div className="text-[12px] font-[600] pt-[2px]">
                {dayjs().month(month).format('MMM')}
              </div>
              {layout === 'weekday' &&
                Array.from(
                  { length: (dayjs(days[0].date).day() + 6) % 7 },
                  (_, index) => <div key={`empty-${index}`} />
                )}
              {days.map((day) => (
                <div
                  key={day.date}
                  onClick={openMonth(day)}
                  className="cursor-pointer flex flex-col items-center gap-[2px] min-h-[36px] pb-[4px] rounded-[4px] border border-newTableBorder hover:bg-[#9CA3AF]/20"
                >
                  <div
                    className={clsx(
                      'text-[9px] leading-[12px] px-[3px] rounded-[3px]',
                      day.date === today
                        ? 'bg-newTableTextFocused text-black font-[600]'
                        : 'text-textColor/60'
                    )}
                  >
                    {layout === 'date'
                      ? dayjs(day.date).format('dd')
                      : Number(day.date.slice(8))}
                  </div>
                  {day.circles.map((circle) => (
                    <div
                      key={circle.pipelineId || 'none'}
                      className={clsx(
                        'w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-[600]',
                        !circle.color && 'bg-newTableTextFocused'
                      )}
                      style={
                        circle.color
                          ? {
                              backgroundColor: circle.color,
                              color: textColorOn(circle.color),
                            }
                          : { color: '#000000' }
                      }
                    >
                      {circle.count}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
