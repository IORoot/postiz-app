import { Injectable } from '@nestjs/common';
import { chunk } from 'lodash';
import { TemporalService } from 'nestjs-temporal-core';
import {
  CleanupRepository,
  STUCK_CLAIM_MS,
} from '@gitroom/nestjs-libraries/database/prisma/cleanup/cleanup.repository';
import {
  CleanupAction,
  CleanupResult,
  CleanupSummary,
} from '@gitroom/nestjs-libraries/dtos/cleanup/cleanup.dto';
import { UploadFactory } from '@gitroom/nestjs-libraries/upload/upload.factory';
import { StoredFile } from '@gitroom/nestjs-libraries/upload/upload.interface';

// A file uploaded this recently may not have its media record yet
const ORPHAN_MIN_AGE_MS = 60 * 60 * 1000;
const BATCH = 10;

@Injectable()
export class CleanupService {
  private storage = UploadFactory.createStorage();

  constructor(
    private _cleanupRepository: CleanupRepository,
    private _temporalService: TemporalService
  ) {}

  async getSummary(org: string): Promise<CleanupSummary> {
    const summary = await this._cleanupRepository.getSummary(org);
    let diskBytes: number | null = null;
    try {
      const files = await this.storage.listFiles?.();
      diskBytes = files ? files.reduce((sum, file) => sum + file.size, 0) : null;
    } catch (err) {
      console.error('Could not list stored files:', err);
    }
    return {
      ...summary,
      canScanFiles: !!this.storage.listFiles,
      diskBytes,
    };
  }

  // What the action would do, without doing it
  async preview(org: string, action: CleanupAction): Promise<CleanupResult> {
    const stuckCutoff = new Date(Date.now() - STUCK_CLAIM_MS);
    switch (action) {
      case CleanupAction.POSTS_SOFT_DELETE:
        return { posts: await this._cleanupRepository.countLivePosts(org) };
      case CleanupAction.POSTS_PURGE_REMOVED:
        return { posts: await this._cleanupRepository.countRemovedPosts(org) };
      case CleanupAction.QUEUE_ITEMS_DELETE:
        return this._cleanupRepository.countQueueItems(org, false);
      case CleanupAction.QUEUE_ITEMS_PURGE_REMOVED:
        return this._cleanupRepository.countQueueItems(org, true);
      case CleanupAction.SLOT_EXECUTIONS_DELETE:
        return {
          slotExecutions: await this._cleanupRepository.countSlotExecutions(
            org
          ),
        };
      case CleanupAction.MEDIA_SOFT_DELETE:
        return { media: await this._cleanupRepository.countMedia(org, false) };
      case CleanupAction.MEDIA_PURGE_REMOVED:
        return this.previewMediaPurge(org, true);
      case CleanupAction.MEDIA_DELETE_ALL:
        return this.previewMediaPurge(org, false);
      case CleanupAction.STUCK_ITEMS_RELEASE:
        return {
          queueItems: await this._cleanupRepository.countStuckItems(
            org,
            stuckCutoff
          ),
        };
      case CleanupAction.STALE_WORKFLOWS_TERMINATE:
        return {
          workflows: (await this.findStaleWorkflowIds(org)).length,
        };
      case CleanupAction.ORPHAN_FILES_DELETE:
        return { files: (await this.findOrphanFiles()).length };
    }
  }

  async run(org: string, action: CleanupAction): Promise<CleanupResult> {
    const stuckCutoff = new Date(Date.now() - STUCK_CLAIM_MS);
    switch (action) {
      case CleanupAction.POSTS_SOFT_DELETE:
        return this.thenStopWorkflows(
          org,
          await this._cleanupRepository.getLivePostIds(org),
          () => this._cleanupRepository.softDeletePosts(org)
        );
      case CleanupAction.POSTS_PURGE_REMOVED:
        return this._cleanupRepository.purgeRemovedPosts(org);
      case CleanupAction.QUEUE_ITEMS_DELETE:
        return this.thenStopWorkflows(
          org,
          await this._cleanupRepository.getQueueItemPostIds(org, false),
          () => this._cleanupRepository.deleteQueueItems(org, false)
        );
      case CleanupAction.QUEUE_ITEMS_PURGE_REMOVED:
        return this._cleanupRepository.deleteQueueItems(org, true);
      case CleanupAction.SLOT_EXECUTIONS_DELETE:
        return this._cleanupRepository.deleteSlotExecutions(org);
      case CleanupAction.MEDIA_SOFT_DELETE:
        return this._cleanupRepository.softDeleteMedia(org);
      case CleanupAction.MEDIA_PURGE_REMOVED:
        return this.purgeMedia(org, true);
      case CleanupAction.MEDIA_DELETE_ALL:
        return this.purgeMedia(org, false);
      case CleanupAction.STUCK_ITEMS_RELEASE:
        await this.terminatePostWorkflows(
          org,
          await this._cleanupRepository.getStuckItemPostIds(org, stuckCutoff)
        );
        return this._cleanupRepository.releaseStuckItems(org, stuckCutoff);
      case CleanupAction.STALE_WORKFLOWS_TERMINATE: {
        const workflowIds = await this.findStaleWorkflowIds(org);
        await this.terminateWorkflows(workflowIds);
        return { workflows: workflowIds.length };
      }
      case CleanupAction.ORPHAN_FILES_DELETE: {
        const files = await this.findOrphanFiles();
        return this.removeFiles(files.map((file) => file.path));
      }
    }
  }

