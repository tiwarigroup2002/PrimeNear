import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { ApiService } from './api.service';
import { ToastService } from './toast.service';
import { CartData } from '../models/api.models';

/** Keeps the cart badge in sync across the app. */
@Injectable({ providedIn: 'root' })
export class CartService {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly count = signal<number>(Number(localStorage.getItem('pn_user_cart_count')) || 0);

  private setCount(n: number) {
    this.count.set(n);
    localStorage.setItem('pn_user_cart_count', String(n));
  }

  load(deliveryType?: string): Observable<CartData> {
    return this.api.get<CartData>('/cart', { deliveryType }).pipe(tap((c) => this.setCount(c.items.reduce((s, i) => s + i.quantity, 0))));
  }

  add(productId: string, quantity = 1): Observable<CartData> {
    return this.api.post<CartData>('/cart/add-item', { productId, quantity }).pipe(
      map((r) => {
        if (r.data.cartCleared) this.toast.warning('Your cart had items from another shop, so it was emptied');
        return r.data;
      }),
      tap((c) => this.setCount(c.items.reduce((s, i) => s + i.quantity, 0)))
    );
  }

  update(productId: string, quantity: number): Observable<CartData> {
    return this.api.put<CartData>('/cart/update-item', { productId, quantity }).pipe(map((r) => r.data), tap((c) => this.setCount(c.items.reduce((s, i) => s + i.quantity, 0))));
  }

  remove(productId: string): Observable<CartData> {
    return this.api.delete<CartData>(`/cart/remove-item/${productId}`).pipe(map((r) => r.data), tap((c) => this.setCount(c.items.reduce((s, i) => s + i.quantity, 0))));
  }

  reset(n = 0) {
    this.setCount(n);
  }
}
