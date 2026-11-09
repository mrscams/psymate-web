import { mkdirSync, renameSync, rmSync, statSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Section exclusive entre les processus de test (M7-04, stabilisation des e2e) : les workers
 * Playwright, et toute autre suite lancée sur la même machine contre la même API locale.
 *
 * Deux usages, sous le même verrou « charge-api » :
 * - un test qui écrit des centaines d'entrées (patient « volume », super-nœud) le prend pour chaque
 *   vague d'écritures et la barrière `apiDrained()` qui la suit ;
 * - un test qui mesure une durée côté API (vue d'ensemble « < 2 s », « < 200 ms ») le prend pour la
 *   seule fenêtre mesurée.
 * Une mesure ne tombe donc jamais pendant une charge que la suite s'inflige à elle-même (pool de
 * connexions saturé, file asynchrone pleine) ; le seuil mesuré, lui, ne change pas.
 *
 * Le verrou est un dossier (mkdir est atomique) dans le dossier temporaire du système ; son
 * détenteur le rafraîchit toutes les 2 s.
 *
 * Équité : les processus en attente sondent toutes les POLL_MS. Un processus qui vient de rendre
 * le verrou (fin d'une vague) attend YIELD_MS, plus longtemps qu'un sondage, avant de le
 * redemander : celui qui attend l'obtient entre deux vagues, au lieu d'attendre toute la création
 * en masse (et de tomber en délai dépassé).
 *
 * Verrou périmé (processus tué : plus rafraîchi depuis STALE_MS) : il est d'abord renommé sous un
 * nom propre à ce processus (rename est atomique : un seul des processus qui le voient périmé
 * réussit), puis son âge est relu sur ce nom. S'il s'avère vivant (rafraîchi entre-temps, ou recréé
 * par un autre après une reprise), il est rendu sous son nom ; sinon il est supprimé.
 */
const STALE_MS = 60_000;
const REFRESH_MS = 2_000;
const POLL_MS = 100;
const YIELD_MS = 3 * POLL_MS;

/** Dernière libération de chaque verrou par ce processus (équité, voir plus haut). */
const releasedAt = new Map<string, number>();

function ageOf(path: string): number {
  return Date.now() - statSync(path).mtimeMs;
}

/** Reprend un verrou périmé, sans jamais supprimer celui d'un processus vivant. */
function reclaimStale(lock: string): void {
  try {
    if (ageOf(lock) <= STALE_MS) return;
  } catch {
    return; // Libéré entre-temps.
  }
  const taken = `${lock}.reprise-${process.pid}-${Date.now()}`;
  try {
    renameSync(lock, taken);
  } catch {
    return; // Un autre processus l'a repris ou libéré le premier.
  }
  try {
    if (ageOf(taken) > STALE_MS) {
      rmSync(taken, { recursive: true, force: true });
      return;
    }
  } catch {
    return;
  }
  // Vivant : on le rend sous son nom. Cela n'échoue que si un troisième processus a créé un
  // verrou entre-temps (verrou périmé vu par trois processus à la fois) : le dossier est alors
  // laissé tel quel (jamais supprimé, il est vivant), et l'exclusion n'est plus garantie pour cette
  // seule section ; cas jugé négligeable pour des tests.
  try {
    renameSync(taken, lock);
  } catch {
    // Voir ci-dessus.
  }
}

export async function exclusive<T>(
  name: string,
  work: () => Promise<T>,
  timeoutMs = 180_000,
): Promise<T> {
  const lock = join(tmpdir(), `psymate-e2e-${name}.lock`);
  const wait = (releasedAt.get(name) ?? 0) + YIELD_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  const started = Date.now();
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      reclaimStale(lock);
      if (Date.now() - started > timeoutMs) {
        throw new Error(`verrou ${name} non obtenu en ${timeoutMs} ms`);
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  }
  const refresh = setInterval(() => {
    try {
      const now = new Date();
      utimesSync(lock, now, now);
    } catch {
      // Repris par un autre après un arrêt du processus : rien à faire.
    }
  }, REFRESH_MS);
  try {
    return await work();
  } finally {
    clearInterval(refresh);
    rmSync(lock, { recursive: true, force: true });
    releasedAt.set(name, Date.now());
  }
}
