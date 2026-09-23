import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PagedList } from '../../core/utils/paged-list';
import { LookupService } from '../../core/services/lookup.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { Category } from '../../core/models/api.models';
import { CanDirective, EntitySelectComponent, InrPipe, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-product-list',
  imports: [FormsModule, RouterLink, DatePipe, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent, InrPipe, EntitySelectComponent, CanDirective],
  template: `
    <app-page-header title="Products" icon="bi-box-seam" [subtitle]="list.total() + ' products across all sellers'" />
    <div class="card">
      <div class="filter-bar">
        <div class="input-group input-group-sm search"><span class="input-group-text"><i class="bi bi-search"></i></span>
          <input class="form-control" placeholder="Product name or SKU" [(ngModel)]="list.filters['search']" (keyup.enter)="list.apply()" /></div>
        <select class="form-select form-select-sm" [(ngModel)]="list.filters['category']" (change)="list.apply()">
          <option value="">All categories</option>
          @for (c of categories(); track c._id) { <option [value]="c._id">{{ c.name }}</option> }
        </select>
        <select class="form-select form-select-sm" [(ngModel)]="list.filters['status']" (change)="list.apply()">
          <option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="lowStock">Low stock</option><option value="outOfStock">Out of stock</option><option value="disabledByAdmin">Disabled by admin</option>
        </select>
        <select class="form-select form-select-sm" [(ngModel)]="list.filters['sortBy']" (change)="list.apply()">
          <option value="">Newest</option><option value="sales">Best selling</option><option value="rating">Top rated</option><option value="stock">Lowest stock</option><option value="price">Lowest price</option>
        </select>
        <div style="min-width: 200px"><app-entity-select kind="seller" placeholder="Seller..." [small]="true" (selected)="list.filters['seller'] = $event?._id || ''; list.apply()" /></div>
      </div>
      <div class="table-responsive">
        <table class="table table-hover">
          <thead><tr><th>Product</th><th>Seller</th><th>Category</th><th class="text-end">Price</th><th class="text-end">Stock</th><th class="text-end">Sold</th><th>Rating</th><th>Status</th><th>Added</th><th></th></tr></thead>
          <tbody>
            @for (p of list.items(); track p._id) {
              <tr>
                <td>
                  <a [routerLink]="['/products', p._id]" class="d-flex gap-2 align-items-center text-decoration-none text-body">
                    @if (p.images?.[0]) { <img [src]="p.images[0]" class="thumb" alt="" /> } @else { <span class="thumb"><i class="bi bi-box"></i></span> }
                    <span><span class="cell-title d-block">{{ p.name }}</span><span class="cell-sub">{{ p.sku || 'No SKU' }}</span></span>
                  </a>
                </td>
                <td><a [routerLink]="['/sellers', p.sellerId?._id]">{{ p.sellerId?.shopName }}</a></td>
                <td>{{ p.categoryId?.name }}<div class="cell-sub">{{ p.subCategoryId?.name }}</div></td>
                <td class="text-end">{{ p.finalPrice | inr }}<div class="cell-sub">GST {{ p.gstRate }}%</div></td>
                <td class="text-end" [class.text-danger]="p.stock <= 0" [class.text-warning]="p.stock > 0 && p.stock <= p.lowStockThreshold">{{ p.stock }}</td>
                <td class="text-end">{{ p.soldCount }}</td>
                <td>@if (p.ratingCount) { ⭐ {{ p.rating.toFixed(1) }} } @else { — }</td>
                <td><app-status-badge [status]="p.isActive ? 'Active' : 'Inactive'" />@if (p.disabledByAdmin) { <div><span class="badge text-bg-danger">Admin disabled</span></div> }</td>
                <td class="small">{{ p.createdAt | date: 'd MMM y' }}</td>
                <td class="text-end" *appCan="'products.manage'">
                  @if (p.isActive) { <button class="btn btn-sm btn-light text-danger" title="Disable" (click)="toggle(p, false)"><i class="bi bi-eye-slash"></i></button> }
                  @else { <button class="btn btn-sm btn-light text-success" title="Enable" (click)="toggle(p, true)"><i class="bi bi-eye"></i></button> }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <app-state [loading]="list.loading()" [error]="list.error()" [empty]="!list.loading() && !list.items().length" emptyText="No products" icon="bi-box" />
      <app-pagination [page]="list.page" [pages]="list.pages()" [total]="list.total()" [limit]="list.limit" (pageChange)="list.goTo($event)" (limitChange)="list.setLimit($event)" />
    </div>
  `,
})
export class ProductListComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  list = new PagedList<any>('/products', { search: '', category: '', status: '', sortBy: '', seller: '' });
  categories = signal<Category[]>([]);

  constructor(lookup: LookupService) {
    lookup.categories().subscribe((c) => this.categories.set(c));
  }

  ngOnInit() {
    this.list.load();
  }

  async toggle(p: any, isActive: boolean) {
    let reason = '';
    if (!isActive) {
      const r = await this.confirm.prompt(`Disable "${p.name}"?`, 'Customers will not see this product and the seller cannot re-enable it.', 'Reason (sent to the seller)', 'Disable');
      if (r === null) return;
      reason = r;
    }
    this.api.post(`/products/${p._id}/toggle-active`, { isActive, reason }).subscribe({
      next: () => { this.toast.success(isActive ? 'Product enabled' : 'Product disabled'); this.list.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}
