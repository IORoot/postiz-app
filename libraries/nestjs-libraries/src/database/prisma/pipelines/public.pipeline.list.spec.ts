import { toPublicPipelines } from './public.pipeline.list';

const catalog = {
  rules: { youtube: 'One public video' },
  tools: { youtube: [{ methodName: 'youtube' }] },
  schemas: { YoutubeDto: { properties: { title: { type: 'string' } } } },
  providers: [
    {
      identifier: 'youtube',
      dto: { name: 'YoutubeDto' },
      maxLength: (verified?: boolean) => (verified ? 5000 : 100),
    },
  ],
};

describe('toPublicPipelines', () => {
  it('returns the pipeline id and name with each channel settings schema', () => {
    expect(
      toPublicPipelines(
        [
          {
            id: 'pipe-1',
            name: 'Weekly',
            channels: [
              {
                id: 'channel-1',
                name: 'London Parkour',
                identifier: 'youtube',
                additionalSettings: JSON.stringify([
                  { title: 'Verified', value: true },
                ]),
              },
            ],
          },
        ],
        catalog
      )
    ).toEqual([
      {
        id: 'pipe-1',
        name: 'Weekly',
        channels: [
          {
            id: 'channel-1',
            name: 'London Parkour',
            identifier: 'youtube',
            settings: {
              rules: 'One public video',
              maxLength: 5000,
              settings: { properties: { title: { type: 'string' } } },
              tools: [{ methodName: 'youtube' }],
              values: [{ title: 'Verified', value: true }],
            },
          },
        ],
      },
    ]);
  });

  it('uses a zero length when the channel provider is unknown', () => {
    const [pipeline] = toPublicPipelines(
      [
        {
          id: 'pipe-1',
          name: 'Weekly',
          channels: [
            {
              id: 'channel-1',
              name: 'Missing',
              identifier: 'gone',
              additionalSettings: 'not-json',
            },
          ],
        },
      ],
      catalog
    );

    expect(pipeline.channels[0].settings).toEqual({
      rules: '',
      maxLength: 0,
      settings: 'No additional settings required',
      tools: [],
      values: [],
    });
  });
});
