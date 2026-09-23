import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { LookupService } from '../../core/services/lookup.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { Category, SubCategory } from '../../core/models/api.models';
import { ModalComponent, PageHeaderComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-categories',
  imports: [FormsModule, PageHeaderComponent, StateComponent, StatusBadgeComponent, ModalComponent],
  template: `
    <app-page-header title="Categories" icon="bi-tags" subtitle="Product categories and sub-categories sellers can choose from">
      <button class="btn btn-sm btn-primary" (click)="openCat()"><i class="bi bi-plus-lg me-1"></i>Add category</button>
    </app-page-header>
    <div class="row g-3">
      <div class="col-lg-7">
        <div class="card">
          <div class="filter-bar">
            <input class="form-control form-control-sm search" placeholder="Search categories" [(ngModel)]="search" (keyup.enter)="load()" />
            <select class="form-select form-select-sm" [(ngModel)]="status" (change)="load()"><option value="">All</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
          </div>
          <div class="table-responsive">
            <table class="table table-hover">
              <thead><tr><th>Category</th><th class="text-center">Sub-categories</th><th class="text-center">Products</th><th>Status</th><th class="text-end">Actions</th></tr></thead>
              <tbody>
                @for (c of categories(); track c._id) {
                  <tr class="row-link" [class.table-active]="selected()?._id === c._id" (click)="select(c)">
                    <td class="d-flex align-items-center gap-2">
                      @if (c.icon) { <img [src]="c.icon" class="thumb" alt="" /> } @else { <span class="thumb"><i class="bi bi-tag"></i></span> }
                      <span><span class="cell-title d-block">{{ c.name }}</span><span class="cell-sub">{{ c.description }}</span></span>
                    </td>
                    <td class="text-center">{{ c.subCategoryCount }}</td>
                    <td class="text-center">{{ c.productCount }}</td>
                    <td><app-status-badge [status]="c.isActive ? 'Active' : 'Inactive'" /></td>
                    <td class="text-end text-nowrap" (click)="$event.stopPropagation()">
                      <button class="btn btn-sm btn-light" title="Edit" (click)="openCat(c)"><i class="bi bi-pencil"></i></button>
                      <button class="btn btn-sm btn-light text-danger" title="Delete" (click)="removeCat(c)"><i class="bi bi-trash"></i></button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <app-state [loading]="loading()" [empty]="!loading() && !categories().length" emptyText="No categories yet" icon="bi-tags" />
        </div>
      </div>
      <div class="col-lg-5">
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span class="card-title">@if (selected()) { Sub-categories of {{ selected()!.name }} } @else { Sub-categories }</span>
            @if (selected()) { <button class="btn btn-sm btn-outline-primary" (click)="openSub()"><i class="bi bi-plus-lg"></i> Add</button> }
          </div>
          @if (!selected()) {
            <div class="card-body text-center text-muted py-5"><i class="bi bi-hand-index fs-2 d-block"></i>Select a category to manage its sub-categories</div>
          } @else {
            <ul class="list-group list-group-flush">
              @for (s of subs(); track s._id) {
                <li class="list-group-item d-flex align-items-center gap-2">
                  <span class="flex-grow-1">{{ s.name }} <span class="cell-sub">· {{ s.productCount }} products</span></span>
                  <div class="form-check form-switch mb-0" title="Active">
                    <input class="form-check-input" type="checkbox" [checked]="s.isActive" (change)="toggleSub(s)" />
                  </div>
                  <button class="btn btn-sm btn-light" (click)="openSub(s)"><i class="bi bi-pencil"></i></button>
                  <button class="btn btn-sm btn-light text-danger" (click)="removeSub(s)"><i class="bi bi-trash"></i></button>
                </li>
              } @empty { <li class="list-group-item text-center text-muted small py-4">No sub-categories</li> }
            </ul>
          }
        </div>
      </div>
    </div>

    <app-modal [open]="catOpen()" [title]="catForm._id ? 'Edit category' : 'Add category'" (closed)="catOpen.set(false)">
      <div class="mb-3"><label class="form-label required">Name</label><input class="form-control" [(ngModel)]="catForm.name" /></div>
      <div class="mb-3"><label class="form-label">Description</label><textarea class="form-control" rows="2" [(ngModel)]="catForm.description"></textarea></div>
      <div class="row g-3 mb-3">
        <div class="col-6"><label class="form-label">Sort order</label><input type="number" class="form-control" [(ngModel)]="catForm.sortOrder" min="0" /></div>
        <div class="col-6 d-flex align-items-end"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="ca" [(ngModel)]="catForm.isActive" /><label class="form-check-label" for="ca">Active</label></div></div>
      </div>
      <label class="form-label">Icon / image</label>
      <div class="d-flex gap-2 align-items-center">
        @if (iconPreview()) { <img [src]="iconPreview()" class="thumb" alt="" /> }
        <input type="file" class="form-control" accept="image/*" (change)="onIcon($event)" />
      </div>
      <div modal-footer class="modal-footer">
        <button class="btn btn-light" (click)="catOpen.set(false)">Cancel</button>
        <button class="btn btn-primary" (click)="saveCat()" [disabled]="saving()">Save</button>
      </div>
    </app-modal>

    <app-modal [open]="subOpen()" [title]="subForm._id ? 'Edit sub-category' : 'Add sub-category'" size="sm" [centered]="true" (closed)="subOpen.set(false)">
      <label class="form-label required">Name</label>
      <input class="form-control" [(ngModel)]="subForm.name" (keyup.enter)="saveSub()" />
      <div modal-footer class="modal-footer">
        <button class="btn btn-light" (click)="subOpen.set(false)">Cancel</button>
        <button class="btn btn-primary" (click)="saveSub()">Save</button>
      </div>
    </app-modal>
  `,
})
export class CategoriesComponent implements OnInit {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private lookup = inject(LookupService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  categories = signal<Category[]>([]);
  subs = signal<SubCategory[]>([]);
  selected = signal<Category | null>(null);
  loading = signal(true);
  saving = signal(false);
  search = '';
  status = '';

  catOpen = signal(false);
  catForm: any = {};
  iconFile: File | null = null;
  iconPreview = signal<string | null>(null);
  subOpen = signal(false);
  subForm: any = {};

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.get<Category[]>('/categories', { search: this.search, status: this.status }).subscribe((c) => {
      this.categories.set(c);
      this.loading.set(false);
      const sel = this.selected();
      if (sel) this.selected.set(c.find((x) => x._id === sel._id) ?? null);
    });
  }

