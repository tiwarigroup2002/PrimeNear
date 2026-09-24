import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { Paged, Product } from '../../core/models/api.models';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { ProductCardComponent, SheetComponent, StateComponent } from '../../shared';

interface Filters { q: string; category: string; subCategory: string; sortBy: string; priceMin: string; priceMax: string; rating: string; inStock: string }
const EMPTY: Filters = { q: '', category: '', subCategory: '', sortBy: '', priceMin: '', priceMax: '', rating: '', inStock: '' };

@Component({
  selector: 'app-search',
  imports: [FormsModule, ProductCardComponent, SheetComponent, StateComponent],
  template: `
    <div class="d-flex gap-2 mb-2">
      <div class="input-group">
        <span class="input-group-text bg-body"><i class="bi bi-search"></i></span>
        <input class="form-control" type="search" placeholder="Search products" [(ngModel)]="f.q" (ngModelChange)="typed$.next()" (keydown.enter)="apply()" aria-label="Search products" />
      </div>
      <button class="btn btn-outline-secondary position-relative flex-shrink-0" (click)="filtersOpen.set(true)" aria-label="Filters">
        <i class="bi bi-sliders"></i>@if (activeFilterCount()) { <span class="dot-count">{{ activeFilterCount() }}</span> }
      </button>
    </div>

    <div class="chip-row mb-2">
      <button class="chip" [class.active]="!f.category" (click)="setCategory('')">All</button>
      @for (c of categories(); track c._id) {
        <button class="chip" [class.active]="f.category === c._id" (click)="setCategory(c._id)">{{ c.name }} <span class="opacity-75">{{ c.productCount }}</span></button>
      }
    </div>
    @if (subCategories().length) {
      <div class="chip-row mb-2">
        @for (s of subCategories(); track s._id) {
          <button class="chip" [class.active]="f.subCategory === s._id" (click)="f.subCategory = f.subCategory === s._id ? '' : s._id; apply()">{{ s.name }}</button>
        }
      </div>
    }

    <div class="d-flex justify-content-between align-items-center mb-2 small">
      <span class="text-muted">@if (!loading() || items().length) { {{ total() }} product{{ total() === 1 ? '' : 's' }} }</span>
      <select class="form-select form-select-sm w-auto" [(ngModel)]="f.sortBy" (ngModelChange)="apply()" aria-label="Sort by">
        <option value="">Relevance</option>
        <option value="popular">Popular</option>
        <option value="price_asc">Price: low to high</option>
        <option value="price_desc">Price: high to low</option>
        <option value="rating">Top rated</option>
        <option value="new">Newest</option>
      </select>
    </div>

    <div class="product-grid">
      @for (p of items(); track p._id) { <app-product-card [product]="p" /> }
    </div>
    <app-state [loading]="loading()" [error]="error()" [empty]="!loading() && !error() && !items().length" icon="bi-search" emptyText="No products match your search" />
    @if (!loading() && page < pages()) {
      <div class="text-center my-3"><button class="btn btn-outline-primary px-4" (click)="more()">Load more</button></div>
    }

    <app-sheet [open]="filtersOpen()" title="Filters" (closed)="filtersOpen.set(false)">
      <label class="form-label">Price range (₹)</label>
      <div class="d-flex gap-2 mb-1">
        <input class="form-control" type="number" min="0" placeholder="Min" [(ngModel)]="draft.priceMin" />
        <input class="form-control" type="number" min="0" placeholder="Max" [(ngModel)]="draft.priceMax" />
      </div>
      @if (priceRange().max) { <small class="text-muted d-block mb-3">Prices in this shop: ₹{{ priceRange().min }} – ₹{{ priceRange().max }}</small> }
      <label class="form-label">Customer rating</label>
      <div class="d-flex flex-wrap gap-2 mb-3">
        @for (r of ['', '4', '3', '2']; track r) {
          <button class="chip" [class.active]="draft.rating === r" (click)="draft.rating = r">{{ r ? r + '★ & above' : 'Any' }}</button>
        }
      </div>
      <div class="form-check form-switch">
        <input class="form-check-input" type="checkbox" id="instock" [checked]="draft.inStock === 'true'" (change)="draft.inStock = $any($event.target).checked ? 'true' : ''" />
        <label class="form-check-label" for="instock">Show only in-stock items</label>
      </div>
      <div sheet-footer>
        <button class="btn btn-light" (click)="clearFilters()">Clear</button>
        <button class="btn btn-primary px-4" (click)="applyDraft()">Apply</button>
      </div>
    </app-sheet>
  `,
})
export class SearchComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private sub?: Subscription;

  f: Filters = { ...EMPTY };
  draft: Filters = { ...EMPTY };
  typed$ = new Subject<void>();
  items = signal<Product[]>([]);
  total = signal(0);
  pages = signal(1);
  page = 1;
  loading = signal(false);
  error = signal<string | null>(null);
  categories = signal<any[]>([]);
  priceRange = signal<{ min: number; max: number }>({ min: 0, max: 0 });
  filtersOpen = signal(false);
  subCategories = computed(() => this.categories().find((c) => c._id === this.catSel())?.subCategories ?? []);
  private catSel = signal('');
  activeFilterCount = signal(0);

  ngOnInit() {
    this.api.get<any[]>('/categories').subscribe({ next: (c) => this.categories.set(c), error: () => {} });
    const s1 = this.typed$.pipe(debounceTime(400)).subscribe(() => this.apply());
    const s2 = this.route.queryParamMap.subscribe((q) => {
      const next = { ...EMPTY };
      (Object.keys(EMPTY) as (keyof Filters)[]).forEach((k) => (next[k] = q.get(k) ?? ''));
      if (JSON.stringify(next) === JSON.stringify(this.f) && this.items().length) return;
      this.f = next;
      this.catSel.set(next.category);
      this.fetch(true);
    });
    this.destroyRef.onDestroy(() => { s1.unsubscribe(); s2.unsubscribe(); this.sub?.unsubscribe(); });
  }

  setCategory(id: string) {
    this.f.category = id;
    this.f.subCategory = '';
    this.apply();
  }

  apply() {
    const qp: Record<string, string | null> = {};
    (Object.keys(this.f) as (keyof Filters)[]).forEach((k) => (qp[k] = this.f[k] || null));
    this.router.navigate([], { relativeTo: this.route, queryParams: qp, replaceUrl: true });
  }

  applyDraft() {
    Object.assign(this.f, { priceMin: this.draft.priceMin ?? '', priceMax: this.draft.priceMax ?? '', rating: this.draft.rating, inStock: this.draft.inStock });
    this.filtersOpen.set(false);
    this.apply();
  }

  clearFilters() {
    this.draft = { ...this.draft, priceMin: '', priceMax: '', rating: '', inStock: '' };
    this.applyDraft();
  }

  more() {
    this.page++;
    this.fetch(false);
  }

  private fetch(reset: boolean) {
    if (reset) {
      this.page = 1;
      this.items.set([]);
    }
    this.draft = { ...this.f };
    this.activeFilterCount.set(['priceMin', 'priceMax', 'rating', 'inStock'].filter((k) => this.f[k as keyof Filters]).length);
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    const { q, ...rest } = this.f;
    this.sub = this.api.get<Paged<Product>>('/products', { ...rest, search: q, page: this.page, limit: 20 }).subscribe({
      next: (r) => {
        this.items.set(reset ? r.items : [...this.items(), ...r.items]);
        this.total.set(r.totalCount);
        this.pages.set(r.pages);
        this.priceRange.set(r['priceRange'] ?? { min: 0, max: 0 });
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }
}
