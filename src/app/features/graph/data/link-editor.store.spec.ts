import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SessionStore } from '../../../core/auth';
import { LinkApi } from './link.api';
import { LinkEditorStore } from './link-editor.store';
import { CATALOG, EVENT, link, MEDICATION, SITUATION, source } from './link.fixtures';

type Api = Partial<Record<keyof LinkApi, ReturnType<typeof vi.fn>>>;

function setup(api: Api = {}, me = signal<{ id: string } | null>({ id: 'u-claire' })) {
  const mock: Api = {
    linkTypes: vi.fn().mockResolvedValue(CATALOG),
    entry: vi.fn().mockResolvedValue(source()),
    linksOf: vi.fn().mockResolvedValue([link()]),
    targets: vi.fn().mockResolvedValue([EVENT, SITUATION, { ...EVENT, id: 'e-feeling' }]),
    create: vi.fn().mockResolvedValue(
      link({
        id: 'l-new',
        linkType: 'triggers',
        sourceId: 'e-event',
        targetId: 'e-feeling',
        label: 'déclenché par',
        sentence: "Anxiété 8/10 déclenché par Entretien d'évaluation",
      }),
    ),
    changeType: vi.fn().mockResolvedValue(link({ id: 'l-2', linkType: 'triggers' })),
    remove: vi.fn().mockResolvedValue(undefined),
    ...api,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: LinkApi, useValue: mock },
      { provide: SessionStore, useValue: { me } },
    ],
  });
  return { store: TestBed.inject(LinkEditorStore), api: mock, me };
}

const network = { status: 0, code: 'NETWORK_ERROR' };