  select(c: Category) {
    this.selected.set(c);
    this.loadSubs();
  }

  loadSubs() {
    this.api.get<SubCategory[]>(`/categories/${this.selected()!._id}/subcategories`).subscribe((s) => this.subs.set(s));
  }

  openCat(c?: Category) {
    this.catForm = c ? { _id: c._id, name: c.name, description: c.description || '', sortOrder: c.sortOrder ?? 0, isActive: c.isActive } : { name: '', description: '', sortOrder: this.categories().length, isActive: true };
    this.iconFile = null;
    this.iconPreview.set(c?.icon || null);
    this.catOpen.set(true);
  }

  onIcon(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    this.iconFile = f;
    const r = new FileReader();
    r.onload = () => this.iconPreview.set(r.result as string);
    r.readAsDataURL(f);
  }

  private formData(obj: Record<string, any>): FormData {
    const fd = new FormData();
    Object.entries(obj).forEach(([k, v]) => { if (k !== '_id' && v !== undefined && v !== null) fd.append(k, String(v)); });
    if (this.iconFile) fd.append('icon', this.iconFile);
    return fd;
  }

  saveCat() {
    if (!this.catForm.name?.trim()) return this.toast.warning('Name is required');
    this.saving.set(true);
    const fd = this.formData(this.catForm);
    const req: Observable<any> = this.catForm._id ? this.http.put(`${this.api.base}/categories/${this.catForm._id}`, fd) : this.http.post(`${this.api.base}/categories`, fd);
    req.subscribe({
      next: () => { this.saving.set(false); this.catOpen.set(false); this.toast.success('Category saved'); this.lookup.invalidate('categories'); this.load(); },
      error: (e) => { this.saving.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  async removeCat(c: Category) {
    if (!(await this.confirm.confirm(`Delete "${c.name}"?`, 'Its sub-categories are deleted too. Categories used by products cannot be deleted – deactivate them instead.'))) return;
    this.api.delete(`/categories/${c._id}`).subscribe({
      next: () => { this.toast.success('Deleted'); if (this.selected()?._id === c._id) this.selected.set(null); this.lookup.invalidate('categories'); this.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  openSub(s?: SubCategory) {
    this.subForm = s ? { _id: s._id, name: s.name } : { name: '' };
    this.subOpen.set(true);
  }

  saveSub() {
    if (!this.subForm.name?.trim()) return this.toast.warning('Name is required');
    const req = this.subForm._id ? this.api.put(`/subcategories/${this.subForm._id}`, { name: this.subForm.name }) : this.api.post(`/categories/${this.selected()!._id}/subcategories`, { name: this.subForm.name });
    req.subscribe({
      next: () => { this.subOpen.set(false); this.toast.success('Saved'); this.loadSubs(); this.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  toggleSub(s: SubCategory) {
    this.api.put(`/subcategories/${s._id}`, { isActive: !s.isActive }).subscribe({ next: () => this.loadSubs(), error: (e) => this.toast.error(errorMessage(e)) });
  }

  async removeSub(s: SubCategory) {
    if (!(await this.confirm.confirm(`Delete "${s.name}"?`, 'This cannot be undone.'))) return;
    this.api.delete(`/subcategories/${s._id}`).subscribe({ next: () => { this.toast.success('Deleted'); this.loadSubs(); this.load(); }, error: (e) => this.toast.error(errorMessage(e)) });
  }
}
