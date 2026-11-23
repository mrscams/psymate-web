import { LOCALE_ID, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ARABIC_FORMAT_LOCALE } from '../../../core/i18n';
import { PreferencesStore } from '../../../core/preferences';
import { CaptureApi, toEmotion, toLinkType } from '../data/capture.api';
import { CANDIDATES, EMOTIONS, LINK_TYPES } from '../data/capture.fixtures';
import { emotionLabelOf } from '../data/capture.model';
import { parseWarning } from '../parser/parse.types';
import { CaptureBlockComponent } from './capture-block.component';
import { list, targetIssueText, warningText } from './capture-labels';

// M16-20, bloc de saisie de droite à gauche (G Q71, Q73, Q77, Q78, Q81 ; docs/design/arabe.md §3,
// §5 à §8) : aucune date lue en arabe, échelle d'intensité dans le sens de lecture, formats par la
// locale de formatage, libellés de catalogue par catalogLabel, contenu saisi en dir="auto".

type Api = Partial<Record<keyof CaptureApi, ReturnType<typeof vi.fn>>>;
type EmotionDto = Parameters<typeof toEmotion>[0];
type LinkTypeDto = Parameters<typeof toLinkType>[0];

async function render(locale: string) {
  const api: Api = {
    emotions: vi.fn().mockResolvedValue(EMOTIONS),
    linkTypes: vi.fn().mockResolvedValue(LINK_TYPES),
    railCandidates: vi.fn().mockResolvedValue(CANDIDATES),
    searchEntries: vi.fn().mockResolvedValue([]),
    create: vi
      .fn()
      .mockImplementation(async (_p: string, body: { type: string; status: string }) => ({
        id: 'e-new',
        type: body.type,
        status: body.status,
        sessionId: 's-open',
      })),
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: LOCALE_ID, useValue: locale },
      { provide: CaptureApi, useValue: api },
      { provide: PreferencesStore, useValue: { defaultVisibility: signal('clinical') } },
    ],
  });
  const fixture = TestBed.createComponent(CaptureBlockComponent);
  fixture.componentRef.setInput('patientId', 'p-marie');
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector<HTMLTextAreaElement>('#pm-capture-input')!;
  return { fixture, el, input, api };
}

async function settle(fixture: ComponentFixture<CaptureBlockComponent>) {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  }
}

async function type(fixture: ComponentFixture<CaptureBlockComponent>, value: string) {
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLTextAreaElement>(
    '#pm-capture-input',
  )!;
  input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle(fixture);
}

async function press(
  fixture: ComponentFixture<CaptureBlockComponent>,
  target: Element,
  key: string,
) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  await settle(fixture);
}

const text = (element: Element | null): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** Ce que l'échelle montre : cases allumées, valeur écrite, valeur lue. */
function scaleView(el: HTMLElement) {
  const slider = el.querySelector<HTMLElement>('#pm-capture-intensity')!;
  return {
    lit: [...slider.querySelectorAll('.cell.on')].map((cell) => cell.getAttribute('data-value')),
    shown: text(el.querySelector('pm-capture-scale .value')),
    now: slider.getAttribute('aria-valuenow'),
  };
}

describe('bloc de saisie en arabe : aucune date lue (Q81)', () => {
  it('texte arabe avec chiffres, date en chiffres et mot d’amorce : moment « maintenant », rien de daté dans le corps', async () => {
    const { el, input, fixture, api } = await render('ar');
    await type(fixture, 'نمت 8 ساعات أمس، موعد 12/03/2024 منذ 2019');
    expect(el.querySelector<HTMLSelectElement>('#pm-capture-when')!.value).toBe('now');
    expect(el.querySelector('.types .tchip[aria-pressed="true"]')?.getAttribute('data-type')).toBe(
      'note',
    );
    expect(el.querySelector('.notes')).toBeNull();
    await press(fixture, input, 'Enter');
    expect(api.create!.mock.calls[0][1]).toEqual({
      type: 'note',
      visibility: 'clinical',
      body: 'نمت 8 ساعات أمس، موعد 12/03/2024 منذ 2019',
      status: 'final',
    });
  });

  it('saisie française en /ar/ : préfixe et émotion lus, « hier » reste dans le texte', async () => {
    const { el, input, fixture, api } = await render('ar');
    await type(fixture, 'anx 8 hier');
    expect(el.querySelector<HTMLSelectElement>('#pm-capture-when')!.value).toBe('now');
    await press(fixture, input, 'Enter');
    expect(api.create!.mock.calls[0][1]).toEqual({
      type: 'feeling',
      visibility: 'clinical',
      feeling: { emotionCode: 'anxiety', intensity: 8 },
      body: 'hier',
      status: 'final',
    });
  });

  it('la même saisie en /fr/ garde sa date (comportement inchangé)', async () => {
    const { el, input, fixture, api } = await render('fr');
    await type(fixture, 'anx 8 hier');
    expect(el.querySelector<HTMLSelectElement>('#pm-capture-when')!.value).toBe('yesterday');
    await press(fixture, input, 'Enter');
    expect(api.create!.mock.calls[0][1].occurred.precision).toBe('day');
  });

  it('champ de saisie, titre, molécule, posologie, émotion et noms des cibles en dir="auto" ; touches en dir="ltr"', async () => {
    const { el, fixture } = await render('ar');
    expect(el.querySelector('#pm-capture-input')?.getAttribute('dir')).toBe('auto');
    expect(el.querySelector('.keys kbd')?.getAttribute('dir')).toBe('ltr');
    expect(el.querySelector('pm-capture-links .tchip .cut')?.getAttribute('dir')).toBe('auto');
    await type(fixture, '/evt شجار');
    expect(el.querySelector('#pm-capture-title')?.getAttribute('dir')).toBe('auto');
    await type(fixture, '/med سيرترالين');
    expect(el.querySelector('#pm-capture-molecule')?.getAttribute('dir')).toBe('auto');
    expect(el.querySelector('#pm-capture-dosage')?.getAttribute('dir')).toBe('auto');
    await type(fixture, 'anx 3');
    expect(el.querySelector('#pm-capture-emotion')?.getAttribute('dir')).toBe('auto');
  });
});

