import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { PagedList } from '../../core/utils/paged-list';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { PageHeaderComponent, PaginationComponent, StateComponent } from '../../shared';

@Component({
  selector: 'app-reviews',
  imports: [DatePipe, FormsModule, PageHeaderComponent, PaginationComponent, StateComponent],
  template: `
    <app-page-header title="Reviews" subtitle="What customers say about your shop" />
    <div class="card mb-3"><div class="card-body d-flex align-items-center gap-4">
      <div class="text-center"><div class="display-6 fw-bold">{{ (list.extra()['rating'] || 0).toFixed(1) }}</div><div class="text-warning">★★★★★</div><div class="small text-muted">{{ list.extra()['ratingCount'] || 0 }} ratings</div></div>
      <div class="flex-grow-1">
        @for (r of [5, 4, 3, 2, 1]; track r) {
          <div class="d-flex align-items-center gap-2 small"><span style="width: 18px">{{ r }}★</span>
            <div class="progress flex-grow-1" style="height: 6px"><div class="progress-bar bg-warning" [style.width.%]="pct(r)"></div></div>
            <span class="text-muted" style="width: 28px">{{ dist()[r] || 0 }}</span></div>
        }
      </div>
    </div></div>
    <div class="d-flex gap-2 mb-3 overflow-auto">
      <select class="form-select form-select-sm w-auto" [(ngModel)]="list.filters['type']" (change)="list.apply()"><option value="">Shop & products</option><option value="Seller">Shop</option><option value="Product">Products</option></select>
      <select class="form-select form-select-sm w-auto" [(ngModel)]="list.filters['rating']" (change)="list.apply()"><option value="">All stars</option>@for (r of [5, 4, 3, 2, 1]; track r) { <option [value]="r">{{ r }} ★</option> }</select>
      <div class="form-check form-switch align-self-center mb-0"><input class="form-check-input" type="checkbox" id="un" [checked]="list.filters['unanswered'] === 'true'" (change)="list.filters['unanswered'] = $any($event.target).checked ? 'true' : ''; list.apply()" /><label class="form-check-label small" for="un">Not replied</label></div>
    </div>
    <div class="card">
      <ul class="list-group list-group-flush">
        @for (r of list.items(); track r._id) {
          <li class="list-group-item">
            <div class="d-flex justify-content-between"><strong class="small">{{ r.userId?.name || 'Customer' }}</strong><span class="small text-muted">{{ r.createdAt | date: 'd MMM y' }}</span></div>
            <div class="text-warning">{{ stars(r.rating) }}</div>
            @if (r.productId) { <div class="cell-sub">on {{ r.productId.name }}</div> }
            @if (r.reviewText) { <div class="small mt-1">{{ r.reviewText }}</div> }
            @if (r.sellerResponse?.text) {
              <div class="small bg-body-tertiary rounded p-2 mt-2"><strong>Your reply:</strong> {{ r.sellerResponse.text }}</div>
            } @else if (replying() === r._id) {
              <div class="input-group input-group-sm mt-2"><input class="form-control" [(ngModel)]="reply" placeholder="Thank the customer..." /><button class="btn btn-primary" (click)="send(r)">Send</button></div>
            } @else {
              <button class="btn btn-link btn-sm px-0" (click)="replying.set(r._id); reply = ''"><i class="bi bi-reply me-1"></i>Reply</button>
            }
          </li>
        }
      </ul>
      <app-state [loading]="list.loading()" [empty]="!list.loading() && !list.items().length" emptyText="No reviews yet" icon="bi-star" />
      <app-pagination [page]="list.page" [pages]="list.pages()" [total]="list.total()" [limit]="list.limit" (pageChange)="list.goTo($event)" (limitChange)="list.setLimit($event)" />
    </div>
  `,
})
export class ReviewsComponent implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  list = new PagedList<any>('/reviews', { type: '', rating: '', unanswered: '' });
  replying = signal<string | null>(null);
  reply = '';

  ngOnInit() {
    this.list.load();
  }

  dist() {
    return this.list.extra()['distribution'] || {};
  }

  pct(r: number) {
    const d = this.dist();
    const total = Object.values(d).reduce((a: number, b: any) => a + b, 0) as number;
    return total ? ((d[r] || 0) / total) * 100 : 0;
  }

  stars(n: number) {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  send(r: any) {
    if (!this.reply.trim()) return;
    this.api.post(`/reviews/${r._id}/respond`, { text: this.reply }).subscribe({
      next: () => { this.toast.success('Reply posted'); this.replying.set(null); this.list.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}
