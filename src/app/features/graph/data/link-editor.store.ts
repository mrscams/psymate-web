import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';

import { SessionStore } from '../../../core/auth';
import { ApiProblem, asProblem } from '../../../core/http';
import { EntryType } from '../../../shared/ui';
import { failed, idle, Loadable, loaded, loading } from '../../../shared/util';
import { LinkApi, TargetQuery } from './link.api';
import {
  EntryLink,
  LinkDraft,
  LinkEntry,
  LinkTypeCode,
  LinkTypeOption,
  otherEnd,
  SourceEntry,
} from './link.model';

/** Un lien de la liste « Liens déjà posés » : actif, ou retiré pendant cette ouverture (G Q41). */
export interface PlacedLink extends EntryLink {
  removed: boolean;
}

/** Problème d'une action sur un lien de la liste (PATCH, DELETE), affiché sous ce lien. */
export interface LinkActionProblem {
  linkId: string;
  problem: ApiProblem;
}

interface LinkEditorState {
  /** Compte pour lequel les données sont gardées (tout est oublié s'il change). */
  ownerId: string | null;
  /** Entrée ouverte : la source proposée du lien. */
  entryId: string | null;
  /** Le panneau est ouvert sur entryId. */
  active: boolean;
  source: Loadable<SourceEntry>;
  /** Catalogue des types et matrice E5.3, lu une fois par compte. */
  catalog: Loadable<LinkTypeOption[]>;
  /** Liens acceptés de l'entrée (GET /api/entries/{id}/links). */
  links: Loadable<EntryLink[]>;
  /** Liens retirés pendant cette ouverture : restent dans la liste, marqués retirés. */
  removed: EntryLink[];
  query: TargetQuery;
  /** Cibles trouvées (une page de la recherche du dossier), sans l'entrée ouverte. */
  targets: Loadable<LinkEntry[]>;
  /** Types d'entrée connus par identifiant (source, cibles trouvées, extrémités lues). */
  entryTypes: Record<string, EntryType>;
  saving: boolean;
  /** Problème du dernier enregistrement (409 LINK_EXISTS, 422, réseau). */
  problem: ApiProblem | null;
  /** Lien en cours de modification ou de retrait (un seul à la fois). */
  busyLinkId: string | null;
  linkProblem: LinkActionProblem | null;
}

const initialState: LinkEditorState = {
  ownerId: null,
  entryId: null,
  active: false,
  source: idle(),
  catalog: idle(),
  links: idle(),
  removed: [],
  query: { q: '', type: null },
  targets: idle(),
  entryTypes: {},
  saving: false,
  problem: null,
  busyLinkId: null,
  linkProblem: null,
};

/**
 * Éditeur de lien (fiche 06, B3 flux 4, B4 écran 6) : l'entrée ouverte, le catalogue des types, ses
 * liens et la recherche de la cible. Fourni à la racine : le panneau (SidePanelService) n'injecte que
 * des services racine. Le choix en cours (cible, type, sens, justification) est l'état d'écran du
 * panneau. Après une écriture, la liste vient de la réponse (création) ou est relue (changement de
 * type : le serveur crée un nouveau lien) ; un lien retiré reste affiché, marqué retiré.
 */
