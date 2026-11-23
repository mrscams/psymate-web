// expect: no-restricted-imports
// Fichier du paquet initial qui reprend le barrel de shared/ui (M16-09B) : refusé.
import { AppBarComponent } from './shared/ui';

export const shell = AppBarComponent;
