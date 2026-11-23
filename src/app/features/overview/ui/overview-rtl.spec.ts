import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { LOCALE_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { LineSeriesOption, ScatterSeriesOption } from 'echarts/charts';
import type { MarkLineComponentOption } from 'echarts/components';

import { ARABIC_FORMAT_LOCALE } from '../../../core/i18n';
import { PreferencesStore } from '../../../core/preferences';
import { ToastService } from '../../../shared/ui';
import { PatientShellStore, ShellPatient } from '../../patient-shell';
import { OverviewApi, toView } from '../data/overview.api';
import { overviewView } from '../data/overview.fixtures';
import { OverviewPage } from '../pages/overview.page';
import { TREND_RENDERER } from './chart-host';
import {
  chartText,
  FeelingsChartLabels,
  feelingsChartOptions,
  readFeelingsTokens,
  tooltipLines,
} from './feelings-chart.options';
import {
  formatComputedAt,
  formatDay,
  formatIntensity,
  formatLongDay,
  formatMonth,
  formatShortDateTime,
  formatShortDay,
  sessionLine,
  trendSummary,
} from './overview-labels';

// M16-16, vue d'ensemble de droite à gauche (G Q71, Q73, Q75, Q77, Q78 ; docs/design/arabe.md) :
// formats par la locale de formatage (chiffres latins, calendrier grégorien), libellés d'émotion par
// catalogLabel, contenu saisi et récit du serveur dans leur sens, courbe des ressentis de gauche à
// droite avec ses textes isolés dans leur sens. Le rendu (direction calculée, position des dates)
// est prouvé par e2e/arabe/overview.spec.ts.

registerLocaleData(localeAr, 'ar');

/** Chiffres arabo-indiens (U+0660–0669) et persans (U+06F0–06F9) : jamais à l'écran (Q71 point 2). */
const NON_LATIN_DIGITS = /[٠-٩۰-۹]/;
const ARABIC_LETTER = /[ء-ي]/;
const FSI = '⁨';
const PDI = '⁩';

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('overview-labels avec la locale arabe (Q73)', () => {
  const now = new Date(2026, 10, 12, 12);

  for (const locale of ['ar', ARABIC_FORMAT_LOCALE]) {
    it(`dates et nombres : mois en arabe, chiffres latins (${locale})`, () => {
      const samples = [
        formatDay('2026-10-17', locale),
        formatShortDay('2026-10-15', locale, now),
        formatShortDay('2025-10-15', locale, now),
        formatLongDay('2026-10-17T09:00:00Z', locale, now),
        formatShortDateTime('2026-11-12T09:20:00Z', locale, now),
        formatMonth('2026-09-01', locale),
        formatComputedAt('2026-11-08T11:03:00Z', locale, now),
      ];
      for (const sample of samples) {
        expect(sample, sample).not.toMatch(NON_LATIN_DIGITS);
        expect(sample, sample).toMatch(ARABIC_LETTER);
      }
      expect(formatShortDay('2025-10-15', locale, now)).toContain('2025');
      expect(formatIntensity(4.5, locale)).not.toMatch(NON_LATIN_DIGITS);
      expect(formatIntensity(4.5, locale)).toMatch(/^4.5$/);
      // Heures sur 24 h, sans « م » ni « ص ».
      expect(formatShortDateTime('2026-11-12T15:20:00', locale, now)).toMatch(/15:20/);
      const summary = trendSummary(overviewView().trend, 9, '90d', locale);
      expect(summary).not.toMatch(NON_LATIN_DIGITS);
    });
  }

  it('ligne de séance : pas de capitale initiale en arabe, toujours en français', () => {
    const session = overviewView().recentSessions[0];
    const ar = sessionLine(session, 'ar', () => 'عيادة', now);
    const day = formatLongDay(session.occurredFrom!, 'ar', now);
    expect(ar.startsWith(day)).toBe(true);
    expect(ar).not.toMatch(NON_LATIN_DIGITS);
    expect(sessionLine(session, 'fr', () => 'cabinet', now)).toMatch(/^Samedi 17 octobre/);
  });
});

describe('toView : libellés d’émotion par catalogLabel (Q78)', () => {
  const dto = {
    feelings: { series: [{ emotionCode: 'calm', label: 'Calme', labelEn: 'Calm' }] },
    emotions: { top: [{ code: 'calm', label: 'Calme' }] },
  };

  it('français en arabe tant que le contrat n’a pas de libellé arabe ; anglais en anglais', () => {
    const ar = toView(dto, '90d', 'ar');
    expect(ar.feelings.series[0].label).toBe('Calme');
    expect(ar.emotions[0].label).toBe('Calme');
    const en = toView(dto, '90d', 'en');
    expect(en.feelings.series[0].label).toBe('Calm');
    expect(en.emotions[0].label).toBe('Calm');
  });

  it('le code quand rien n’est servi', () => {
    const view = toView(
      { feelings: { series: [{ emotionCode: 'calm' }] }, emotions: { top: [{ code: 'calm' }] } },
      '90d',
      'ar',
    );
    expect(view.feelings.series[0].label).toBe('calm');
    expect(view.emotions[0].label).toBe('calm');
  });
});

describe('courbe des ressentis en interface de droite à gauche (Q71 point 4)', () => {
  const tokens = readFeelingsTokens((name) => `tok(${name})`);
  const base: FeelingsChartLabels = {
    average: 'متوسط',
    session: 'جلسة',
    medicationStart: 'بداية العلاج',
    medicationEnd: 'نهاية العلاج',
    emotion: (code) => code,
    day: (value) => `يوم ${value}`,
    intensity: (value) => String(value),
  };

  function options(labels: FeelingsChartLabels) {
    const view = overviewView();
    return feelingsChartOptions({ trend: view.trend, feelings: view.feelings }, tokens, labels);
  }

  it('textes du SVG isolés dans leur sens en rtl, inchangés en ltr', () => {
    const rtl = { ...base, direction: 'rtl' as const };
    expect(chartText('15 أكتوبر', rtl)).toBe(`${FSI}15 أكتوبر${PDI}`);
    expect(chartText('', rtl)).toBe('');
    expect(chartText('15 oct.', base)).toBe('15 oct.');
    expect(chartText('15 oct.', { ...base, direction: 'ltr' })).toBe('15 oct.');

    const axis = options(rtl).xAxis as { axisLabel: { formatter: (v: number) => string } };
    expect(axis.axisLabel.formatter(0)).toMatch(new RegExp(`^${FSI}.*${PDI}$`));
    const sessions = (options(rtl).series as ScatterSeriesOption[]).find(
      (s) => s.id === 'sessions',
    )!;
    const line = (sessions.markLine as MarkLineComponentOption).data![0] as {
      label: { align: string; formatter: () => string };
    };
    expect(line.label.formatter()).toMatch(new RegExp(`^${FSI}.*${PDI}$`));
    // Alignements des repères : coordonnées du dessin, les mêmes dans les deux sens.
    const ltrLine = (
      (options(base).series as ScatterSeriesOption[]).find((s) => s.id === 'sessions')!
        .markLine as MarkLineComponentOption
    ).data![0] as { label: { align: string } };
    expect(line.label.align).toBe(ltrLine.label.align);
    expect(options(rtl).grid).toEqual(options(base).grid);
  });

  it('infobulle : une ligne par morceau dans son sens en rtl, <br> en ltr ; jamais hors du cadre', () => {
    expect(tooltipLines(['a', 'b'], base)).toBe('a<br>b');
    expect(tooltipLines(['a', 'b'], { ...base, direction: 'rtl' })).toBe(
      '<div dir="auto">a</div><div dir="auto">b</div>',
    );
    const average = (options({ ...base, direction: 'rtl' }).series as LineSeriesOption[]).find(
      (s) => s.id === 'average',
    )!;
    const formatter = (average.tooltip as { formatter: (p: unknown) => string }).formatter;
    expect(formatter({ value: ['2026-11-01', 4.5] })).toBe(
      '<div dir="auto">يوم 2026-11-01</div><div dir="auto">متوسط : 4.5/10</div>',
    );
    expect((options(base).tooltip as { confine?: boolean }).confine).toBe(true);
  });
});

describe('page en /ar/ : contenu saisi et récit du serveur dans leur sens (Q77)', () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const patient: ShellPatient = {
    id: 'p-marie',
    displayName: 'Marie D.',
    birthDate: null,
    followedSince: '2025-03-12',
    flags: ['watch'],
    sessionModality: 'in_person',
    plannedDurationMin: 50,
  };

  async function render(locale: string) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: LOCALE_ID, useValue: locale },
        {
          provide: OverviewApi,
          useValue: { overview: () => Promise.resolve(overviewView()) },
        },
        {
          provide: PatientShellStore,
          useValue: {
            patientId: signal('p-marie'),
            patient: signal<ShellPatient | null>(patient),
            followedSince: signal<string | null>(null),
            revision: signal(0),
            currentSession: signal<{ id: string } | null>(null),
            recallTab: () => undefined,
            rememberTab: () => undefined,
          },
        },
        {
          provide: PreferencesStore,
          useValue: {
            overviewWindow: signal('90d'),
            loaded: signal(true),
            status: signal('idle'),
          },
        },
        { provide: ToastService, useValue: { warning: () => undefined } },
        {
          provide: TREND_RENDERER,
          useValue: () =>
            Promise.resolve(() => ({
              setOption: () => undefined,
              resize: () => undefined,
              on: () => undefined,
              dispose: () => undefined,
            })),
        },
      ],
    });
    const fixture = TestBed.createComponent(OverviewPage);
    await tick();
    await fixture.whenStable();
    await tick();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('dir="auto" ou <bdi> sur chaque texte saisi, le récit du serveur en dir="auto"', async () => {
    const el = await render('ar');
    expect(el.querySelector('pm-overview-since .brief')?.getAttribute('dir')).toBe('auto');
    expect(text(el.querySelector('pm-overview-since .attention bdi'))).toBe(
      'À surveiller depuis le 3 octobre 2026 (motif : Sommeil).',
    );
    expect(text(el.querySelector('pm-overview-side .line .muted bdi'))).toBe('Sommeil');
    const medication = el.querySelector('pm-overview-side .dot.medication')!.parentElement!;
    expect(medication.querySelector('b')?.getAttribute('dir')).toBe('auto');
    expect([...medication.querySelectorAll('bdi')].map((b) => text(b))).toEqual([
      '75 mg',
      'matin',
      'Dr Lemaire',
    ]);
    expect(el.querySelector('pm-overview-side .sit .t span[dir="auto"]')?.textContent?.trim()).toBe(
      'Surcharge au travail',
    );
    for (const name of el.querySelectorAll('pm-overview-noted .name, pm-overview-noted .text')) {
      expect(name.getAttribute('dir')).toBe('auto');
    }
    for (const summary of el.querySelectorAll('pm-overview-sessions .s')) {
      expect(summary.getAttribute('dir')).toBe('auto');
    }
    // Aucune date en chiffres arabo-indiens.
    expect(text(el)).not.toMatch(NON_LATIN_DIGITS);
  });

  it('graphique dans un conteneur HTML en dir="ltr" (Q75)', async () => {
    const el = await render('ar');
    const figure = el.querySelector('pm-overview-feelings-chart .figure');
    expect(figure?.tagName).toBe('DIV');
    expect(figure?.getAttribute('dir')).toBe('ltr');
    expect(figure?.querySelector('.chart')).not.toBeNull();
  });

  it('en /fr/ : mêmes textes qu’avant l’isolation (espaces gardées)', async () => {
    const el = await render('fr');
    const frame = [...el.querySelectorAll('pm-overview-side .line')].map((line) => text(line));
    expect(frame).toContain('Drapeau À surveiller depuis le 3 oct. · Sommeil · modifier');
    const medication = el.querySelector('pm-overview-side .dot.medication')!.parentElement!;
    expect(text(medication)).toBe('Sertraline 75 mg matin · depuis le 12 sept. · Dr Lemaire');
    expect(text(el.querySelector('pm-overview-since .attention'))).toBe(
      'Point d’attention : À surveiller depuis le 3 octobre 2026 (motif : Sommeil).'.replace(
        '’',
        "'",
      ),
    );
  });
});
