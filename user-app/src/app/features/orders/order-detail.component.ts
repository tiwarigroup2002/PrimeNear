import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { CartService } from '../../core/services/cart.service';
import { AuthService } from '../../core/services/auth.service';
import { PaymentService } from '../../core/services/payment.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { InrPipe, PageHeaderComponent, SheetComponent, StarsComponent, StateComponent, StatusBadgeComponent } from '../../shared';

const FLOW = ['Pending', 'Confirmed', 'Packed', 'Shipped', 'Delivered'];
const RETURN_REASONS = ['Damaged / broken item', 'Wrong item received', 'Item missing', 'Quality not as expected', 'Expired product', 'Other'];

@Component({
  selector: 'app-order-detail',
  imports: [DatePipe, FormsModule, RouterLink, InrPipe, PageHeaderComponent, SheetComponent, StarsComponent, StateComponent, StatusBadgeComponent],
  template: `
    <app-page-header [title]="o()?.orderId || 'Order'" back="/orders" backLabel="My orders">
      @if (o()) { <app-status-badge [status]="o().orderStatus" /> }
    </app-page-header>
    <app-state [loading]="loading()" [error]="error()" />
    @if (o(); as o) {
      <div class="row g-3">
        <div class="col-lg-7">
          @if (d().deliveryCode) {
            <div class="card mb-3" style="border-color: rgba(var(--bs-primary-rgb), .4)"><div class="card-body d-flex align-items-center gap-3 flex-wrap">
              <i class="bi bi-shield-lock fs-2 text-primary"></i>
              <div class="flex-grow-1">
                <div class="fw-semibold">Delivery code</div>
                <div class="small text-muted">Open the box and check your items. Tell this code to the shop only after you receive them.</div>
              </div>
              <span class="delivery-code">{{ d().deliveryCode }}</span>
            </div></div>
          }
          @if (d().canPay) {
            <div class="alert alert-warning d-flex align-items-center gap-2 flex-wrap">
              <i class="bi bi-hourglass-split fs-4"></i>
              <div class="flex-grow-1"><strong>Payment pending.</strong><div class="small">Pay within {{ minutesLeft() }} min or the order will be cancelled automatically.</div></div>
              <button class="btn btn-primary" (click)="payNow()" [disabled]="busy()">Pay {{ o.finalAmount | inr }}</button>
            </div>
          }
          @if (o.orderStatus === 'Cancelled') {
            <div class="alert alert-danger"><i class="bi bi-x-circle me-1"></i><strong>Order cancelled.</strong> @if (o.cancelReason) { <div class="small">Reason: {{ o.cancelReason }}</div> }
              @if (o.refundedAmount) { <div class="small">Refund of {{ o.refundedAmount | inr }} has been started to your original payment method.</div> }
            </div>
          } @else if (o.source === 'Online') {
            <div class="card mb-3"><div class="card-body">
              <div class="status-flow">
                @for (s of flow; track s; let i = $index) {
                  <div class="step" [class.done]="i < stepIndex() || (i === stepIndex() && s === 'Delivered')" [class.current]="i === stepIndex() && s !== 'Delivered'">
                    <div class="dot">@if (i < stepIndex() || s === 'Delivered' && i === stepIndex()) { <i class="bi bi-check"></i> } @else { {{ i + 1 }} }</div>
                    {{ label(s) }}
                  </div>
                }
              </div>
              @if (o.orderStatus === 'Returned') { <div class="alert alert-secondary small mt-3 mb-0 py-2">This order was returned.</div> }
            </div></div>
          }

          @if (d().returnRequest; as r) {
            <div class="card mb-3 border-info-subtle"><div class="card-body">
              <div class="d-flex justify-content-between"><h2 class="h6 fw-semibold mb-1"><i class="bi bi-arrow-return-left me-1"></i>Return request</h2><app-status-badge [status]="r.status === 'Initiated' ? 'Pending' : r.status" /></div>
              <div class="small">{{ r.reason }}@if (r.description) { – {{ r.description }} }</div>
              @if (r.status === 'Initiated') { <div class="small text-muted mt-1">Waiting for the shop to review your request.</div> }
              @if (r.refundAmount && r.status !== 'Rejected') { <div class="small mt-1">Refund: <strong>{{ r.refundAmount | inr }}</strong> · {{ r.refundStatus }}</div> }
              @if (r.approvalNotes) { <div class="small text-muted mt-1">Shop note: {{ r.approvalNotes }}</div> }
            </div></div>
          }

          <div class="card mb-3">
            <div class="card-header d-flex justify-content-between"><span>{{ o.items.length }} item(s)</span><a [routerLink]="['/shop', o.sellerId?._id]" class="small">{{ o.sellerId?.shopName }}</a></div>
            <div class="m-list">
              @for (it of o.items; track $index) {
                <a class="m-item" [routerLink]="['/product', it.productId]">
                  @if (it.image) { <img [src]="it.image" class="thumb" alt="" /> } @else { <span class="thumb"><i class="bi bi-box"></i></span> }
                  <div class="flex-grow-1 min-w-0"><div class="line-clamp-2">{{ it.productName }}</div>@if (it.variantLabel) { <span class="variant-tag">{{ it.variantLabel }}</span> }<small class="text-muted">{{ it.quantity }} × {{ it.subtotal / it.quantity | inr }}</small>
                    @if (productReview(it.productId); as pr) { <div><app-stars [value]="pr.rating" /></div> }
                  </div>
                  <strong>{{ it.subtotal | inr }}</strong>
                </a>
              }
            </div>
            <div class="card-body border-top">
              <div class="summary-row small"><span>Items</span><span>{{ o.subtotal | inr }}</span></div>
              <div class="summary-row small"><span>GST</span><span>{{ o.gstAmount | inr }}</span></div>
              @if (o.deliveryCharge) { <div class="summary-row small"><span>Delivery</span><span>{{ o.deliveryCharge | inr }}</span></div> }
              @if (o.discount) { <div class="summary-row small text-success"><span>Discount</span><span>-{{ o.discount | inr }}</span></div> }
              <div class="summary-row summary-total"><span>Total</span><span>{{ o.finalAmount | inr }}</span></div>
              @if (o.refundedAmount) { <div class="summary-row small text-success"><span>Refunded</span><span>{{ o.refundedAmount | inr }}</span></div> }
            </div>
          </div>
        </div>

        <div class="col-lg-5">
          <div class="card mb-3"><div class="card-body d-grid gap-2">
            @if (d().canReview) { <button class="btn btn-primary" (click)="openRate()"><i class="bi bi-star me-1"></i>{{ d().reviews.length ? 'Edit your rating' : 'Rate this order' }}</button> }
            @if (o.source === 'Online' && ['Delivered', 'Cancelled', 'Returned'].includes(o.orderStatus)) { <button class="btn btn-outline-primary" (click)="reorder()" [disabled]="busy()"><i class="bi bi-arrow-repeat me-1"></i>Order again</button> }
            @if (['Delivered', 'Returned'].includes(o.orderStatus)) { <button class="btn btn-outline-secondary" (click)="invoice()"><i class="bi bi-receipt me-1"></i>View invoice</button> }
            @if (d().canReturn) { <button class="btn btn-outline-secondary" (click)="returnOpen.set(true)"><i class="bi bi-arrow-return-left me-1"></i>Return / item issue</button><small class="text-muted text-center">You can raise an issue until {{ d().returnDeadline | date: 'd MMM, h:mm a' }}</small> }
            @if (d().canCancel) { <button class="btn btn-outline-danger" (click)="cancelOpen.set(true)"><i class="bi bi-x-circle me-1"></i>Cancel order</button> }
            <div class="d-flex gap-2">
              @if (o.sellerId?.mobileNumber) { <a class="btn btn-light flex-grow-1" [href]="'tel:+91' + o.sellerId.mobileNumber"><i class="bi bi-telephone me-1"></i>Call shop</a> }
              <a class="btn btn-light flex-grow-1" routerLink="/support" [queryParams]="{ orderId: o.orderId }"><i class="bi bi-question-circle me-1"></i>Get help</a>
            </div>
          </div></div>

          <div class="card mb-3"><div class="card-body">
            <dl class="dl-grid small mb-0">
              <dt>Placed on</dt><dd>{{ o.createdAt | date: 'd MMM y, h:mm a' }}</dd>
              <dt>Payment</dt><dd>{{ o.paymentMethod === 'Cash' ? 'Cash' : 'Online' }} · <app-status-badge [status]="o.paymentStatus" /></dd>
              @if (o.source === 'Online') {
                <dt>{{ o.deliveryType === 'Pickup' ? 'Pickup' : 'Deliver to' }}</dt>
                <dd>@if (o.deliveryType === 'Pickup') { From store: {{ o.sellerId?.shopAddress || o.sellerId?.shopName }} } @else { {{ o.deliveryAddress?.name }}<br />{{ addr(o.deliveryAddress) }} }</dd>
              }
              @if (o.billingAddress?.fullAddress) {
                <dt>Billing</dt><dd>{{ o.billingAddress.name }}<br />{{ addr(o.billingAddress) }}</dd>
              }
              @if (o.deliveredAt) { <dt>Delivered</dt><dd>{{ o.deliveredAt | date: 'd MMM y, h:mm a' }}</dd> }
              @if (o.customerNote) { <dt>Your note</dt><dd>{{ o.customerNote }}</dd> }
            </dl>
          </div></div>

          <div class="card"><div class="card-header">Order updates</div><div class="card-body">
            <ul class="timeline">
              @for (h of history(); track $index) {
                <li><div class="fw-semibold small">{{ label(h.status) }}</div><small class="text-muted">{{ h.at | date: 'd MMM, h:mm a' }}@if (h.note) { · {{ h.note }} }</small></li>
              }
            </ul>
          </div></div>
        </div>
      </div>
    }

    <app-sheet [open]="cancelOpen()" title="Cancel order" (closed)="cancelOpen.set(false)">
      <p class="small text-muted">Why do you want to cancel?</p>
      <div class="d-flex flex-wrap gap-2 mb-2">
        @for (r of cancelReasons; track r) { <button class="chip" [class.active]="cancelReason === r" (click)="cancelReason = r">{{ r }}</button> }
      </div>
      <textarea class="form-control" rows="2" [(ngModel)]="cancelReason" placeholder="Reason" maxlength="300"></textarea>
      @if (o()?.paymentStatus === 'Completed') { <div class="alert alert-info small py-2 mt-2 mb-0">Your payment of {{ o()?.finalAmount | inr }} will be refunded to the original payment method.</div> }
      <div sheet-footer>
        <button class="btn btn-light" (click)="cancelOpen.set(false)">Keep order</button>
        <button class="btn btn-danger" (click)="cancel()" [disabled]="busy() || cancelReason.trim().length < 3">Cancel order</button>
      </div>
    </app-sheet>

    <app-sheet [open]="returnOpen()" title="Return / item issue" (closed)="returnOpen.set(false)">
      <div class="alert alert-light border small py-2"><i class="bi bi-box-seam me-1"></i>This was an <strong>Open Box Delivery</strong>. Returns depend on the shop; tell them what went wrong or talk to them directly.</div>
      <label class="form-label">Order code</label>
      <div class="input-group mb-2">
        <input class="form-control" [value]="o()?.orderId" readonly />
        <button class="btn btn-outline-secondary" type="button" (click)="copyCode()" aria-label="Copy order code"><i class="bi bi-copy"></i></button>
      </div>
      <label class="form-label required">Reason</label>
      <select class="form-select mb-2" [(ngModel)]="ret.reason"><option value="">Choose a reason</option>@for (r of returnReasons; track r) { <option [value]="r">{{ r }}</option> }</select>
      <label class="form-label">Comment</label>
      <textarea class="form-control mb-2" rows="3" [(ngModel)]="ret.description" maxlength="1000" placeholder="Tell the shop what went wrong"></textarea>
      <div class="d-flex gap-2 mb-3">
        @if (o()?.sellerId?.mobileNumber) {
          <a class="btn btn-sm btn-outline-primary flex-grow-1" [href]="'tel:+91' + o().sellerId.mobileNumber"><i class="bi bi-telephone me-1"></i>Call shop</a>
          <a class="btn btn-sm btn-outline-success flex-grow-1" [href]="whatsappLink()" target="_blank" rel="noopener"><i class="bi bi-whatsapp me-1"></i>WhatsApp shop</a>
        }
      </div>
      <label class="form-label">Photos (up to 4)</label>
      <div class="d-flex flex-wrap gap-2 mb-2">
        @for (f of retFiles(); track $index) { <div class="img-tile"><img [src]="f.url" alt="" /><button class="btn btn-danger btn-sm" (click)="removeRetFile($index)" aria-label="Remove">×</button></div> }
        @if (retFiles().length < 4) { <label class="img-tile d-flex align-items-center justify-content-center border rounded-3 text-muted" style="cursor:pointer"><i class="bi bi-camera fs-4"></i><input type="file" accept="image/*" hidden multiple (change)="addRetFiles($event)" /></label> }
      </div>
      <small class="text-muted">The shop sees your request with the order code. If they approve a return, the refund goes to your original payment method.</small>
      <div sheet-footer>
        <button class="btn btn-light" (click)="returnOpen.set(false)">Close</button>
        <button class="btn btn-primary" (click)="submitReturn()" [disabled]="busy() || !ret.reason">Send to shop</button>
      </div>
    </app-sheet>

    <app-sheet [open]="rateOpen()" title="Rate your order" (closed)="rateOpen.set(false)">
      <div class="text-center mb-3">
        <div class="fw-semibold">How was {{ o()?.sellerId?.shopName }}?</div>
        <app-stars [value]="rate.seller.rating" [editable]="true" size="2rem" (changed)="rate.seller.rating = $event" />
        <textarea class="form-control mt-2" rows="2" [(ngModel)]="rate.seller.reviewText" placeholder="Share your experience with the shop (optional)" maxlength="1000"></textarea>
      </div>
      @for (p of rate.products; track p.productId) {
        <div class="border-top pt-2 mb-2">
          <div class="small fw-semibold line-clamp-2">{{ p.name }}</div>
          <app-stars [value]="p.rating" [editable]="true" size="1.5rem" (changed)="p.rating = $event" />
          <input class="form-control form-control-sm mt-1" [(ngModel)]="p.reviewText" placeholder="Review this product (optional)" maxlength="1000" />
        </div>
      }
      <div sheet-footer>
        <button class="btn btn-light" (click)="rateOpen.set(false)">Later</button>
        <button class="btn btn-primary" (click)="submitRating()" [disabled]="busy() || (!rate.seller.rating && !hasProductRating())">Submit</button>
      </div>
    </app-sheet>
  `,
})
export class OrderDetailComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cart = inject(CartService);
  private auth = inject(AuthService);
  private payment = inject(PaymentService);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  id = this.route.snapshot.paramMap.get('id')!;
  flow = FLOW;
  returnReasons = RETURN_REASONS;
  cancelReasons = ['Ordered by mistake', 'Want to change items', 'Delivery is taking too long', 'Found a better price'];

  d = signal<any>({});
  o = computed(() => this.d().order);
  loading = signal(true);
  error = signal<string | null>(null);
  busy = signal(false);
  now = signal(Date.now());
  cancelOpen = signal(false);
  returnOpen = signal(false);
  rateOpen = signal(false);
  cancelReason = '';
  ret = { reason: '', description: '' };
  retFiles = signal<{ file: File; url: string }[]>([]);
  rate: { seller: { rating: number; reviewText: string }; products: { productId: string; name: string; rating: number; reviewText: string }[] } = { seller: { rating: 0, reviewText: '' }, products: [] };

  stepIndex = computed(() => FLOW.indexOf(this.o()?.orderStatus === 'Returned' ? 'Delivered' : this.o()?.orderStatus));
  history = computed(() => [...(this.o()?.statusHistory ?? [])].reverse());
  minutesLeft = computed(() => {
    const exp = this.o()?.paymentExpiresAt;
    return exp ? Math.max(0, Math.ceil((new Date(exp).getTime() - this.now()) / 60000)) : 30;
  });

  ngOnInit() {
    this.load();
    const t = setInterval(() => this.now.set(Date.now()), 30000);
    this.destroyRef.onDestroy(() => clearInterval(t));
  }

  load() {
    this.api.get<any>(`/orders/${this.id}`).subscribe({
      next: (d) => { this.d.set(d); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.error.set(errorMessage(e)); },
    });
  }

  label(s: string) {
    if (s === 'Shipped') return this.o()?.deliveryType === 'Pickup' ? 'Ready' : 'On the way';
    if (s === 'Pending') return 'Placed';
    return s;
  }

  productReview(productId: string) {
    return (this.d().reviews ?? []).find((r: any) => r.ratingType === 'Product' && r.productId === productId);
  }

  hasProductRating() {
    return this.rate.products.some((p) => p.rating);
  }

  payNow() {
    this.busy.set(true);
    this.api.post<any>(`/orders/${this.o()._id}/retry-payment`).subscribe({
      next: async (r) => {
        let result = 'dismissed';
        try { result = await this.payment.pay(this.o(), r.data); } catch (e: any) { this.toast.error(e?.message || 'Could not open payment'); }
        this.busy.set(false);
        if (result === 'paid') this.toast.success('Payment successful! Your order is placed.');
        else if (result === 'failed') this.toast.error('Payment failed');
        this.load();
      },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); this.load(); },
    });
  }

  cancel() {
    this.busy.set(true);
    this.api.post<any>(`/orders/${this.o()._id}/cancel`, { reason: this.cancelReason.trim() }).subscribe({
      next: (r) => { this.busy.set(false); this.cancelOpen.set(false); this.toast.success(r.message || 'Order cancelled'); this.load(); },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  addRetFiles(e: Event) {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    const room = 4 - this.retFiles().length;
    this.retFiles.set([...this.retFiles(), ...files.slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
    (e.target as HTMLInputElement).value = '';
  }

  removeRetFile(i: number) {
    this.retFiles.set(this.retFiles().filter((_, idx) => idx !== i));
  }

  addr(a: any) {
    if (!a) return '';
    return [a.fullAddress, a.city !== a.taluka ? a.city : '', a.taluka, a.district, a.state].filter(Boolean).join(', ') + (a.zipCode ? ` - ${a.zipCode}` : '');
  }

  copyCode() {
    navigator.clipboard?.writeText(this.o().orderId).then(() => this.toast.success('Order code copied'), () => {});
  }

  whatsappLink() {
    const text = `Hello ${this.o().sellerId?.shopName}, I have a question about my order ${this.o().orderId}.${this.ret.description ? ' ' + this.ret.description : ''}`;
    return `https://wa.me/91${this.o().sellerId?.mobileNumber}?text=${encodeURIComponent(text)}`;
  }

  submitReturn() {
    const fd = new FormData();
    fd.append('reason', this.ret.reason);
    if (this.ret.description) fd.append('description', this.ret.description);
    this.retFiles().forEach((f) => fd.append('images', f.file));
    this.busy.set(true);
    this.api.post<any>(`/orders/${this.o()._id}/return`, fd).subscribe({
      next: (r) => { this.busy.set(false); this.returnOpen.set(false); this.toast.success(r.message || 'Return requested'); this.load(); },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  openRate() {
    const reviews = this.d().reviews ?? [];
    const sellerReview = reviews.find((r: any) => r.ratingType === 'Seller');
    const seen = new Set<string>();
    this.rate = {
      seller: { rating: sellerReview?.rating ?? 0, reviewText: sellerReview?.reviewText ?? '' },
      products: this.o().items
        .filter((it: any) => it.productId && !seen.has(it.productId) && seen.add(it.productId))
        .map((it: any) => { const pr = this.productReview(it.productId); return { productId: it.productId, name: it.productName, rating: pr?.rating ?? 0, reviewText: pr?.reviewText ?? '' }; }),
    };
    this.rateOpen.set(true);
  }

  submitRating() {
    const body: any = { orderId: this.o()._id, products: this.rate.products.filter((p) => p.rating).map(({ productId, rating, reviewText }) => ({ productId, rating, reviewText })) };
    if (this.rate.seller.rating) body.seller = this.rate.seller;
    this.busy.set(true);
    this.api.post<any>('/reviews', body).subscribe({
      next: (r) => { this.busy.set(false); this.rateOpen.set(false); this.toast.success(r.message || 'Thanks!'); this.load(); },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  reorder() {
    this.busy.set(true);
    this.api.post<any>(`/orders/${this.o()._id}/reorder`).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.cart.reset(r.data.items.reduce((s: number, i: any) => s + i.quantity, 0));
        this.auth.setActiveSeller(this.o().sellerId._id);
        r.data.skipped?.length ? this.toast.warning(r.message || 'Some items are not available') : this.toast.success(r.message || 'Added to cart');
        this.router.navigate(['/cart']);
      },
      error: (e) => { this.busy.set(false); this.toast.error(errorMessage(e)); },
    });
  }

  invoice() {
    this.api.get<{ invoiceId: string }>(`/orders/${this.o()._id}/invoice`).subscribe({
      next: (r) => this.router.navigate(['/invoices', r.invoiceId]),
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}