describe('échelle d’intensité de droite à gauche (docs/design/arabe.md §3, §6)', () => {
  it('ar : flèche gauche augmente jusqu’à 10, flèche droite diminue jusqu’à 0 ; la valeur enregistrée est celle montrée', async () => {
    const { el, input, fixture, api } = await render('ar');
    await type(fixture, 'anx 5');
    const slider = el.querySelector<HTMLElement>('#pm-capture-intensity')!;
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('10');

    await press(fixture, slider, 'ArrowLeft');
    expect(scaleView(el)).toEqual({
      lit: ['1', '2', '3', '4', '5', '6'],
      shown: '6/10',
      now: '6',
    });
    for (let i = 0; i < 8; i++) await press(fixture, slider, 'ArrowLeft');
    expect(scaleView(el).now).toBe('10');
    expect(scaleView(el).lit).toHaveLength(10);
    expect(scaleView(el).shown).toBe('10/10');
    await press(fixture, input, 'Enter');
    expect(api.create!.mock.calls[0][1].feeling).toEqual({ emotionCode: 'anxiety', intensity: 10 });

    await type(fixture, 'anx 5');
    const again = el.querySelector<HTMLElement>('#pm-capture-intensity')!;
    await press(fixture, again, 'ArrowRight');
    expect(scaleView(el)).toEqual({ lit: ['1', '2', '3', '4'], shown: '4/10', now: '4' });
    for (let i = 0; i < 8; i++) await press(fixture, again, 'ArrowRight');
    expect(scaleView(el)).toEqual({ lit: [], shown: '0/10', now: '0' });
    await press(fixture, input, 'Enter');
    expect(api.create!.mock.calls[1][1].feeling).toEqual({ emotionCode: 'anxiety', intensity: 0 });
  });

  it('ar : haut, bas, Début et Fin ne changent pas de sens', async () => {
    const { el, fixture } = await render('ar');
    await type(fixture, 'anx 5');
    const slider = el.querySelector<HTMLElement>('#pm-capture-intensity')!;
    await press(fixture, slider, 'ArrowUp');
    expect(scaleView(el).now).toBe('6');
    await press(fixture, slider, 'ArrowDown');
    await press(fixture, slider, 'ArrowDown');
    expect(scaleView(el).now).toBe('4');
    await press(fixture, slider, 'End');
    expect(scaleView(el).now).toBe('10');
    await press(fixture, slider, 'Home');
    expect(scaleView(el).now).toBe('0');
  });

  it('fr : flèche droite augmente, flèche gauche diminue (inchangé)', async () => {
    const { el, fixture } = await render('fr');
    await type(fixture, 'anx 5');
    const slider = el.querySelector<HTMLElement>('#pm-capture-intensity')!;
    await press(fixture, slider, 'ArrowRight');
    expect(scaleView(el).now).toBe('6');
    await press(fixture, slider, 'ArrowLeft');
    await press(fixture, slider, 'ArrowLeft');
    expect(scaleView(el).now).toBe('4');
  });

  it('les cases suivent le sens de lecture (aucun sens forcé) ; la valeur « 7/10 » reste en ltr', async () => {
    const { el, fixture } = await render('ar');
    await type(fixture, 'anx 7');
    const slider = el.querySelector<HTMLElement>('#pm-capture-intensity')!;
    expect(slider.getAttribute('dir')).toBeNull();
    expect(
      [...slider.querySelectorAll('.cell')].map((cell) => cell.getAttribute('data-value')),
    ).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(el.querySelector('pm-capture-scale .value')?.getAttribute('dir')).toBe('ltr');
  });
});

