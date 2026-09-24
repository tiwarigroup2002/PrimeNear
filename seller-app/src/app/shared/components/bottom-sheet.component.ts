import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

/** Mobile friendly sheet that slides up from the bottom (centered dialog on desktop). */
@Component({
  selector: 'app-sheet',
  template: `
    @if (open) {
      <div class="sheet-backdrop" (click)="closed.emit()"></div>
      <div class="sheet" role="dialog">
        <div class="sheet-header">
          <strong>{{ title }}</strong>
          <button class="btn-close" (click)="closed.emit()" aria-label="Close"></button>
        </div>
        <div class="sheet-body"><ng-content /></div>
        <ng-content select="[sheet-footer]" />
      </div>
    }
  `,
})
export class SheetComponent {
  @Input() open = false;
  @Input() title = '';
  @Output() closed = new EventEmitter<void>();

  @HostListener('document:keydown.escape')
  esc() {
    if (this.open) this.closed.emit();
  }
}