  private async previewMediaPurge(org: string, removedOnly: boolean) {
    const [media, posts] = await Promise.all([
      this._cleanupRepository.countMedia(org, removedOnly),
      this._cleanupRepository.countPostsWithAttachments(org),
    ]);
    return { media, postsWithAttachments: posts };
  }

  private async purgeMedia(
    org: string,
    removedOnly: boolean
  ): Promise<CleanupResult> {
    const { count, files } = await this._cleanupRepository.purgeMedia(
      org,
      removedOnly
    );
    return { media: count, ...(await this.removeFiles(files)) };
  }

  // A file that can't be removed never fails the batch, it is counted
  private async removeFiles(files: string[]): Promise<CleanupResult> {
    let filesRemoved = 0;
    let filesFailed = 0;
    for (const batch of chunk(files, BATCH)) {
      await Promise.all(
        batch.map(async (file) => {
          try {
            await this.storage.removeFile(file);
            filesRemoved++;
          } catch (err) {
            filesFailed++;
            console.error(`Could not remove file ${file}:`, err);
          }
        })
      );
    }
    return { filesRemoved, filesFailed };
  }

  private async findOrphanFiles(): Promise<StoredFile[]> {
    if (!this.storage.listFiles) {
      return [];
    }
    const [files, references] = await Promise.all([
      this.storage.listFiles(),
      this._cleanupRepository.getFileReferences(),
    ]);
    const newest = Date.now() - ORPHAN_MIN_AGE_MS;
    return files.filter(
      (file) =>
        file.modifiedAt.getTime() < newest &&
        !references.includes(file.relativePath)
    );
  }

  // The posts are gone from the database first, so a workflow that wakes up
  // before it is stopped finds nothing to publish
  private async thenStopWorkflows(
    org: string,
    postIds: string[],
    change: () => Promise<CleanupResult>
  ): Promise<CleanupResult> {
    const result = await change();
    await this.terminatePostWorkflows(org, postIds);
    return result;
  }

  // A workflow that can't be stopped is logged and never fails the purge
  private async terminatePostWorkflows(org: string, postIds: string[]) {
    const wanted = new Set(postIds);
    if (!wanted.size) {
      return;
    }
    try {
      const workflowIds = (await this.listRunningPostWorkflows(org))
        .filter(({ postId }) => wanted.has(postId))
        .map(({ workflowId }) => workflowId);
      await this.terminateWorkflows(workflowIds);
    } catch (err) {
      console.error('Could not list the running workflows:', err);
    }
  }

  // Running post workflows (`post_<postId>` and `post_<postId>_pipeline_...`)
  private async listRunningPostWorkflows(org: string) {
    const found: { postId: string; workflowId: string }[] = [];
    const workflows = this._temporalService.client
      .getRawClient()
      ?.workflow.list({
        query: `organizationId="${org}" AND ExecutionStatus="Running"`,
      });
    if (!workflows) {
      return found;
    }
    for await (const executionInfo of workflows) {
      const postId = /^post_([^_]+)/.exec(executionInfo.workflowId)?.[1];
      if (postId) {
        found.push({ postId, workflowId: executionInfo.workflowId });
      }
    }
    return found;
  }

  private async terminateWorkflows(workflowIds: string[]) {
    for (const batch of chunk(workflowIds, BATCH)) {
      await Promise.all(
        batch.map(async (workflowId) => {
          try {
            const workflow = await this._temporalService.client.getWorkflowHandle(
              workflowId
            );
            await workflow.terminate('Settings > Clean up');
          } catch (err) {
            console.error(`Could not terminate workflow ${workflowId}:`, err);
          }
        })
      );
    }
  }

  // Running post workflows whose post is deleted or gone
  private async findStaleWorkflowIds(org: string): Promise<string[]> {
    let running: { postId: string; workflowId: string }[];
    try {
      running = await this.listRunningPostWorkflows(org);
    } catch (err) {
      console.error('Could not list the running workflows:', err);
      return [];
    }
    const live = await this._cleanupRepository.getLivePostIdsAmong(org, [
      ...new Set(running.map(({ postId }) => postId)),
    ]);
    return running
      .filter(({ postId }) => !live.has(postId))
      .map(({ workflowId }) => workflowId);
  }
}
