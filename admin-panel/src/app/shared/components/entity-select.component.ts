import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of, catchError } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

interface Option { _id: string; label: string; sub?: string }

/**
 * Search-as-you-type selector for sellers or users.
 *   <app-entity-select kind="seller" (selected)="..."/>
 */
@Component({
  selector: 'app-entity-select',
  imports: [FormsModule],
  template: `
    <div class="position-relative">
      @if (current(); as c) {
        <div class="form-control d-flex justify-content-between align-items-center" [class.form-control-sm]="small">
          <span class="text-truncate">{{ c.label }} @if (c.sub) { <small class="text-muted">· {{ c.sub }}</small> }</span>
          <button type="button" class="btn btn-sm btn-link p-0 text-muted" (click)="clear()" aria-label="Clear"><i class="bi bi-x-lg"></i></button>
        </div>
      } @else {
        <input class="form-control" [class.form-control-sm]="small" [placeholder]="placeholder" [(ngModel)]="text" (ngModelChange)="search$.next($event)" (focus)="open.set(true); search$.next(text)" (blur)="closeLater()" />
        @if (open() && options().length) {
          <div class="dropdown-menu show w-100 shadow-sm" style="max-height: 260px; overflow:auto">
            @for (o of options(); track o._id) {
              <button type="button" class="dropdown-item" (mousedown)="pick(o)">
                {{ o.label }} @if (o.sub) { <small class="text-muted">· {{ o.sub }}</small> }
              </button>
            }
          </div>
        }
      }
    </div>
  `,
})
export class EntitySelectComponent implements OnInit {
  private api = inject(ApiService);
  @Input() kind: 'seller' | 'user' = 'seller';
  @Input() placeholder = 'Search...';
  @Input() small = false;
  @Input() set value(v: Option | null) { this.current.set(v); }
  @Output() selected = new EventEmitter<Option | null>();

  text = '';
  current = signal<Option | null>(null);
  options = signal<Option[]>([]);
  open = signal(false);
  search$ = new Subject<string>();

  ngOnInit() {
    const url = this.kind === 'seller' ? '/sellers/lookup' : '/users/lookup';
    this.search$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => this.api.get<any[]>(url, { search: q }).pipe(catchError(() => of([]))))
      )
      .subscribe((rows) =>
        this.options.set(
          rows.map((r) => (this.kind === 'seller'
            ? { _id: r._id, label: r.shopName, sub: `${r.ownerName} · ${r.mobileNumber}` }
            : { _id: r._id, label: r.name || r.mobileNumber, sub: r.name ? r.mobileNumber : '' }))
        )
      );
  }

  pick(o: Option) {
    this.current.set(o);
    this.open.set(false);
    this.selected.emit(o);
  }

  clear() {
    this.current.set(null);
    this.text = '';
    this.selected.emit(null);
  }

  closeLater() {
    setTimeout(() => this.open.set(false), 150);
  }
}
