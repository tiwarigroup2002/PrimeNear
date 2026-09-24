import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-page-header',
  imports: [RouterLink],
  template: `
    <div class="page-header">
      <div>
        @if (back) {
          <a [routerLink]="back" class="text-decoration-none small text-muted"><i class="bi bi-arrow-left"></i> {{ backLabel }}</a>
        }
        <h1 class="page-title">
          @if (icon) { <i class="bi {{ icon }} me-2 text-primary"></i> }{{ title }}
        </h1>
        @if (subtitle) { <p class="text-muted mb-0 small">{{ subtitle }}</p> }
      </div>
      <div class="d-flex flex-wrap gap-2 align-items-center"><ng-content /></div>
    </div>
  `,
})
export class PageHeaderComponent {
  @Input() title = '';
  @Input() subtitle = '';
  @Input() icon = '';
  @Input() back: string | any[] | null = null;
  @Input() backLabel = 'Back';
}
