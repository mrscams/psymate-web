import { TestBed } from '@angular/core/testing';

import { SessionStore, SessionUser } from '../../../core/auth';
import { SessionApi } from '../../../core/auth/data/session.api';
import { ConfirmDialogService, SidePanelService } from '../../../shared/ui';
import { SecurityApi } from '../data/security.api';
import { TwoFactorPanel, TwoFactorPanelResult } from './two-factor.panel';

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

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const escape = () =>
  document.body.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }),
  );

describe('TwoFactorPanel', () => {
  let confirm: ReturnType<typeof vi.fn>;
  let panels: SidePanelService;

  beforeEach(() => {
    confirm = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: ConfirmDialogService, useValue: { confirm } },
        { provide: SessionApi, useValue: {} },
        {
          provide: SecurityApi,
          useValue: { enableTwoFactor: vi.fn(() => new Promise<never>(() => undefined)) },
        },
      ],
    });
    TestBed.inject(SessionStore).signIn(claire);
    panels = TestBed.inject(SidePanelService);
  });

  afterEach(async () => {
    panels.closeAll();
    await tick();
    document.querySelectorAll('.cdk-overlay-container').forEach((n) => n.remove());
  });

  it('Échap demande confirmation (secret en attente) : refusée, le panneau reste ; acceptée, il se ferme', async () => {
    const ref = panels.open<TwoFactorPanel, undefined, TwoFactorPanelResult>(TwoFactorPanel);
    await tick();
    await tick();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    confirm.mockResolvedValueOnce(false);
    escape();
    await tick();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0].title).toContain("Abandonner l'activation");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    confirm.mockResolvedValueOnce(true);
    escape();
    await tick();
    await tick();
    expect(confirm).toHaveBeenCalledTimes(2);
    await expect(ref?.closed).resolves.toBeUndefined();
  });

  it('Annuler passe par la même confirmation', async () => {
    panels.open(TwoFactorPanel);
    await tick();
    confirm.mockResolvedValueOnce(false);
    const cancel = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
      (b) => b.textContent?.trim() === 'Annuler',
    );
    cancel?.click();
    await tick();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});
