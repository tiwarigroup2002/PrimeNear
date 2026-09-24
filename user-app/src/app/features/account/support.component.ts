import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
    <app-page-header title="Help & support" icon="bi-life-preserver">
      <button class="btn btn-sm btn-primary" (click)="openNew()"><i class="bi bi-plus-lg me-1"></i>New ticket</button>
    </app-page-header>
    <div class="card mb-3"><div class="card-body small">
      <div class="fw-semibold mb-1">Contact {{ cfg.config().platformName }}</div>
      @if (cfg.config().supportPhone) { <a class="btn btn-sm btn-outline-secondary me-2" [href]="'tel:' + cfg.config().supportPhone"><i class="bi bi-telephone me-1"></i>{{ cfg.config().supportPhone }}</a>
        <a class="btn btn-sm btn-outline-success me-2" [href]="'https://wa.me/' + cfg.config().supportPhone" target="_blank" rel="noopener"><i class="bi bi-whatsapp me-1"></i>WhatsApp</a> }
      @if (cfg.config().supportEmail) { <a class="btn btn-sm btn-outline-secondary" [href]="'mailto:' + cfg.config().supportEmail"><i class="bi bi-envelope me-1"></i>Email</a> }
      <details class="mt-3"><summary class="fw-semibold">FAQ</summary>
        <p class="mt-2 mb-1"><b>Why can I see only some shops?</b> You can buy only from shops that added your mobile number. Ask your shopkeeper to add you.</p>
        <p class="mb-1"><b>When will I get my refund?</b> Online payments are refunded to the same UPI / card / bank in 5–7 working days after cancellation or an approved return.</p>
        <p class="mb-1"><b>Can I return an item?</b> Yes, within 7 days of delivery from the order page. The shop checks the request.</p>
        <p class="mb-0"><b>How do I cancel?</b> Open the order and tap “Cancel order” before it is packed.</p>
      </details>
    </div></div>
    <div class="card">
      <div class="m-list">
        @for (t of list.items(); track t._id) {
          <a class="m-item" [routerLink]="['/support', t._id]">
            <span class="flex-grow-1 min-w-0"><span class="d-block small fw-semibold text-truncate">{{ t.title }}</span><small class="text-muted">{{ t.ticketId }} · {{ t.updatedAt | date: 'd MMM, h:mm a' }}@if (t.orderId) { · {{ t.orderId.orderId }} }</small></span>
            <app-status-badge [status]="t.status" />
          </a>
        }
      </div>
      <app-state [loading]="list.loading()" [empty]="!list.loading() && !list.items().length" emptyText="No tickets. Need help? Create one." icon="bi-life-preserver" />
      <app-pagination [page]="list.page" [pages]="list.pages()" [total]="list.total()" [limit]="list.limit" (pageChange)="list.goTo($event)" (limitChange)="list.setLimit($event)" />
    </div>

    <app-sheet [open]="newOpen()" title="New support ticket" (closed)="newOpen.set(false)">
      <label class="form-label">Topic</label>
      <select class="form-select mb-2" [(ngModel)]="form.category"><option value="ProductQuality">Product quality / wrong item</option><option value="LateDelivery">Late delivery</option><option value="PaymentIssue">Payment / refund</option><option value="Fraud">Fraud / misbehaviour</option><option value="Other">Other</option></select>
      <label class="form-label">Order ID (optional)</label>
      <input class="form-control mb-2" [(ngModel)]="form.orderId" placeholder="ORD-..." />
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
  private route = inject(ActivatedRoute);
  cfg = inject(AppConfigService);
  list = new PagedList<any>('/support', {}, false);
  newOpen = signal(false);
  busy = signal(false);
  form: any = { category: 'ProductQuality', orderId: '', title: '', description: '' };
  files: FileList | null = null;

  ngOnInit() {
    this.list.load();
    if (this.route.snapshot.queryParamMap.get('orderId')) this.openNew();
  }

  openNew() {
    this.form = { category: 'ProductQuality', orderId: this.route.snapshot.queryParamMap.get('orderId') || '', title: '', description: '' };
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