describe('LinkEditorStore', () => {
  it('open : entrée, liens, catalogue, puis cibles récentes du dossier sans l’entrée ouverte', async () => {
    const { store, api } = setup();
    await store.open('e-feeling');
    expect(api.entry).toHaveBeenCalledWith('e-feeling');
    expect(api.linksOf).toHaveBeenCalledWith('e-feeling');
    expect(api.targets).toHaveBeenCalledWith('p-marie', { q: '', type: null });
    expect(store.source().data?.type).toBe('feeling');
    expect(store.catalog().data).toHaveLength(8);
    expect(store.targets().data?.map((entry) => entry.id)).toEqual(['e-event', 'e-situation']);
    expect(store.isOpenOn('e-feeling')).toBe(true);
    expect(store.entryTypes()['e-situation']).toBe('situation');
  });

  it('« Changer » la source : entrées du dossier sans la source actuelle, erreur, effacement', async () => {
    const { store, api } = setup();
    await store.open('e-feeling');
    await store.searchSources('entretien');
    expect(api.targets).toHaveBeenLastCalledWith('p-marie', { q: 'entretien', type: null });
    expect(store.sources().data?.map((entry) => entry.id)).toEqual(['e-event', 'e-situation']);
    api.targets!.mockRejectedValueOnce(network);
    await store.searchSources('x');
    expect(store.sources().status).toBe('error');
    store.clearSources();
    expect(store.sources().status).toBe('idle');
    // Rouvert sur une autre entrée : la liste des sources repart de zéro.
    await store.searchSources('');
    await store.open('e-event');
    expect(store.sources().status).toBe('idle');
  });

  it('catalogue lu une fois par compte ; un autre compte repart de zéro', async () => {
    const me = signal<{ id: string } | null>({ id: 'u-claire' });
    const { store, api } = setup({}, me);
    await store.open('e-feeling');
    store.closed('e-feeling');
    await store.open('e-feeling');
    expect(api.linkTypes).toHaveBeenCalledTimes(1);
    me.set({ id: 'u-autre' });
    await store.open('e-feeling');
    expect(api.linkTypes).toHaveBeenCalledTimes(2);
  });

  it('linkedTo : autres extrémités des liens actifs avec leur verbe', async () => {
    const { store } = setup();
    await store.open('e-feeling');
    expect(store.linkedTo().get('e-situation')).toEqual(['aggravé par']);
    expect(store.activeCount()).toBe(1);
  });

  it('erreur de l’entrée : pas de recherche ; Réessayer relit puis cherche', async () => {
    const entry = vi.fn().mockRejectedValueOnce(network).mockResolvedValue(source());
    const { store, api } = setup({ entry });
    await store.open('e-feeling');
    expect(store.source().status).toBe('error');
    expect(api.targets).not.toHaveBeenCalled();
    await store.retrySource();
    expect(store.source().status).toBe('loaded');
    expect(api.targets).toHaveBeenCalledTimes(1);
  });

  it('searchTargets : seule la dernière réponse compte', async () => {
    let resolveSlow: (value: unknown) => void = () => undefined;
    const targets = vi
      .fn()
      .mockResolvedValueOnce([EVENT])
      .mockImplementationOnce(() => new Promise((resolve) => (resolveSlow = resolve)))
      .mockResolvedValueOnce([MEDICATION]);
    const { store } = setup({ targets });
    await store.open('e-feeling');
    const slow = store.searchTargets({ q: 'entre', type: null });
    await store.searchTargets({ q: 'sertra', type: 'medication' });
    resolveSlow([SITUATION]);
    await slow;
    expect(store.targets().data?.map((entry) => entry.id)).toEqual(['e-medication']);
    expect(store.query()).toEqual({ q: 'sertra', type: 'medication' });
  });

  it('createLink : le lien rendu s’ajoute à la liste', async () => {
    const { store, api } = setup();
    await store.open('e-feeling');
    const created = await store.createLink({
      targetId: 'e-event',
      linkType: 'triggers',
      reversed: true,
      rationale: '',
    });
    expect(api.create).toHaveBeenCalledWith('e-feeling', {
      targetId: 'e-event',
      linkType: 'triggers',
      reversed: true,
      rationale: '',
    });
    expect(created?.id).toBe('l-new');
    expect(store.links().data?.map((item) => item.id)).toEqual(['l-1', 'l-new']);
    expect(store.linkedTo().get('e-event')).toEqual(['déclenché par']);
  });

  it('createLink 409 LINK_EXISTS : rien n’est ajouté, le problème est rangé', async () => {
    const conflict = { status: 409, code: 'LINK_EXISTS', extra: { existingLinkId: 'l-1' } };
    const { store } = setup({ create: vi.fn().mockRejectedValue(conflict) });
    await store.open('e-feeling');
    const created = await store.createLink({
      targetId: 'e-situation',
      linkType: 'worsens',
      reversed: true,
      rationale: '',
    });
    expect(created).toBeNull();
    expect(store.problem()).toEqual(conflict);
    expect(store.saving()).toBe(false);
    expect(store.links().data).toHaveLength(1);
  });

  it('removeLink : DELETE, le lien quitte les actifs et reste dans la liste, marqué retiré', async () => {
    const { store, api } = setup();
    await store.open('e-feeling');
    expect(await store.removeLink('l-1')).toBe(true);
    expect(api.remove).toHaveBeenCalledWith('l-1');
    expect(store.links().data).toEqual([]);
    expect(store.placed()).toEqual([{ ...link(), removed: true }]);
    expect(store.linkedTo().size).toBe(0);
  });

  it('removeLink en échec : le lien reste actif, le problème est rattaché au lien', async () => {
    const { store } = setup({ remove: vi.fn().mockRejectedValue(network) });
    await store.open('e-feeling');
    expect(await store.removeLink('l-1')).toBe(false);
    expect(store.placed()[0].removed).toBe(false);
    expect(store.linkProblem()).toEqual({ linkId: 'l-1', problem: network });
    expect(store.busyLinkId()).toBeNull();
  });

  it('changeLinkType : PATCH puis relecture de la liste ; un retiré reste affiché', async () => {
    const linksOf = vi
      .fn()
      .mockResolvedValueOnce([link(), link({ id: 'l-9', sourceId: 'e-feeling', targetId: 'x' })])
      .mockResolvedValue([link({ id: 'l-2', linkType: 'triggers', label: 'déclenché par' })]);
    const { store, api } = setup({ linksOf });
    await store.open('e-feeling');
    await store.removeLink('l-9');
    expect(await store.changeLinkType('l-1', 'triggers')).toBe(true);
    expect(api.changeType).toHaveBeenCalledWith('l-1', 'triggers');
    expect(store.placed().map((item) => [item.id, item.removed])).toEqual([
      ['l-2', false],
      ['l-9', true],
    ]);
  });

  it('changeLinkType 409 : liste inchangée, problème sous le lien', async () => {
    const conflict = { status: 409, code: 'LINK_EXISTS' };
    const { store, api } = setup({ changeType: vi.fn().mockRejectedValue(conflict) });
    await store.open('e-feeling');
    expect(await store.changeLinkType('l-1', 'worsens')).toBe(false);
    expect(api.linksOf).toHaveBeenCalledTimes(1);
    expect(store.linkProblem()?.problem).toEqual(conflict);
  });

  it('resolveEntryType : depuis le cache, sinon GET /api/entries/{id}', async () => {
    const { store, api } = setup();
    await store.open('e-feeling');
    expect(await store.resolveEntryType('e-situation')).toBe('situation');
    expect(api.entry).toHaveBeenCalledTimes(1);
    api.entry!.mockResolvedValueOnce(source({ id: 'e-loin', type: 'medication' }));
    expect(await store.resolveEntryType('e-loin')).toBe('medication');
    expect(api.entry).toHaveBeenCalledTimes(2);
  });

  it('undoLink : DELETE et le lien sort de la liste sans y rester marqué', async () => {
    const { store, api } = setup();
    await store.open('e-feeling');
    const created = await store.createLink({
      targetId: 'e-event',
      linkType: 'triggers',
      reversed: true,
      rationale: '',
    });
    expect(await store.undoLink(created!)).toBe(true);
    expect(api.remove).toHaveBeenCalledWith('l-new');
    expect(store.placed().map((item) => item.id)).toEqual(['l-1']);
  });
});
