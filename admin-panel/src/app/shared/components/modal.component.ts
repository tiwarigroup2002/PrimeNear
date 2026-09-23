import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

/** Lightweight Bootstrap-styled modal controlled with [open]. */
@Component({
  selector: 'app-modal',
  template: `
    @if (open) {
      <div class="modal d-block" tabindex="-1" role="dialog" (mousedown)="backdrop($event)">
        <div class="modal-dialog modal-dialog-scrollable" [class]="'modal-' + size" [class.modal-dialog-centered]="centered">
          <div class="modal-content shadow">
            <div class="modal-header">
              <h5 class="modal-title">{{ title }}</h5>
              <button type="button" class="btn-close" aria-label="Close" (click)="closed.emit()"></button>
            </div>
            <div class="modal-body"><ng-content /></div>
            <ng-content select="[modal-footer]" />
          </div>
        </div>
      </div>
      <div class="modal-backdrop show"></div>
    }
  `,
})
export class ModalComponent {
  @Input() open = false;
  @Input() title = '';
  @Input() size: 'sm' | 'md' | 'lg' | 'xl' = 'md';
  @Input() centered = false;
  @Input() closeOnBackdrop = false;
  @Output() closed = new EventEmitter<void>();

  backdrop(e: MouseEvent) {
    if (this.closeOnBackdrop && (e.target as HTMLElement).classList.contains('modal')) this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  esc() {
    if (this.open) this.closed.emit();
  }
}
