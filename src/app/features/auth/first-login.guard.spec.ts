import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';

import { SessionStore, SessionUser } from '../../core/auth';
import { SessionApi } from '../../core/auth/data/session.api';
import { firstLoginGuard } from './first-login.guard';

const base: SessionUser = {
  id: '1',
  email: 'x@example.test',
  displayName: 'X',
  profession: 'psychologist',
  verificationStatus: 'approved',
  role: 'practitioner',
  twoFactorEnabled: false,
  passwordChangeRequired: false,
};

function run(me: SessionUser | null): string | true {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: SessionApi, useValue: {} }],
  });
  if (me) TestBed.inject(SessionStore).signIn(me);
  const result = TestBed.runInInjectionContext(() =>
    firstLoginGuard({} as never, { url: '/premiere-connexion' } as never),
  );
  return result === true ? true : TestBed.inject(Router).serializeUrl(result as UrlTree);
}

describe('firstLoginGuard (fiche 18 C)', () => {
  it('sans session : la page s’ouvre (403 PASSWORD_CHANGE_REQUIRED au login)', () => {
    expect(run(null)).toBe(true);
  });

  it('mot de passe à usage unique à remplacer : la page s’ouvre', () => {
    expect(run({ ...base, role: 'admin', passwordChangeRequired: true })).toBe(true);
  });

  it('administrateur sans 2FA : la page s’ouvre (étape 2)', () => {
    expect(run({ ...base, role: 'admin' })).toBe(true);
  });

  it('administrateur équipé : /admin', () => {
    expect(run({ ...base, role: 'admin', twoFactorEnabled: true })).toBe('/admin');
  });

  it('praticien sans obligation : /patients', () => {
    expect(run(base)).toBe('/patients');
  });
});
