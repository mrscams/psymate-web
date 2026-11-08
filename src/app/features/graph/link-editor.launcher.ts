import { DestroyRef, effect, inject, Injector, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { ShortcutService } from '../../core/shortcuts';
import { SidePanelRef, SidePanelService } from '../../shared/ui';
import { ENTRY_QUERY_PARAM } from '../entries';
import { LinkEditorStore } from './data/link-editor.store';
import { EntryLink } from './data/link.model';
import { LinkEditorPanel, LinkEditorData } from './panels/link-editor.panel';

/** Paramètre de requête de l'éditeur de lien : `?link=<entryId>` le rouvre au rechargement. */
export const LINK_QUERY_PARAM = 'link';

export interface OpenLinkEditorOptions {
  /** Rappel du patient dans l'en-tête du panneau. */
  patientName?: string | null;
  /** Hors contexte d'injection (gestionnaire d'événement), l'injecteur de l'appelant. */
  injector?: Injector;
}

/** Le lien posé par « Enregistrer le lien » (undefined : fermé sans enregistrer, ou après « … et lier une autre »). */
export type LinkEditorResult = EntryLink;

/**
 * Ouvre l'éditeur de lien (fiche 06) sur une entrée, source proposée du lien : panneau 420 px,
 * empilé sur le panneau ouvert (l'éditeur d'entrée) s'il y en a un, seul sinon. L'URL porte
 * `?link=<entryId>` tant qu'il est ouvert (rechargement, lien partagé). Une seconde demande pour la
 * même entrée ne fait rien ; renvoie null si le panneau n'a pas pu s'ouvrir (pile pleine).
 */
export function openLinkEditor(
  entryId: string,
  options: OpenLinkEditorOptions = {},
): SidePanelRef<LinkEditorResult> | null {
  const injector = options.injector ?? inject(Injector);
  const store = injector.get(LinkEditorStore);
  if (store.isOpenOn(entryId)) return null;
  const panels = injector.get(SidePanelService);
  // Ouvert sur une autre entrée : il est au-dessus de la pile, on le remplace.
  if (store.active()) panels.closeTop();

  const data: LinkEditorData = { entryId, patientName: options.patientName ?? null };
  const ref = panels.open<LinkEditorPanel, LinkEditorData, LinkEditorResult>(LinkEditorPanel, {
    data,
    width: 420,
    stack: panels.isOpen(),
  });
  if (!ref) return null;

  const router = injector.get(Router);
  setLinkParam(router, entryId);
  void ref.closed.then(() => {
    const url = router.parseUrl(router.url);
    if (url.queryParams[LINK_QUERY_PARAM] === entryId) setLinkParam(router, null);
  });
  return ref;
}

/** Le patient du dossier ouvert, tel que le shell le connaît. */
export interface LinkEditorPatient {
  id: string;
  displayName: string;
}

/**
 * Branche l'éditeur de lien sur une page du dossier patient (le shell, dans son constructeur) :
 * `L` lie l'entrée ouverte (`?entry=<id>`, éditeur d'entrée en correction) et `?link=<entryId>`
 * ouvre l'éditeur une fois le patient chargé (après l'éditeur d'entrée, sur lequel il s'empile).
 */
export function connectLinkEditor(patient: () => LinkEditorPatient | null): void {
  const injector = inject(Injector);
  const params = toSignal(inject(ActivatedRoute).queryParamMap);
  const shortcuts = inject(ShortcutService);

  inject(DestroyRef).onDestroy(
    shortcuts.register(
      'l',
      () => {
        const entryId = params()?.get(ENTRY_QUERY_PARAM);
        if (!entryId || !patient()) return;
        openLinkEditor(entryId, { injector, patientName: patient()?.displayName });
      },
      $localize`:Aide des raccourcis@@shortcuts.l:Lier l'entrée ouverte`,
    ),
  );

  effect(() => {
    const entryId = params()?.get(LINK_QUERY_PARAM);
    const current = patient();
    if (!entryId || !current) return;
    untracked(() => openLinkEditor(entryId, { injector, patientName: current.displayName }));
  });
}

function setLinkParam(router: Router, entryId: string | null): void {
  const url = router.parseUrl(router.url);
  if ((url.queryParams[LINK_QUERY_PARAM] ?? null) === entryId) return;
  const queryParams = { ...url.queryParams };
  if (entryId) queryParams[LINK_QUERY_PARAM] = entryId;
  else delete queryParams[LINK_QUERY_PARAM];
  url.queryParams = queryParams;
  void router.navigateByUrl(url, { replaceUrl: true });
}
