import { Component, inject, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmService } from '../../core/services/confirm.service';
import { ModalComponent } from './modal.component';

@Component({
  selector: 'app-confirm-host',
  imports: [ModalComponent, FormsModule],
  template: `
    @if (svc.current(); as c) {
      <app-modal [open]="true" [title]="c.title" size="md" [centered]="true" (closed)="svc.close(false)">
        <p class="mb-2" style="white-space: pre-line">{{ c.message }}</p>
        @if (c.input) {
          <label class="form-label small fw-semibold">{{ c.input.label }}</label>
          <textarea class="form-control" rows="3" [placeholder]="c.input.placeholder || ''" [(ngModel)]="value" autofocus></textarea>
          @if (touched() && invalid()) {
            <div class="text-danger small mt-1">Please enter at least {{ c.input.minLength || 1 }} characters</div>
          }
        }
        <div modal-footer class="modal-footer">
          <button class="btn btn-light" (click)="svc.close(false)">{{ c.cancelText }}</button>
          <button class="btn btn-{{ c.variant }}" (click)="submit()">{{ c.confirmText }}</button>
        </div>
      </app-modal>
    }
  `,
})
export class ConfirmHostComponent {
  svc = inject(ConfirmService);
  value = '';
  touched = signal(false);

  constructor() {
    effect(() => {
      const c = this.svc.current();
      this.value = c?.input?.value ?? '';
      this.touched.set(false);
    });
  }

  invalid() {
    const input = this.svc.current()?.input;
    return !!input?.required && this.value.trim().length < (input.minLength || 1);
  }

  submit() {
    this.touched.set(true);
    if (this.invalid()) return;
    this.svc.close(true, this.value.trim());
  }
}
