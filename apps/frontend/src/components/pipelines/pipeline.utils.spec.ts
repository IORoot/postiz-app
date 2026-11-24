import { pipelineExistingData } from './pipeline.utils';

const row = (id: string, channel: string, extra: Record<string, unknown> = {}) => ({
  id,
  integration: { id: channel, picture: `${channel}.png` },
  settings: JSON.stringify({ __type: channel }),
  ...extra,
});

describe('pipelineExistingData', () => {
  const rows = [row('p1', 'tiktok'), row('p2', 'instagram'), row('p3', 'youtube')];

  it('opens the first channel and keeps the others as siblings', () => {
    const data = pipelineExistingData('g1', rows as any);

    expect(data!.integration).toBe('tiktok');
    expect(data!.posts.map((p: any) => p.id)).toEqual(['p1']);
    expect(data!.siblings.map((s) => s.integration)).toEqual([
      'instagram',
      'youtube',
    ]);
  });

  it('opens the channel that was clicked', () => {
    const data = pipelineExistingData('g1', rows as any, 'instagram');

    expect(data!.integration).toBe('instagram');
    expect(data!.integrationPicture).toBe('instagram.png');
    expect(data!.settings).toEqual({ __type: 'instagram' });
    expect(data!.siblings.map((s) => s.integration)).toEqual([
      'tiktok',
      'youtube',
    ]);
    expect(data!.siblings[0].group).toBe('g1');
  });

  it('keeps a channel\'s follow-up posts with it, even without their own channel', () => {
    const data = pipelineExistingData(
      'g1',
      [
        row('p1', 'tiktok'),
        { id: 'c1', parentPostId: 'p1', settings: '{}' },
        row('p2', 'instagram'),
      ] as any,
      'tiktok'
    );

    expect(data!.posts.map((p: any) => p.id)).toEqual(['p1', 'c1']);
    expect(data!.siblings[0].posts.map((p: any) => p.id)).toEqual(['p2']);
  });

  it('accepts settings that are already parsed', () => {
    const data = pipelineExistingData('g1', [
      row('p1', 'tiktok', { settings: { __type: 'tiktok' } }),
    ] as any);

    expect(data!.settings).toEqual({ __type: 'tiktok' });
  });

  it('has nothing to open without a channel', () => {
    expect(pipelineExistingData('g1', [])).toBeUndefined();
    expect(
      pipelineExistingData('g1', [{ id: 'p1', settings: '{}' }] as any)
    ).toBeUndefined();
  });

  it('lists a repeated channel once', () => {
    const data = pipelineExistingData('g1', [
      row('p1', 'tiktok'),
      row('p2', 'tiktok'),
      row('p3', 'instagram'),
    ] as any);

    expect(data!.siblings.map((s) => s.integration)).toEqual(['instagram']);
  });

  it('falls back to the first channel when the clicked one is not there', () => {
    expect(pipelineExistingData('g1', rows as any, 'nope')!.integration).toBe(
      'tiktok'
    );
  });

  it('survives settings that are not valid JSON', () => {
    const data = pipelineExistingData('g1', [
      row('p1', 'tiktok', { settings: '{oops' }),
    ] as any);

    expect(data!.settings).toEqual({});
  });
});
