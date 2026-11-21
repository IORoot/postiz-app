import { toPublicPipelines } from './public.pipeline.list';

describe('toPublicPipelines', () => {
  it('turns a Date next slot into an ISO string', () => {
    const [pipeline] = toPublicPipelines([
      {
        id: 'pipe-1',
        name: 'Weekly',
        timezone: 'Europe/London',
        active: true,
        nextSlot: new Date('2026-11-23T18:00:00.000Z'),
        channels: [],
      },
    ]);

    expect(pipeline.nextSlot).toBe('2026-11-23T18:00:00.000Z');
  });

  it('turns a missing next slot into null', () => {
    const [pipeline] = toPublicPipelines([
      {
        id: 'pipe-1',
        name: 'Weekly',
        timezone: 'Europe/London',
        active: true,
        channels: [],
      },
    ]);

    expect(pipeline.nextSlot).toBeNull();
  });

  it('keeps an inactive pipeline and returns null when it has no next slot', () => {
    const [pipeline] = toPublicPipelines([
      {
        id: 'pipe-1',
        name: 'Weekly',
        timezone: 'Europe/London',
        active: false,
        channels: [],
      },
    ]);

    expect(pipeline.active).toBe(false);
    expect(pipeline.nextSlot).toBeNull();
  });

  it('drops disabled and deleted channels and keeps a usable one', () => {
    const [pipeline] = toPublicPipelines([
      {
        id: 'pipe-1',
        name: 'Weekly',
        timezone: 'Europe/London',
        active: true,
        channels: [
          {
            id: 'disabled',
            name: 'Off',
            identifier: 'x',
            disabled: true,
            deletedAt: null,
            linkCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
          {
            id: 'deleted',
            name: 'Gone',
            identifier: 'linkedin',
            disabled: false,
            deletedAt: new Date('2026-02-01T00:00:00.000Z'),
            linkCreatedAt: new Date('2026-01-02T00:00:00.000Z'),
          },
          {
            id: 'youtube-1',
            name: 'London Parkour',
            identifier: 'youtube',
            disabled: false,
            deletedAt: null,
            linkCreatedAt: new Date('2026-01-03T00:00:00.000Z'),
          },
        ],
      },
    ]);

    expect(pipeline.channels).toEqual([
      { id: 'youtube-1', name: 'London Parkour', identifier: 'youtube' },
    ]);
  });

  it('returns an empty channel list when every channel is excluded', () => {
    const [pipeline] = toPublicPipelines([
      {
        id: 'pipe-1',
        name: 'Weekly',
        timezone: 'Europe/London',
        active: true,
        channels: [
          {
            id: 'disabled',
            name: 'Off',
            identifier: 'x',
            disabled: true,
            deletedAt: null,
            linkCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      },
    ]);

    expect(pipeline.channels).toEqual([]);
  });

  it('sorts usable channels by link createdAt ascending', () => {
    const [pipeline] = toPublicPipelines([
      {
        id: 'pipe-1',
        name: 'Weekly',
        timezone: 'Europe/London',
        active: true,
        channels: [
          {
            id: 'later',
            name: 'Later',
            identifier: 'youtube',
            disabled: false,
            deletedAt: null,
            linkCreatedAt: new Date('2026-03-01T00:00:00.000Z'),
          },
          {
            id: 'earlier',
            name: 'Earlier',
            identifier: 'instagram',
            disabled: false,
            deletedAt: null,
            linkCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      },
    ]);

    expect(pipeline.channels.map((channel) => channel.id)).toEqual([
      'earlier',
      'later',
    ]);
  });

  it('returns only the public pipeline keys', () => {
    const [pipeline] = toPublicPipelines([
      {
        id: 'pipe-1',
        name: 'Weekly',
        timezone: 'Europe/London',
        active: true,
        nextSlot: new Date('2026-11-23T18:00:00.000Z'),
        channels: [
          {
            id: 'youtube-1',
            name: 'London Parkour',
            identifier: 'youtube',
            disabled: false,
            deletedAt: null,
            linkCreatedAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ],
      },
    ]);

    expect(Object.keys(pipeline)).toEqual([
      'id',
      'name',
      'timezone',
      'active',
      'nextSlot',
      'channels',
    ]);
    expect(Object.keys(pipeline.channels[0])).toEqual([
      'id',
      'name',
      'identifier',
    ]);
  });
});
