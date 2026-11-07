import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SessionStore, SessionUser } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { SecurityApi } from '../data/security.api';
import { groupSecret, TwoFactorSetupComponent } from './two-factor-setup.component';

const claire: SessionUser = {
  id: '1',
  email: 'claire@example.test',
  displayName: 'Claire',
  profession: 'psychologist',
  verificationStatus: 'approved',
  role: 'practitioner',
  twoFactorEnabled: false,
  passwordChangeRequired: false,
};

const ENROLLMENT = {
  secret: 'JBSWY3DPEHPK3PXP7Q4MN5A2KZ6RH3LT',
  otpauthUri:
    'otpauth://totp/PsyMate:claire@example.test?secret=JBSWY3DPEHPK3PXP7Q4MN5A2KZ6RH3LT&issuer=PsyMate',
};
const CODES = Array.from({ length: 10 }, (_, i) => `${String(i).repeat(5)}-ABCDE`);

async function render(api: Partial<SecurityApi>) {
  TestBed.configureTestingModule({
    imports: [TwoFactorSetupComponent],
    providers: [
      { provide: SecurityApi, useValue: api },
      {
        provide: SessionApi,
        useValue: { me: vi.fn().mockResolvedValue({ ...claire, twoFactorEnabled: true }) },
      },
    ],
  });
  TestBed.inject(SessionStore).signIn(claire);
  const fixture = TestBed.createComponent(TwoFactorSetupComponent);
  await settle(fixture);
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

function button(el: HTMLElement, text: string): HTMLButtonElement {
  const found = [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  if (!found) throw new Error(`bouton absent : ${text}`);
  return found;
}

function current(el: HTMLElement): string {
  return el.querySelector('.stepper [aria-current=step]')?.textContent?.trim() ?? '';
}

describe('groupSecret', () => {
  it('groupe le secret Base32 par 4', () => {
    expect(groupSecret('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
  });
});

describe('TwoFactorSetupComponent', () => {
  it('chargement : enable appelé à l’ouverture, squelette, étape 1 courante', async () => {
    const enableTwoFactor = vi.fn(() => new Promise<never>(() => undefined));
    const { el } = await render({ enableTwoFactor });
    expect(enableTwoFactor).toHaveBeenCalledTimes(1);
    expect(el.querySelector('pm-state [aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('svg[role=img]')).toBeNull();
    expect(current(el)).toContain('Scanner le QR');
  });

  it('erreur de enable : bloc erreur avec Réessayer qui rappelle enable', async () => {
    const enableTwoFactor = vi
      .fn()
      .mockRejectedValueOnce({ status: 500, code: 'INTERNAL_ERROR' })
      .mockResolvedValueOnce(ENROLLMENT);
    const { fixture, el } = await render({ enableTwoFactor });
    expect(el.querySelector('pm-state [role=alert]')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('pm-state button')?.click();
    await settle(fixture);
    expect(enableTwoFactor).toHaveBeenCalledTimes(2);
    expect(el.querySelector('svg[role=img]')).not.toBeNull();
  });

  it('QR + secret groupé, Continuer → champ code (one-time-code) ; code faux → message unique ; code juste → 10 codes, saved', async () => {
    const verifyTwoFactor = vi
      .fn()
      .mockRejectedValueOnce({
        status: 422,
        code: 'VALIDATION_FAILED',
        errors: [{ field: 'code', code: 'INVALID_CODE', message: 'serveur' }],
      })
      .mockResolvedValueOnce(CODES);
    const { fixture, el } = await render({
      enableTwoFactor: vi.fn().mockResolvedValue(ENROLLMENT),
      verifyTwoFactor,
    });
    expect(el.querySelector('svg[role=img]')?.getAttribute('aria-label')).toContain('QR code');
    expect(el.querySelector('.secret code')?.textContent).toBe(groupSecret(ENROLLMENT.secret));

    button(el, 'Continuer').click();
    await settle(fixture);
    expect(current(el)).toContain('Saisir le code');
    const input = el.querySelector<HTMLInputElement>('input.otp');
    expect(input?.getAttribute('autocomplete')).toBe('one-time-code');
    expect(input?.getAttribute('inputmode')).toBe('numeric');
    expect(el.querySelector('label')?.getAttribute('for')).toBe(input?.id);

    input!.value = '000000';
    input!.dispatchEvent(new Event('input'));
    button(el, 'Vérifier').click();
    await settle(fixture);
    expect(verifyTwoFactor).toHaveBeenCalledWith('000000');
    expect(el.querySelector('.field-error[role=alert]')?.textContent).toBe(
      "Ce code n'est pas valide ou a déjà été utilisé.",
    );
    expect(current(el)).toContain('Saisir le code');

    const saved: boolean[] = [];
    fixture.componentInstance.saved.subscribe((v) => saved.push(v));
    input!.value = '123456';
    input!.dispatchEvent(new Event('input'));
    button(el, 'Vérifier').click();
    await settle(fixture);
    expect(current(el)).toContain('Codes de secours');
    expect(el.querySelectorAll('pm-recovery-codes li')).toHaveLength(10);
    expect(el.querySelector('.secret')).toBeNull();
    const checkbox = el.querySelector<HTMLInputElement>('input[type=checkbox]');
    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event('change'));
    expect(saved).toEqual([true]);
  });

  it('423 : verrou affiché avec le délai, Vérifier désactivé', async () => {
    const { fixture, el } = await render({
      enableTwoFactor: vi.fn().mockResolvedValue(ENROLLMENT),
      verifyTwoFactor: vi
        .fn()
        .mockRejectedValue({ status: 423, code: 'ACCOUNT_LOCKED', retryAfterSeconds: 90 }),
    });
    button(el, 'Continuer').click();
    await settle(fixture);
    const input = el.querySelector<HTMLInputElement>('input.otp')!;
    input.value = '000000';
    input.dispatchEvent(new Event('input'));
    button(el, 'Vérifier').click();
    await settle(fixture);
    expect(el.querySelector('pm-lock-notice [role=alert]')?.textContent).toMatch(
      /Réessayez dans 1:[23]\d/,
    );
    expect(button(el, 'Vérifier').disabled).toBe(true);
  });
});
