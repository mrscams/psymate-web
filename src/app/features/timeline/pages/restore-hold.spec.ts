import { RESTORE_HOLD_MS, RestoreHold } from './restore-hold';

function setup() {
  let now = 1_000;
  const hold = new RestoreHold(() => now);
  const toolbar = document.createElement('div');
  const button = document.createElement('button');
  toolbar.append(button);
  const list = document.createElement('div');
  const card = document.createElement('article');
  card.tabIndex = 0;
  list.append(card);
  document.body.append(toolbar, list);
  const unlisten = hold.listen(list, document);
  return {
    hold,
    button,
    list,
    card,
    advance: (ms: number) => (now += ms),
    cleanup: () => {
      unlisten();
      toolbar.remove();
      list.remove();
    },
  };
}

describe('RestoreHold (position tenue au retour sur l’onglet)', () => {
  it('sans geste : un défilement non demandé est ramené à la position rangée', () => {
    const { hold, cleanup } = setup();
    expect(hold.correction(500)).toBeNull();
    hold.hold(43_200);
    expect(hold.offset).toBe(43_200);
    expect(hold.correction(0)).toBe(43_200);
    expect(hold.correction(43_200.5)).toBeNull();
    cleanup();
  });

  it('libérée au premier geste sur la liste (molette, pointeur, toucher)', () => {
    for (const type of ['wheel', 'pointerdown', 'touchstart']) {
      const { hold, list, cleanup } = setup();
      hold.hold(800);
      list.dispatchEvent(new Event(type, { bubbles: true }));
      expect(hold.offset).toBeNull();
      expect(hold.correction(0)).toBeNull();
      cleanup();
    }
  });

  it('libérée au clavier pressé hors de la liste (Tab depuis la barre d’outils) et au focus qui entre dans la liste', () => {
    const { hold, button, card, cleanup } = setup();
    hold.hold(800);
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(hold.offset).toBeNull();

    hold.hold(800);
    card.focus();
    expect(document.activeElement).toBe(card);
    expect(hold.offset).toBeNull();
    // La carte focalisée hors écran peut donc être amenée à l'écran.
    expect(hold.correction(1_600)).toBeNull();
    cleanup();
  });

  it('plafond de 3 s : au-delà, plus rien n’est tenu', () => {
    const { hold, advance, cleanup } = setup();
    hold.hold(800);
    advance(RESTORE_HOLD_MS);
    expect(hold.correction(0)).toBe(800);
    advance(1);
    expect(hold.offset).toBeNull();
    expect(hold.correction(0)).toBeNull();
    cleanup();
  });

  it('listen rend une fonction qui retire les écouteurs', () => {
    const { hold, button, cleanup } = setup();
    cleanup();
    hold.hold(800);
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(hold.offset).toBe(800);
  });
});
