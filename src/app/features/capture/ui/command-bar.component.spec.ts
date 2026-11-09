import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PreferencesStore } from '../../../core/preferences';
import { ToastService } from '../../../shared/ui';
import { EntryPrefill } from '../../entries';
import { CaptureApi } from '../data/capture.api';
import { CANDIDATES, EMOTIONS, LINK_TYPES } from '../data/capture.fixtures';
import { CapturedEntry } from '../data/capture.model';
import { CommandBarComponent } from './command-bar.component';

type Api = Partial<Record<keyof CaptureApi, ReturnType<typeof vi.fn>>>;

const STRESS = {
  code: 'c_00aa11bb',
  labelFr: 'Stress',
  labelEn: null,
  label: 'Stress',
  family: 'fear' as const,
  custom: true,
};

async function render(api: Api = {}) {
  const mock: Api = {
    emotions: vi.fn().mockResolvedValue(EMOTIONS),
    linkTypes: vi.fn().mockResolvedValue(LINK_TYPES),
    railCandidates: vi.fn().mockResolvedValue(CANDIDATES),
    create: vi
      .fn()
      .mockImplementation(async (_p: string, body: { type: string; status: string }) => ({
        id: 'e-new',
        type: body.type,
        status: body.status,
        sessionId: 's-open',
      })),
    createEmotion: vi.fn().mockResolvedValue(STRESS),
    ...api,
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: CaptureApi, useValue: mock },
      { provide: PreferencesStore, useValue: { defaultVisibility: signal('clinical') } },
    ],
  });
  const fixture = TestBed.createComponent(CommandBarComponent);
  fixture.componentRef.setInput('patientId', 'p-marie');
  fixture.componentRef.setInput('session', { kind: 'current', startedAt: '2026-11-11T09:00:00Z' });
  const saved: CapturedEntry[] = [];
  const opened: (EntryPrefill | null)[] = [];
  fixture.componentInstance.saved.subscribe((entry) => saved.push(entry));
  fixture.componentInstance.openEditor.subscribe((prefill) => opened.push(prefill));
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector<HTMLInputElement>('#pm-capture-input')!;
  return { fixture, el, input, api: mock, saved, opened };
}

const text = (element: Element | null): string =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

async function type(fixture: ComponentFixture<CommandBarComponent>, value: string) {
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
    '#pm-capture-input',
  )!;
  input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle(fixture);
}

async function press(
  fixture: ComponentFixture<CommandBarComponent>,
  target: Element,
  key: string,
  init: KeyboardEventInit = {},
) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  await settle(fixture);
  return event;
}

async function settle(fixture: ComponentFixture<CommandBarComponent>) {
  for (let i = 0; i < 3; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  }
}

