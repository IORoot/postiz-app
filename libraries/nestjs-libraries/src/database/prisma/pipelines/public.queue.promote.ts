export function queuePromoteWithoutDate(item: {
  status: string;
  scheduledFor: string | null;
}): { code: 'no_free_slot' } | { ok: true } {
  if (item.status === 'draft' && !item.scheduledFor) {
    return { code: 'no_free_slot' };
  }
  return { ok: true };
}
