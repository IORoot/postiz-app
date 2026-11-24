'use client';

import React, { FC, useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  CleanupAction,
  CleanupResult,
  CleanupSummary,
} from '@gitroom/nestjs-libraries/dtos/cleanup/cleanup.dto';

const CONFIRM_WORD = 'DELETE';

const useCleanupSummary = () => {
  const fetch = useFetch();
  const load = useCallback(async () => {
    return (await fetch('/cleanup')).json() as Promise<CleanupSummary>;
  }, []);
  return useSWR('cleanup-summary', load);
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const describeCounts = (counts: CleanupResult) =>
  Object.entries(counts)
    .map(([name, count]) => `${count} ${name}`)
    .join(', ');

export const CleanupComponent: FC = () => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const { data: summary, mutate } = useCleanupSummary();
  const [running, setRunning] = useState<CleanupAction | null>(null);
  const [pending, setPending] = useState<{
    action: CleanupAction;
    counts: CleanupResult;
  } | null>(null);
  const [typed, setTyped] = useState('');

  const groups = useMemo(
    () => [
      {
        title: t('cleanup_posts', 'Posts'),
        actions: [
          {
            action: CleanupAction.POSTS_SOFT_DELETE,
            label: t('cleanup_posts_soft_delete', 'Delete all posts'),
            description: t(
              'cleanup_posts_soft_delete_description',
              'Hides every post from the calendar and stops their publishing workflows. The rows stay in the database.'
            ),
          },
          {
            action: CleanupAction.POSTS_PURGE_REMOVED,
            label: t(
              'cleanup_posts_purge_removed',
              'Permanently delete removed posts'
            ),
            description: t(
              'cleanup_posts_purge_removed_description',
              'Erases posts that are already hidden, with their error logs, comments and tags.'
            ),
            irreversible: true,
          },
        ],
      },
      {
        title: t('cleanup_pipelines', 'Pipelines'),
        actions: [
          {
            action: CleanupAction.QUEUE_ITEMS_DELETE,
            label: t('cleanup_queue_items_delete', 'Delete all queue items'),
            description: t(
              'cleanup_queue_items_delete_description',
              'Erases every pipeline queue item with its posts and slot executions.'
            ),
            irreversible: true,
          },
          {
            action: CleanupAction.QUEUE_ITEMS_PURGE_REMOVED,
            label: t(
              'cleanup_queue_items_purge_removed',
              'Delete removed queue items'
            ),
            description: t(
              'cleanup_queue_items_purge_removed_description',
              'Erases only the queue items already marked as removed.'
            ),
            irreversible: true,
          },
          {
            action: CleanupAction.SLOT_EXECUTIONS_DELETE,
            label: t(
              'cleanup_slot_executions_delete',
              'Delete slot executions'
            ),
            description: t(
              'cleanup_slot_executions_delete_description',
              'Erases the history of finished pipeline runs. Running slots are kept.'
            ),
            irreversible: true,
          },
          {
            action: CleanupAction.STUCK_ITEMS_RELEASE,
            label: t('cleanup_stuck_items_release', 'Release stuck items'),
            description: t(
              'cleanup_stuck_items_release_description',
              'Frees queue items stuck in publishing for over 30 minutes: unpublished ones go back in the queue, the rest are closed.'
            ),
          },
          {
            action: CleanupAction.STALE_WORKFLOWS_TERMINATE,
            label: t(
              'cleanup_stale_workflows_terminate',
              'Stop stale workflows'
            ),
            description: t(
              'cleanup_stale_workflows_terminate_description',
              'Stops running post workflows whose post no longer exists.'
            ),
          },
        ],
      },
      {
        title: t('cleanup_media', 'Media'),
        actions: [
          {
            action: CleanupAction.MEDIA_SOFT_DELETE,
            label: t('cleanup_media_soft_delete', 'Soft delete media'),
            description: t(
              'cleanup_media_soft_delete_description',
              'Hides all media from the library. Files stay on disk.'
            ),
          },
          {
            action: CleanupAction.MEDIA_PURGE_REMOVED,
            label: t(
              'cleanup_media_purge_removed',
              'Delete soft-deleted media'
            ),
            description: t(
              'cleanup_media_purge_removed_description',
              'Erases the hidden media records and their files.'
            ),
            irreversible: true,
          },
          {
            action: CleanupAction.MEDIA_DELETE_ALL,
            label: t('cleanup_media_delete_all', 'Delete all media'),
            description: t(
              'cleanup_media_delete_all_description',
              'Erases every media record and file. Posts that still use them lose their pictures.'
            ),
            irreversible: true,
          },
          ...(summary?.canScanFiles
            ? [
                {
                  action: CleanupAction.ORPHAN_FILES_DELETE,
                  label: t(
                    'cleanup_orphan_files_delete',
                    'Delete orphan files'
                  ),
                  description: t(
                    'cleanup_orphan_files_delete_description',
                    'Erases uploaded files that no media record or post points at.'
                  ),
                  irreversible: true,
                },
              ]
            : []),
        ],
      },
    ],
    [t, summary?.canScanFiles]
  );

  const execute = useCallback(
    async (action: CleanupAction) => {
      setRunning(action);
      try {
        const response = await fetch('/cleanup', {
          method: 'POST',
          body: JSON.stringify({ action }),
        });
        if (response.status !== 200 && response.status !== 201) {
          toaster.show(
            t('cleanup_failed', 'The clean up failed, nothing was changed'),
            'warning'
          );
          return;
        }
        const result = (await response.json()) as CleanupResult;
        toaster.show(
          `${t('cleanup_done', 'Done')}: ${describeCounts(result)}`,
          'success'
        );
        await mutate();
      } finally {
        setRunning(null);
        setPending(null);
        setTyped('');
      }
    },
    [t, mutate]
  );

  const start = useCallback(
    (action: CleanupAction, irreversible?: boolean) => async () => {
      setRunning(action);
      let counts: CleanupResult;
      try {
        const response = await fetch(`/cleanup/preview?action=${action}`);
        if (response.status !== 200) {
          toaster.show(
            t('cleanup_preview_failed', 'Could not check what would change'),
            'warning'
          );
          return;
        }
        counts = await response.json();
      } finally {
        setRunning(null);
      }

      if (irreversible) {
        setTyped('');
        setPending({ action, counts });
        return;
      }
      if (
        await deleteDialog(
          `${t('cleanup_will_affect', 'This will affect')}: ${describeCounts(
            counts
          )}`,
          t('cleanup_confirm', 'Yes, continue')
        )
      ) {
        await execute(action);
      }
    },
    [t, execute]
  );

  return (
    <div className="flex flex-col gap-[16px]">
      <h3 className="text-[20px]">{t('cleanup', 'Clean up')}</h3>

      {!!summary && (
        <div className="bg-sixth border-fifth border rounded-[4px] p-[16px] text-[14px] flex flex-wrap gap-x-[24px] gap-y-[4px]">
          <div>
            {t('cleanup_summary_posts', 'Posts')}: {summary.posts.live}{' '}
            {t('cleanup_live', 'live')}, {summary.posts.removed}{' '}
            {t('cleanup_removed', 'removed')}
          </div>
          <div>
            {t('cleanup_summary_queue', 'Queue items')}:{' '}
            {Object.entries(summary.queueItems)
              .map(([status, count]) => `${count} ${status.toLowerCase()}`)
              .join(', ') || '0'}
          </div>
          <div>
            {t('cleanup_summary_executions', 'Slot executions')}:{' '}
            {summary.slotExecutions}
          </div>
          <div>
            {t('cleanup_summary_media', 'Media')}: {summary.media.live}{' '}
            {t('cleanup_live', 'live')}, {summary.media.removed}{' '}
            {t('cleanup_removed', 'removed')}
          </div>
          {summary.diskBytes !== null && (
            <div>
              {t('cleanup_summary_disk', 'Uploads on disk (whole installation)')}:{' '}
              {formatBytes(summary.diskBytes)}
            </div>
          )}
        </div>
      )}

      {groups.map((group) => (
        <div
          key={group.title}
          className="bg-sixth border-fifth border rounded-[4px] p-[24px] flex flex-col gap-[16px]"
        >
          <div>{group.title}</div>
          {group.actions.map((item) => (
            <div key={item.action} className="flex flex-col gap-[8px]">
              <div className="flex items-center justify-between gap-[16px]">
                <div className="flex flex-col">
                  <div className="text-[14px]">{item.label}</div>
                  <div className="text-[12px] text-textItemBlur">
                    {item.description}
                  </div>
                </div>
                <Button
                  type="button"
                  className={item.irreversible ? '!bg-red-800' : ''}
                  loading={running === item.action}
                  disabled={!!running}
                  onClick={start(item.action, item.irreversible)}
                >
                  {item.label}
                </Button>
              </div>
              {pending?.action === item.action && (
                <div className="flex items-center gap-[12px] text-[14px] border border-red-800 rounded-[4px] p-[12px]">
                  <div className="flex-1">
                    {t('cleanup_cannot_undo', 'This cannot be undone')}:{' '}
                    {describeCounts(pending.counts)}.{' '}
                    {t('cleanup_type', 'Type')} {CONFIRM_WORD}{' '}
                    {t('cleanup_to_confirm', 'to confirm.')}
                  </div>
                  <input
                    className="bg-newBgColorInner border border-fifth rounded-[4px] px-[8px] h-[36px] w-[120px] outline-none"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                  />
                  <Button
                    type="button"
                    className="!bg-red-800"
                    loading={running === item.action}
                    disabled={typed !== CONFIRM_WORD || !!running}
                    onClick={() => execute(item.action)}
                  >
                    {t('cleanup_confirm_delete', 'Confirm')}
                  </Button>
                  <Button
                    type="button"
                    secondary
                    disabled={!!running}
                    onClick={() => setPending(null)}
                  >
                    {t('cancel', 'Cancel')}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
