import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { ChangeDetectionStrategy, Component, input, LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { provideApiClient } from '../../../core/auth';
import { ARABIC_FORMAT_LOCALE } from '../../../core/i18n';
import { PreferencesStore } from '../../../core/preferences';
import { SidePanelService } from '../../../shared/ui';
import { PatientShellApi } from '../data/patient-shell.api';
import {
  notedEntry,
  openSession,
  previousSession,
  reminders,
  shellPatient,
} from '../data/patient-shell.fixtures';
import { PatientShellStore } from '../data/patient-shell.store';
import { CloseSessionPanel, CloseSessionPanelData } from '../panels/close-session.panel';
import { ShortcutsHelpData, ShortcutsHelpPanel } from '../panels/shortcuts-help.panel';
import { NotedEntriesComponent } from './noted-entries.component';
import { PlannedChecklistComponent } from './planned-checklist.component';
import { SessionContextComponent } from './session-context.component';
import {
  closePanelSubtitle,
  formatClock,
  formatLongDay,
  formatShortDay,
  isolate,
  previousHeading,
  textShortcutRows,
} from './shell-labels';

// M16-15, dossier patient de droite à gauche (G Q71, Q73, Q77, Q78, Q81 ; docs/design/arabe.md) :
// formats par la locale de formatage (chiffres latins, heures sur 24 h), libellés d'émotion par
// catalogLabel, contenu saisi dans son sens (dir="auto", <bdi>, isolation Unicode dans les chaînes),
// touches en dir="ltr", aide de la grammaire sans ce que /ar/ ne reconnaît pas. Le rendu (sens
// calculé, captures) est prouvé par e2e/arabe/patient-shell.spec.ts.

registerLocaleData(localeAr, 'ar');

/** Chiffres arabo-indiens (U+0660–0669) et persans (U+06F0–06F9) : jamais à l'écran (Q71 point 2). */
const NON_LATIN_DIGITS = /[٠-٩۰-۹]/;
const ARABIC_LETTER = /[ء-ي]/;
const FSI = '\u2068';
const LRI = '\u2066';
const PDI = '\u2069';
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('shell-labels avec la locale arabe (Q73)', () => {
  const now = new Date(2026, 10, 12, 12);

  for (const locale of ['ar', ARABIC_FORMAT_LOCALE]) {
    it(`dates en arabe, chiffres latins, heures sur 24 h (${locale})`, () => {
      const days = [
        formatLongDay('2026-10-17T09:00:00Z', locale, now),
        formatLongDay('2025-10-17T09:00:00Z', locale, now),
        formatShortDay('2026-10-15T09:00:00Z', locale),
        previousHeading('2026-11-05T09:00:00Z', locale),
      ];
      for (const sample of days) {
        expect(sample, sample).not.toMatch(NON_LATIN_DIGITS);
        expect(sample, sample).toMatch(ARABIC_LETTER);
      }
      expect(formatLongDay('2025-10-17T09:00:00Z', locale, now)).toContain('2025');
      const clock = formatClock(new Date(2026, 10, 12, 15, 8).toISOString(), locale);
      expect(clock).toBe('15:08');
    });
  }

  it('français et anglais : les formats d’avant, inchangés', () => {
    const at = new Date(2026, 10, 12, 9, 8).toISOString();
    expect(formatClock(at, 'fr')).toBe('09:08');
    expect(formatClock(at, 'en')).toBe(
      new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date(at)),
    );
    expect(formatLongDay(at, 'fr', now)).toBe('jeudi 12 novembre');
    expect(formatShortDay(at, 'fr')).toBe('12 nov.');
    expect(formatShortDay(at, 'en')).toBe('Nov 12');
  });
});

