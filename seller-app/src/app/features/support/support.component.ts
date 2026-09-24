import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AppConfigService } from '../../core/services/app-config.service';
import { ToastService } from '../../core/services/toast.service';
import { PagedList } from '../../core/utils/paged-list';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { PageHeaderComponent, PaginationComponent, SheetComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-support',
  imports: [DatePipe, FormsModule, RouterLink, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent, SheetComponent],
  template: `
    <app-page-header title="Help & support">
      <button class="btn btn-sm btn-primary" (click)="openNew()"><i class="bi bi-plus-lg me-1"></i>New ticket</button>
    </app-page-header>
    <div class="card mb-3"><div class="card-body small">
      <div class="fw-semibold mb-1">Contact {{ cfg.config().platformName }}</div>
      @if (cfg.config().supportPhone) { <a class="btn btn-sm btn-outline-secondary me-2" [href]="'tel:' + cfg.config().supportPhone"><i class="bi bi-telephone me-1"></i>{{ cfg.config().supportPhone }}</a>
        <a class="btn btn-sm btn-outline-success me-2" [href]="'https://wa.me/' + cfg.config().supportPhone" target="_blank" rel="noopener"><i class="bi bi-whatsapp me-1"></i>WhatsApp</a> }
      @if (cfg.config().supportEmail) { <a class="btn btn-sm btn-outline-secondary" [href]="'mailto:' + cfg.config().supportEmail"><i class="bi bi-envelope me-1"></i>Email</a> }
      <details class="mt-3"><summary class="fw-semibold">FAQ</summary>
        <p class="mt-2 mb-1"><b>When do I get money for app orders?</b> After delivery and the holding period, in the next payout to your bank account (Earnings page).</p>
        <p class="mb-1"><b>How can a customer see my shop?</b> Add their mobile number in Customers. Only added customers can shop from you.</p>
        <p class="mb-0"><b>Why is my product hidden?</b> It may be out of stock, switched off, or disabled by the admin (reason shown on the product).</p>
      </details>
    </div></div>
    <div class="card">
      <div class="m-list">
        @for (t of list.items(); track t._id) {
          <a class="m-item" [routerLink]="['/support', t._id]">
            <span class="flex-grow-1 min-w-0"><span class="d-block small fw-semibold text-truncate">{{ t.title }}</span><span class="cell-sub">{{ t.ticketId }} · {{ t.updatedAt | date: 'd MMM, h:mm a' }}@if (t.orderId) { · {{ t.orderId.orderId }} }</span></span>
            <app-status-badge [status]="t.status" />
          </a>
        }
      </div>
      <app-state [loading]="list.loading()" [empty]="!list.loading() && !list.items().length" emptyText="No tickets. Need help? Create one." icon="bi-life-preserver" />
      <app-pagination [page]="list.page" [pages]="list.pages()" [total]="list.total()" [limit]="list.limit" (pageChange)="list.goTo($event)" (limitChange)="list.setLimit($event)" />
    </div>

    <app-sheet [open]="newOpen()" title="New support ticket" (closed)="newOpen.set(false)">
      <label class="form-label">Topic</label>
      <select class="form-select mb-2" [(ngModel)]="form.category"><option value="PaymentIssue">Payment / payout</option><option value="ProductQuality">Product / return</option><option value="LateDelivery">Delivery</option><option value="Fraud">Fraud / abuse</option><option value="Other">Other</option></select>
      <label class="form-label">Order ID (optional)</label>
      <input class="form-control mb-2" [(ngModel)]="form.orderId" placeholder="ORD-..." />
      @if (form.orderId) { <div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="ag" [(ngModel)]="form.againstUser" /><label class="form-check-label small" for="ag">This is a complaint about the customer</label></div> }
      <label class="form-label required">Title</label>
      <input class="form-control mb-2" [(ngModel)]="form.title" />
      <label class="form-label required">Describe the problem</label>
      <textarea class="form-control mb-2" rows="4" [(ngModel)]="form.description"></textarea>
      <label class="form-label">Photos (optional)</label>
      <input type="file" class="form-control" accept="image/*" multiple (change)="files = $any($event.target).files" />
      <div sheet-footer class="sheet-footer"><button class="btn btn-light" (click)="newOpen.set(false)">Cancel</button><button class="btn btn-primary" (click)="create()" [disabled]="busy()">Submit</button></div>
    </app-sheet>
  `,
})
export class SupportComponent implements OnInit {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private router = inject(Router);
  cfg = inject(AppConfigService);
  list = new PagedList<any>('/support', {}, false);
  newOpen = signal(false);
  busy = signal(false);
  form: any = { category: 'PaymentIssue', orderId: '', title: '', description: '', againstUser: false };
  files: FileList | null = null;

  ngOnInit() {
    this.list.load();
  }

  openNew() {
    this.form = { category: 'PaymentIssue', orderId: '', title: '', description: '', againstUser: false };
    this.files = null;
    this.newOpen.set(true);
  }

  create() {
    if (this.form.title.trim().length < 3 || this.form.description.trim().length < 5) return this.toast.warning('Enter a title and describe the problem');
    const fd = new FormData();
    Object.entries(this.form).forEach(([k, v]) => fd.append(k, String(v)));
    Array.from(this.files ?? []).slice(0, 4).forEach((f) => fd.append('images', f));
    this.busy.set(true);
    this.http.post<any>(`${this.api.base}/support`, fd).subscribe({
      next: (r) => { this.busy.set(false); this.newOpen.set(false); this.toast.success(r.message); this.router.navigate(['/support', r.data._id]); },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }
}
