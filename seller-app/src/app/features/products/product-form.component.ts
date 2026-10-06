import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AppConfigService } from '../../core/services/app-config.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { Product } from '../../core/models/api.models';
import { compressImage } from '../../core/utils/image';
import { InrPipe, PageHeaderComponent, SheetComponent, StateComponent } from '../../shared';

interface Cat { _id: string; name: string; subCategories: { _id: string; name: string }[] }

@Component({
  selector: 'app-product-form',
  imports: [FormsModule, DatePipe, InrPipe, PageHeaderComponent, StateComponent, SheetComponent],
  templateUrl: './product-form.component.html',
})
export class ProductFormComponent implements OnInit {
  @Input() id?: string;
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  cfg = inject(AppConfigService);

  categories = signal<Cat[]>([]);
  loading = signal(false);
  saving = signal(false);
  product = signal<Product | null>(null);
  movements = signal<any[]>([]);
  barcode = signal<any>(null);
  touched = false;

  f: any = { name: '', categoryId: '', subCategoryId: '', description: '', mrp: null, costPrice: null, sellingPrice: null, gstRate: 0, stock: 0, lowStockThreshold: 5, sku: '', isActive: true };
  existingImages: string[] = [];
  newFiles: { file: File; url: string }[] = [];
  existingVideos: string[] = [];
  newVideos: { file: File; url: string }[] = [];

  adjustOpen = signal(false);
  adjust = { quantity: null as number | null, mode: 'add', reason: 'Added', note: '' };

  subs = computed(() => this.categories().find((c) => c._id === this.catId())?.subCategories ?? []);
  private catId = signal('');

  get isEdit() { return !!this.id; }
  get gst() { return Math.round((Number(this.f.sellingPrice) || 0) * (Number(this.f.gstRate) || 0)) / 100; }
  get finalPrice() { return Math.round(((Number(this.f.sellingPrice) || 0) + this.gst) * 100) / 100; }
  get margin() {
    const sp = Number(this.f.sellingPrice) || 0;
    const cp = Number(this.f.costPrice) || 0;
    return cp && sp ? Math.round(((sp - cp) / sp) * 1000) / 10 : null;
  }

  ngOnInit() {
    this.api.get<Cat[]>('/categories').subscribe((c) => this.categories.set(c));
    if (!this.isEdit) this.f.lowStockThreshold = this.cfg.config().lowStockThreshold;
    if (this.isEdit) this.load();
  }

  load() {
    this.loading.set(true);
    this.api.get<any>(`/products/${this.id}`).subscribe({
      next: ({ product, movements }) => {
        this.product.set(product);
        this.movements.set(movements);
        this.f = { ...product, categoryId: product.categoryId?._id, subCategoryId: product.subCategoryId?._id || '', mrp: product.mrp ?? null, costPrice: product.costPrice ?? null };
        this.catId.set(this.f.categoryId);
        this.existingImages = [...product.images];
        this.existingVideos = [...((product as any).videos || [])];
        this.newFiles = [];
        this.newVideos = [];
        this.loading.set(false);
      },
      error: (e) => { this.toast.error(errorMessage(e)); this.router.navigate(['/products']); },
    });
  }

  onCategory() {
    this.catId.set(this.f.categoryId);
    this.f.subCategoryId = '';
  }