describe('isolate (Q77, valeur dans une chaîne)', () => {
  it('en arabe : toujours isolée, dans son sens ou de gauche à droite', () => {
    expect(isolate('Lou P.', 'ar')).toBe(`${FSI}Lou P.${PDI}`);
    expect(isolate('09:08 → 09:56', 'ar', 'ltr')).toBe(`${LRI}09:08 → 09:56${PDI}`);
  });

  it('en français et en anglais : inchangée, sauf une valeur écrite de droite à gauche', () => {
    expect(isolate('Lou P.', 'fr')).toBe('Lou P.');
    expect(isolate('Lou P.', 'en')).toBe('Lou P.');
    expect(isolate('09:08 → 09:56', 'fr', 'ltr')).toBe('09:08 → 09:56');
    expect(isolate('ليلى ب.', 'fr')).toBe(`${FSI}ليلى ب.${PDI}`);
  });
});

describe('closePanelSubtitle (sous-titre du panneau de clôture)', () => {
  const start = new Date(2026, 10, 12, 9, 8).toISOString();
  const now = new Date(2026, 10, 12, 9, 56);

  it('en arabe : plage horaire de gauche à droite (le nom passe par `subject`)', () => {
    const subtitle = closePanelSubtitle(start, 'video', 'ar', now);
    expect(subtitle).not.toContain('Lou P.');
    expect(subtitle.endsWith(` · ${LRI}09:08 → 09:56${PDI}`)).toBe(true);
    expect(subtitle).not.toMatch(NON_LATIN_DIGITS);
  });

  it('en français : la phrase d’avant sans le nom, caractère pour caractère', () => {
    expect(closePanelSubtitle(start, 'video', 'fr', now)).toBe(
      'jeudi 12 novembre · visio · 09:08 → 09:56',
    );
    expect(closePanelSubtitle(start, null, 'fr', now)).toBe('jeudi 12 novembre · 09:08 → 09:56');
  });
});

describe('textShortcutRows : /ar/ ne promet que ce qui marche (Q81)', () => {
  const tokens = (locale: 'fr' | 'en' | 'ar') =>
    textShortcutRows(locale).map((row) => row.tokens.join(', '));

  it('français et anglais : les sept rangées, dates et ressenti compris', () => {
    expect(tokens('fr')).toEqual([
      'anx 7',
      '/evt',
      '/sit',
      '/med',
      '/note',
      'hier, 12 mars, il y a 3 j',
      '> cible',
    ]);
    expect(tokens('en')).toEqual(tokens('fr'));
  });

  it('arabe : ni dates ni ressenti, les préfixes et le lien restent', () => {
    expect(tokens('ar')).toEqual(['/evt', '/sit', '/med', '/note', '> cible']);
    expect(textShortcutRows('ar').map((row) => row.label)).toEqual([
      'événement',
      'situation',
      'médicament',
      '',
      'lien',
    ]);
  });
});

describe('PatientShellApi.emotionLabels : catalogLabel (Q78)', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  async function labels(locale: string): Promise<Record<string, string>> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiClient(),
        { provide: LOCALE_ID, useValue: locale },
      ],
    });
    const pending = TestBed.inject(PatientShellApi).emotionLabels();
    TestBed.inject(HttpTestingController)
      .expectOne((r) => r.url === '/api/vocabulary/emotions' && r.method === 'GET')
      .flush([
        { code: 'anxiety', labelFr: 'Anxiété', labelEn: 'Anxiety' },
        { code: 'calm', labelFr: 'Calme' },
        { code: 'bare' },
        { labelFr: 'Sans code' },
      ]);
    return pending;
  }

  it('arabe : le français tant que le contrat n’a pas de libellé arabe, sinon le code', async () => {
    expect(await labels('ar')).toEqual({ anxiety: 'Anxiété', calm: 'Calme', bare: 'bare' });
  });

  it('anglais : l’anglais, sinon le français, sinon le code', async () => {
    expect(await labels('en')).toEqual({ anxiety: 'Anxiety', calm: 'Calme', bare: 'bare' });
  });

  it('français : le français, sinon le code', async () => {
    expect(await labels('fr')).toEqual({ anxiety: 'Anxiété', calm: 'Calme', bare: 'bare' });
  });
});

