import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { InrPipe } from '../../shared';

@Component({
  selector: 'app-order-success',
  imports: [RouterLink, InrPipe],
  template: `
    <div class="text-center py-4" style="max-width:460px;margin:0 auto">
      <div class="success-mark"><i class="bi bi-check-lg"></i></div>
      <h1 class="h4 fw-bold mt-3 mb-1">Order placed!</h1>
      <p class="text-muted">ऑर्डर सफलतापूर्वक हो गया। दुकानदार जल्द ही इसे कन्फर्म करेगा।</p>
      @if (o(); as o) {
        <div class="card text-start mb-3"><div class="card-body">
          <dl class="dl-grid small mb-0">
            <dt>Order ID</dt><dd class="fw-semibold">{{ o.orderId }}</dd>
            <dt>Shop</dt><dd>{{ o.sellerId?.shopName }}</dd>
            <dt>Amount</dt><dd>{{ o.finalAmount | inr }}</dd>
            <dt>Payment</dt><dd>{{ o.paymentMethod === 'Cash' ? (o.deliveryType === 'Pickup' ? 'Pay at store' : 'Cash on delivery') : 'Paid online' }}</dd>
            <dt>{{ o.deliveryType === 'Pickup' ? 'Pickup from' : 'Deliver to' }}</dt><dd>{{ o.deliveryType === 'Pickup' ? o.sellerId?.shopAddress || o.sellerId?.shopName : o.deliveryAddress?.fullAddress }}</dd>
          </dl>
        </div></div>
      }
      <div class="d-grid gap-2">
        <a [routerLink]="['/orders', id]" class="btn btn-primary btn-lg">Track order</a>
        <a routerLink="/home" class="btn btn-light">Continue shopping</a>
      </div>
    </div>
  `,
})
export class OrderSuccessComponent implements OnInit {
  private api = inject(ApiService);
  id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
  o = signal<any>(null);
  ngOnInit() {
    this.api.get<any>(`/orders/${this.id}`).subscribe({ next: (d) => this.o.set(d.order), error: () => {} });
  }
}
