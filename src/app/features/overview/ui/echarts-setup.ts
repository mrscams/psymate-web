// ECharts en modules (fiche 02, C2 M4-05) : seulement ce que la courbe de tendance utilise, avec le
// rendu SVG. Ce fichier n'est importé que dynamiquement (loadTrendRenderer) : ECharts reste hors
// du bundle initial et du morceau de la page.
import { LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { init, use } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';

use([LineChart, ScatterChart, GridComponent, MarkLineComponent, TooltipComponent, SVGRenderer]);

export function createChart(element: HTMLElement) {
  return init(element, undefined, { renderer: 'svg' });
}
