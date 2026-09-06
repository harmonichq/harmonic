// Compatibility entry: one bundled ECharts identity on window for the chart
// modules that still read the global.
import * as echarts from 'echarts';

window.echarts = echarts;