@Component({
  selector: 'pm-context-host',
  imports: [SessionContextComponent],
  template: `<pm-session-context [padEmpty]="padEmpty()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ContextHost {
  readonly padEmpty = input(false);
}

function shellApi() {
  return {
    patient: vi.fn().mockResolvedValue(shellPatient({ displayName: 'Lou P.' })),
    current: vi.fn().mockResolvedValue(openSession()),
    firstSessionMonth: vi.fn().mockResolvedValue('2025-03'),
    hasEntries: vi.fn().mockResolvedValue(true),
    sessionEntries: vi
      .fn()
      .mockResolvedValue([notedEntry({ title: 'Appel du médecin du travail' })]),
    linkSentence: vi.fn().mockResolvedValue(null),
    previousSession: vi.fn().mockResolvedValue(previousSession()),
    reminders: vi.fn().mockResolvedValue(reminders()),
    emotionLabels: vi.fn().mockResolvedValue({ anxiety: 'Anxiété' }),
    close: vi.fn(),
  };
}

async function shellStore(locale: string) {
  TestBed.configureTestingModule({
    providers: [
      PatientShellStore,
      provideRouter([]),
      { provide: LOCALE_ID, useValue: locale },
      { provide: PatientShellApi, useValue: shellApi() },
      { provide: PreferencesStore, useValue: { defaultDurationMin: signal(50) } },
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const store = TestBed.inject(PatientShellStore);
  await store.load('p-marie');
  await tick();
  return store;
}

async function renderContext(locale: string, padEmpty = false) {
  await shellStore(locale);
  const fixture = TestBed.createComponent(ContextHost);
  fixture.componentRef.setInput('padEmpty', padEmpty);
  for (let i = 0; i < 3; i++) {
    await tick();
    await fixture.whenStable();
  }
  return fixture.nativeElement as HTMLElement;
}

describe('colonne de contexte en séance', () => {
  it('/ar/ : compte rendu, motif, médicament et situation dans leur sens', async () => {
    const el = await renderContext('ar', true);
    expect(el.querySelector('.summary')?.getAttribute('dir')).toBe('auto');
    expect(el.querySelector('.line .muted')?.getAttribute('dir')).toBe('auto');
    const bdis = [...el.querySelectorAll('.line bdi')].map((b) => text(b));
    expect(bdis).toEqual(['Mélatonine 2 mg le soir', 'Réorganisation du service de nuit']);
    // Aide de la grammaire : ni dates ni ressenti en arabe (Q81).
    const shortcuts = text(el.querySelector('.shortcuts'));
    expect(shortcuts).not.toContain('anx 7');
    expect(shortcuts).not.toContain('12 mars');
    expect(shortcuts).toContain('/evt');
    expect(text(el)).not.toMatch(NON_LATIN_DIGITS);
  });

  it('/fr/ : mêmes textes qu’avant l’isolation, espaces comprises', async () => {
    const el = await renderContext('fr');
    const lines = [...el.querySelectorAll('.line')].map((line) => line.textContent);
    // Texte brut relevé sur origin/main (1931dfa) avant les <bdi>.
    expect(lines).toEqual([
      'À surveillersommeil très dégradé',
      'Mélatonine 2 mg le soir ',
      ' Réorganisation du service de nuit  · en cours',
    ]);
    const shortcuts = el.querySelector('.shortcuts')!.textContent;
    expect(shortcuts).toBe(
      'anx 7 ressenti·/evt événement·/sit situation·/med médicament·/note·hier, 12 mars, il y a 3 j dates·> cible lien',
    );
  });
});

describe('lignes « Noté pendant cette séance »', () => {
  async function render(locale: string) {
    TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: locale }] });
    const fixture = TestBed.createComponent(NotedEntriesComponent);
    fixture.componentRef.setInput('entries', [
      notedEntry({ id: 'e-1', title: 'Appel du médecin du travail' }),
    ]);
    fixture.componentRef.setInput('links', {
      'e-1': { status: 'loaded', sentence: 'Appel déclenché par Réorganisation', count: 1 },
    });
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('titre et phrase de lien en dir="auto" : un titre latin tronqué garde son début', async () => {
    const el = await render('ar');
    expect(el.querySelector('.name')?.getAttribute('dir')).toBe('auto');
    expect(el.querySelector('.text')?.getAttribute('dir')).toBe('auto');
    expect(text(el.querySelector('.time'))).not.toMatch(NON_LATIN_DIGITS);
  });
});

describe('« Prévu la dernière fois »', () => {
  it('chaque point en dir="auto" ; « Noter » prépare le texte sans isolation', async () => {
    const requestPrefill = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: LOCALE_ID, useValue: 'ar' },
        {
          provide: PatientShellStore,
          useValue: {
            currentSession: signal(null),
            recallTab: () => undefined,
            rememberTab: () => undefined,
            requestPrefill,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(PlannedChecklistComponent);
    fixture.componentRef.setInput('lines', ['Relire l’agenda du sommeil']);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('label')?.getAttribute('dir')).toBe('auto');
    el.querySelector<HTMLButtonElement>('button')!.click();
    expect(requestPrefill).toHaveBeenCalledWith('Relire l’agenda du sommeil : ');
  });
});

describe('panneau de clôture', () => {
  afterEach(() => TestBed.inject(SidePanelService).closeAll?.());

  async function openPanel(locale: string): Promise<HTMLElement> {
    const store = await shellStore(locale);
    TestBed.inject(SidePanelService).open<CloseSessionPanel, CloseSessionPanelData>(
      CloseSessionPanel,
      { data: { store, unclosedAfterMin: 180 }, width: 520 },
    );
    await tick();
    return document.querySelector<HTMLElement>('pm-close-session-panel')!;
  }

  it('/ar/ : champs libres en dir="auto", durée et touche en dir="ltr", nom dans un <bdi>', async () => {
    const panel = await openPanel('ar');
    expect(panel.querySelector('textarea')?.getAttribute('dir')).toBe('auto');
    expect(panel.querySelector('#next-time-new')?.getAttribute('dir')).toBe('auto');
    expect(panel.querySelector('input.duration')?.getAttribute('dir')).toBe('ltr');
    expect(panel.querySelector('.hints kbd')?.getAttribute('dir')).toBe('ltr');
    expect(text(panel.querySelector('.subtitle bdi'))).toBe('Lou P.');
    expect(panel.querySelector('.subtitle')?.textContent).toMatch(/^Lou P\. · .*\u2066.*\u2069$/);
  });

  it('/fr/ : sous-titre au même texte qu’avant (« Lou P. · jour · lieu · heures »)', async () => {
    const panel = await openPanel('fr');
    const subtitle = panel.querySelector('.subtitle')?.textContent ?? '';
    expect(subtitle).toMatch(/^Lou P\. · \S+ \d+ \S+ · cabinet · \d\d:\d\d → \d\d:\d\d$/);
    expect(subtitle).not.toMatch(/[\u2066-\u2069]/);
  });
});

describe('aide des raccourcis', () => {
  const rows: ShortcutsHelpData['rows'] = [
    { keys: ['N'], label: 'Nouvelle entrée', available: true },
    { keys: ['1', '2', '3'], label: 'Onglets', available: true },
    { keys: ['Ctrl', 'B'], combo: true, label: 'Replier la navigation', available: false },
  ];

  async function open(locale: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: locale }] });
    TestBed.inject(SidePanelService).open<ShortcutsHelpPanel, ShortcutsHelpData>(
      ShortcutsHelpPanel,
      { data: { rows } },
    );
    await tick();
    return document.querySelector<HTMLElement>('pm-shortcuts-help-panel')!;
  }

  afterEach(() => TestBed.inject(SidePanelService).closeAll?.());

  it('touches en dir="ltr" ; combinaison de gauche à droite, touches alternatives dans le sens de la page', async () => {
    const panel = await open('ar');
    const kbds = [...panel.querySelectorAll('kbd')];
    expect(kbds.length).toBe(6);
    expect(kbds.every((kbd) => kbd.getAttribute('dir') === 'ltr')).toBe(true);
    const keySets = [...panel.querySelectorAll('th.keys > span')];
    expect(keySets.map((set) => set.getAttribute('dir'))).toEqual([null, null, 'ltr']);
    expect(keySets.map((set) => text(set))).toEqual(['N', '123', 'Ctrl+B']);
  });
});