describe('CommandBarComponent', () => {
  it('champ « Noter quelque chose » ; au focus, l’aide (état vide) et la lecture du vocabulaire et du rail', async () => {
    const { el, input, fixture, api } = await render();
    expect(el.querySelector('label[for="pm-capture-input"]')?.textContent?.trim()).toBe(
      'Noter quelque chose',
    );
    expect(input.placeholder).toBe('Noter quelque chose…');
    expect(el.querySelector('.panel')).toBeNull();

    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await settle(fixture);
    expect(text(el.querySelector('.panel [role="status"] .title'))).toBe('Notez au clavier');
    expect(api.emotions).toHaveBeenCalledOnce();
    expect(api.railCandidates).toHaveBeenCalledWith('p-marie');
  });

  it('aperçu en direct, rail avec la cible du `>` cochée, Entrée crée le ressenti lié puis vide la barre', async () => {
    const { el, input, fixture, api, saved } = await render();
    await type(fixture, "anx 8 n'a pas dormi > entretien");
    expect(text(el.querySelector('pm-capture-preview .line'))).toContain(
      "Ressenti · Anxiété 8/10 · « n'a pas dormi » · maintenant · séance en cours · lié à Événement « Entretien annuel »",
    );
    expect(input.getAttribute('aria-describedby')).toBe('pm-capture-preview');
    const rail = el.querySelector('fieldset.rail')!;
    expect(text(rail.querySelector('legend'))).toBe('Lié à…');
    expect(rail.querySelector<HTMLInputElement>('#pm-rail-e-event')?.checked).toBe(true);
    expect(rail.querySelector<HTMLInputElement>('#pm-rail-e-situation')?.checked).toBe(false);

    const event = await press(fixture, input, 'Enter');
    expect(event.defaultPrevented).toBe(true);
    expect(api.create).toHaveBeenCalledOnce();
    const [patientId, body] = api.create!.mock.calls[0];
    expect(patientId).toBe('p-marie');
    expect(body).toEqual({
      type: 'feeling',
      visibility: 'clinical',
      feeling: { emotionCode: 'anxiety', intensity: 8 },
      body: "n'a pas dormi",
      status: 'final',
      links: [{ targetId: 'e-event', linkType: 'triggers', direction: 'incoming' }],
    });
    expect(saved).toEqual([{ id: 'e-new', type: 'feeling', status: 'final', sessionId: 's-open' }]);
    expect(input.value).toBe('');
    expect(TestBed.inject(ToastService).toasts().at(-1)?.message).toBe('Entrée enregistrée.');
  });

  it('rail : une cible cochée de plus part avec la cible du `>` ; décocher la cible du `>` la retire', async () => {
    const { el, input, fixture, api } = await render();
    await type(fixture, "anx 8 n'a pas dormi > entretien");
    const situation = el.querySelector<HTMLInputElement>('#pm-rail-e-situation')!;
    situation.click();
    await settle(fixture);
    const target = el.querySelector<HTMLInputElement>('#pm-rail-e-event')!;
    target.click();
    await settle(fixture);
    expect(target.checked).toBe(false);
    await press(fixture, input, 'Enter');
    expect(api.create!.mock.calls[0][1].links).toEqual([
      { targetId: 'e-situation', linkType: 'triggers', direction: 'incoming' },
    ]);
  });

  it('Ctrl+S : brouillon ; Ctrl+Entrée : l’éditeur prérempli, rien n’est créé', async () => {
    const { input, fixture, api, opened } = await render();
    await type(fixture, '/evt entretien avec le manager');
    const draft = await press(fixture, input, 's', { ctrlKey: true });
    expect(draft.defaultPrevented).toBe(true);
    expect(api.create!.mock.calls[0][1]).toMatchObject({
      type: 'event',
      title: 'entretien avec le manager',
      status: 'draft',
    });
    expect(TestBed.inject(ToastService).toasts().at(-1)?.message).toBe('Brouillon enregistré.');

    await type(fixture, "anx 8 n'a pas dormi > entretien");
    await press(fixture, input, 'Enter', { ctrlKey: true });
    expect(api.create).toHaveBeenCalledOnce();
    expect(opened).toEqual([
      {
        type: 'feeling',
        feeling: { emotionCode: 'anxiety', intensity: 8 },
        body: "n'a pas dormi",
        occurred: null,
        links: [{ targetId: 'e-event', linkType: 'triggers', direction: 'incoming' }],
      },
    ]);
    // La barre garde la saisie : c'est le dossier qui la vide quand l'éditeur s'est ouvert.
    expect(input.value).toBe("anx 8 n'a pas dormi > entretien");
  });

  it('Entrée sur un champ vide : l’éditeur vide', async () => {
    const { input, fixture, api, opened } = await render();
    await press(fixture, input, 'Enter');
    expect(opened).toEqual([null]);
    expect(api.create).not.toHaveBeenCalled();
  });

  it('avertissement bloquant : Entrée ne crée rien et le dit ; le choix d’une émotion réécrit la saisie', async () => {
    const { el, input, fixture, api } = await render();
    await type(fixture, 'tri 5 pleure souvent');
    await press(fixture, input, 'Enter');
    expect(api.create).not.toHaveBeenCalled();
    const alert = el.querySelector('p.alert[role="alert"]');
    expect(text(alert)).toBe(
      "Rien n'est enregistré. « tri » désigne plusieurs émotions : choisissez-en une.",
    );
    expect(input.getAttribute('aria-describedby')).toBe('pm-capture-preview pm-capture-alert');

    el.querySelectorAll<HTMLButtonElement>('button.pick')[1].click();
    await settle(fixture);
    expect(input.value).toBe('Tristesse profonde 5 pleure souvent');
    expect(text(el.querySelector('.emotion-name'))).toBe('Tristesse profonde');
    await press(fixture, input, 'Enter');
    expect(api.create!.mock.calls[0][1].feeling).toEqual({
      emotionCode: 'c_1a2b3c4d',
      intensity: 5,
    });
  });

  it('cible introuvable : bloquant (un lien demandé ne disparaît pas en silence)', async () => {
    const { el, input, fixture, api } = await render();
    await type(fixture, 'anx 8 > dispute');
    await press(fixture, input, 'Enter');
    expect(api.create).not.toHaveBeenCalled();
    expect(text(el.querySelector('p.alert'))).toContain(
      'Aucune entrée récente ne commence par « dispute »',
    );
  });

  it('préfixe inconnu : proposition de création d’une émotion personnalisée, famille obligatoire, puis ressenti reconnu', async () => {
    const { el, input, fixture, api } = await render();
    await type(fixture, "stress 7 avant l'examen");
    // Après la création, le vocabulaire relu la contient.
    api.emotions?.mockResolvedValue([...EMOTIONS, STRESS]);
    const proposal = el.querySelector('pm-emotion-proposal [role="group"]')!;
    expect(text(proposal.querySelector('.title'))).toBe("Créer l'émotion personnalisée « Stress »");

    proposal.querySelector<HTMLButtonElement>('button.create')!.click();
    await settle(fixture);
    expect(api.createEmotion).not.toHaveBeenCalled();
    expect(text(proposal.querySelector('[role="alert"]'))).toBe(
      "Choisissez la famille de l'émotion.",
    );

    const family = proposal.querySelector<HTMLSelectElement>('select')!;
    expect(el.querySelector(`label[for="${family.id}"]`)?.textContent?.trim()).toBe('Famille');
    family.value = 'fear';
    family.dispatchEvent(new Event('change'));
    proposal.querySelector<HTMLButtonElement>('button.create')!.click();
    await settle(fixture);
    expect(api.createEmotion).toHaveBeenCalledWith('Stress', 'fear');
    expect(el.querySelector('pm-emotion-proposal')).toBeNull();
    expect(text(el.querySelector('.emotion-name'))).toBe('Stress');
    expect(TestBed.inject(ToastService).toasts().at(-1)?.message).toBe('Émotion « Stress » créée.');

    await press(fixture, input, 'Enter');
    expect(api.create!.mock.calls[0][1].feeling).toEqual({
      emotionCode: 'c_00aa11bb',
      intensity: 7,
    });
  });

  it('émotion déjà prise : 409 affiché sous la proposition', async () => {
    const { el, fixture } = await render({
      createEmotion: vi.fn().mockRejectedValue({ status: 409, code: 'EMOTION_LABEL_EXISTS' }),
    });
    await type(fixture, 'stress 7');
    const family = el.querySelector<HTMLSelectElement>('pm-emotion-proposal select')!;
    family.value = 'anger';
    family.dispatchEvent(new Event('change'));
    el.querySelector<HTMLButtonElement>('pm-emotion-proposal button.create')!.click();
    await settle(fixture);
    expect(text(el.querySelector('pm-emotion-proposal [role="alert"]'))).toBe(
      'Une émotion porte déjà ce libellé : tapez son nom ou son début.',
    );
  });

  it('enregistrement refusé (422 SESSION_REQUIRED) : message sous la barre, saisie conservée', async () => {
    const { el, input, fixture, saved } = await render({
      create: vi.fn().mockRejectedValue({
        status: 422,
        code: 'SESSION_REQUIRED',
        errors: [{ field: 'sessionId', code: 'SESSION_REQUIRED', message: 'Aucune séance.' }],
      }),
    });
    await type(fixture, 'semble plus détendu');
    await press(fixture, input, 'Enter');
    expect(text(el.querySelector('p.alert'))).toContain('Toute entrée appartient à une séance');
    expect(input.value).toBe('semble plus détendu');
    expect(saved).toEqual([]);
  });

  it('trois états : vocabulaire en erreur → Réessayer ; rail vide → « Aucune entrée récente à lier »', async () => {
    const { el, fixture, api } = await render({
      emotions: vi
        .fn()
        .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
        .mockResolvedValue(EMOTIONS),
      railCandidates: vi.fn().mockResolvedValue([]),
    });
    await type(fixture, 'anx 8');
    const error = el.querySelector('pm-capture-preview [role="alert"]');
    expect(text(error?.querySelector('.title') ?? null)).toBe('Impossible de charger les émotions');
    expect(text(el.querySelector('fieldset.rail [role="status"] .title'))).toBe(
      'Aucune entrée récente à lier',
    );
    error!.querySelector<HTMLButtonElement>('button.retry')!.click();
    await settle(fixture);
    expect(api.emotions).toHaveBeenCalledTimes(2);
    expect(text(el.querySelector('.emotion-name'))).toBe('Anxiété');
  });

  it('focus discret (arrivée sur un dossier créé) : champ focalisé, panneau replié jusqu’à la frappe', async () => {
    const { el, input, fixture } = await render();
    fixture.componentInstance.focus({ quiet: true });
    await settle(fixture);
    expect(document.activeElement).toBe(input);
    expect(el.querySelector('.panel')).toBeNull();
    await type(fixture, 'anx 8');
    expect(el.querySelector('.panel')).not.toBeNull();
  });

  it('focus ordinaire (Démarrer, Clôturer) : le panneau s’ouvre avec le focus', async () => {
    const { el, input, fixture } = await render();
    fixture.componentInstance.focus();
    await settle(fixture);
    expect(document.activeElement).toBe(input);
    expect(el.querySelector('.panel')).not.toBeNull();
  });

  it('écriture ailleurs dans le dossier (revision) : rail relu au focus suivant ; Échap replie le panneau', async () => {
    const { el, input, fixture, api } = await render();
    await type(fixture, 'anx 8');
    expect(api.railCandidates).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('revision', 1);
    await settle(fixture);
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await settle(fixture);
    expect(api.railCandidates).toHaveBeenCalledTimes(2);

    const escape = await press(fixture, input, 'Escape');
    expect(escape.defaultPrevented).toBe(true);
    expect(el.querySelector('.panel')).toBeNull();
    await type(fixture, 'anx 9');
    expect(el.querySelector('.panel')).not.toBeNull();
  });

  it('sa propre création ne périme pas le rail (déjà relu par le store) ; une écriture ailleurs, si', async () => {
    const { input, fixture, api } = await render();
    await type(fixture, 'semble plus détendu');
    await press(fixture, input, 'Enter');
    // Le store relit le rail après la création.
    await vi.waitFor(() => expect(api.railCandidates).toHaveBeenCalledTimes(2));
    // Le dossier répond à `saved` en avançant sa révision : pas de relecture de plus au focus.
    fixture.componentRef.setInput('revision', 1);
    await settle(fixture);
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await settle(fixture);
    expect(api.railCandidates).toHaveBeenCalledTimes(2);
    expect(api.emotions).toHaveBeenCalledOnce();

    fixture.componentRef.setInput('revision', 2);
    await settle(fixture);
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await settle(fixture);
    expect(api.railCandidates).toHaveBeenCalledTimes(3);
  });

  it('rail illisible : la cible du `>` est indisponible, Entrée ne crée rien (pas de lien perdu en silence)', async () => {
    const { el, input, fixture, api } = await render({
      railCandidates: vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' }),
    });
    await type(fixture, 'anx 8 > entretien');
    expect(text(el.querySelector('li.warning.blocking'))).toContain(
      "Les entrées à lier n'ont pas pu être chargées : réessayez, ou retirez « > ».",
    );
    await press(fixture, input, 'Enter');
    expect(api.create).not.toHaveBeenCalled();
    expect(text(el.querySelector('p.alert'))).toBe(
      "Rien n'est enregistré. Les entrées à lier n'ont pas pu être chargées : réessayez, ou retirez « > ».",
    );

    // Sans `>`, le rail illisible ne bloque pas.
    await type(fixture, 'anx 8');
    await press(fixture, input, 'Enter');
    expect(api.create).toHaveBeenCalledOnce();
  });

  it('catalogue des liens illisible : même blocage', async () => {
    const { input, fixture, api } = await render({
      linkTypes: vi.fn().mockRejectedValue({ status: 500, code: 'INTERNAL_ERROR' }),
    });
    await type(fixture, 'anx 8 > entretien');
    await press(fixture, input, 'Enter');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('composition en cours (IME, accents) : Entrée et Ctrl+S appartiennent à la saisie', async () => {
    const { input, fixture, api, opened } = await render();
    await type(fixture, 'semble plus détendu');
    await press(fixture, input, 'Enter', { isComposing: true });
    await press(fixture, input, 'Enter', { keyCode: 229 } as KeyboardEventInit);
    await press(fixture, input, 's', { ctrlKey: true, isComposing: true });
    expect(api.create).not.toHaveBeenCalled();
    expect(opened).toEqual([]);
  });

  it('Ctrl+S par la touche physique (code KeyS, autre disposition) ; rien pendant un enregistrement', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const { input, fixture, api, opened } = await render({
      create: vi.fn().mockImplementation(() => new Promise((done) => (resolve = done))),
    });
    await type(fixture, 'semble plus détendu');
    await press(fixture, input, 'ß', { ctrlKey: true, code: 'KeyS' });
    expect(api.create).toHaveBeenCalledOnce();
    expect(api.create!.mock.calls[0][1].status).toBe('draft');
    // Enregistrement en cours : Ctrl+Entrée et Entrée ne font rien.
    await press(fixture, input, 'Enter', { ctrlKey: true });
    await press(fixture, input, 'Enter');
    expect(opened).toEqual([]);
    expect(api.create).toHaveBeenCalledOnce();
    resolve({ id: 'e-new', type: 'note', status: 'draft', sessionId: 's-open' });
    await settle(fixture);
  });

  it('saisie modifiée pendant l’enregistrement : la barre la garde', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    const { input, fixture } = await render({
      create: vi.fn().mockImplementation(() => new Promise((done) => (resolve = done))),
    });
    await type(fixture, 'semble plus détendu');
    await press(fixture, input, 'Enter');
    input.value = 'semble plus détendu, sourit';
    input.dispatchEvent(new Event('input'));
    resolve({ id: 'e-new', type: 'note', status: 'final', sessionId: 's-open' });
    await settle(fixture);
    expect(input.value).toBe('semble plus détendu, sourit');
  });

  it('lecteurs d’écran : résumé court (role="status") après une pause, tout de suite si la saisie devient bloquée ; aria-controls vers le panneau', async () => {
    const { el, input, fixture } = await render();
    await type(fixture, "anx 8 n'a pas dormi > entretien");
    expect(input.getAttribute('aria-controls')).toBe('pm-capture-panel');
    expect(el.querySelector('#pm-capture-panel')?.getAttribute('tabindex')).toBe('-1');
    const status = el.querySelector('p.sr-only[role="status"]')!;
    expect(text(status)).toBe('');
    await new Promise((done) => setTimeout(done, 600));
    await fixture.whenStable();
    expect(text(status)).toBe('Ressenti, Anxiété 8 sur 10, lié à « Entretien annuel »');

    await type(fixture, 'anx 12');
    expect(text(status)).toBe("Ressenti, Anxiété, 1 point(s) à corriger avant d'enregistrer");
  });
});
