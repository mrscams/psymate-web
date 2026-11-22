import { expect, Page, Response } from '@playwright/test';

/** Praticiens de démonstration du seed small (M14-08) : manuel, puis automatique. */
export const MANUAL = 'claire-martin';
export const AUTO = 'karim-haddad';

export interface PublicSlot {
  startsAt: string;
  endsAt: string;
}

export interface SlotsResponse {
  url: URL;
  timezone: string;
  slots: PublicSlot[];
}

/** Attend la prochaine réponse de GET …/slots de ce praticien, captée sur la page. */
export function nextSlots(page: Page, slug: string): Promise<SlotsResponse> {
  return page
    .waitForResponse(
      (response: Response) =>
        response.request().method() === 'GET' &&
        response.url().includes(`/api/public/booking/practitioners/${slug}/slots`),
    )
    .then(async (response) => {
      expect(response.status()).toBe(200);
      const body = (await response.json()) as { timezone: string; slots: PublicSlot[] };
      return { url: new URL(response.url()), ...body };
    });
}

/** Jour du créneau dans un fuseau, AAAA-MM-JJ. */
function dayKey(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

/** « mardi 24 novembre » (« 1er » le premier du mois), comme la maquette 31. */
function dayTitle(day: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
    .formatToParts(new Date(`${day}T12:00:00Z`))
    .map((part) => (part.type === 'day' && part.value === '1' ? '1er' : part.value))
    .join('');
}

function hour(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(instant));
}

/** Ce que l'écran doit montrer pour cette réponse : jours (titres) et heures, dans l'ordre. */
export function expectedDays(response: SlotsResponse): { title: string; hours: string[] }[] {
  const days: { key: string; title: string; hours: string[] }[] = [];
  for (const slot of response.slots) {
    const key = dayKey(slot.startsAt, response.timezone);
    let day = days.at(-1);
    if (!day || day.key !== key) {
      day = { key, title: dayTitle(key), hours: [] };
      days.push(day);
    }
    day.hours.push(hour(slot.startsAt, response.timezone));
  }
  return days.map(({ title, hours }) => ({ title, hours }));
}

/** Jours et heures affichés, dans l'ordre du document. */
export async function shownDays(page: Page): Promise<{ title: string; hours: string[] }[]> {
  return page.locator('pm-booking-slots .day').evaluateAll((sections) =>
    sections.map((section) => ({
      title: section.querySelector('h3')?.textContent?.trim() ?? '',
      hours: [...section.querySelectorAll('button.slot')].map((b) => b.textContent?.trim() ?? ''),
    })),
  );
}

/** Aucun défilement horizontal : scrollWidth <= clientWidth sur l'élément racine. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `défilement horizontal sur ${page.url()}`).toBeLessThanOrEqual(clientWidth);
}

/** Vrai si `a` précède `b` dans l'ordre du document. */
export async function precedes(page: Page, a: string, b: string): Promise<boolean> {
  return page.evaluate(
    ([first, second]) => {
      const x = document.querySelector(first);
      const y = document.querySelector(second);
      return !!x && !!y && !!(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
    },
    [a, b],
  );
}

export const MODE = {
  manual: "Le praticien vous répondra par e-mail. Votre demande n'est pas encore un rendez-vous.",
  auto: 'Votre rendez-vous sera confirmé dès que vous aurez validé votre adresse e-mail.',
};
