import { DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../services/api.service';
import { Paged } from '../models/api.models';
import { errorMessage } from '../interceptors/auth.interceptor';

/**
 * State + loading logic shared by every paginated table.
 * Filters are mirrored in the URL query string so lists are shareable
 * and survive a page refresh.
 *
 *   list = new PagedList<Seller>('/sellers', { status: '', search: '' });
 */
export class PagedList<T> {
  private api = inject(ApiService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private sub?: Subscription;

  readonly items = signal<T[]>([]);
  readonly total = signal(0);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly extra = signal<Record<string, any>>({});
  page = 1;
  limit = 20;
  filters: Record<string, any>;

  constructor(private url: string, defaults: Record<string, any> = {}, private syncUrl = true) {
    this.filters = { ...defaults };
    const q = this.route.snapshot.queryParamMap;
    if (syncUrl) {
      Object.keys(defaults).forEach((k) => {
        if (q.has(k)) this.filters[k] = q.get(k);
      });
      if (q.has('page')) this.page = Number(q.get('page')) || 1;
      if (q.has('limit')) this.limit = Number(q.get('limit')) || 20;
    }
    inject(DestroyRef).onDestroy(() => this.sub?.unsubscribe());
  }

  load() {
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    if (this.syncUrl) {
      const qp: Record<string, any> = { page: this.page > 1 ? this.page : null, limit: this.limit !== 20 ? this.limit : null };
      Object.entries(this.filters).forEach(([k, v]) => (qp[k] = v === '' || v === null ? null : v));
      this.router.navigate([], { relativeTo: this.route, queryParams: qp, replaceUrl: true });
    }
    this.sub = this.api.get<Paged<T>>(this.url, { ...this.filters, page: this.page, limit: this.limit }).subscribe({
      next: (res) => {
        const { items, totalCount, pages, page: _p, limit: _l, ...rest } = res;
        this.items.set(items);
        this.total.set(totalCount);
        this.pages.set(pages);
        this.extra.set(rest);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(errorMessage(err, 'Could not load data'));
        this.loading.set(false);
      },
    });
  }

  /** Call after a filter changes: goes back to page 1. */
  apply() {
    this.page = 1;
    this.load();
  }

  reset(defaults: Record<string, any>) {
    this.filters = { ...defaults };
    this.apply();
  }

  goTo(page: number) {
    this.page = page;
    this.load();
  }

  setLimit(limit: number) {
    this.limit = limit;
    this.apply();
  }
}
