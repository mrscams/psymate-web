// cytoscape-cose-bilkent 4.1.0 ne publie pas de types : l'extension de layout (cytoscape.use) suffit.
declare module 'cytoscape-cose-bilkent' {
  import type { Ext } from 'cytoscape';

  const coseBilkent: Ext;
  export default coseBilkent;
}
