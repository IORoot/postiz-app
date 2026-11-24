import { CleanupService } from './cleanup.service';
import { CleanupAction } from '@gitroom/nestjs-libraries/dtos/cleanup/cleanup.dto';

// the real factory pulls in an ESM-only dependency Jest can't load
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));

const ORG = 'org-1';

const makeService = (repository: Record<string, jest.Mock>) => {
  const terminate = jest.fn().mockResolvedValue(undefined);
  const temporal = {
    client: {
      getRawClient: () => ({
        workflow: {
          list: () =>
            (async function* () {
              yield { workflowId: 'post_p1' };
            })(),
        },
      }),
      getWorkflowHandle: jest.fn().mockResolvedValue({ terminate }),
    },
  };
  const service = new CleanupService(repository as any, temporal as any);
  const removeFile = jest.fn().mockResolvedValue(undefined);
  (service as any).storage = { removeFile };
  return { service, terminate, removeFile, temporal };
};

describe('CleanupService', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('previews the same counts the repository would act on', async () => {
    const { service } = makeService({
      countRemovedPosts: jest.fn().mockResolvedValue(659),
    });

    await expect(
      service.preview(ORG, CleanupAction.POSTS_PURGE_REMOVED)
    ).resolves.toEqual({ posts: 659 });
  });

  it('hides the posts first, then stops their workflows', async () => {
    const order: string[] = [];
    const { service, terminate } = makeService({
      getLivePostIds: jest.fn().mockResolvedValue(['p1']),
      softDeletePosts: jest.fn().mockImplementation(async () => {
        order.push('delete');
        return { posts: 1 };
      }),
    });
    terminate.mockImplementation(async () => {
      order.push('terminate');
    });

    await expect(
      service.run(ORG, CleanupAction.POSTS_SOFT_DELETE)
    ).resolves.toEqual({ posts: 1 });
    expect(order).toEqual(['delete', 'terminate']);
  });

  it('still deletes when a workflow cannot be terminated', async () => {
    const softDeletePosts = jest.fn().mockResolvedValue({ posts: 1 });
    const { service, terminate } = makeService({
      getLivePostIds: jest.fn().mockResolvedValue(['p1']),
      softDeletePosts,
    });
    terminate.mockRejectedValue(new Error('not found'));

    await expect(
      service.run(ORG, CleanupAction.POSTS_SOFT_DELETE)
    ).resolves.toEqual({ posts: 1 });
    expect(softDeletePosts).toHaveBeenCalledWith(ORG);
  });

  it('removes the files of purged media and counts the ones that fail', async () => {
    const { service, removeFile } = makeService({
      purgeMedia: jest.fn().mockResolvedValue({
        count: 2,
        files: ['/uploads/a.mp4', '/uploads/b.mp4'],
      }),
    });
    removeFile.mockRejectedValueOnce(new Error('gone'));

    await expect(
      service.run(ORG, CleanupAction.MEDIA_DELETE_ALL)
    ).resolves.toEqual({ media: 2, filesRemoved: 1, filesFailed: 1 });
  });

  it('only removes files nothing refers to and that are not brand new', async () => {
    const old = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { service, removeFile } = makeService({
      getFileReferences: jest
        .fn()
        .mockResolvedValue('https://x/uploads/2026/10/08/used.mp4'),
    });
    (service as any).storage.listFiles = jest.fn().mockResolvedValue([
      {
        path: '/uploads/2026/10/08/used.mp4',
        relativePath: '/2026/10/08/used.mp4',
        size: 1,
        modifiedAt: old,
      },
      {
        path: '/uploads/2026/10/08/orphan.mp4',
        relativePath: '/2026/10/08/orphan.mp4',
        size: 1,
        modifiedAt: old,
      },
      {
        path: '/uploads/2026/11/24/new.mp4',
        relativePath: '/2026/11/24/new.mp4',
        size: 1,
        modifiedAt: new Date(),
      },
    ]);

    await expect(
      service.run(ORG, CleanupAction.ORPHAN_FILES_DELETE)
    ).resolves.toEqual({ filesRemoved: 1, filesFailed: 0 });
    expect(removeFile).toHaveBeenCalledWith('/uploads/2026/10/08/orphan.mp4');
  });

  it('only stops workflows whose post is gone', async () => {
    const { service, terminate } = makeService({
      getLivePostIdsAmong: jest.fn().mockResolvedValue(new Set()),
    });

    await expect(
      service.run(ORG, CleanupAction.STALE_WORKFLOWS_TERMINATE)
    ).resolves.toEqual({ workflows: 1 });
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});
