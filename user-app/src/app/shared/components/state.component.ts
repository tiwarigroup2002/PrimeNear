import { Component, Input } from '@angular/core';

/** Loading spinner / empty state / error message block. */
@Component({
  selector: 'app-state',
  template: `
    @if (loading) {
      <div class="text-center text-muted py-5"><div class="spinner-border spinner-border-sm me-2"></div>{{ loadingText }}</div>
    } @else if (error) {
      <div class="text-center py-5 text-danger"><i class="bi bi-exclamation-octagon fs-3 d-block mb-2"></i>{{ error }}</div>
    } @else if (empty) {
      <div class="text-center py-5 text-muted"><i class="bi {{ icon }} fs-2 d-block mb-2 opacity-50"></i>{{ emptyText }}</div>
    }
  `,
})
export class StateComponent {
  @Input() loading = false;
  @Input() empty = false;
  @Input() error: string | null = null;
  @Input() loadingText = 'Loading...';
  @Input() emptyText = 'No records found';
  @Input() icon = 'bi-inbox';
}
