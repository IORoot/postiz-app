'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { YearOverviewRow } from '@gitroom/frontend/components/launches/year.grid';

export const yearOverviewKey = (
  startDate: string,
  endDate: string,
  customer?: string | null
) => {
  const params = new URLSearchParams({ startDate, endDate });
  if (customer) {
    params.set('customer', customer);
  }
  return `/posts/year-overview?${params.toString()}`;
};

export const useYearOverview = (
  startDate: string,
  endDate: string,
  customer?: string | null
) => {
  const fetch = useFetch();

  const load = useCallback(async () => {
    const response = await fetch(yearOverviewKey(startDate, endDate, customer));
    if (!response.ok) {
      throw new Error('Unable to load the year');
    }
    const data = await response.json();
    return Array.isArray(data) ? (data as YearOverviewRow[]) : [];
  }, [fetch, startDate, endDate, customer]);

  return useSWR<YearOverviewRow[]>(
    yearOverviewKey(startDate, endDate, customer),
    load,
    {
      refreshInterval: 3600000,
      refreshWhenOffline: false,
      refreshWhenHidden: false,
      revalidateOnFocus: false,
      keepPreviousData: true,
    }
  );
};
