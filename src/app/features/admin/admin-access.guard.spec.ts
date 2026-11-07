import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';

import { SessionStore, SessionUser } from '../../core/auth';
import { SessionApi } from '../../core/auth/data/session.api';
import { adminTwoFactorGuard } from './admin-access.guard';

const admin: SessionUser = {
  id: 'a1',
  email: 'admin@example.test',
  displayName: 'Administrateur',
  profession: 'psychologist',
  verificationStatus: 'approved',
  role: 'admin',
  twoFactorEnabled: false,
  passwordChangeRequired: false,
};

function run(me: SessionUser): string | true {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: SessionApi, useValue: {} }],
  });
  TestBed.inject(SessionStore).signIn(me);
  const result = TestBed.runInInjectionContext(() =>
    adminTwoFactorGuard({} as never, { url: '/admin' } as never),
  );
  return result === true ? true : TestBed.inject(Router).serializeUrl(result as UrlTree);
}

describe('adminTwoFactorGuard (G Q5)', () => {
  it('administrateur sans 2FA : renvoyé à /premiere-connexion', () => {
    expect(run(admin)).toBe('/premiere-connexion');
  });

  it('administrateur avec 2FA : entre', () => {
    expect(run({ ...admin, twoFactorEnabled: true })).toBe(true);
  });
});
