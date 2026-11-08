import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { EntryType } from '../../../shared/ui';
import { CANDIDATES, candidate, EMOTIONS, LINK_TYPES } from '../data/entry.fixtures';
import { LinkCandidate, RailLink } from '../data/entry.model';
import { candidateName, LinkRailComponent } from './link-rail.component';

@Component({
  selector: 'pm-test-rail-host',
  imports: [ReactiveFormsModule, LinkRailComponent],
  template: `<pm-link-rail
    [formControl]="control"
    [candidates]="candidates()"
    [linkTypes]="types"
    [entryType]="entryType()"
    [emotions]="emotions"
  />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly control = new FormControl<RailLink[]>([], { nonNullable: true });
  readonly candidates = signal<LinkCandidate[]>(CANDIDATES);
  readonly entryType = signal<EntryType>('feeling');
  readonly types = LINK_TYPES;
  readonly emotions = EMOTIONS;
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const rows = () => Array.from(element.querySelectorAll<HTMLElement>('.row'));
  const row = (name: string) => rows().find((item) => item.textContent?.includes(name))!;
  return { fixture, host: fixture.componentInstance, element, rows, row };
}

const text = (element: Element | null | undefined) =>
  (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('LinkRailComponent', () => {
  it('une case avec label par cible, nom, contexte et type proposé par la matrice (pointillé)', () => {
    const { rows, row } = setup();
    expect(rows()).toHaveLength(3);
    const event = row('Entretien annuel');
    const box = event.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(event.querySelector(`label[for="${box.id}"]`)).not.toBeNull();
    expect(text(event.querySelector('.meta'))).toMatch(/^Événement · /);
    const select = event.querySelector<HTMLSelectElement>('select')!;
    expect(select.getAttribute('aria-label')).toBe('Type de lien avec « Entretien annuel »');
    expect(text(select.selectedOptions[0])).toBe('déclenché par');
    expect(select.classList.contains('confirmed')).toBe(false);
    // Ressenti sans titre : émotion du vocabulaire et intensité ; situation en cours signalée.
    expect(row('Anxiété 6/10')).toBeDefined();
    expect(text(row('Surcharge au travail').querySelector('.meta'))).toContain('en cours');
  });

  it('cocher (Espace sur la case = clic natif) pose le type proposé ; décocher le retire', () => {
    const { fixture, host, row } = setup();
    const box = row('Entretien annuel').querySelector<HTMLInputElement>('input')!;
    box.click();
    fixture.detectChanges();
    expect(host.control.value).toEqual([
      { targetId: 'c-event', linkType: 'triggers', direction: 'incoming' },
    ]);
    expect(row('Entretien annuel').classList.contains('checked')).toBe(true);
    expect(row('Entretien annuel').querySelector('select')!.classList.contains('confirmed')).toBe(
      true,
    );
    box.click();
    fixture.detectChanges();
    expect(host.control.value).toEqual([]);
  });

  it('changer le type confirme le lien avec ce type (sens compris)', () => {
    const { fixture, host, row } = setup();
    const select = row('Entretien annuel').querySelector<HTMLSelectElement>('select')!;
    const options = Array.from(select.options).map((option) => text(option));
    const index = options.indexOf('est causé par');
    select.value = String(index);
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.control.value).toEqual([
      { targetId: 'c-event', linkType: 'caused_by', direction: 'outgoing' },
    ]);
    expect(row('Entretien annuel').querySelector<HTMLInputElement>('input')!.checked).toBe(true);
  });

  it('valeur écrite par le formulaire (brouillon) : case cochée, type rendu', () => {
    const { fixture, host, row } = setup();
    host.control.setValue([{ targetId: 'c-event', linkType: 'follows', direction: 'incoming' }]);
    fixture.detectChanges();
    const event = row('Entretien annuel');
    expect(event.querySelector<HTMLInputElement>('input')!.checked).toBe(true);
    expect(text(event.querySelector<HTMLSelectElement>('select')!.selectedOptions[0])).toBe(
      'suivi de',
    );
  });

  it('une cible sans type permis n’est pas proposée', () => {
    const { fixture, host, rows } = setup();
    host.candidates.set([candidate({ id: 'c-session', type: 'session', title: null })]);
    host.entryType.set('medication');
    fixture.detectChanges();
    expect(rows()).toHaveLength(0);
  });

  it('candidateName : titre, sinon émotion et intensité, sinon type', () => {
    expect(candidateName(candidate(), EMOTIONS)).toBe('Entretien annuel');
    expect(
      candidateName(
        candidate({ type: 'feeling', title: null, emotionCode: 'anger', intensity: 3 }),
        EMOTIONS,
      ),
    ).toBe('Colère 3/10');
    expect(candidateName(candidate({ type: 'note', title: null }), EMOTIONS)).toBe('Note');
  });
});
