import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { chunk } from 'lodash';
import {
  PrismaRepository,
  PrismaTransaction,
} from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { PIPELINE_SCHEDULER_GRACE_WINDOW_MS } from '@gitroom/nestjs-libraries/database/prisma/pipelines/pipeline.schedule';
import { CleanupResult } from '@gitroom/nestjs-libraries/dtos/cleanup/cleanup.dto';

// A slot claimed more recently than this may still be running
export const STUCK_CLAIM_MS = 30 * 60 * 1000;

// Every query below is scoped to one organization
@Injectable()
export class CleanupRepository {
  constructor(
    private _repository: PrismaRepository<
      | 'post'
      | 'pipelineQueueItem'
      | 'pipelineSlotExecution'
      | 'media'
      | 'tagsPosts'
      | 'comments'
      | 'errors'
      | 'payoutProblems'
      | 'integration'
      | 'clippingClip'
    >,
    private _transaction: PrismaTransaction
  ) {}

  private get db() {
    return this._repository.model;
  }

  private transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    return (this._transaction.model as any).$transaction(callback, {
      timeout: 5 * 60 * 1000,
      maxWait: 30 * 1000,
    });
  }

  // posts hidden from the app that nothing visible hangs off
  private removedPostWhere(org: string): Prisma.PostWhereInput {
    return {
      organizationId: org,
      deletedAt: { not: null },
      childrenPost: { none: { deletedAt: null } },
    };
  }

  private queueItemWhere(
    org: string,
    removedOnly: boolean
  ): Prisma.PipelineQueueItemWhereInput {
    return {
      pipeline: { organizationId: org },
      ...(removedOnly ? { status: 'REMOVED' } : {}),
    };
  }

  // An item whose slot claimed it recently may still be publishing, so it is
  // never deleted from under the running workflow
  private deletableQueueItemWhere(
    org: string,
    removedOnly: boolean
  ): Prisma.PipelineQueueItemWhereInput {
    return {
      ...this.queueItemWhere(org, removedOnly),
      NOT: {
        status: 'PUBLISHING',
        claimedAt: { gte: new Date(Date.now() - STUCK_CLAIM_MS) },
      },
    };
  }

  private executionWhere(org: string): Prisma.PipelineSlotExecutionWhereInput {
    // a running slot, or one inside the scheduler's grace window, is left
    // alone so the scheduler can't claim the same slot twice
    return {
      pipeline: { organizationId: org },
      status: { not: 'CLAIMED' },
      scheduledFor: {
        lt: new Date(Date.now() - PIPELINE_SCHEDULER_GRACE_WINDOW_MS),
      },
    };
  }

  private mediaWhere(
    org: string,
    removedOnly: boolean
  ): Prisma.MediaWhereInput {
    return {
      organizationId: org,
      ...(removedOnly ? { deletedAt: { not: null } } : {}),
    };
  }

  // What hangs off a post and can't outlive it. Payout problems are records
  // of money, so they are detached instead of deleted.
  private async deletePosts(
    tx: any,
    where: Prisma.PostWhereInput
  ): Promise<CleanupResult> {
    // a thread child that stays must not keep pointing at a deleted parent
    await tx.post.updateMany({
      where: { parentPost: where, NOT: where },
      data: { parentPostId: null },
    });
    await tx.tagsPosts.deleteMany({ where: { post: where } });
    await tx.comments.deleteMany({ where: { post: where } });
    const errors = await tx.errors.deleteMany({ where: { post: where } });
    await tx.payoutProblems.updateMany({
      where: { post: where },
      data: { postId: null },
    });
    const posts = await tx.post.deleteMany({ where });
    return { posts: posts.count, errorLogs: errors.count };
  }

  async getSummary(org: string) {
    const [live, removed, queueItems, executions, mediaLive, mediaRemoved] =
      await Promise.all([
        this.db.post.count({
          where: { organizationId: org, deletedAt: null },
        }),
        this.db.post.count({
          where: { organizationId: org, deletedAt: { not: null } },
        }),
        this.db.pipelineQueueItem.groupBy({
          by: ['status'],
          where: this.queueItemWhere(org, false),
          _count: true,
        }),
        this.db.pipelineSlotExecution.count({
          where: { pipeline: { organizationId: org } },
        }),
        this.db.media.count({
          where: { organizationId: org, deletedAt: null },
        }),
        this.db.media.count({
          where: { organizationId: org, deletedAt: { not: null } },
        }),
      ]);
    return {
      posts: { live, removed },
      queueItems: Object.fromEntries(
        queueItems.map((item) => [item.status, item._count])
      ),
      slotExecutions: executions,
      media: { live: mediaLive, removed: mediaRemoved },
    };
  }

  // ---- posts ----

  countLivePosts(org: string) {
    return this.db.post.count({
      where: { organizationId: org, deletedAt: null },
    });
  }

  async getLivePostIds(org: string) {
    const posts = await this.db.post.findMany({
      where: { organizationId: org, deletedAt: null },
      select: { id: true },
    });
    return posts.map((post) => post.id);
  }

  // Hides the live posts the way the calendar does, and takes their queue
  // items out of the pipeline so a slot can't claim a deleted post
  softDeletePosts(org: string): Promise<CleanupResult> {
    return this.transaction(async (tx) => {
      const now = new Date();
      const posts = await tx.post.updateMany({
        where: { organizationId: org, deletedAt: null },
        data: { deletedAt: now },
      });
      const items = await tx.pipelineQueueItem.updateMany({
        where: {
          ...this.queueItemWhere(org, false),
          status: { in: ['QUEUED', 'FAILED'] },
          deletedAt: null,
        },
        data: { status: 'REMOVED', deletedAt: now },
      });
      return { posts: posts.count, queueItemsRemoved: items.count };
    });
  }

  countRemovedPosts(org: string) {
    return this.db.post.count({ where: this.removedPostWhere(org) });
  }

  purgeRemovedPosts(org: string): Promise<CleanupResult> {
    return this.transaction((tx) =>
      this.deletePosts(tx, this.removedPostWhere(org))
    );
  }

  // ---- pipeline queue items ----

  async countQueueItems(org: string, removedOnly: boolean) {
    const where = this.deletableQueueItemWhere(org, removedOnly);
    const [queueItems, posts, executions] = await Promise.all([
      this.db.pipelineQueueItem.count({ where }),
      this.db.post.count({ where: { pipelineQueueItem: where } }),
      this.db.pipelineSlotExecution.count({
        where: { pipelineQueueItem: where },
      }),
    ]);
    return { queueItems, posts, slotExecutions: executions };
  }

  async getQueueItemPostIds(org: string, removedOnly: boolean) {
    const posts = await this.db.post.findMany({
      where: {
        pipelineQueueItem: this.deletableQueueItemWhere(org, removedOnly),
        deletedAt: null,
      },
      select: { id: true },
    });
    return posts.map((post) => post.id);
  }

  // The posts and slot executions of an item go with it
  deleteQueueItems(org: string, removedOnly: boolean): Promise<CleanupResult> {
    const where = this.deletableQueueItemWhere(org, removedOnly);
    return this.transaction(async (tx) => {
      // a very recent slot keeps its row, detached from the item, so the
      // scheduler can't claim the same slot a second time
      await tx.pipelineSlotExecution.updateMany({
        where: {
          pipelineQueueItem: where,
          scheduledFor: {
            gte: new Date(Date.now() - PIPELINE_SCHEDULER_GRACE_WINDOW_MS),
          },
        },
        data: { pipelineQueueItemId: null },
      });
      const executions = await tx.pipelineSlotExecution.deleteMany({
        where: { pipelineQueueItem: where },
      });
      const posts = await this.deletePosts(tx, { pipelineQueueItem: where });
      const items = await tx.pipelineQueueItem.deleteMany({ where });
      return {
        queueItems: items.count,
        posts: posts.posts,
        errorLogs: posts.errorLogs,
        slotExecutions: executions.count,
      };
    });
  }

  // ---- slot executions ----

  countSlotExecutions(org: string) {
    return this.db.pipelineSlotExecution.count({
      where: this.executionWhere(org),
    });
  }

  async deleteSlotExecutions(org: string): Promise<CleanupResult> {
    const executions = await this.db.pipelineSlotExecution.deleteMany({
      where: this.executionWhere(org),
    });
    return { slotExecutions: executions.count };
  }

  // ---- media ----

  countMedia(org: string, removedOnly: boolean) {
    return this.db.media.count({ where: this.mediaWhere(org, removedOnly) });
  }

  // Live posts with attachments: a warning that deleting the media may leave
  // them without their pictures
  countPostsWithAttachments(org: string) {
    return this.db.post.count({
      where: { organizationId: org, deletedAt: null, image: { not: null } },
    });
  }

  softDeleteMedia(org: string): Promise<CleanupResult> {
    return this.db.media
      .updateMany({
        where: this.mediaWhere(org, false),
        data: { deletedAt: new Date() },
      })
      .then((media) => ({ media: media.count }));
  }

  // Deletes the rows and returns the files they pointed at, so the caller can
  // remove them from storage afterwards
  purgeMedia(
    org: string,
    removedOnly: boolean
  ): Promise<{ count: number; files: string[] }> {
    const where = this.mediaWhere(org, removedOnly);
    return this.transaction(async (tx) => {
      const media = await tx.media.findMany({
        where,
        select: { id: true, path: true, thumbnail: true },
      });
      let count = 0;
      // by the captured ids, so the rows deleted are exactly the files listed
      for (const ids of chunk(
        media.map((item: any) => item.id),
        5000
      )) {
        // profile pictures, agency logos, app pictures and clips point at media
        await tx.user.updateMany({
          where: { pictureId: { in: ids } },
          data: { pictureId: null },
        });
        await tx.socialMediaAgency.updateMany({
          where: { logoId: { in: ids } },
          data: { logoId: null },
        });
        await tx.oAuthApp.updateMany({
          where: { pictureId: { in: ids } },
          data: { pictureId: null },
        });
        await tx.clippingClip.updateMany({
          where: { mediaId: { in: ids } },
          data: { mediaId: null },
        });
        count += (await tx.media.deleteMany({ where: { id: { in: ids } } }))
          .count;
      }
      return {
        count,
        files: media.flatMap((item: any) =>
          [item.path, item.thumbnail].filter((file): file is string => !!file)
        ),
      };
    });
  }

  // ---- stuck pipeline items ----

  private stuckItemWhere(
    org: string,
    cutoff: Date
  ): Prisma.PipelineQueueItemWhereInput {
    return {
      ...this.queueItemWhere(org, false),
      status: 'PUBLISHING',
      claimedAt: { lt: cutoff },
    };
  }

  countStuckItems(org: string, cutoff: Date) {
    return this.db.pipelineQueueItem.count({
      where: this.stuckItemWhere(org, cutoff),
    });
  }

  async getStuckItemPostIds(org: string, cutoff: Date) {
    const posts = await this.db.post.findMany({
      where: {
        pipelineQueueItem: this.stuckItemWhere(org, cutoff),
        deletedAt: null,
      },
      select: { id: true },
    });
    return posts.map((post) => post.id);
  }

  // A slot that never finalized leaves its item PUBLISHING and its execution
  // CLAIMED. An item whose posts never published goes back in the queue; one
  // that already published (fully or partly) is closed instead, since
  // queueing it again would publish twice.
  releaseStuckItems(org: string, cutoff: Date): Promise<CleanupResult> {
    return this.transaction(async (tx) => {
      const now = new Date();
      const items = await tx.pipelineQueueItem.findMany({
        where: this.stuckItemWhere(org, cutoff),
        select: {
          id: true,
          posts: {
            where: { deletedAt: null, parentPostId: null },
            select: { state: true },
          },
        },
      });
      const result = { requeued: 0, published: 0, failed: 0, executions: 0 };
      for (const item of items) {
        const states = item.posts.map((post: any) => post.state);
        const published = states.filter((state: string) => state === 'PUBLISHED');
        if (states.length && !published.length) {
          await tx.post.updateMany({
            where: { pipelineQueueItemId: item.id, deletedAt: null },
            data: { state: 'DRAFT', error: null },
          });
          await tx.pipelineQueueItem.update({
            where: { id: item.id },
            data: { status: 'QUEUED', claimedAt: null, error: null },
          });
          result.requeued++;
        } else if (states.length && published.length === states.length) {
          await tx.pipelineQueueItem.update({
            where: { id: item.id },
            data: { status: 'PUBLISHED', publishedAt: now, error: null },
          });
          result.published++;
        } else {
          await tx.pipelineQueueItem.update({
            where: { id: item.id },
            data: {
              status: 'FAILED',
              failedAt: now,
              error: states.length
                ? 'Some posts published before the slot stopped'
                : 'The posts were removed before the slot finished',
            },
          });
          result.failed++;
        }
      }
      const executions = await tx.pipelineSlotExecution.updateMany({
        where: {
          pipeline: { organizationId: org },
          status: 'CLAIMED',
          claimedAt: { lt: cutoff },
        },
        data: {
          status: 'FAILED',
          failedAt: now,
          error: 'Released from Settings > Clean up',
        },
      });
      result.executions = executions.count;
      return result;
    });
  }

  // ---- stale workflows ----

  async getLivePostIdsAmong(org: string, ids: string[]) {
    const found = new Set<string>();
    for (const batch of chunk(ids, 5000)) {
      const posts = await this.db.post.findMany({
        where: { organizationId: org, deletedAt: null, id: { in: batch } },
        select: { id: true },
      });
      posts.forEach((post) => found.add(post.id));
    }
    return found;
  }

  // ---- orphan files ----

  // Everything that can point at an uploaded file, across organizations, since
  // they share one upload directory. Soft-deleted posts count too: deleting
  // all posts is meant to be reversible.
  async getFileReferences(): Promise<string> {
    const [media, posts, integrations, clips] = await Promise.all([
      this.db.media.findMany({ select: { path: true, thumbnail: true } }),
      this.db.post.findMany({
        where: { image: { not: null } },
        select: { image: true },
      }),
      this.db.integration.findMany({ select: { picture: true } }),
      this.db.clippingClip.findMany({
        select: { path: true, thumbnail: true },
      }),
    ]);
    return [
      ...media.flatMap((item) => [item.path, item.thumbnail]),
      ...posts.map((post) => post.image),
      ...integrations.map((integration) => integration.picture),
      ...clips.flatMap((clip) => [clip.path, clip.thumbnail]),
    ]
      .filter(Boolean)
      .join('\n');
  }
}