describe('formats et libellés par la locale de formatage (Q73, Q78)', () => {
  const OLD = (locale: string, items: string[]) =>
    new Intl.ListFormat(locale, { type: 'conjunction' }).format(items);

  it('listes : sortie française et anglaise strictement inchangée, conjonction arabe en arabe', () => {
    for (const items of [['A'], ['A', 'B'], ['Tristesse', 'Tristesse profonde', 'Rage']]) {
      for (const locale of ['fr', 'fr-FR', 'en', 'en-GB']) {
        expect(list(items, locale)).toBe(OLD(locale, items));
      }
    }
    expect(list(['A', 'B', 'C'], 'fr')).toBe('A, B et C');
    expect(list(['A', 'B', 'C'], 'en')).toBe('A, B, and C');
    expect(list(['A', 'B'], 'ar')).toBe('A وB');
    expect(list(['A', 'B'], ARABIC_FORMAT_LOCALE)).toBe('A وB');
  });

  it('phrases du parseur : texte français identique, liste arabe en arabe', () => {
    const warning = parseWarning('POSSIBLE_FEELING', {
      word: 'tri',
      candidates: ['sadness', 'c_1a2b3c4d'],
    });
    expect(warningText(warning, 'note', EMOTIONS, 'fr')).toBe(
      'Un ressenti (Tristesse et Tristesse profonde) ? Ajoutez une intensité de 0 à 10 après « tri ».',
    );
    expect(warningText(warning, 'note', EMOTIONS, ARABIC_FORMAT_LOCALE)).toContain(
      'Tristesse وTristesse profonde',
    );
  });

  it('cible incompatible : types en minuscules par la locale, texte français identique', () => {
    const issue = {
      code: 'TARGET_NOT_ALLOWED' as const,
      name: 'Dort mal',
      targetType: 'note' as const,
    };
    expect(targetIssueText(issue, 'event', 'fr')).toBe(
      'Aucun type de lien ne relie « Dort mal » (note) à cette entrée (événement) : choisissez une autre cible ou retirez « > ».',
    );
    expect(targetIssueText(issue, 'event', ARABIC_FORMAT_LOCALE)).toContain('(note)');
  });

  it('émotion à créer : capitale française inchangée, mot arabe tel que saisi', () => {
    expect(emotionLabelOf(' stress ', 'fr')).toBe('Stress');
    expect(emotionLabelOf('élan', 'fr')).toBe('Élan');
    expect(emotionLabelOf('stress', 'en')).toBe('Stress');
    expect(emotionLabelOf(' قلق ', ARABIC_FORMAT_LOCALE)).toBe('قلق');
    expect(emotionLabelOf('stress', ARABIC_FORMAT_LOCALE)).toBe('Stress');
  });

  it('libellés de catalogue (Q78) : anglais s’il existe, sinon français ; en arabe, français tant que labelAr manque', () => {
    const anxiety = {
      code: 'anxiety',
      labelFr: 'Anxiété',
      labelEn: 'Anxiety',
      family: 'fear',
    } as EmotionDto;
    const custom = { code: 'c_1', labelFr: 'Stress', scope: 'custom' } as EmotionDto;
    expect(toEmotion(anxiety, 'fr').label).toBe('Anxiété');
    expect(toEmotion(anxiety, 'en').label).toBe('Anxiety');
    expect(toEmotion(anxiety, 'ar').label).toBe('Anxiété');
    expect(toEmotion(custom, 'en').label).toBe('Stress');
    expect(toEmotion(anxiety, 'ar')).toMatchObject({ labelFr: 'Anxiété', labelEn: 'Anxiety' });

    const triggers = {
      code: 'triggers',
      labelFr: 'déclenche',
      labelEn: 'triggers',
      inverseLabelFr: 'déclenché par',
      inverseLabelEn: 'triggered by',
    } as LinkTypeDto;
    const coOccurs = {
      code: 'co_occurs',
      labelFr: 'survient avec',
      labelEn: 'co-occurs with',
    } as LinkTypeDto;
    expect(toLinkType(triggers, 'fr')).toMatchObject({
      label: 'déclenche',
      inverseLabel: 'déclenché par',
    });
    expect(toLinkType(triggers, 'en')).toMatchObject({
      label: 'triggers',
      inverseLabel: 'triggered by',
    });
    expect(toLinkType(triggers, 'ar')).toMatchObject({
      label: 'déclenche',
      inverseLabel: 'déclenché par',
    });
    expect(toLinkType(coOccurs, 'en').inverseLabel).toBeNull();
    expect(toLinkType(coOccurs, 'fr').inverseLabel).toBeNull();
  });
});
