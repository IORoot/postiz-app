import { NotFoundException } from '@nestjs/common';

// the controller imports most of the app, none of which this route uses
function stub(...names: string[]) {
  return () => Object.fromEntries(names.map((name) => [name, class {}]));
}
jest.mock('@gitroom/nestjs-libraries/upload/multer.stream.engine', () => ({
  streamUploadOptions: () => ({}),
}));
jest.mock('@gitroom/backend/services/auth/permissions/permissions.ability', () => ({
  CheckPolicies: () => () => undefined,
}));
jest.mock(
  '@gitroom/backend/services/auth/permissions/permission.exception.class',
  () => ({ AuthorizationActions: {}, Sections: {} })
);
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({ ioRedis: {} }));
jest.mock('@gitroom/nestjs-libraries/chat/validation.schemas.helper', () => ({}));
jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
  socialIntegrationList: [],
}));
jest.mock('@gitroom/nestjs-libraries/integrations/social.abstract', () => ({
  RefreshToken: class {},
}));
jest.mock('@gitroom/backend/api/routes/posts.validation.exception', () => ({
  PostValidationException: class {},
}));
jest.mock('@sentry/nestjs', () => ({ metrics: { count: jest.fn() } }));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  stub('PostsService')
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  stub('IntegrationService')
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  stub('MediaService')
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  stub('NotificationService')
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/clipping/clipping.service',
  stub('ClippingService')
);
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  stub('RefreshIntegrationService')
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/users/users.service',
  stub('UsersService')
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/admin-stats/admin-stats.service',
  stub('AdminStatsService')
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  stub('OrganizationService')
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  stub('SubscriptionService')
);
jest.mock(
  '@gitroom/backend/services/auth/super.admin.guard',
  stub('SuperAdminGuard')
);

import { PublicIntegrationsController } from './public.integrations.controller';

const org = { id: 'org-1' } as any;

const setup = (posts: any[]) => {
  const postsService = {
    getMainPostsByGroup: jest.fn().mockResolvedValue(posts),
  };
  const controller = new PublicIntegrationsController(
    undefined as any,
    postsService as any,
    ...(Array(8).fill(undefined) as [any, any, any, any, any, any, any, any])
  );
  return { controller, postsService };
};

describe('GET /public/v1/posts/group/:group', () => {
  it('returns the main posts of the org group', async () => {
    const posts = [
      {
        id: 'p1',
        state: 'QUEUE',
        publishDate: new Date('2026-01-01T10:00:00Z'),
        integration: { id: 'ch-1', providerIdentifier: 'youtube', name: 'LP' },
        image: [{ id: 'm1', path: 'a.mp4' }],
      },
    ];
    const { controller, postsService } = setup(posts);
    await expect(controller.getPostsByGroup(org, 'g1')).resolves.toEqual({
      posts,
    });
    expect(postsService.getMainPostsByGroup).toHaveBeenCalledWith('org-1', 'g1');
  });

  it('returns 404 when the group has no posts left', async () => {
    const { controller } = setup([]);
    await expect(controller.getPostsByGroup(org, 'unknown')).rejects.toThrow(
      NotFoundException
    );
  });
});
