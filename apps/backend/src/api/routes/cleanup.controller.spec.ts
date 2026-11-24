import { ForbiddenException } from '@nestjs/common';
import { CleanupController } from './cleanup.controller';
import { CleanupAction } from '@gitroom/nestjs-libraries/dtos/cleanup/cleanup.dto';

// the real factory pulls in an ESM-only dependency Jest can't load
jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: () => ({}) },
}));

const orgWithRole = (role: string) => ({ id: 'org-1', users: [{ role }] } as any);

describe('CleanupController', () => {
  const service = {
    getSummary: jest
      .fn()
      .mockResolvedValue({ canScanFiles: true, diskBytes: 10 }),
    preview: jest.fn().mockResolvedValue({ posts: 1 }),
    run: jest.fn().mockResolvedValue({ posts: 1 }),
  };
  const controller = new CleanupController(service as any);

  it('rejects a plain member', () => {
    expect(() => controller.getSummary(orgWithRole('USER'))).rejects.toThrow(
      ForbiddenException
    );
    expect(() =>
      controller.run(orgWithRole('USER'), {
        action: CleanupAction.POSTS_SOFT_DELETE,
      })
    ).toThrow(ForbiddenException);
    expect(service.run).not.toHaveBeenCalled();
  });

  it('lets an admin run an action', async () => {
    await expect(
      controller.run(orgWithRole('ADMIN'), {
        action: CleanupAction.POSTS_SOFT_DELETE,
      })
    ).resolves.toEqual({ posts: 1 });
  });

  it('keeps the orphan file scan and install-wide figures for the superadmin', async () => {
    expect(() =>
      controller.run(orgWithRole('ADMIN'), {
        action: CleanupAction.ORPHAN_FILES_DELETE,
      })
    ).toThrow(ForbiddenException);
    await expect(controller.getSummary(orgWithRole('ADMIN'))).resolves.toEqual({
      canScanFiles: false,
      diskBytes: null,
    });
    await expect(
      controller.getSummary(orgWithRole('SUPERADMIN'))
    ).resolves.toEqual({ canScanFiles: true, diskBytes: 10 });
  });
});
