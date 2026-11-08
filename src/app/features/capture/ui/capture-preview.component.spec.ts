import { TestBed } from '@angular/core/testing';

import { entryTypeLabel } from '../../../shared/ui';
import { StateKind } from '../../../shared/util';
import { CANDIDATES, EMOTIONS, LINK_TYPES } from '../data/capture.fixtures';
import { buildPreview, CapturePreview } from '../data/capture.model';
import { parse } from '../parser/parse';
import { CASE_OPTIONS, caseOptions, PARSE_CASES } from '../parser/parse.cases';
import { precisionLabel } from './capture-labels';
import { CapturePreviewComponent } from './capture-preview.component';

async function render(
  preview: CapturePreview | null,
  state: StateKind | null = null,
  session: string | null = null,
) {
  const fixture = TestBed.createComponent(CapturePreviewComponent);
  fixture.componentRef.setInput('preview', preview);
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.setInput('emotions', EMOTIONS);
  fixture.componentRef.setInput('session', session);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const text = (element: Element | null): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

const context = { emotions: EMOTIONS, candidates: CANDIDATES, linkTypes: LINK_TYPES };

describe('CapturePreviewComponent', () => {
  it('vide : l’aide de la syntaxe ; chargement : squelette ; erreur : Réessayer', async () => {
    const { el, fixture } = await render(null, 'empty');
    expect(text(el.querySelector('[role="status"] .title'))).toBe('Notez au clavier');
    expect(text(el.querySelector('[role="status"] .message'))).toContain('/evt, /sit, /med, /note');

    fixture.componentRef.setInput('state', 'loading');
    await fixture.whenStable();
    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('.line')).toBeNull();

    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);
    fixture.componentRef.setInput('state', 'error');
    await fixture.whenStable();
    expect(text(el.querySelector('[role="alert"] .title'))).toBe(
      'Impossible de charger les émotions',
    );
    el.querySelector<HTMLButtonElement>('[role="alert"] button.retry')!.click();
    expect(retry).toHaveBeenCalledOnce();
  });

  it('B5, état A de la fiche 05 : « Ressenti · Anxiété 8/10 · « n’a pas dormi » · maintenant · séance en cours · lié à Événement « Entretien annuel » »', async () => {
    const preview = buildPreview(
      parse("anx 8 n'a pas dormi > entretien", caseOptions(PARSE_CASES[1])),
      context,
    );
    const { el } = await render(preview, null, 'séance en cours');
    expect(text(el.querySelector('.line'))).toBe(
      "Ressenti · Anxiété 8/10 · « n'a pas dormi » · maintenant · séance en cours · lié à Événement « Entretien annuel » lien « déclenché par » proposé",
    );
    expect(el.querySelector('.emotion .dot')?.classList).toContain('family-fear');
    // La ligne est déjà décrite par aria-describedby : pas de région live ici (résumé dans la barre).
    expect(el.querySelector('[aria-live]')).toBeNull();
    expect(el.querySelector('.warnings')).toBeNull();
  });

  // Critère C2 M6-02 : aperçu correct pour les phrases de M6-01 (toute la table de parse.cases.ts).
  it.each(PARSE_CASES.map((parseCase) => [parseCase.rule, parseCase] as const))(
    'phrase M6-01 : %s',
    async (_rule, parseCase) => {
      const expected = parseCase.expected;
      const preview = buildPreview(parse(parseCase.input, caseOptions(parseCase)), context);
      const { el } = await render(preview);

      expect(text(el.querySelector('.type-name'))).toBe(entryTypeLabel(expected.type));
      if (expected.emotionCode) {
        const label = EMOTIONS.find((emotion) => emotion.code === expected.emotionCode)?.label;
        expect(text(el.querySelector('.emotion-name'))).toBe(label);
      } else {
        expect(el.querySelector('.emotion-name')).toBeNull();
      }
      if (expected.intensity !== undefined) {
        expect(text(el.querySelector('.intensity'))).toBe(`${expected.intensity}/10`);
      } else {
        expect(el.querySelector('.intensity')).toBeNull();
      }
      if (expected.text) {
        expect(text(el.querySelector('.part.text'))).toBe(`« ${expected.text} »`);
      } else {
        expect(el.querySelector('.part.text')).toBeNull();
      }
      const when = text(el.querySelector('.when'));
      if (expected.dateExpression) {
        expect(when).toContain(`(${precisionLabel(expected.occurred.precision)})`);
      } else {
        expect(when).toBe('maintenant');
      }
      const issue = preview.targetIssue ? 1 : 0;
      expect(el.querySelectorAll('li.warning')).toHaveLength(expected.warnings.length + issue);
      expect(el.querySelectorAll('li.warning.blocking')).toHaveLength(
        expected.warnings.filter((warning) => warning.blocking).length + issue,
      );
      if (preview.target) {
        expect(text(el.querySelector('.target-name'))).toBe(`« ${preview.target.name} »`);
      }
    },
  );

  it('avertissements traduits : « À corriger » bloque, « À vérifier » informe ; mot ambigu → choix', async () => {
    const ambiguous = buildPreview(parse('tri 5 pleure souvent', CASE_OPTIONS), context);
    const { el, fixture } = await render(ambiguous);
    const warning = el.querySelector('li.warning.blocking');
    expect(text(warning)).toContain('À corriger : « tri » désigne plusieurs émotions');
    expect(text(el.querySelector('.pending'))).toBe('« tri » ? 5/10');
    const picks = [...el.querySelectorAll<HTMLButtonElement>('button.pick')];
    expect(picks.map((button) => text(button))).toEqual(['Tristesse', 'Tristesse profonde']);
    const picked = vi.fn();
    fixture.componentInstance.pickEmotion.subscribe(picked);
    picks[1].click();
    expect(picked).toHaveBeenCalledWith(expect.objectContaining({ code: 'c_1a2b3c4d' }));

    fixture.componentRef.setInput(
      'preview',
      buildPreview(parse("anx n'a pas dormi", CASE_OPTIONS), context),
    );
    await fixture.whenStable();
    expect(text(el.querySelector('li.warning'))).toBe(
      'À vérifier : Un ressenti (Anxiété) ? Ajoutez une intensité de 0 à 10 après « anx ».',
    );

    fixture.componentRef.setInput(
      'preview',
      buildPreview(parse('anx 8 > dispute', CASE_OPTIONS), context),
    );
    await fixture.whenStable();
    expect(text(el.querySelector('li.warning.blocking'))).toContain(
      'Aucune entrée récente ne commence par « dispute »',
    );
  });
});
