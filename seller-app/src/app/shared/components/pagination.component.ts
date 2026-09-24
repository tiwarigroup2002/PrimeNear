import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-pagination',
  imports: [FormsModule],
  template: `
    @if (total > 0) {
      <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 px-3 py-2 border-top small">
        <div class="text-muted">
          Showing {{ from }}–{{ to }} of {{ total }}
          <select class="form-select form-select-sm d-inline-block w-auto ms-2" [ngModel]="limit" (ngModelChange)="limitChange.emit(+$event)">
            @for (n of sizes; track n) { <option [value]="n">{{ n }} / page</option> }
          </select>
        </div>
        <nav>
          <ul class="pagination pagination-sm mb-0">
            <li class="page-item" [class.disabled]="page <= 1"><button class="page-link" (click)="go(1)" aria-label="First"><i class="bi bi-chevron-double-left"></i></button></li>
            <li class="page-item" [class.disabled]="page <= 1"><button class="page-link" (click)="go(page - 1)" aria-label="Previous"><i class="bi bi-chevron-left"></i></button></li>
            @for (p of pagesToShow; track p) {
              <li class="page-item" [class.active]="p === page"><button class="page-link" (click)="go(p)">{{ p }}</button></li>
            }
            <li class="page-item" [class.disabled]="page >= pages"><button class="page-link" (click)="go(page + 1)" aria-label="Next"><i class="bi bi-chevron-right"></i></button></li>
            <li class="page-item" [class.disabled]="page >= pages"><button class="page-link" (click)="go(pages)" aria-label="Last"><i class="bi bi-chevron-double-right"></i></button></li>
          </ul>
        </nav>
      </div>
    }
  `,
})
export class PaginationComponent {
  @Input() page = 1;
  @Input() pages = 1;
  @Input() total = 0;
  @Input() limit = 20;
  @Output() pageChange = new EventEmitter<number>();
  @Output() limitChange = new EventEmitter<number>();
  sizes = [10, 20, 50, 100];

  get from() { return this.total ? (this.page - 1) * this.limit + 1 : 0; }
  get to() { return Math.min(this.page * this.limit, this.total); }
  get pagesToShow(): number[] {
    const start = Math.max(1, Math.min(this.page - 2, this.pages - 4));
    const end = Math.min(this.pages, start + 4);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
  go(p: number) {
    if (p >= 1 && p <= this.pages && p !== this.page) this.pageChange.emit(p);
  }
}
