import { PipelineManager } from './pipeline.manager';

// the pipeline repository imports Prisma enums Jest can't resolve without a client build
jest.mock('./pipeline.repository', () => ({
  PipelineRepository: class {},
  isActivePipelineIntegration: () => true,
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  () => ({ PostsService: class {} })
);

const body = {
  pipelineId: 'pipe-1',
  post: {
    posts: [{ integration: { id: 'ch-1' } }, { integration: { id: 'ch-2' } }],
  },
} as any;

const setup = () => {
  const repository = {
    getPipeline: jest.fn().mockResolvedValue({
      id: 'pipe-1',
      integrations: [
        { integrationId: 'ch-1', integration: {} },
        { integrationId: 'ch-2', integration: {} },
      ],
    }),
    getQueueItemByIdempotencyKey: jest.fn().mockResolvedValue(null),
    publishQueueItem: jest.fn().mockResolvedValue({ id: 'item-1' }),
    discardUnlinkedDraftPosts: jest.fn().mockResolvedValue(undefined),
  };
  const posts = {
    validatePosts: jest.fn().mockResolvedValue([]),
    mapTypeToPost: jest.fn().mockImplementation(async (b) => b),
    createPost: jest.fn().mockResolvedValue([
      { postId: 'post-1', integration: 'ch-1' },
      { postId: 'post-2', integration: 'ch-2' },
    ]),
    getMainPostsByGroup: jest.fn().mockResolvedValue([
      { id: 'post-1', integration: { id: 'ch-1' } },
      { id: 'post-2', integration: { id: 'ch-2' } },
    ]),
  };
  return {
    repository,
    posts,
    manager: new PipelineManager(repository as any, posts as any),
  };
};

describe('PipelineManager.enqueue', () => {
  it('returns one post per channel next to the id and group', async () => {
    const { manager } = setup();
    const result = await manager.enqueue('org-1', body);
    expect(result).toEqual({
      id: 'item-1',
      group: expect.any(String),
      posts: [
        { id: 'post-1', integration: 'ch-1' },
        { id: 'post-2', integration: 'ch-2' },
      ],
    });
  });

  it('returns the same posts on an idempotent repeat without creating again', async () => {
    const { manager, repository, posts } = setup();
    repository.getQueueItemByIdempotencyKey.mockResolvedValue({
      id: 'item-1',
      group: 'group-1',
    });
    const result = await manager.enqueue('org-1', body, 'API', 'key');
    expect(result).toEqual({
      id: 'item-1',
      group: 'group-1',
      posts: [
        { id: 'post-1', integration: 'ch-1' },
        { id: 'post-2', integration: 'ch-2' },
      ],
    });
    expect(posts.getMainPostsByGroup).toHaveBeenCalledWith('org-1', 'group-1');
    expect(posts.createPost).not.toHaveBeenCalled();
  });

  it('returns the existing item with its posts after a duplicate key race', async () => {
    const { manager, repository, posts } = setup();
    repository.getQueueItemByIdempotencyKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'item-1', group: 'group-1' });
    repository.publishQueueItem.mockRejectedValue({ code: 'P2002' });
    const result = await manager.enqueue('org-1', body, 'API', 'key');
    expect(result.id).toBe('item-1');
    expect(result.group).toBe('group-1');
    expect((result as any).posts).toHaveLength(2);
    expect(posts.getMainPostsByGroup).toHaveBeenCalledWith('org-1', 'group-1');
  });
});
