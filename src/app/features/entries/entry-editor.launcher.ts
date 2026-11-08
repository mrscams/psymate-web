import { inject, Injector } from '@angular/core';
import { Router } from '@angular/router';

import { EntryType, SidePanelRef, SidePanelService } from '../../shared/ui';
import { EntryEditorStore } from './data/entry-editor.store';
import { EntryPrefill, EntryView } from './data/entry.model';
import { EntryEditorPanel } from './panels/entry-editor.panel';

/** Paramètre de requête d'une correction : `?entry=<id>` rouvre le panneau au rechargement. */
export const ENTRY_QUERY_PARAM = 'entry';

export interface OpenEntryEditorOptions {
  /** Correction d'une entrée existante (sinon création). */
  entryId?: string | null;
  /** Type proposé à la création (préfixes de la barre de capture, M6-02). */
  type?: EntryType;
  /** Texte de la barre de capture, repris dans le texte de l'entrée. */
  text?: string;
  /**
   * Saisie interprétée par la barre de commande (features/capture, Ctrl+Entrée) : type, émotion,
   * intensité, moment, texte et liens préremplis ; remplace `type` et `text`.
   */
  prefill?: EntryPrefill;
  /** Hors contexte d'injection (gestionnaire d'événement), l'injecteur de l'appelant. */
  injector?: Injector;
}

/** L'entrée enregistrée, rendue par le panneau à sa fermeture (undefined : fermé sans enregistrer). */
export type SavedEntry = Pick<EntryView, 'id' | 'type' | 'status' | 'version' | 'sessionId'>;

/**
 * Ouvre l'éditeur d'entrée (fiche 05) dans le panneau latéral, par-dessus le dossier du patient :
 * création (N, +, barre de capture) ou correction (`entryId`). En correction, l'URL porte
 * `?entry=<id>` tant que le panneau est ouvert (rechargement, lien partagé) ; une seconde demande
 * pour la cible déjà ouverte ne fait rien. Renvoie la poignée du panneau, ou null s'il n'a pas pu
 * s'ouvrir.
 */
export function openEntryEditor(
  patientId: string,
  options: OpenEntryEditorOptions = {},
): SidePanelRef<SavedEntry> | null {
  const injector = options.injector ?? inject(Injector);
  const store = injector.get(EntryEditorStore);
  const entryId = options.entryId ?? null;
  if (store.isOpenOn({ patientId, entryId })) return null;

  const panels = injector.get(SidePanelService);
  const ref = panels.open<EntryEditorPanel, unknown, SavedEntry>(EntryEditorPanel, {
    data: options.prefill
      ? { patientId, entryId, type: options.prefill.type, prefill: options.prefill }
      : { patientId, entryId, type: options.type, text: options.text },
    width: 480,
  });
  if (!ref) return null;

  const router = injector.get(Router);
  if (entryId) setEntryParam(router, entryId);
  void ref.closed.then(() => {
    const url = router.parseUrl(router.url);
    if (entryId && url.queryParams[ENTRY_QUERY_PARAM] === entryId) setEntryParam(router, null);
  });
  return ref;
}

function setEntryParam(router: Router, entryId: string | null): void {
  const url = router.parseUrl(router.url);
  if ((url.queryParams[ENTRY_QUERY_PARAM] ?? null) === entryId) return;
  const queryParams = { ...url.queryParams };
  if (entryId) queryParams[ENTRY_QUERY_PARAM] = entryId;
  else delete queryParams[ENTRY_QUERY_PARAM];
  url.queryParams = queryParams;
  void router.navigateByUrl(url, { replaceUrl: true });
}
