import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PasswordRulesComponent } from './password-rules.component';

function states(fixture: ComponentFixture<PasswordRulesComponent>): string[] {
  return [...(fixture.nativeElement as HTMLElement).querySelectorAll('li')].map(
    (li) => li.getAttribute('data-state') ?? '',
  );
}

function render(password: string) {
  const fixture = TestBed.createComponent(PasswordRulesComponent);
  fixture.componentRef.setInput('id', 'rules');
  fixture.componentRef.setInput('password', password);
  fixture.detectChanges();
  return fixture;
}

describe('PasswordRulesComponent', () => {
  it('vide : trois règles en attente, la troisième « vérifié à l’envoi »', () => {
    const fixture = render('');
    expect(states(fixture)).toEqual(['pending', 'pending', 'pending']);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain("vérifié à l'envoi");
  });

  it('au fil de la saisie : longueur puis casse cochées, texte lu par le lecteur d’écran', () => {
    const fixture = render('toutenminuscules');
    expect(states(fixture)).toEqual(['ok', 'pending', 'pending']);
    fixture.componentRef.setInput('password', 'Avec-Majuscule-2026');
    fixture.detectChanges();
    expect(states(fixture)).toEqual(['ok', 'ok', 'pending']);
    expect((fixture.nativeElement as HTMLElement).querySelector('.sr-only')?.textContent).toBe(
      'règle respectée',
    );
  });

  it('422 PASSWORD_POLICY : la règle fautive passe en erreur avec le message du serveur, jusqu’à la prochaine saisie', () => {
    const fixture = render('Mot-De-Passe-Compromis-1');
    fixture.componentRef.setInput('problems', [
      { field: 'password', code: 'PASSWORD_COMPROMISED', message: 'Mot de passe trop courant.' },
      { field: 'password', code: 'PASSWORD_CASE', message: 'Casse insuffisante.' },
    ]);
    fixture.detectChanges();
    expect(states(fixture)).toEqual(['ok', 'ko', 'ko']);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Mot de passe trop courant.',
    );
    fixture.componentRef.setInput('password', 'Mot-De-Passe-Compromis-12');
    fixture.detectChanges();
    expect(states(fixture)).toEqual(['ok', 'ok', 'pending']);
  });
});
