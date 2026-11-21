import { queuePromoteWithoutDate } from './public.queue.promote';

describe('queuePromoteWithoutDate', () => {
  it('rejects a draft that has no projected slot', () => {
    expect(
      queuePromoteWithoutDate({ status: 'draft', scheduledFor: null })
    ).toEqual({ code: 'no_free_slot' });
  });

  it('accepts a draft that has a projected slot', () => {
    expect(
      queuePromoteWithoutDate({
        status: 'draft',
        scheduledFor: '2026-11-23T18:00:00.000Z',
      })
    ).toEqual({ ok: true });
  });

  it('accepts an item that is already scheduled or published', () => {
    expect(
      queuePromoteWithoutDate({
        status: 'scheduled',
        scheduledFor: '2026-11-23T18:00:00.000Z',
      })
    ).toEqual({ ok: true });
    expect(
      queuePromoteWithoutDate({ status: 'published', scheduledFor: null })
    ).toEqual({ ok: true });
  });
});
