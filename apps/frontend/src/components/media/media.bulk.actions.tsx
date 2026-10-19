'use client';

import { FC, useCallback, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { deleteDialog } from '@gitroom/react/helpers/delete.dialog';
import { Button } from '@gitroom/react/form/button';
import { Checkbox } from '@gitroom/react/form/checkbox';
import {
  BULK_MEDIA_MAX,
  type BulkDeleteMediaResult,
} from '@gitroom/nestjs-libraries/dtos/media/bulk.delete.media.dto';

// `ids` for a picked selection, `all` (with the active search) for the whole library
export interface BulkMediaSelection {
  ids: string[];
  all: boolean;
  search: string;
  folderId?: string;
}

export const useBulkMediaActions = (
  selection: BulkMediaSelection,
  onDone: () => void
) => {
  const t = useT();
  const fetch = useFetch();
  const toaster = useToaster();
  const [busy, setBusy] = useState(false);

  const send = useCallback(
    async (removeFiles: boolean) => {
      setBusy(true);
      try {
        const response = await fetch('/media/bulk/delete', {
          method: 'POST',
          body: JSON.stringify(
            selection.all
                ? {
                  all: true,
                  search: selection.search.trim() || undefined,
                  folderId: selection.folderId,
                  removeFiles,
                }
              : { ids: selection.ids, removeFiles }
          ),
        });

        if (!response.ok) {
          toaster.show(
            t('bulk_media_failed', 'Something went wrong, please try again'),
            'warning'
          );
          return;
        }

        const result: BulkDeleteMediaResult = await response.json();
        if (!removeFiles) {
          toaster.show(
            t('media_hidden', 'Hidden: {{n}}', { n: result.deleted }),
            'success'
          );
        } else {
          toaster.show(
            t(
              'media_files_deleted',
              'Deleted {{n}} ({{removed}} files removed, {{failed}} failed)',
              {
                n: result.deleted,
                removed: result.filesRemoved,
                failed: result.filesFailed,
              }
            ),
            result.filesFailed ? 'warning' : 'success'
          );
        }

        onDone();
      } finally {
        setBusy(false);
      }
    },
    [fetch, toaster, t, onDone, selection]
  );

  const tooMany = !selection.all && selection.ids.length > BULK_MEDIA_MAX;
  const target = selection.all
    ? selection.folderId
      ? selection.search.trim()
        ? t(
            'all_media_in_folder_matching_search',
            'all media in this folder matching your search'
          )
        : t('all_media_in_folder', 'all media in this folder')
      : selection.search.trim()
        ? t('all_media_matching_search', 'all media matching your search')
        : t('all_media_in_library', 'all media in the library')
    : t('n_media', '{{n}} media', { n: selection.ids.length });

  const hide = useCallback(async () => {
    if (
      !(await deleteDialog(
        t(
          'are_you_sure_you_want_to_hide_media',
          'Remove {{target}} from the library? The files stay in storage.',
          { target, interpolation: { escapeValue: false } }
        ),
        t('yes_remove', 'Yes, remove')
      ))
    ) {
      return;
    }
    await send(false);
  }, [send, t, target]);

  const move = useCallback(
    async (targetFolderId?: string) => {
      setBusy(true);
      try {
        const response = await fetch('/media/bulk/move', {
          method: 'POST',
          body: JSON.stringify(
            selection.all
              ? {
                  all: true,
                  search: selection.search.trim() || undefined,
                  folderId: selection.folderId,
                  targetFolderId,
                }
              : { ids: selection.ids, targetFolderId }
          ),
        });

        if (!response.ok) {
          toaster.show(
            t('bulk_media_failed', 'Something went wrong, please try again'),
            'warning'
          );
          return;
        }

        const result: { moved: number } = await response.json();
        toaster.show(
          t('media_moved', 'Moved: {{n}}', { n: result.moved }),
          'success'
        );
        onDone();
        return true;
      } finally {
        setBusy(false);
      }
    },
    [fetch, toaster, t, onDone, selection]
  );

  const deleteFiles = useCallback(async () => {
    if (
      !(await deleteDialog(
        t(
          'are_you_sure_you_want_to_delete_media_files',
          'Permanently delete the files of {{target}}? Scheduled posts that use them will lose their media.',
          { target, interpolation: { escapeValue: false } }
        ),
        t('yes_delete_files', 'Yes, delete files')
      ))
    ) {
      return;
    }
    await send(true);
  }, [send, t, target]);

  return { busy, tooMany, hide, deleteFiles, move };
};

export const MediaBulkActionsBar: FC<{
  selection: BulkMediaSelection;
  pageSelected: boolean;
  onSelectPage: () => void;
  onSelectLibrary: () => void;
  onClear: () => void;
  onCancel: () => void;
  onDone: () => void;
}> = ({
  selection,
  pageSelected,
  onSelectPage,
  onSelectLibrary,
  onClear,
  onCancel,
  onDone,
}) => {
  const t = useT();
  const fetch = useFetch();
  const { busy, tooMany, hide, deleteFiles, move } = useBulkMediaActions(
    selection,
    onDone
  );
  const [destination, setDestination] = useState('');
  const loadFolders = useCallback(async () => {
    const response = await fetch('/media/folders');
    if (!response.ok) {
      return [];
    }
    const body = await response.json();
    return Array.isArray(body) ? body : [];
  }, [fetch]);
  const { data: folders } = useSWR<{ id: string; name: string }[]>(
    'get-media-folders',
    loadFolders
  );
  const hasSelection = selection.all || selection.ids.length > 0;
  const folderChoices = (folders || []).filter(
    (folder) => !(selection.all && folder.id === selection.folderId)
  );

  return (
    <div className="flex flex-wrap items-center gap-[10px] px-[12px] py-[8px] border border-newTableBorder bg-newBgColorInner rounded-[8px] text-[14px] text-textColor">
      <Checkbox
        disableForm
        checked={pageSelected}
        label={t('select_all_on_page', 'Select all on this page')}
        onChange={pageSelected ? onClear : onSelectPage}
      />
      <Checkbox
        disableForm
        checked={selection.all}
        label={
          selection.folderId
            ? t('select_whole_folder', 'Select whole folder')
            : t('select_whole_library', 'Select whole library')
        }
        onChange={selection.all ? onClear : onSelectLibrary}
      />
      <div className="text-textColor/70">
        {selection.all
          ? selection.folderId
            ? t('whole_folder_selected', 'Whole folder')
            : t('whole_library_selected', 'Whole library')
          : t('n_selected', 'Selected: {{n}}', { n: selection.ids.length })}
      </div>
      {tooMany && (
        <div className="text-red-500">
          {t('bulk_media_max', 'Up to {{max}} at a time', {
            max: BULK_MEDIA_MAX,
          })}
        </div>
      )}
      <div className="flex-1" />
      {!!folders?.length && (
        <select
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          className="h-[34px] max-w-[180px] px-[8px] rounded-[8px] bg-newBgColorInner border border-newTableBorder text-[14px] outline-none"
        >
          <option value="">{t('move_to_folder', 'Move to folder…')}</option>
          <option value="root">{t('no_folder', 'No folder')}</option>
          {folderChoices.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
      )}
      {!!folders?.length && (
        <Button
          secondary
          className="rounded-[8px] !h-[34px] !px-[12px]"
          disabled={!hasSelection || !destination || tooMany || busy}
          onClick={async () => {
            const moved = await move(
              destination === 'root' ? undefined : destination
            );
            if (moved) {
              setDestination('');
            }
          }}
        >
          {t('move', 'Move')}
        </Button>
      )}
      <Button
        secondary
        className="rounded-[8px] !h-[34px] !px-[12px]"
        disabled={!hasSelection || tooMany || busy}
        onClick={hide}
      >
        {t('hide', 'Hide')}
      </Button>
      <Button
        className="!bg-red-700 rounded-[8px] !h-[34px] !px-[12px]"
        disabled={!hasSelection || tooMany || busy}
        loading={busy}
        onClick={deleteFiles}
      >
        {t('delete_files', 'Delete files')}
      </Button>
      <Button
        secondary
        className="rounded-[8px] !h-[34px] !px-[12px]"
        onClick={onCancel}
      >
        {t('cancel', 'Cancel')}
      </Button>
    </div>
  );
};
