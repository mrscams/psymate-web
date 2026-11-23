import { registerLocaleData } from '@angular/common';
import localeAr from '@angular/common/locales/ar';
import { Component, LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatMenuModule } from '@angular/material/menu';

import { ARABIC_FORMAT_LOCALE } from '../../../core/i18n';
import { periodMonth } from '../data/timeline-decade.model';
import { monthlySummary, timelineItem } from '../data/timeline.fixtures';
import { TimelineCardComponent } from './timeline-card.component';
import { TimelineDayComponent } from './timeline-day.component';
import { TimelineDecadeComponent } from './timeline-decade.component';
import {
  anchorLabel,
  averageLabel,
  dayLabel,
  durationLabel,
  groupLabel,
  monthHeading,
  monthLabel,
  rowTime,
  sessionDate,
} from './timeline-labels';

// M16-17, timeline de droite à gauche (G Q71, Q73, Q75, Q77 ; docs/design/arabe.md §3, §5, §7) :
// formats par la locale de formatage (chiffres latins, calendrier grégorien), vue décennie de
// gauche à droite, contenu saisi en dir="auto".

registerLocaleData(localeAr, 'ar');

@Component({
  imports: [MatMenuModule, TimelineCardComponent],
  template: `
    <mat-menu #menu="matMenu" />
    <pm-timeline-card [item]="item" [menu]="menu" />
  `,
})
class CardHostComponent {
  readonly item = timelineItem({
    title: 'نوبة قلق',
    tags: ['نوم'],
    occurred: { from: '2026-11-12T14:05:00', to: null, precision: 'exact', label: null },
  });
}

/** Chiffres arabo-indiens (U+0660–0669) et persans (U+06F0–06F9) : jamais à l'écran (Q71 point 2). */
const NON_LATIN_DIGITS = /[٠-٩۰-۹]/;
const ARABIC_LETTER = /[ء-ي]/;

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('timeline-labels avec la locale de formatage arabe (Q73)', () => {
  const locale = ARABIC_FORMAT_LOCALE;
  const today = new Date(2026, 10, 12, 12);

  it('dates : mois en arabe, chiffres latins, calendrier grégorien, heures sur 24 h', () => {
    const samples = [
      monthLabel(2026 * 12 + 10, locale),
      monthLabel(2026 * 12 + 10, locale, true),
      monthHeading(2026 * 12 + 10, locale),
      sessionDate('2026-11-08T14:00:00Z', locale),
      dayLabel('2026-10-08', locale),
      groupLabel('2026-11-08T14:00:00Z', 'exact', 'day', locale).main,
      anchorLabel({ from: '2026-11-12T09:40:00', precision: 'exact' }, 'day', locale, today).main,
    ];
    for (const sample of samples) {
      expect(sample, sample).not.toMatch(NON_LATIN_DIGITS);
      expect(sample, sample).toMatch(ARABIC_LETTER);
    }
    expect(monthLabel(2026 * 12 + 10, locale)).toContain('2026');
    expect(dayLabel('2026-10-08', locale)).toMatch(/\b8\b/);
    expect(rowTime({ from: '2026-11-12T14:05:00', precision: 'exact' }, locale)).toBe('14:05');
  });

  it('nombres : chiffres latins', () => {
    expect(averageLabel(5.25, locale)).not.toMatch(NON_LATIN_DIGITS);
    expect(averageLabel(5.25, locale)).toMatch(/^5.(2|3)$/);
    expect(durationLabel(1250, locale)).toContain('1');
    expect(durationLabel(1250, locale)).not.toMatch(NON_LATIN_DIGITS);
  });
});

describe('vue décennie : graphique de gauche à droite dans les trois langues (Q71 point 4)', () => {
  const m = (period: string) => periodMonth(period)!;

  async function render(locale: string) {
    TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: locale }] });
    const fixture = TestBed.createComponent(TimelineDecadeComponent);
    fixture.componentRef.setInput('status', 'loaded');
    fixture.componentRef.setInput('periods', monthlySummary(48, '2026-10'));
    fixture.componentRef.setInput('plage', { start: m('2022-11'), end: m('2026-10') });
    fixture.componentRef.setInput('types', ['note', 'feeling']);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.resetTestingModule());

  for (const locale of ['fr', 'ar']) {
    it(`${locale} : le SVG est en dir="ltr", l'année la plus ancienne à gauche`, async () => {
      const el = await render(locale);
      const svg = el.querySelector('svg.chart')!;
      expect(svg.getAttribute('dir')).toBe('ltr');
      const years = [...svg.querySelectorAll('text.year-label')].map((label) => ({
        year: Number(text(label)),
        x: Number(label.getAttribute('x')),
      }));
      expect(years.length).toBeGreaterThan(1);
      const byX = [...years].sort((a, b) => a.x - b.x).map((y) => y.year);
      expect(byX).toEqual([...byX].sort((a, b) => a - b));
      expect(text(svg)).not.toMatch(NON_LATIN_DIGITS);
    });
  }

  it('la flèche de la plage pointe vers la fin dans le sens de lecture', async () => {
    expect(text((await render('fr')).querySelector('.range'))).toContain('→');
    TestBed.resetTestingModule();
    const range = text((await render('ar')).querySelector('.range'));
    expect(range).toContain('←');
    expect(range).not.toMatch(NON_LATIN_DIGITS);
  });
});

describe('contenu saisi en dir="auto" (Q77)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('carte : titre et tags en dir="auto", heure en chiffres latins', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'ar' }] });
    const fixture = TestBed.createComponent(CardHostComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.title')!.getAttribute('dir')).toBe('auto');
    expect(text(el.querySelector('.title'))).toBe('نوبة قلق');
    for (const tag of el.querySelectorAll('.tag:not(.more-tags)')) {
      expect(tag.getAttribute('dir')).toBe('auto');
    }
    expect(text(el.querySelector('.tm'))).toBe('14:05');
  });

  it('ancre d’un jour : le libellé saisi d’une période est isolé (<bdi>)', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: LOCALE_ID, useValue: 'fr' }] });
    const fixture = TestBed.createComponent(TimelineDayComponent);
    fixture.componentRef.setInput('occurred', {
      from: '2014-01-01T00:00:00Z',
      to: '2016-01-01T00:00:00Z',
      precision: 'period',
      label: 'الجامعة',
    });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(text(el.querySelector('.date b bdi'))).toBe('الجامعة');
  });
});
