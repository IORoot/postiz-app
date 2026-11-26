'use client';

import { FC, useCallback, useMemo } from 'react';
import clsx from 'clsx';
import dayjs from 'dayjs';
import { useCalendar } from '@gitroom/frontend/components/launches/calendar.context';
import { useYearOverview } from '@gitroom/frontend/components/launches/use.year.overview';
import {
  buildYearGrid,
  textColorOn,
  YearDay,
} from '@gitroom/frontend/components/launches/year.grid';
import { newDayjs } from '@gitroom/frontend/components/layout/set.timezone';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

const ACCENT = '#612BD3';
const LEVEL_OPACITY = [0, 0.3, 0.5, 0.75, 1];
const COLUMNS = 'grid-cols-[44px_repeat(31,minmax(0,1fr))]';

const Heatmap: FC<{ months: ReturnType<typeof buildYearGrid> }> = ({
  months,
}) => {
  const t = useT();
  return (
    <div className="flex flex-col gap-[6px] min-w-[760px]">
      <div className="flex flex-col gap-[3px]">
        {months.map(({ month, days }) => (
          <div key={month} className={clsx('grid gap-[3px] items-center', COLUMNS)}>
            <div className="text-[10px] text-textColor/60">
              {dayjs().month(month).format('MMM')}
            </div>
            {days.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${day.total}`}
                className="aspect-square rounded-[2px] border border-newTableBorder"
                style={
                  day.level
                    ? {
                        backgroundColor: ACCENT,
                        opacity: LEVEL_OPACITY[day.level],
                        borderColor: ACCENT,
                      }
                    : undefined
                }
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-[4px] text-[10px] text-textColor/60">
        <span>{t('less', 'Less')}</span>
        {LEVEL_OPACITY.map((opacity, level) => (
          <div
            key={level}
            className="w-[10px] h-[10px] rounded-[2px] border border-newTableBorder"
            style={
              level
                ? { backgroundColor: ACCENT, opacity, borderColor: ACCENT }
                : undefined
            }
          />
        ))}
        <span>{t('more', 'More')}</span>
      </div>
    </div>
  );
};

export const YearView: FC = () => {
  const { startDate, customer, setFilters } = useCalendar();
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

  return (
    <div
      className={clsx(
        'flex flex-col gap-[20px] flex-1 overflow-auto',
        isLoading && 'animate-pulse'
      )}
    >
      <Heatmap months={months} />
      <div className="flex flex-col gap-[4px] min-w-[760px]">
        {months.map(({ month, days }) => (
          <div
            key={month}
            className={clsx(
              'grid gap-[2px] items-start rounded-[8px] border border-newTableBorder p-[4px]',
              COLUMNS
            )}
          >
            <div className="text-[12px] font-[600] pt-[2px]">
              {dayjs().month(month).format('MMM')}
            </div>
            {days.map((day) => (
              <div
                key={day.date}
                onClick={openMonth(day)}
                className="cursor-pointer flex flex-col items-center gap-[2px] min-h-[28px] rounded-[4px] hover:bg-boxFocused"
              >
                <div
                  className={clsx(
                    'text-[9px] leading-[12px] px-[3px] rounded-[3px]',
                    day.date === today
                      ? 'bg-newTableTextFocused text-black font-[600]'
                      : 'text-textColor/60'
                  )}
                >
                  {Number(day.date.slice(8))}
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
    </div>
  );
};
