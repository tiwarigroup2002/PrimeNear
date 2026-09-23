import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { LookupService } from '../../core/services/lookup.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { CanDirective, InrPipe, ModalComponent, PageHeaderComponent, StatCardComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-product-detail',
  imports: [DatePipe, FormsModule, RouterLink, PageHeaderComponent, StateComponent, StatusBadgeComponent, StatCardComponent, InrPipe, ModalComponent, CanDirective],
  template: `
    <app-page-header [title]="d()?.product?.name || 'Product'" back="/products" backLabel="Products">
      @if (d(); as d) {
        <ng-container *appCan="'products.manage'">
          <button class="btn btn-sm btn-outline-primary" (click)="openEdit()"><i class="bi bi-pencil me-1"></i>Edit</button>
          @if (d.product.isActive) { <button class="btn btn-sm btn-outline-danger" (click)="toggle(false)"><i class="bi bi-eye-slash me-1"></i>Disable</button> }
          @else { <button class="btn btn-sm btn-outline-success" (click)="toggle(true)"><i class="bi bi-eye me-1"></i>Enable</button> }
        </ng-container>
      }
    </app-page-header>
    <app-state [loading]="loading()" [error]="error()" />
    @if (d(); as d) {
      @if (d.product.disabledByAdmin) { <div class="alert alert-danger small"><i class="bi bi-eye-slash me-1"></i>Disabled by admin: {{ d.product.adminNote || 'no reason given' }}</div> }
      <div class="row g-3 mb-3">
        <div class="col-6 col-lg-3"><app-stat-card label="Units sold" [value]="d.sales.quantity" icon="bi-bag" color="primary" /></div>
        <div class="col-6 col-lg-3"><app-stat-card label="Revenue" [value]="d.sales.revenue | inr: 0" icon="bi-currency-rupee" color="success" /></div>
        <div class="col-6 col-lg-3"><app-stat-card label="Stock" [value]="d.product.stock" icon="bi-box" [color]="d.product.stock <= 0 ? 'danger' : d.product.stock <= d.product.lowStockThreshold ? 'warning' : 'info'" [hint]="'Low stock below ' + d.product.lowStockThreshold" /></div>
        <div class="col-6 col-lg-3"><app-stat-card label="Rating" [value]="d.product.ratingCount ? d.product.rating.toFixed(1) + ' ⭐' : '—'" icon="bi-star" color="warning" [hint]="d.product.ratingCount + ' ratings'" /></div>
      </div>
      <div class="row g-3">
        <div class="col-lg-5">
          <div class="card mb-3">
            @if (d.product.images?.length) {
              <img [src]="d.product.images[img()]" class="card-img-top" style="max-height: 320px; object-fit: contain; background: var(--bs-tertiary-bg)" alt="" />
              <div class="d-flex gap-2 p-2 overflow-auto">@for (i of d.product.images; track $index) { <img [src]="i" class="thumb" role="button" (click)="img.set($index)" [class.border]="img() === $index" alt="" /> }</div>
            } @else { <div class="text-center py-5 text-muted"><i class="bi bi-image fs-1"></i><div class="small">No images</div></div> }
          </div>
          <div class="card">
            <div class="card-body">
              <dl class="dl-grid small">
                <dt>Seller</dt><dd><a [routerLink]="['/sellers', d.product.sellerId?._id]">{{ d.product.sellerId?.shopName }}</a></dd>
                <dt>Category</dt><dd>{{ d.product.categoryId?.name }} › {{ d.product.subCategoryId?.name || '—' }}</dd>
                <dt>SKU</dt><dd>{{ d.product.sku || '—' }}</dd>
                <dt>Status</dt><dd><app-status-badge [status]="d.product.isActive ? 'Active' : 'Inactive'" /></dd>
                <dt>Added</dt><dd>{{ d.product.createdAt | date: 'd MMM y' }}</dd>
              </dl>
            </div>
          </div>
        </div>
        <div class="col-lg-7">
          <div class="card mb-3">
            <div class="card-header"><span class="card-title">Price details</span></div>
            <div class="card-body">
              <dl class="dl-grid">
                <dt>MRP</dt><dd>{{ d.product.mrp | inr }}</dd>
                @if (d.product.mrp > d.product.sellingPrice) { <dt>Discount</dt><dd class="text-success">-{{ d.product.mrp - d.product.sellingPrice | inr }}</dd> }
                <dt>Selling price</dt><dd>{{ d.product.sellingPrice | inr }}</dd>
                <dt>GST ({{ d.product.gstRate }}%)</dt><dd>{{ d.product.gstAmount | inr }}</dd>
                <dt class="fw-semibold">Final price</dt><dd class="fw-bold">{{ d.product.finalPrice | inr }}</dd>
                <dt>Cost price</dt><dd class="text-muted">{{ d.product.costPrice | inr }}</dd>
              </dl>
              @if (d.product.description) { <hr /><div class="small text-pre">{{ d.product.description }}</div> }
            </div>
          </div>
          <div class="card">
            <div class="card-header"><span class="card-title">Reviews ({{ d.reviews.length }})</span></div>
            <ul class="list-group list-group-flush">
              @for (r of d.reviews; track r._id) {
                <li class="list-group-item" [class.opacity-50]="r.isHidden">
                  <div class="d-flex justify-content-between">
                    <div><strong class="small">{{ r.userId?.name || 'Customer' }}</strong> <span class="text-warning">{{ '★'.repeat(r.rating) }}{{ '☆'.repeat(5 - r.rating) }}</span></div>
                    <div class="small text-muted">{{ r.createdAt | date: 'd MMM y' }}
                      <button *appCan="'products.manage'" class="btn btn-link btn-sm p-0 ms-2" (click)="hideReview(r)">{{ r.isHidden ? 'Show' : 'Hide' }}</button>
                    </div>
                  </div>
                  @if (r.reviewText) { <div class="small mt-1">{{ r.reviewText }}</div> }
                  @if (r.isHidden) { <span class="badge text-bg-secondary">Hidden</span> }
                </li>
              } @empty { <li class="list-group-item text-muted small text-center py-3">No reviews yet</li> }
            </ul>
          </div>
        </div>
      </div>

      <app-modal [open]="editOpen()" title="Edit product" size="lg" (closed)="editOpen.set(false)">
        <div class="row g-3">
          <div class="col-12"><label class="form-label">Name</label><input class="form-control" [(ngModel)]="edit.name" /></div>
          <div class="col-md-6"><label class="form-label">Category</label>
            <select class="form-select" [(ngModel)]="edit.categoryId" (change)="loadSubs(); edit.subCategoryId = null">@for (c of categories(); track c._id) { <option [value]="c._id">{{ c.name }}</option> }</select></div>
          <div class="col-md-6"><label class="form-label">Sub-category</label>
            <select class="form-select" [(ngModel)]="edit.subCategoryId"><option [ngValue]="null">—</option>@for (s of subs(); track s._id) { <option [value]="s._id">{{ s.name }}</option> }</select></div>
          <div class="col-md-3"><label class="form-label">MRP</label><input type="number" class="form-control" [(ngModel)]="edit.mrp" /></div>
          <div class="col-md-3"><label class="form-label">Selling price</label><input type="number" class="form-control" [(ngModel)]="edit.sellingPrice" /></div>
          <div class="col-md-3"><label class="form-label">GST %</label>
            <select class="form-select" [(ngModel)]="edit.gstRate">@for (g of gstSlabs(); track g) { <option [ngValue]="g">{{ g }}%</option> }</select></div>
          <div class="col-md-3"><label class="form-label">Stock</label><input type="number" class="form-control" [(ngModel)]="edit.stock" /></div>
          <div class="col-12"><label class="form-label">Description</label><textarea class="form-control" rows="3" [(ngModel)]="edit.description"></textarea></div>
          <div class="col-12 small text-muted">Final price: {{ (edit.sellingPrice || 0) * (1 + (edit.gstRate || 0) / 100) | inr }}</div>
        </div>
        <div modal-footer class="modal-footer">
          <button class="btn btn-light" (click)="editOpen.set(false)">Cancel</button>
          <button class="btn btn-primary" (click)="saveEdit()">Save</button>
        </div>
      </app-modal>
    }
  `,
})
export class ProductDetailComponent implements OnInit {
  @Input() id!: string;
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private lookup = inject(LookupService);
  d = signal<any>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  img = signal(0);
  editOpen = signal(false);
  edit: any = {};
  categories = signal<any[]>([]);
  subs = signal<any[]>([]);
  gstSlabs = signal<number[]>([0, 5, 12, 18, 28]);

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.get<any>(`/products/${this.id}`).subscribe({
      next: (d) => { this.d.set(d); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }

  openEdit() {
    const p = this.d().product;
    this.edit = { name: p.name, categoryId: p.categoryId?._id, subCategoryId: p.subCategoryId?._id ?? null, mrp: p.mrp, sellingPrice: p.sellingPrice, gstRate: p.gstRate, stock: p.stock, description: p.description || '' };
    this.lookup.categories().subscribe((c) => this.categories.set(c));
    this.lookup.settings().subscribe({ next: (s) => this.gstSlabs.set(s.gstSettings.slabs.map((x: any) => x.percentage)), error: () => {} });
    this.loadSubs();
    this.editOpen.set(true);
  }

  loadSubs() {
    this.api.get<any[]>(`/categories/${this.edit.categoryId}/subcategories`).subscribe((s) => this.subs.set(s));
  }

  saveEdit() {
    this.api.put(`/products/${this.id}`, { ...this.edit, mrp: Number(this.edit.mrp) || 0, sellingPrice: Number(this.edit.sellingPrice), stock: Number(this.edit.stock) }).subscribe({
      next: () => { this.toast.success('Product updated'); this.editOpen.set(false); this.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  async toggle(isActive: boolean) {
    let reason = '';
    if (!isActive) {
      const r = await this.confirm.prompt('Disable product?', 'Customers will not see it and the seller cannot re-enable it.', 'Reason (sent to the seller)', 'Disable');
      if (r === null) return;
      reason = r;
    }
    this.api.post(`/products/${this.id}/toggle-active`, { isActive, reason }).subscribe({
      next: () => { this.toast.success(isActive ? 'Enabled' : 'Disabled'); this.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  hideReview(r: any) {
    this.api.put(`/reviews/${r._id}/visibility`, { isHidden: !r.isHidden }).subscribe({
      next: () => { this.toast.success(r.isHidden ? 'Review visible' : 'Review hidden'); this.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}
