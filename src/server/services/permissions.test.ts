import { roleChangeError } from '@/server/services/permissions';
import { describe, expect, test } from 'bun:test';

describe('roleChangeError (#90)', () => {
  test('admins and judges can be added, changed between each other and removed', () => {
    expect(roleChangeError(null, 'admin')).toBeNull();
    expect(roleChangeError(null, 'judge')).toBeNull();
    expect(roleChangeError('admin', 'judge')).toBeNull();
    expect(roleChangeError('judge', 'admin')).toBeNull();
    expect(roleChangeError('admin', null)).toBeNull();
    expect(roleChangeError('judge', null)).toBeNull();
  });

  test('no one is made owner here', () => {
    expect(roleChangeError(null, 'owner')).toContain('transfer ownership');
    expect(roleChangeError('admin', 'owner')).toContain('transfer ownership');
  });

  test('the owner can’t be changed or removed', () => {
    expect(roleChangeError('owner', 'admin')).toContain('can’t be changed or removed');
    expect(roleChangeError('owner', 'judge')).toContain('can’t be changed or removed');
    expect(roleChangeError('owner', null)).toContain('can’t be changed or removed');
  });
});
