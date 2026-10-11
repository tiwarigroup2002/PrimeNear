import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild, inject, effect } from '@angular/core';
import { Chart, ChartConfiguration, ChartType, registerables } from 'chart.js';
import { ThemeService } from '../../core/services/theme.service';

Chart.register(...registerables);

export const CHART_COLORS = ['#d70f64', '#2563eb', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#475569'];

/** Small Chart.js wrapper: <app-chart type="line" [labels]="..." [datasets]="..."/> */
@Component({
  selector: 'app-chart',
  template: `<div class="chart-box" [style.height.px]="height"><canvas #canvas></canvas></div>`,
})
export class ChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;
  @Input() type: ChartType = 'line';
  @Input() labels: (string | number)[] = [];
  @Input() datasets: ChartConfiguration['data']['datasets'] = [];
  @Input() height = 280;
  @Input() currency = false;
  @Input() legend = true;
  @Input() stacked = false;
  @Input() horizontal = false;
  private chart?: Chart;
  private theme = inject(ThemeService);

  constructor() {
    effect(() => {
      this.theme.theme();
      if (this.chart) this.render();
    });
  }

  ngAfterViewInit() { this.render(); }
  ngOnChanges() { if (this.canvas) this.render(); }
  ngOnDestroy() { this.chart?.destroy(); }

  private render() {
    this.chart?.destroy();
    const dark = this.theme.theme() === 'dark';
    const grid = dark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.06)';
    const text = dark ? '#adb5bd' : '#6c757d';
    const round = ['pie', 'doughnut', 'polarArea'].includes(this.type);
    const fmt = (v: any) => (this.currency ? '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : Number(v).toLocaleString('en-IN'));

    const datasets = this.datasets.map((d, i) => {
      const color = CHART_COLORS[i % CHART_COLORS.length];
      if (round) return { backgroundColor: CHART_COLORS, borderWidth: 1, ...d };
      return {
        borderColor: color,
        backgroundColor: this.type === 'line' ? color + '22' : color + 'cc',
        fill: this.type === 'line',
        tension: 0.3,
        pointRadius: this.labels.length > 40 ? 0 : 2,
        borderWidth: 2,
        borderRadius: this.type === 'bar' ? 4 : 0,
        ...d,
      };
    });

    this.chart = new Chart(this.canvas.nativeElement, {
      type: this.type,
      data: { labels: this.labels, datasets: datasets as any },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: this.horizontal ? 'y' : 'x',
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: this.legend, position: round ? 'right' : 'top', labels: { color: text, boxWidth: 12 } },
          tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label || ctx.label}: ${fmt(ctx.parsed?.y ?? ctx.parsed?.x ?? ctx.parsed)}` } },
        },
        scales: round
          ? {}
          : {
              x: { stacked: this.stacked, grid: { color: grid }, ticks: { color: text, maxRotation: 0, autoSkip: true, maxTicksLimit: 10, ...(this.horizontal ? { callback: (v: any) => fmt(v) } : {}) } },
              y: { stacked: this.stacked, beginAtZero: true, grid: { color: grid }, ticks: { color: text, ...(this.horizontal ? {} : { callback: (v: any) => fmt(v) }) } },
            },
      } as any,
    });
  }
}
