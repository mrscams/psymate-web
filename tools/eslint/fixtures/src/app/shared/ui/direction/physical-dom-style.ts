// expect: psymate/no-physical-direction
// Violation : écriture DOM d'une position physique.
export function place(element: HTMLElement, x: number): void {
  element.style.left = `${x}px`;
}
