import { mkdirSync, rmSync, statSync, utimesSync } from 'node:fs';
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
 * détenteur le rafraîchit toutes les 2 s. Un verrou que personne n'a rafraîchi depuis 60 s (test
 * tué) est repris.
 */
const STALE_MS = 60_000;
const REFRESH_MS = 2_000;
const POLL_MS = 100;

export async function exclusive<T>(
  name: string,
  work: () => Promise<T>,
  timeoutMs = 180_000,
): Promise<T> {
  const lock = join(tmpdir(), `psymate-e2e-${name}.lock`);
  const started = Date.now();
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(lock).mtimeMs > STALE_MS) rmSync(lock, { recursive: true });
      } catch {
        // Libéré entre-temps : on retente.
      }
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
  }
}
