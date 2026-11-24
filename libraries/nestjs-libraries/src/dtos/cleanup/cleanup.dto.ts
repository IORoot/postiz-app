import { IsEnum } from 'class-validator';

export enum CleanupAction {
  POSTS_SOFT_DELETE = 'posts_soft_delete',
  POSTS_PURGE_REMOVED = 'posts_purge_removed',
  QUEUE_ITEMS_DELETE = 'queue_items_delete',
  QUEUE_ITEMS_PURGE_REMOVED = 'queue_items_purge_removed',
  SLOT_EXECUTIONS_DELETE = 'slot_executions_delete',
  MEDIA_SOFT_DELETE = 'media_soft_delete',
  MEDIA_PURGE_REMOVED = 'media_purge_removed',
  MEDIA_DELETE_ALL = 'media_delete_all',
  STUCK_ITEMS_RELEASE = 'stuck_items_release',
  STALE_WORKFLOWS_TERMINATE = 'stale_workflows_terminate',
  ORPHAN_FILES_DELETE = 'orphan_files_delete',
}

export class CleanupActionDto {
  @IsEnum(CleanupAction)
  action: CleanupAction;
}

export interface CleanupSummary {
  posts: { live: number; removed: number };
  queueItems: Record<string, number>;
  slotExecutions: number;
  media: { live: number; removed: number };
  // false when the storage provider can't list its files
  canScanFiles: boolean;
  diskBytes: number | null;
}

// Named counts, e.g. { posts: 659, errors: 11 }; the same shape comes back
// from the preview and from the real run
export type CleanupResult = Record<string, number>;
