import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { RailSection, RecordRailComponent } from './record-rail.component';

const SECTIONS: RailSection[] = [
  { id: 'identite', label: 'Identité', count: '4 champs', countSuffix: 'renseignés' },
  { id: 'contexte', label: 'Contexte', count: '', countSuffix: 'champs renseignés' },
  { id: 'drapeaux', label: 'Drapeaux', count: '1 posé', countSuffix: '' },
  { id: 'archivage', label: 'Archivage', count: '', countSuffix: '', quiet: true },
];

@Component({
  imports: [RecordRailComponent],
  template: `
    <form id="f" (submit)="submitted.set(submitted() + 1); $event.preventDefault()"></form>
    <pm-record-rail
      [sections]="sections"
      [current]="current()"
      href="/fr/patients/p/fiche"
      formId="f"
      saveLabel="Enregistrer"
      cancelLabel="Annuler les modifications"
      [disabled]="disabled()"
      [cancelDisabled]="false"
      note="1 champ modifié · chaque enregistrement crée une version horodatée."
      (navigate)="navigated.set($event)"
      (discard)="cancelled.set(true)"
    >
      <p class="projected">Aperçu</p>
    </pm-record-rail>
  `,
})
class HostComponent {
  readonly sections = SECTIONS;
  readonly current = signal<string | null>('identite');
  readonly disabled = signal(false);
  readonly navigated = signal<string | null>(null);
  readonly cancelled = signal(false);
  readonly submitted = signal(0);
}

async function render() {
  const fixture = TestBed.createComponent(HostComponent);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('RecordRailComponent', () => {
  it('aperçu projeté, liens-ancres avec décompte, section courante, Enregistrer relié au formulaire', async () => {
    const { el } = await render();
    expect(el.querySelector('.preview-slot .projected')?.textContent).toBe('Aperçu');
    const nav = el.querySelector('nav')!;
    expect(nav.getAttribute('aria-label')).toBe('Sections de la fiche');
    const links = [...nav.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/fr/patients/p/fiche#identite',
      '/fr/patients/p/fiche#contexte',
      '/fr/patients/p/fiche#drapeaux',
      '/fr/patients/p/fiche#archivage',
    ]);
    // Nom accessible : libellé, espace, décompte, fin pour les lecteurs d'écran.
    expect(links.map((a) => a.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Identité 4 champs renseignés',
      'Contexte',
      'Drapeaux 1 posé',
      'Archivage',
    ]);
    expect(links[0].querySelector('.sr-only')?.textContent?.trim()).toBe('renseignés');
    expect(links[0].getAttribute('aria-current')).toBe('true');
    expect(links[1].getAttribute('aria-current')).toBeNull();
    expect(links[3].classList).toContain('quiet');
    const save = el.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(save.getAttribute('form')).toBe('f');
    expect(save.textContent).toContain('Enregistrer');
    expect(save.querySelector('kbd')?.textContent).toBe('Ctrl+↵');
    expect(el.querySelector('.note')?.textContent).toContain('1 champ modifié');
  });

  it('lien suivi : navigate (le défilement est à la page) ; clic avec Ctrl laissé au navigateur', async () => {
    const { fixture, host, el } = await render();
    const link = el.querySelectorAll('a')[2];
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(host.navigated()).toBe('drapeaux');
    host.navigated.set(null);
    const newTab = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    link.dispatchEvent(newTab);
    expect(host.navigated()).toBeNull();
    newTab.preventDefault();
    host.current.set('drapeaux');
    fixture.detectChanges();
    expect(link.getAttribute('aria-current')).toBe('true');
  });

  it('Enregistrer soumet le formulaire relié ; inactif quand disabled ; Annuler émis', async () => {
    const { fixture, host, el } = await render();
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    expect(host.submitted()).toBe(1);
    el.querySelector<HTMLButtonElement>('button.ghost')!.click();
    expect(host.cancelled()).toBe(true);
    host.disabled.set(true);
    fixture.detectChanges();
    expect(el.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  });
});