export const LinkEditorStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    /** Liens actifs puis retirés, pour la liste du panneau. */
    placed: computed<PlacedLink[]>(() => [
      ...(store.links().data ?? []).map((link) => ({ ...link, removed: false })),
      ...store.removed().map((link) => ({ ...link, removed: true })),
    ]),
    activeCount: computed(() => store.links().data?.length ?? 0),
    /** Entrées déjà liées à l'entrée ouverte → verbes des liens actifs (« déjà lié (aggrave) »). */
    linkedTo: computed<Map<string, string[]>>(() => {
      const entryId = store.entryId();
      const map = new Map<string, string[]>();
      if (!entryId) return map;
      for (const link of store.links().data ?? []) {
        const other = otherEnd(link, entryId);
        map.set(other, [...(map.get(other) ?? []), link.label]);
      }
      return map;
    }),
  })),
  withMethods((store, api = inject(LinkApi), session = inject(SessionStore)) => {
    let searchSeq = 0;

    function checkOwner(): void {
      const owner = session.me()?.id ?? null;
      if (store.ownerId() !== owner) patchState(store, { ...initialState, ownerId: owner });
    }

    function rememberTypes(entries: { id: string; type: EntryType }[]): void {
      const known = { ...store.entryTypes() };
      for (const entry of entries) if (entry.id) known[entry.id] = entry.type;
      patchState(store, { entryTypes: known });
    }

    async function loadCatalog(force = false): Promise<void> {
      if (!force && store.catalog().status === 'loaded') return;
      patchState(store, { catalog: loading(store.catalog()) });
      try {
        patchState(store, { catalog: loaded(await api.linkTypes()) });
      } catch (error) {
        patchState(store, { catalog: failed(asProblem(error), store.catalog()) });
      }
    }

    async function loadSource(entryId: string): Promise<void> {
      patchState(store, { source: loading(store.source()) });
      try {
        const source = await api.entry(entryId);
        if (store.entryId() !== entryId) return;
        rememberTypes([source]);
        patchState(store, { source: loaded(source) });
      } catch (error) {
        if (store.entryId() === entryId)
          patchState(store, { source: failed(asProblem(error), store.source()) });
      }
    }

    async function loadLinks(entryId: string): Promise<void> {
      patchState(store, { links: loading(store.links()) });
      try {
        const links = await api.linksOf(entryId);
        if (store.entryId() !== entryId) return;
        const removed = store.removed().filter((gone) => !links.some((l) => l.id === gone.id));
        patchState(store, { links: loaded(links), removed });
      } catch (error) {
        if (store.entryId() === entryId)
          patchState(store, { links: failed(asProblem(error), store.links()) });
      }
    }

    async function loadTargets(): Promise<void> {
      const entryId = store.entryId();
      const patientId = store.source().data?.patientId;
      if (!entryId || !patientId) return;
      const seq = ++searchSeq;
      const query = store.query();
      patchState(store, { targets: loading(store.targets()) });
      try {
        const found = await api.targets(patientId, query);
        if (seq !== searchSeq || store.entryId() !== entryId) return;
        rememberTypes(found);
        patchState(store, { targets: loaded(found.filter((entry) => entry.id !== entryId)) });
      } catch (error) {
        if (seq !== searchSeq || store.entryId() !== entryId) return;
        patchState(store, { targets: failed(asProblem(error), store.targets()) });
      }
    }

    return {
      /**
       * Ouvre l'éditeur sur une entrée : l'entrée, ses liens et le catalogue, puis les cibles récentes
       * du dossier (la recherche a besoin du patient de l'entrée). Une autre entrée repart de zéro.
       */
      async open(entryId: string): Promise<void> {
        checkOwner();
        if (store.entryId() !== entryId) {
          patchState(store, {
            entryId,
            source: idle(),
            links: idle(),
            targets: idle(),
            query: { q: '', type: null },
          });
        }
        patchState(store, {
          active: true,
          removed: [],
          problem: null,
          saving: false,
          busyLinkId: null,
          linkProblem: null,
        });
        await Promise.all([loadCatalog(), loadSource(entryId), loadLinks(entryId)]);
        if (store.entryId() === entryId && store.source().data) await loadTargets();
      },

      /** Le panneau est-il ouvert sur cette entrée (pas de seconde ouverture pour ?link=) ? */
      isOpenOn(entryId: string): boolean {
        return store.active() && store.entryId() === entryId;
      },

      /** Le panneau de cette entrée s'est fermé. */
      closed(entryId: string): void {
        if (store.entryId() !== entryId) return;
        patchState(store, { active: false, problem: null, linkProblem: null });
      },

      async retrySource(): Promise<void> {
        const entryId = store.entryId();
        if (!entryId) return;
        await loadSource(entryId);
        if (store.source().data && store.targets().status === 'idle') await loadTargets();
      },

      async retryLinks(): Promise<void> {
        const entryId = store.entryId();
        if (entryId) await loadLinks(entryId);
      },

      async retryCatalog(): Promise<void> {
        await loadCatalog(true);
      },

      async retryTargets(): Promise<void> {
        await loadTargets();
      },

      /** Nouvelle recherche de cible (texte, type) ; seule la dernière réponse compte. */
      async searchTargets(query: TargetQuery): Promise<void> {
        patchState(store, { query });
        await loadTargets();
      },

      /** Type d'une entrée, lu au besoin (l'autre extrémité d'un lien, pour les types permis). */
      async resolveEntryType(entryId: string): Promise<EntryType | null> {
        const known = store.entryTypes()[entryId];
        if (known) return known;
        try {
          const entry = await api.entry(entryId);
          rememberTypes([entry]);
          return entry.type;
        } catch {
          return null;
        }
      },

      /** Efface le problème du dernier enregistrement (nouvelle saisie). */
      clearProblem(): void {
        patchState(store, { problem: null });
      },

      /**
       * Pose le lien (POST /api/entries/{id}/links). Succès : le lien rendu s'ajoute à la liste.
       * Échec : le problème est rangé (409, 422, réseau).
       */
      async createLink(draft: LinkDraft): Promise<EntryLink | null> {
        const entryId = store.entryId();
        if (!entryId || store.saving()) return null;
        patchState(store, { saving: true, problem: null });
        try {
          const link = await api.create(entryId, draft);
          if (store.entryId() !== entryId) return link;
          patchState(store, {
            saving: false,
            links: loaded([...(store.links().data ?? []), link]),
          });
          return link;
        } catch (error) {
          patchState(store, { saving: false, problem: asProblem(error) });
          return null;
        }
      },

      /**
       * Change le type d'un lien (PATCH /api/links/{id}) : le serveur le remplace par un nouveau lien
       * (l'ancien passe superseded) ; la liste est relue pour avoir la phrase vue depuis l'entrée.
       */
      async changeLinkType(linkId: string, linkType: LinkTypeCode): Promise<boolean> {
        const entryId = store.entryId();
        if (!entryId || store.busyLinkId()) return false;
        patchState(store, { busyLinkId: linkId, linkProblem: null });
        try {
          await api.changeType(linkId, linkType);
          await loadLinks(entryId);
          patchState(store, { busyLinkId: null });
          return true;
        } catch (error) {
          patchState(store, {
            busyLinkId: null,
            linkProblem: { linkId, problem: asProblem(error) },
          });
          return false;
        }
      },

      /**
       * Retire un lien (DELETE /api/links/{id}) : il passe superseded, jamais effacé (G Q41), et reste
       * dans la liste, marqué retiré.
       */
      async removeLink(linkId: string): Promise<boolean> {
        const link = store.links().data?.find((item) => item.id === linkId);
        if (!link || store.busyLinkId()) return false;
        patchState(store, { busyLinkId: linkId, linkProblem: null });
        const entryId = store.entryId();
        try {
          await api.remove(linkId);
          // Rouvert sur une autre entrée pendant le DELETE : rien à marquer dans sa liste.
          if (store.entryId() !== entryId) return true;
          patchState(store, {
            busyLinkId: null,
            links: loaded((store.links().data ?? []).filter((item) => item.id !== linkId)),
            removed: [...store.removed(), link],
          });
          return true;
        } catch (error) {
          if (store.entryId() !== entryId) return false;
          patchState(store, {
            busyLinkId: null,
            linkProblem: { linkId, problem: asProblem(error) },
          });
          return false;
        }
      },

      /**
       * « Annuler » du toast après une création : le lien est retiré (DELETE, superseded) et sort de
       * la liste sans y rester marqué, puisqu'il vient d'être posé par erreur.
       */
      async undoLink(link: EntryLink): Promise<boolean> {
        try {
          await api.remove(link.id);
        } catch {
          return false;
        }
        const data = store.links().data;
        if (data?.some((item) => item.id === link.id)) {
          patchState(store, { links: loaded(data.filter((item) => item.id !== link.id)) });
        }
        return true;
      },
    };
  }),
);
