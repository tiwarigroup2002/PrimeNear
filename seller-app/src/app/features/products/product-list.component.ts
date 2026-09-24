import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PagedList } from '../../core/utils/paged-list';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { Product } from '../../core/models/api.models';
import { InrPipe, PageHeaderComponent, PaginationComponent, SheetComponent, StateComponent } from '../../shared';

@Component({
  selector: 'app-product-list',
  imports: [FormsModule, RouterLink, InrPipe, PageHeaderComponent, PaginationComponent, StateComponent, SheetComponent],
  template: `
    <app-page-header title="Products" [subtitle]="list.total() + ' products'">
      <a routerLink="/products/bulk-upload" class="btn btn-sm btn-outline-secondary"><i class="bi bi-upload"></i><span class="d-none d-md-inline ms-1">Bulk upload</span></a>
      <a routerLink="/products/new" class="btn btn-sm btn-primary"><i class="bi bi-plus-lg me-1"></i>Add</a>
    </app-page-header>

    <div class="input-group mb-2">
      <span class="input-group-text"><i class="bi bi-search"></i></span>
      <input class="form-control" placeholder="Search name, SKU or scan barcode" [(ngModel)]="list.filters['search']" (keyup.enter)="list.apply()" />
      @if (list.filters['search']) { <button class="btn btn-outline-secondary" (click)="list.filters['search'] = ''; list.apply()"><i class="bi bi-x-lg"></i></button> }
    </div>
    <div class="d-flex gap-2 mb-3 overflow-auto pb-1">
      @for (f of filters; track f[0]) {
        <button class="btn btn-sm rounded-pill text-nowrap" [class.btn-primary]="list.filters['status'] === f[0]" [class.btn-outline-secondary]="list.filters['status'] !== f[0]" (click)="list.filters['status'] = f[0]; list.apply()">{{ f[1] }}</button>
      }
      <select class="form-select form-select-sm w-auto rounded-pill" [(ngModel)]="list.filters['sortBy']" (change)="list.apply()">
        <option value="">Newest</option><option value="name">Name</option><option value="stock">Low stock first</option><option value="sales">Best selling</option><option value="price">Price</option>
      </select>
    </div>

    @if (selected().size) {
      <div class="alert alert-primary d-flex flex-wrap align-items-center gap-2 py-2 small">
        <strong>{{ selected().size }} selected</strong>
        <button class="btn btn-sm btn-light" (click)="bulk('activate')">Show</button>
        <button class="btn btn-sm btn-light" (click)="bulk('deactivate')">Hide</button>
        <button class="btn btn-sm btn-light" (click)="priceOpen.set(true)">Change price</button>
        <button class="btn btn-sm btn-light text-danger" (click)="bulk('delete')">Delete</button>
        <button class="btn btn-sm btn-link ms-auto" (click)="clearSelection()">Clear</button>
      </div>
    }

    <div class="card">
      <div class="m-list">
        @for (p of list.items(); track p._id) {
          <div class="m-item">
            <input type="checkbox" class="form-check-input flex-shrink-0" [checked]="selected().has(p._id)" (change)="toggle(p._id)" aria-label="Select" />
            <a [routerLink]="['/products', p._id]" class="d-flex align-items-center gap-3 flex-grow-1 min-w-0 text-decoration-none text-body">
              @if (p.images[0]) { <img [src]="p.images[0]" class="thumb thumb-lg" style="width:56px;height:56px" alt="" /> } @else { <span class="thumb" style="width:56px;height:56px"><i class="bi bi-box fs-4"></i></span> }
              <span class="min-w-0 flex-grow-1">
                <span class="d-block fw-semibold text-truncate">{{ p.name }}</span>
                <span class="cell-sub d-block text-truncate">{{ p.categoryId?.name }}@if (p.sku) { · {{ p.sku }} }</span>
                <span class="small">
                  <strong>{{ p.finalPrice | inr: 0 }}</strong>
                  @if (p.mrp && p.mrp > p.sellingPrice) { <s class="text-muted ms-1">{{ p.mrp | inr: 0 }}</s> }
                  <span class="ms-2" [class.text-danger]="p.stock <= 0" [class.text-warning]="p.stock > 0 && p.stock <= p.lowStockThreshold" [class.text-muted]="p.stock > p.lowStockThreshold">
                    {{ p.stock <= 0 ? 'Out of stock' : p.stock + ' in stock' }}
                  </span>
                </span>
              </span>
            </a>
            <div class="form-check form-switch mb-0" [title]="p.disabledByAdmin ? 'Disabled by admin' : 'Visible to customers'">
              <input class="form-check-input" type="checkbox" [checked]="p.isActive" [disabled]="p.disabledByAdmin" (change)="toggleActive(p)" aria-label="Active" />
            </div>
          </div>
        }
      </div>
      <app-state [loading]="list.loading()" [error]="list.error()" [empty]="!list.loading() && !list.items().length" emptyText="No products yet. Add your first product!" icon="bi-box-seam" />
      <app-pagination [page]="list.page" [pages]="list.pages()" [total]="list.total()" [limit]="list.limit" (pageChange)="list.goTo($event)" (limitChange)="list.setLimit($event)" />
    </div>

    <app-sheet [open]="priceOpen()" title="Change price of selected products" (closed)="priceOpen.set(false)">
      <label class="form-label">Change selling price by (%)</label>
      <div class="input-group"><input type="number" class="form-control" [(ngModel)]="percent" placeholder="e.g. 10 or -5" /><span class="input-group-text">%</span></div>
      <div class="form-text">Positive increases, negative decreases. GST and final price are recalculated.</div>
      <div sheet-footer class="sheet-footer"><button class="btn btn-light" (click)="priceOpen.set(false)">Cancel</button><button class="btn btn-primary" (click)="bulk('price')">Apply</button></div>
    </app-sheet>
  `,
})
export class ProductListComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  list = new PagedList<Product>('/products', { search: '', status: '', sortBy: '' });
  filters = [['', 'All'], ['active', 'Active'], ['inactive', 'Hidden'], ['lowStock', 'Low stock'], ['outOfStock', 'Out of stock']];
  selected = signal<Set<string>>(new Set());
  priceOpen = signal(false);
  percent: number | null = null;

  ngOnInit() {
    this.list.load();
  }

  clearSelection() {
    this.selected.set(new Set());
  }

  toggle(id: string) {
    const s = new Set(this.selected());
    s.has(id) ? s.delete(id) : s.add(id);
    this.selected.set(s);
  }

  toggleActive(p: Product) {
    this.api.post(`/products/${p._id}/toggle-active`, { isActive: !p.isActive }).subscribe({
      next: (r: any) => { this.toast.success(r.message); this.list.load(); },
      error: (e) => { this.toast.error(errorMessage(e)); this.list.load(); },
    });
  }

  async bulk(action: 'activate' | 'deactivate' | 'delete' | 'price') {
    const ids = [...this.selected()];
    if (action === 'delete' && !(await this.confirm.confirm(`Delete ${ids.length} product(s)?`, 'They will be removed from your shop.'))) return;
    if (action === 'price' && (this.percent === null || isNaN(+this.percent))) return this.toast.warning('Enter a percentage');
    this.api.post<any>('/products/bulk', { ids, action, percent: action === 'price' ? Number(this.percent) : undefined }).subscribe({
      next: (r) => { this.toast.success(r.message || 'Done'); this.selected.set(new Set()); this.priceOpen.set(false); this.list.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}