  async addImages(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const original of files) {
      if (this.existingImages.length + this.newFiles.length >= 6) { this.toast.warning('Maximum 6 images'); break; }
      if (original.size > 15 * 1024 * 1024) { this.toast.warning(`${original.name} is larger than 15 MB`); continue; }
      const file = await compressImage(original);
      this.newFiles.push({ file, url: URL.createObjectURL(file) });
    }
  }

  addVideos(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const file of files) {
      if (this.existingVideos.length + this.newVideos.length >= 2) { this.toast.warning('Maximum 2 videos'); break; }
      if (file.size > 60 * 1024 * 1024) { this.toast.warning(`${file.name} is larger than 60 MB`); continue; }
      this.newVideos.push({ file, url: URL.createObjectURL(file) });
    }
  }

  /** Adds a sub-category to the selected category (shared with all shops) and selects it. */
  async addSubCategory() {
    if (!this.f.categoryId) return this.toast.warning('Select a category first');
    const name = await this.confirm.prompt('New sub-category', `It will be added under ${this.categories().find((c) => c._id === this.f.categoryId)?.name}.`, 'Sub-category name', 'Add');
    if (!name?.trim()) return;
    this.api.post<{ _id: string; name: string }>(`/categories/${this.f.categoryId}/subcategories`, { name: name.trim() }).subscribe({
      next: (r) => {
        const sub = { _id: r.data._id, name: r.data.name };
        this.categories.update((cats) => cats.map((c) => (c._id === this.f.categoryId && !c.subCategories.some((s) => s._id === sub._id) ? { ...c, subCategories: [...c.subCategories, sub].sort((a, b) => a.name.localeCompare(b.name)) } : c)));
        this.f.subCategoryId = sub._id;
        this.toast.success(r.message || 'Sub-category added');
      },
      error: (err) => this.toast.error(errorMessage(err)),
    });
  }

  valid() {
    return this.f.name?.trim().length >= 2 && this.f.categoryId && this.f.sellingPrice !== null && this.f.sellingPrice !== '' && Number(this.f.sellingPrice) >= 0;
  }

  save() {
    this.touched = true;
    if (!this.valid()) return this.toast.warning('Fill the required fields');
    if (this.f.mrp && Number(this.f.mrp) < Number(this.f.sellingPrice)) return this.toast.warning('MRP cannot be less than the selling price');
    const fd = new FormData();
    const fields = ['name', 'categoryId', 'subCategoryId', 'description', 'mrp', 'costPrice', 'sellingPrice', 'gstRate', 'lowStockThreshold', 'sku', 'isActive'];
    if (!this.isEdit) fields.push('stock');
    fields.forEach((k) => {
      const v = this.f[k];
      if (v !== null && v !== undefined && !(this.isEdit && k === 'isActive' && this.product()?.disabledByAdmin)) fd.append(k, String(v));
    });
    if (this.isEdit) {
      fd.append('keepImages', JSON.stringify(this.existingImages));
      fd.append('keepVideos', JSON.stringify(this.existingVideos));
    }
    this.newFiles.forEach((n) => fd.append('images', n.file));
    this.newVideos.forEach((n) => fd.append('videos', n.file));
    this.saving.set(true);
    const url = `${this.api.base}/products${this.isEdit ? '/' + this.id : ''}`;
    (this.isEdit ? this.http.put<any>(url, fd) : this.http.post<any>(url, fd)).subscribe({
      next: (r) => {
        this.saving.set(false);
        this.toast.success(r.message || 'Saved');
        if (this.isEdit) this.load();
        else this.router.navigate(['/products', r.data._id]);
      },
      error: (e) => { this.saving.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  showBarcode() {
    this.api.get<any>(`/products/${this.id}/barcode`).subscribe({ next: (b) => this.barcode.set(b), error: (e) => this.toast.error(errorMessage(e)) });
  }

  printBarcode() {
    const b = this.barcode();
    const w = window.open('', '_blank', 'width=400,height=500');
    if (!w) return;
    w.document.write(`<html><body style="font-family:sans-serif;text-align:center;margin:20px"><img src="${b.qrCode}" width="200"/><div style="font-size:14px;font-weight:bold">${b.name}</div><div>${b.sku}</div><div style="font-size:18px">₹${b.price}</div><script>setTimeout(()=>print(),300)</script></body></html>`);
    w.document.close();
  }

  saveAdjust() {
    const q = Number(this.adjust.quantity);
    if (!Number.isInteger(q) || (this.adjust.mode === 'add' && q === 0) || (this.adjust.mode === 'set' && q < 0)) return this.toast.warning('Enter a valid quantity');
    this.api.post<any>('/inventory/adjust-stock', { productId: this.id, ...this.adjust, quantity: q }).subscribe({
      next: (r) => { this.toast.success(`Stock is now ${r.data.newStock}`); this.adjustOpen.set(false); this.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  async remove() {
    if (!(await this.confirm.confirm('Delete product?', 'It will be removed from your shop and customers will not see it.'))) return;
    this.api.delete(`/products/${this.id}`).subscribe({ next: () => { this.toast.success('Product deleted'); this.router.navigate(['/products']); }, error: (e) => this.toast.error(errorMessage(e)) });
  }
}
