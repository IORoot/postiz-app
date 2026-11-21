import { toPublicQueueItem } from './public.queue.read';

const youtube = {
  integrationId: 'youtube-1',
  integrationName: 'London Parkour',
  identifier: 'youtube',
};

describe('toPublicQueueItem', () => {
  it('uses the projected slot for a queued draft and ignores the post publishDate', () => {
    const item = toPublicQueueItem({
      id: 'item-1',
      group: 'group-1',
      status: 'QUEUED',
      projectedFor: new Date('2026-11-23T18:00:00.000Z'),
      posts: [
        {
          id: 'post-1',
          state: 'DRAFT',
          publishDate: new Date('2026-11-21T15:04:00.000Z'),
          integrationId: youtube.integrationId,
          integrationName: youtube.integrationName,
          identifier: youtube.identifier,
        },
      ],
    });

    expect(item.status).toBe('draft');
    expect(item.scheduledFor).toBe('2026-11-23T18:00:00.000Z');
    expect(item.channels[0].scheduledFor).toBe('2026-11-21T15:04:00.000Z');
    expect(item.channels[0].state).toBe('draft');
  });

  it('returns a null item time when a queued draft has no projection', () => {
    const item = toPublicQueueItem({
      id: 'item-1',
      group: 'group-1',
      status: 'QUEUED',
      posts: [
        {
          id: 'post-1',
          state: 'DRAFT',
          publishDate: new Date('2026-11-21T15:04:00.000Z'),
          integrationId: youtube.integrationId,
          integrationName: youtube.integrationName,
          identifier: youtube.identifier,
        },
      ],
    });

    expect(item.status).toBe('draft');
    expect(item.scheduledFor).toBeNull();
  });

  it('reports a publishing item as scheduled at the post time', () => {
    const item = toPublicQueueItem({
      id: 'item-1',
      group: 'group-1',
      status: 'PUBLISHING',
      posts: [
        {
          id: 'post-1',
          state: 'QUEUE',
          publishDate: new Date('2026-11-23T18:00:00.000Z'),
          integrationId: youtube.integrationId,
          integrationName: youtube.integrationName,
          identifier: youtube.identifier,
        },
      ],
    });

    expect(item.status).toBe('scheduled');
    expect(item.scheduledFor).toBe('2026-11-23T18:00:00.000Z');
    expect(item.channels[0].state).toBe('scheduled');
  });

  it('reports a published item as published', () => {
    const item = toPublicQueueItem({
      id: 'item-1',
      group: 'group-1',
      status: 'PUBLISHED',
      posts: [
        {
          id: 'post-1',
          state: 'PUBLISHED',
          publishDate: new Date('2026-11-23T18:00:00.000Z'),
          integrationId: youtube.integrationId,
          integrationName: youtube.integrationName,
          identifier: youtube.identifier,
        },
      ],
    });

    expect(item.status).toBe('published');
    expect(item.scheduledFor).toBe('2026-11-23T18:00:00.000Z');
  });

  it('reports error when one channel failed and keeps both channel states', () => {
    const item = toPublicQueueItem({
      id: 'item-1',
      group: 'group-1',
      status: 'FAILED',
      error: 'One or more Pipeline channel posts did not publish',
      posts: [
        {
          id: 'post-1',
          state: 'PUBLISHED',
          publishDate: new Date('2026-11-23T18:00:00.000Z'),
          integrationId: youtube.integrationId,
          integrationName: youtube.integrationName,
          identifier: youtube.identifier,
        },
        {
          id: 'post-2',
          state: 'ERROR',
          publishDate: new Date('2026-11-23T18:00:00.000Z'),
          error: 'Instagram rejected the video',
          integrationId: 'instagram-1',
          integrationName: 'London Parkour IG',
          identifier: 'instagram',
        },
      ],
    });

    expect(item.status).toBe('error');
    expect(item.error).toBe(
      'One or more Pipeline channel posts did not publish'
    );
    expect(item.channels.map((channel) => channel.state)).toEqual([
      'published',
      'error',
    ]);
    expect(item.channels[1].error).toBe('Instagram rejected the video');
  });

  it('reads a removed item with queued posts as scheduled', () => {
    const item = toPublicQueueItem({
      id: 'item-1',
      group: 'group-1',
      status: 'REMOVED',
      posts: [
        {
          id: 'post-1',
          state: 'QUEUE',
          publishDate: new Date('2026-11-23T19:30:00.000Z'),
          integrationId: youtube.integrationId,
          integrationName: youtube.integrationName,
          identifier: youtube.identifier,
        },
      ],
    });

    expect(item.status).toBe('scheduled');
    expect(item.scheduledFor).toBe('2026-11-23T19:30:00.000Z');
  });

  it('reads a removed item whose posts are published as published', () => {
    const item = toPublicQueueItem({
      id: 'item-1',
      group: 'group-1',
      status: 'REMOVED',
      posts: [
        {
          id: 'post-1',
          state: 'PUBLISHED',
          publishDate: new Date('2026-11-23T19:30:00.000Z'),
          integrationId: youtube.integrationId,
          integrationName: youtube.integrationName,
          identifier: youtube.identifier,
        },
      ],
    });

    expect(item.status).toBe('published');
  });

  it('uses the earliest channel time when the item is no longer a draft', () => {
    const item = toPublicQueueItem({
      id: 'item-1',
      group: 'group-1',
      status: 'PUBLISHING',
      posts: [
        {
          id: 'post-2',
          state: 'QUEUE',
          publishDate: new Date('2026-11-23T19:00:00.000Z'),
          integrationId: 'instagram-1',
          integrationName: 'London Parkour IG',
          identifier: 'instagram',
        },
        {
          id: 'post-1',
          state: 'QUEUE',
          publishDate: new Date('2026-11-23T18:00:00.000Z'),
          integrationId: youtube.integrationId,
          integrationName: youtube.integrationName,
          identifier: youtube.identifier,
        },
      ],
    });

    expect(item.scheduledFor).toBe('2026-11-23T18:00:00.000Z');
    expect(item.channels.map((channel) => channel.postId)).toEqual([
      'post-2',
      'post-1',
    ]);
  });

  it('returns only the public keys', () => {
    const item = toPublicQueueItem({
      id: 'item-1',
      group: 'group-1',
      status: 'QUEUED',
      posts: [
        {
          id: 'post-1',
          state: 'DRAFT',
          integrationId: youtube.integrationId,
          integrationName: youtube.integrationName,
          identifier: youtube.identifier,
        },
      ],
    });

    expect(Object.keys(item)).toEqual([
      'id',
      'group',
      'status',
      'scheduledFor',
      'error',
      'channels',
    ]);
    expect(Object.keys(item.channels[0])).toEqual([
      'postId',
      'integrationId',
      'name',
      'identifier',
      'state',
      'scheduledFor',
      'error',
    ]);
  });
});
