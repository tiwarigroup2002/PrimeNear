import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
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
/** One colour / size combination in the form */
interface VariantRow { _id?: string; color: string; size: string; sellingPrice: any; mrp: any; stock: number; sku: string; isActive: boolean; images: string[]; newFiles: { file: File; url: string }[] }

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
  adjust = { quantity: null as number | null, mode: 'add', reason: 'Added', note: '', variantId: '' };

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
        this.loadVariants(product);
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

  // ---- Colours & sizes (variants) ----
  hasVariants = false;
  colors: string[] = [];
  sizes: string[] = [];
  colorInput = '';
  sizeInput = '';
  rows: VariantRow[] = [];

  private loadVariants(product: any) {
    const vs: any[] = product.variants || [];
    this.hasVariants = vs.length > 0;
    this.colors = [...new Set(vs.map((v) => v.color).filter(Boolean))] as string[];
    this.sizes = [...new Set(vs.map((v) => v.size).filter(Boolean))] as string[];
    this.rows = vs.map((v) => ({ _id: v._id, color: v.color || '', size: v.size || '', sellingPrice: v.sellingPrice, mrp: v.mrp ?? null, stock: v.stock, sku: v.sku || '', isActive: v.isActive !== false, images: [...(v.images || [])], newFiles: [] }));
  }

  label(r: VariantRow) {
    return [r.color, r.size].filter(Boolean).join(' / ');
  }

  get totalStock() {
    return this.rows.reduce((s, r) => s + (Number(r.stock) || 0), 0);
  }

  addOption(kind: 'color' | 'size') {
    const list = kind === 'color' ? this.colors : this.sizes;
    const raw = (kind === 'color' ? this.colorInput : this.sizeInput).split(',').map((s) => s.trim()).filter(Boolean);
    raw.forEach((v) => { if (!list.some((x) => x.toLowerCase() === v.toLowerCase())) list.push(v); });
    if (kind === 'color') this.colorInput = ''; else this.sizeInput = '';
    this.buildRows();
  }

  removeOption(kind: 'color' | 'size', i: number) {
    (kind === 'color' ? this.colors : this.sizes).splice(i, 1);
    this.buildRows();
  }

  /** One row for every colour × size; existing rows (price, stock, photos) are kept. */
  buildRows() {
    const colors = this.colors.length ? this.colors : [''];
    const sizes = this.sizes.length ? this.sizes : [''];
    const key = (c: string, s: string) => `${c.toLowerCase()}|${s.toLowerCase()}`;
    const old = new Map(this.rows.map((r) => [key(r.color, r.size), r]));
    const next: VariantRow[] = [];
    for (const c of colors) {
      for (const s of sizes) {
        if (!c && !s) continue;
        next.push(old.get(key(c, s)) ?? { color: c, size: s, sellingPrice: this.f.sellingPrice ?? null, mrp: this.f.mrp ?? null, stock: 0, sku: '', isActive: true, images: [], newFiles: [] });
      }
    }
    this.rows = next;
  }

  /** Copies the first row's price / MRP to every row. */
  samePriceForAll() {
    const first = this.rows[0];
    if (!first) return;
    this.rows.forEach((r) => { r.sellingPrice = first.sellingPrice; r.mrp = first.mrp; });
  }

  async addRowImages(r: VariantRow, e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const original of files) {
      if (r.images.length + r.newFiles.length >= 6) { this.toast.warning('Maximum 6 photos per colour / size'); break; }
      const file = await compressImage(original);
      r.newFiles.push({ file, url: URL.createObjectURL(file) });
    }
  }

  /** Uploads photos chosen for each variant once the product is saved (variants then have ids). */
  private async uploadVariantPhotos(productId: string, saved: any[]) {
    const key = (c: string, s: string) => `${(c || '').toLowerCase()}|${(s || '').toLowerCase()}`;
    for (const r of this.rows.filter((x) => x.newFiles.length)) {
      const v = saved.find((x) => key(x.color, x.size) === key(r.color, r.size));
      if (!v) continue;
      const fd = new FormData();
      r.newFiles.forEach((n) => fd.append('images', n.file));
      await firstValueFrom(this.http.post(`${this.api.base}/products/${productId}/variants/${v._id}/images`, fd));
    }
  }

  valid() {
    const priceOk = this.hasVariants || (this.f.sellingPrice !== null && this.f.sellingPrice !== '' && Number(this.f.sellingPrice) >= 0);
    return this.f.name?.trim().length >= 2 && this.f.categoryId && priceOk;
  }

  save() {
    this.touched = true;
    if (!this.valid()) return this.toast.warning('Fill the required fields');
    if (this.hasVariants) {
      if (!this.rows.length) return this.toast.warning('Add at least one colour or size');
      const bad = this.rows.find((r) => r.sellingPrice === null || r.sellingPrice === '' || Number(r.sellingPrice) < 0);
      if (bad) return this.toast.warning(`Enter a price for ${this.label(bad)}`);
      const badMrp = this.rows.find((r) => r.mrp && Number(r.mrp) < Number(r.sellingPrice));
      if (badMrp) return this.toast.warning(`MRP of ${this.label(badMrp)} cannot be less than its price`);
    } else if (this.f.mrp && Number(this.f.mrp) < Number(this.f.sellingPrice)) return this.toast.warning('MRP cannot be less than the selling price');
    const fd = new FormData();
    const fields = ['name', 'categoryId', 'subCategoryId', 'description', 'costPrice', 'gstRate', 'lowStockThreshold', 'sku', 'isActive'];
    if (!this.hasVariants) fields.push('mrp', 'sellingPrice');
    if (!this.isEdit && !this.hasVariants) fields.push('stock');
    // Turning variants off sends an empty list; on sends every combination
    if (this.hasVariants || this.product()?.variants?.length) {
      fd.append('variants', JSON.stringify(this.hasVariants ? this.rows.map((r) => ({ _id: r._id, color: r.color, size: r.size, sellingPrice: r.sellingPrice, mrp: r.mrp, sku: r.sku, isActive: r.isActive, stock: r.stock, images: r.images })) : []));
    }
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
      next: async (r) => {
        try {
          if (this.hasVariants) await this.uploadVariantPhotos(r.data._id, r.data.variants || []);
        } catch (err) {
          this.toast.error(`Product saved, but some photos were not uploaded: ${errorMessage(err)}`);
        }
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
    if (this.hasVariants && !this.adjust.variantId) return this.toast.warning('Choose the colour / size');
    this.api.post<any>('/inventory/adjust-stock', { productId: this.id, ...this.adjust, quantity: q, variantId: this.adjust.variantId || undefined }).subscribe({
      next: (r) => { this.toast.success(`Stock is now ${r.data.newStock}`); this.adjustOpen.set(false); this.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  async remove() {
    if (!(await this.confirm.confirm('Delete product?', 'It will be removed from your shop and customers will not see it.'))) return;
    this.api.delete(`/products/${this.id}`).subscribe({ next: () => { this.toast.success('Product deleted'); this.router.navigate(['/products']); }, error: (e) => this.toast.error(errorMessage(e)) });
  }
}
