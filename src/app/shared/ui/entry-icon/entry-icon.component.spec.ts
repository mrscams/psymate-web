import { TestBed } from '@angular/core/testing';

import { ENTRY_TYPES, EntryIconComponent, entryTypeLabel } from './entry-icon.component';

describe('EntryIconComponent', () => {
  async function render(type: string, labelled = false) {
    TestBed.configureTestingModule({ imports: [EntryIconComponent] });
    const fixture = TestBed.createComponent(EntryIconComponent);
    fixture.componentRef.setInput('type', type);
    fixture.componentRef.setInput('labelled', labelled);
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector('svg') as SVGElement;
  }

  it.each(ENTRY_TYPES)(
    '%s : une forme, la classe de couleur, décorative par défaut',
    async (type) => {
      const svg = await render(type);
      expect(svg.classList.contains(`type-${type}`)).toBe(true);
      expect(svg.children.length).toBeGreaterThan(0);
      expect(svg.getAttribute('aria-hidden')).toBe('true');
      expect(svg.getAttribute('role')).toBeNull();
      TestBed.resetTestingModule();
    },
  );

  it('les six formes sont distinctes', async () => {
    const shapes = new Set<string>();
    for (const type of ENTRY_TYPES) {
      shapes.add((await render(type)).innerHTML.replace(/\s+/g, ' ').trim());
      TestBed.resetTestingModule();
    }
    expect(shapes.size).toBe(6);
  });

  it('labelled : role img avec le nom du type', async () => {
    const svg = await render('feeling', true);
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Ressenti');
    expect(svg.getAttribute('aria-hidden')).toBeNull();
    expect(entryTypeLabel('medication')).toBe('Médicament');
  });
});
