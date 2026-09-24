import { Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-toast-host',
  template: `
    <div class="toast-stack">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast show align-items-center border-0 text-bg-{{ t.type }}" role="alert">
          <div class="d-flex">
            <div class="toast-body">
              <i class="bi me-2" [class]="icon(t.type)"></i>{{ t.message }}
            </div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" aria-label="Close" (click)="toast.dismiss(t.id)"></button>
          </div>
        </div>
      }
    </div>
  `,
})
export class ToastHostComponent {
  toast = inject(ToastService);
  icon(type: string) {
    return { success: 'bi-check-circle', danger: 'bi-x-octagon', warning: 'bi-exclamation-triangle', info: 'bi-info-circle' }[type] ?? 'bi-info-circle';
  }
}
