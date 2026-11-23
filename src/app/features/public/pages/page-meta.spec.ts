import { DOCUMENT, PlatformLocation } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { PublicMeta } from './page-meta';

/** Au prérendu (plateforme serveur), les liens restent relatifs : on lit les chemins seuls. */
function links(baseHref: string) {
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'server' },
      { provide: PlatformLocation, useValue: { getBaseHrefFromDOM: () => baseHref } },
    ],
  });
  TestBed.inject(PublicMeta).apply({
    description: 'Comment ça marche',
    robots: 'index,follow',
    canonicalPath: '/comment-ca-marche',
  });
  const head = TestBed.inject(DOCUMENT).head;
  const result = {
    canonical: head.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    alternates: [...head.querySelectorAll('link[rel="alternate"]')].map((link) => [
      link.getAttribute('hreflang'),
      link.getAttribute('href'),
    ]),
  };
  head.querySelectorAll('[data-pm-public-meta]').forEach((node) => node.remove());
  return result;
}

describe('PublicMeta : URL canonique et alternatives de langue (M16-08, M16-29, G Q80)', () => {
  const ALTERNATES = [
    ['fr', '/fr/comment-ca-marche'],
    ['en', '/en/comment-ca-marche'],
    ['ar', '/ar/comment-ca-marche'],
  ];

  it.each([
    ['/fr/', '/fr/comment-ca-marche'],
    ['/en/', '/en/comment-ca-marche'],
    ['/ar/', '/ar/comment-ca-marche'],
    ['/ar', '/ar/comment-ca-marche'],
    ['/app/ar/', '/app/ar/comment-ca-marche'],
  ])('base %s : canonique %s, alternatives fr, en et ar', (base, canonical) => {
    const alternates = base.startsWith('/app/')
      ? ALTERNATES.map(([locale, href]) => [locale, `/app${href}`])
      : ALTERNATES;
    expect(links(base)).toEqual({ canonical, alternates });
  });

  it('base sans langue : canonique en français', () => {
    expect(links('/').canonical).toBe('/fr/comment-ca-marche');
  });
});
