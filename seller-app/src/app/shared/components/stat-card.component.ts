import { Component, Input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-stat-card',
  imports: [DecimalPipe, RouterLink],
  template: `
    <div class="card stat-card h-100" [class.clickable]="link" [routerLink]="link || null">
      <div class="card-body d-flex align-items-center gap-3">
        <div class="stat-icon bg-{{ color }}-subtle text-{{ color }}"><i class="bi {{ icon }}"></i></div>
        <div class="flex-grow-1 min-w-0">
          <div class="text-muted small text-truncate">{{ label }}</div>
          <div class="fs-4 fw-semibold text-truncate">{{ value }}</div>
          @if (change !== null && change !== undefined) {
            <div class="small" [class.text-success]="change >= 0" [class.text-danger]="change < 0">
              <i class="bi" [class.bi-arrow-up-right]="change >= 0" [class.bi-arrow-down-right]="change < 0"></i>
              {{ change | number: '1.0-1' }}% <span class="text-muted">{{ changeLabel }}</span>
            </div>
          } @else if (hint) {
            <div class="small text-muted text-truncate">{{ hint }}</div>
          }
        </div>
      </div>
    </div>
  `,
})
export class StatCardComponent {
  @Input() label = '';
  @Input() value: string | number | null = '';
  @Input() icon = 'bi-graph-up';
  @Input() color: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'secondary' = 'primary';
  @Input() change: number | null = null;
  @Input() changeLabel = 'vs previous period';
  @Input() hint = '';
  @Input() link: string | null = null;
}
