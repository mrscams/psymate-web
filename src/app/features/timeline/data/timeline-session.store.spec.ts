import { TestBed } from '@angular/core/testing';

import { TimelineApi } from './timeline.api';
import { TimelineSessionStore } from './timeline-session.store';
import { SessionDetail } from './timeline-sessions.model';

const detail: SessionDetail = {
  id: 's-1',
  from: '2026-10-30T15:00:00Z',
  to: '2026-10-30T15:50:00Z',
  durationMin: 50,
  modality: 'in_person',
  kind: 'session',
  closedAt: '2026-10-30T15:50:00Z',
  summary: 'Point sur le sommeil.',
};

function setup(sessionDetail: ReturnType<typeof vi.fn>) {
  TestBed.configureTestingModule({
    providers: [TimelineSessionStore, { provide: TimelineApi, useValue: { sessionDetail } }],
  });
  return TestBed.inject(TimelineSessionStore);
}

describe('TimelineSessionStore', () => {
  it('load : en cours puis chargé, une seule lecture par séance', async () => {
    const api = vi.fn().mockResolvedValue(detail);
    const store = setup(api);
    const loading = store.load('s-1');
    expect(store.details()['s-1'].status).toBe('loading');
    await loading;
    expect(store.details()['s-1']).toEqual({ status: 'loaded', detail, problem: null });
    await store.load('s-1');
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('erreur : ApiProblem gardé, retry relit', async () => {
    const api = vi
      .fn()
      .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
      .mockResolvedValue(detail);
    const store = setup(api);
    await store.load('s-1');
    expect(store.details()['s-1']).toMatchObject({
      status: 'error',
      problem: { code: 'INTERNAL_ERROR' },
    });
    await store.retry('s-1');
    expect(store.details()['s-1'].status).toBe('loaded');
  });

  it('refresh relit les détails connus ; reset ignore les réponses en vol', async () => {
    let release: (value: SessionDetail) => void = () => undefined;
    const api = vi
      .fn()
      .mockResolvedValueOnce(detail)
      .mockImplementationOnce(() => new Promise<SessionDetail>((resolve) => (release = resolve)));
    const store = setup(api);
    await store.load('s-1');
    const refreshing = store.refresh();
    expect(api).toHaveBeenCalledTimes(2);
    store.reset();
    release({ ...detail, summary: 'Autre' });
    await refreshing;
    expect(store.details()).toEqual({});
  });
});
