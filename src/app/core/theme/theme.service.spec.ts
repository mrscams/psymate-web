import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme.service';

interface FakeMedia {
  matches: boolean;
  listeners: ((event: { matches: boolean }) => void)[];
  addEventListener: (type: string, cb: (event: { matches: boolean }) => void) => void;
  removeEventListener: (type: string, cb: (event: { matches: boolean }) => void) => void;
}

function fakeMatchMedia(dark: boolean): FakeMedia {
  const media: FakeMedia = {
    matches: dark,
    listeners: [],
    addEventListener: (_type, cb) => media.listeners.push(cb),
    removeEventListener: (_type, cb) => {
      media.listeners = media.listeners.filter((listener) => listener !== cb);
    },
  };
  // jsdom n'a pas matchMedia : on le pose sur la fenêtre du document (celle que lit le service).
  Object.defineProperty(document.defaultView, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue(media as unknown as MediaQueryList),
  });
  return media;
}

describe('ThemeService', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
    vi.restoreAllMocks();
    delete (document.defaultView as unknown as { matchMedia?: unknown }).matchMedia;
  });

  it('suit la préférence système par défaut et pose data-theme sur <html>', () => {
    const media = fakeMatchMedia(true);
    const service = TestBed.inject(ThemeService);
    expect(service.preference()).toBe('system');
    expect(service.resolved()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    media.matches = false;
    media.listeners.forEach((listener) => listener({ matches: false }));
    expect(service.resolved()).toBe('light');
    // Sans rechargement : <html> suit le système, pas seulement le signal.
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    media.matches = true;
    media.listeners.forEach((listener) => listener({ matches: true }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('un choix manuel ignore les changements du système, system les suit de nouveau', () => {
    const media = fakeMatchMedia(false);
    const service = TestBed.inject(ThemeService);
    service.set('soft');

    media.matches = true;
    media.listeners.forEach((listener) => listener({ matches: true }));
    expect(service.resolved()).toBe('soft');
    expect(document.documentElement.getAttribute('data-theme')).toBe('soft');

    // Le système a changé pendant le choix manuel : revenir à system prend la valeur courante.
    service.set('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('écoute prefers-color-scheme: dark et se désabonne à la destruction', () => {
    const media = fakeMatchMedia(false);
    TestBed.inject(ThemeService);
    expect(window.matchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    expect(media.listeners).toHaveLength(1);
    TestBed.resetTestingModule();
    expect(media.listeners).toHaveLength(0);
  });

  it('refresh() relit le système et réapplique', () => {
    const media = fakeMatchMedia(false);
    const service = TestBed.inject(ThemeService);
    media.matches = true;
    service.refresh();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('sans matchMedia (rendu serveur, vieux navigateur) : clair par défaut', () => {
    delete (document.defaultView as unknown as { matchMedia?: unknown }).matchMedia;
    const service = TestBed.inject(ThemeService);
    expect(service.resolved()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    service.set('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it.each(['light', 'soft', 'dark'] as const)('set(%s) applique le thème demandé', (theme) => {
    fakeMatchMedia(true);
    const service = TestBed.inject(ThemeService);
    service.set(theme);
    expect(service.resolved()).toBe(theme);
    expect(document.documentElement.getAttribute('data-theme')).toBe(theme);
  });

  it('system après un choix manuel revient à la préférence du système', () => {
    fakeMatchMedia(false);
    const service = TestBed.inject(ThemeService);
    service.set('dark');
    service.set('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('ignore une valeur inconnue', () => {
    fakeMatchMedia(false);
    const service = TestBed.inject(ThemeService);
    service.set('sepia' as never);
    expect(service.preference()).toBe('system');
  });
});
