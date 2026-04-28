import { describe, expect, it, vi } from 'vitest';
import type { ResolverClient } from '../../providers/resolver/client.js';
import { createResolverService } from './index.js';

function makeResolver(overrides: Partial<ResolverClient> = {}): ResolverClient {
  return {
    ping: async () => ({ ok: true }),
    listKnown: async () => [],
    resolveByAddress: async () => null,
    select: async () => ({ orchAddress: null, reason: 'no node matched', nodes: [] }),
    refresh: async () => undefined,
    getAuditLog: async () => [],
    close: () => undefined,
    ...overrides,
  };
}

describe('ResolverService', () => {
  it('search() forwards the query untouched', async () => {
    const select = vi.fn(async () => ({
      orchAddress: '0xabc',
      reason: 'top-weighted',
      nodes: [],
    }));
    const svc = createResolverService({ resolver: makeResolver({ select }) });
    const res = await svc.search({ capability: 'whisper', model: 'whisper-large' });
    expect(res.orchAddress).toBe('0xabc');
    expect(select).toHaveBeenCalledWith({ capability: 'whisper', model: 'whisper-large' });
  });

  it('refresh() with no address calls the resolver with `*` and force=true', async () => {
    const refresh = vi.fn(async () => undefined);
    const svc = createResolverService({ resolver: makeResolver({ refresh }) });
    await svc.refresh({});
    expect(refresh).toHaveBeenCalledWith('*', { force: true });
  });

  it('refresh() with address calls the resolver with the eth address', async () => {
    const refresh = vi.fn(async () => undefined);
    const svc = createResolverService({ resolver: makeResolver({ refresh }) });
    await svc.refresh({ address: '0xaaa' });
    expect(refresh).toHaveBeenCalledWith('0xaaa', { force: true });
  });

  it('fetchAuditLog() forwards opts and returns the entries', async () => {
    const getAuditLog = vi.fn(async () => [
      {
        occurredAt: 1,
        orchAddress: '0xabc',
        kind: 'select',
        mode: 'well-known' as const,
        detail: 'd',
      },
    ]);
    const svc = createResolverService({ resolver: makeResolver({ getAuditLog }) });
    const res = await svc.fetchAuditLog({ since: 100, limit: 50, ethAddress: '0xabc' });
    expect(res).toHaveLength(1);
    expect(getAuditLog).toHaveBeenCalledWith({ since: 100, limit: 50, ethAddress: '0xabc' });
  });

  it('fetchAuditLog() with no opts passes empty {}', async () => {
    const getAuditLog = vi.fn(async () => []);
    const svc = createResolverService({ resolver: makeResolver({ getAuditLog }) });
    await svc.fetchAuditLog();
    expect(getAuditLog).toHaveBeenCalledWith({});
  });
});
