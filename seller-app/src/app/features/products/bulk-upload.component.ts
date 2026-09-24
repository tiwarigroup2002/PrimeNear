import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { PageHeaderComponent } from '../../shared';

/** CSV bulk upload used for both products and customers (route data: kind). */
@Component({
  selector: 'app-bulk-upload',
  imports: [PageHeaderComponent, RouterLink],
  template: `
    <app-page-header [title]="kind === 'products' ? 'Bulk upload products' : 'Bulk add customers'" [back]="'/' + kind" [backLabel]="kind === 'products' ? 'Products' : 'Customers'" />
    <div class="card mb-3"><div class="card-body small">
      @if (kind === 'products') {
        <p class="mb-2">Columns: <code>name, category, subCategory, sellingPrice, mrp, costPrice, gstRate, stock, sku, description, lowStockThreshold</code>. Category names must match exactly. Empty SKU is auto-generated.</p>
        <button class="btn btn-sm btn-outline-primary" (click)="template()"><i class="bi bi-download me-1"></i>Download template</button>
      } @else {
        <p class="mb-0">Columns: <code>mobileNumber, name, customerType</code> (Retail / Wholesale). Each number gets access to your shop in the user app.</p>
      }
    </div></div>
    <div class="card mb-3"><div class="card-body text-center">
      <i class="bi bi-filetype-csv display-5 text-muted"></i>
      <div class="my-2"><label class="btn btn-outline-secondary">Choose CSV file<input type="file" accept=".csv,text/csv" hidden (change)="choose($event)" /></label></div>
      @if (file()) { <div class="small fw-semibold mb-2">{{ file()!.name }}</div> }
      <button class="btn btn-primary" [disabled]="!file() || busy()" (click)="upload()">@if (busy()) { <span class="spinner-border spinner-border-sm me-1"></span> }Upload</button>
    </div></div>
    @if (result(); as r) {
      <div class="alert" [class.alert-success]="!r.failedCount" [class.alert-warning]="r.failedCount">
        <strong>{{ r.uploadedCount ?? r.linkedCount }}</strong> added, <strong>{{ r.failedCount }}</strong> failed.
        <a [routerLink]="'/' + kind" class="ms-2">View {{ kind }}</a>
      </div>
      @if (r.errors.length) {
        <div class="card"><ul class="list-group list-group-flush small">
          @for (e of r.errors; track e.row) { <li class="list-group-item text-danger">Row {{ e.row }} ({{ e.name || e.mobileNumber }}): {{ e.message }}</li> }
        </ul></div>
      }
    }
  `,
})
export class BulkUploadComponent {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  kind: 'products' | 'customers' = location.pathname.startsWith('/customers') ? 'customers' : 'products';
  file = signal<File | null>(null);
  busy = signal(false);
  result = signal<any>(null);

  template() {
    this.api.download('/products/bulk-upload/template', 'products-template.csv').subscribe();
  }

  choose(e: Event) {
    this.file.set((e.target as HTMLInputElement).files?.[0] ?? null);
    this.result.set(null);
  }

  upload() {
    const fd = new FormData();
    fd.append('csvFile', this.file()!);
    this.busy.set(true);
    const url = this.kind === 'products' ? '/products/bulk-upload' : '/customers/bulk-link';
    this.http.post<any>(this.api.base + url, fd).subscribe({
      next: (r) => { this.busy.set(false); this.result.set(r.data); this.toast.success(r.message); },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }
}
