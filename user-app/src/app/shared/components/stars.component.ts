import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Read-only or interactive 5 star rating. */
@Component({
  selector: 'app-stars',
  template: `
    <span class="stars" [class.stars-input]="editable" [style.font-size]="size">
      @for (i of [1, 2, 3, 4, 5]; track i) {
        <i class="bi" [class.bi-star-fill]="i <= Math.round(value)" [class.bi-star]="i > Math.round(value)" (click)="editable && changed.emit(i)" [attr.role]="editable ? 'button' : null" [attr.aria-label]="editable ? i + ' stars' : null"></i>
      }
    </span>
  `,
})
export class StarsComponent {
  @Input() value = 0;
  @Input() editable = false;
  @Input() size = '0.85rem';
  @Output() changed = new EventEmitter<number>();
  protected Math = Math;
}
