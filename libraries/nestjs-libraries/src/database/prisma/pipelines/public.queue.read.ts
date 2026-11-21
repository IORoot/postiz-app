export type PublicQueueChannelState =
  | 'draft'
  | 'scheduled'
  | 'published'
  | 'error';

export interface PublicQueuePostSource {
  id: string;
  state: 'DRAFT' | 'QUEUE' | 'PUBLISHED' | 'ERROR';
  publishDate?: Date | null;
  error?: string | null;
  integrationId: string;
  integrationName: string;
  identifier: string;
}

export interface PublicQueueItemSource {
  id: string;
  group: string;
  status:
    | 'CREATING'
    | 'QUEUED'
    | 'PUBLISHING'
    | 'PUBLISHED'
    | 'FAILED'
    | 'REMOVED';
  error?: string | null;
  projectedFor?: Date;
  posts: PublicQueuePostSource[];
}

export interface PublicQueueChannel {
  postId: string;
  integrationId: string;
  name: string;
  identifier: string;
  state: PublicQueueChannelState;
  scheduledFor: string | null;
  error: string | null;
}

export interface PublicQueueItem {
  id: string;
  group: string;
  status: PublicQueueChannelState;
  scheduledFor: string | null;
  error: string | null;
  channels: PublicQueueChannel[];
}

const channelState: Record<
  PublicQueuePostSource['state'],
  PublicQueueChannelState
> = {
  DRAFT: 'draft',
  QUEUE: 'scheduled',
  PUBLISHED: 'published',
  ERROR: 'error',
};

export function toPublicQueueItem(
  source: PublicQueueItemSource
): PublicQueueItem {
  const channels = source.posts.map((post) => ({
    postId: post.id,
    integrationId: post.integrationId,
    name: post.integrationName,
    identifier: post.identifier,
    state: channelState[post.state],
    scheduledFor: post.publishDate ? post.publishDate.toISOString() : null,
    error: post.error ?? null,
  }));
  const status = itemStatus(source.status, channels);

  return {
    id: source.id,
    group: source.group,
    status,
    scheduledFor:
      status === 'draft'
        ? source.projectedFor
          ? source.projectedFor.toISOString()
          : null
        : earliest(channels),
    error: source.error ?? null,
    channels,
  };
}

function itemStatus(
  queueStatus: PublicQueueItemSource['status'],
  channels: PublicQueueChannel[]
): PublicQueueChannelState {
  if (queueStatus === 'FAILED' || channels.some((channel) => channel.state === 'error')) {
    return 'error';
  }
  if (
    queueStatus === 'PUBLISHED' ||
    (channels.length > 0 &&
      channels.every((channel) => channel.state === 'published'))
  ) {
    return 'published';
  }
  if (
    queueStatus === 'PUBLISHING' ||
    channels.some((channel) => channel.state === 'scheduled')
  ) {
    return 'scheduled';
  }
  return 'draft';
}

function earliest(channels: PublicQueueChannel[]): string | null {
  const times = channels.flatMap((channel) =>
    channel.scheduledFor ? [channel.scheduledFor] : []
  );
  if (!times.length) {
    return null;
  }
  return times.sort()[0];
}
