import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  convertToParamMap,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';

import { authGuard, guestGuard } from './auth.guard';
import { SessionApi } from './data/session.api';
import { roleGuard } from './role.guard';
import { SessionUser } from './session.model';
import { SessionStore } from './session.store';
import { statusGuard } from './status.guard';

const practitioner: SessionUser = {
  id: '1',
  email: 'claire@example.test',
  displayName: 'Claire',
  profession: 'psychologist',
  verificationStatus: 'approved',
  role: 'practitioner',
  twoFactorEnabled: false,
  passwordChangeRequired: false,
};

function run(
  guard: CanActivateFn,
  me: SessionUser | null,
  url: string,
  next?: string,
): string | true {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: SessionApi, useValue: {} }],
  });
  if (me) TestBed.inject(SessionStore).signIn(me);
  const route = {
    queryParamMap: convertToParamMap(next ? { next } : {}),
  } as ActivatedRouteSnapshot;
  const state = { url } as RouterStateSnapshot;
  const result = TestBed.runInInjectionContext(() => guard(route, state));
  if (result === true) return true;
  return TestBed.inject(Router).serializeUrl(result as UrlTree);
}

describe('authGuard', () => {
  it('laisse passer un compte connecté', () => {
    expect(run(authGuard, practitioner, '/patients')).toBe(true);
  });

  it('sans session : /connexion?next=<route demandée>', () => {
    expect(run(authGuard, null, '/patients')).toBe('/connexion?next=%2Fpatients');
  });
});

describe('guestGuard (/connexion)', () => {
  it('laisse passer sans session', () => {
    expect(run(guestGuard, null, '/connexion')).toBe(true);
  });

  it('déjà connecté : triage, ?next= conservé', () => {
    expect(run(guestGuard, practitioner, '/connexion', '/patients/7')).toBe('/patients/7');
  });

  it('déjà connecté, sans ?next= : accueil du rôle', () => {
    expect(run(guestGuard, practitioner, '/connexion')).toBe('/patients');
  });
});

describe("roleGuard('admin')", () => {
  it('un administrateur passe', () => {
    expect(run(roleGuard('admin'), { ...practitioner, role: 'admin' }, '/admin')).toBe(true);
  });

  it('un praticien est renvoyé vers /patients', () => {
    expect(run(roleGuard('admin'), practitioner, '/admin')).toBe('/patients');
  });

  it('sans session : /connexion?next=', () => {
    expect(run(roleGuard('admin'), null, '/admin/journal')).toBe(
      '/connexion?next=%2Fadmin%2Fjournal',
    );
  });
});

describe('statusGuard', () => {
  it.each([
    [{ verificationStatus: 'approved' }, true],
    [{ verificationStatus: 'docs_pending' }, true],
    [{ verificationStatus: 'email_pending' }, '/confirmer-email'],
    [{ verificationStatus: 'rejected' }, '/compte-suspendu'],
    [{ verificationStatus: 'suspended' }, '/compte-suspendu'],
    [{ passwordChangeRequired: true }, '/premiere-connexion'],
  ] as [Partial<SessionUser>, string | true][])('%o → %s', (overrides, expected) => {
    expect(run(statusGuard, { ...practitioner, ...overrides }, '/patients')).toBe(expected);
  });

  it('sans session, laisse authGuard décider', () => {
    expect(run(statusGuard, null, '/patients')).toBe(true);
  });
});
