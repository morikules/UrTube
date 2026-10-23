import { describe, expect, it } from 'vitest';
import { accountKey } from './accounts';

describe('accountKey', () => {
  it('is short, stable and does not contain the ID', async () => {
    const a = await accountKey('108765432109876543210||');
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(await accountKey('108765432109876543210||')).toBe(a);
    expect(await accountKey('108765432109876543210||123')).not.toBe(a);
  });
});
