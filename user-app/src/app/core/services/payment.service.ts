import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { AppConfigService } from './app-config.service';

export interface GatewayInfo { gateway: 'razorpay' | 'mock'; keyId?: string; razorpayOrderId: string; amount: number; currency: string }
export type PayResult = 'paid' | 'dismissed' | 'failed';

declare global {
  interface Window { Razorpay?: any }
}

/**
 * Opens Razorpay checkout (or a test-payment sheet when the server runs without
 * Razorpay keys) and verifies the result with the backend.
 */
@Injectable({ providedIn: 'root' })
export class PaymentService {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private cfg = inject(AppConfigService);

  /** Pending test payment shown by <app-mock-pay-host>. */
  readonly mock = signal<{ orderId: string; orderCode: string; amount: number; resolve: (r: PayResult) => void } | null>(null);
  readonly mockBusy = signal(false);

  async pay(order: { _id: string; orderId: string }, info: GatewayInfo): Promise<PayResult> {
    if (info.gateway === 'mock') {
      return new Promise<PayResult>((resolve) => this.mock.set({ orderId: order._id, orderCode: order.orderId, amount: info.amount / 100, resolve }));
    }
    await this.loadScript();
    return new Promise<PayResult>((resolve) => {
      const user = this.auth.user();
      const rz = new window.Razorpay!({
        key: info.keyId,
        amount: info.amount,
        currency: info.currency,
        order_id: info.razorpayOrderId,
        name: this.cfg.config().platformName,
        description: `Order ${order.orderId}`,
        prefill: { contact: user?.mobileNumber ? '+91' + user.mobileNumber : undefined, name: user?.name, email: user?.email },
        theme: { color: '#d70f64' },
        handler: async (resp: any) => {
          try {
            await firstValueFrom(this.api.post('/orders/verify-payment', { orderId: order._id, razorpayOrderId: resp.razorpay_order_id, razorpayPaymentId: resp.razorpay_payment_id, razorpaySignature: resp.razorpay_signature }));
            resolve('paid');
          } catch {
            resolve('failed');
          }
        },
        modal: { ondismiss: () => resolve('dismissed'), confirm_close: true },
      });
      rz.open();
    });
  }

  /** Called by the test-payment sheet. */
  async mockResult(result: 'success' | 'fail' | 'dismiss') {
    const m = this.mock();
    if (!m) return;
    if (result === 'dismiss') {
      this.mock.set(null);
      return m.resolve('dismissed');
    }
    this.mockBusy.set(true);
    try {
      if (result === 'success') await firstValueFrom(this.api.post('/orders/verify-payment', { orderId: m.orderId, mock: true }));
      else await firstValueFrom(this.api.post(`/orders/${m.orderId}/payment-failed`, { reason: 'Test payment failed' }));
      m.resolve(result === 'success' ? 'paid' : 'failed');
    } catch {
      m.resolve('failed');
    } finally {
      this.mockBusy.set(false);
      this.mock.set(null);
    }
  }

  private loadScript(): Promise<void> {
    if (window.Razorpay) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Could not load the payment page. Check your internet connection.'));
      document.body.appendChild(s);
    });
  }
}
