import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, Seller, ShopSummary } from '../models/api.models';

const TOKEN = 'pn_seller_token';
const SELLER = 'pn_seller';
const OWNER = 'pn_seller_owner';
const SHOPS = 'pn_seller_shops';

export interface VerifyResult {
  token?: string;
  seller?: Seller;
  selectShop?: boolean;
  ownerToken?: string;
  shops: ShopSummary[];
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private base = environment.apiUrl;

  readonly seller = signal<Seller | null>(this.read(SELLER));
  readonly shops = signal<ShopSummary[]>(this.read(SHOPS) ?? []);
  readonly isLoggedIn = computed(() => !!this.seller() && !!this.token);
  readonly hasManyShops = computed(() => this.shops().length > 1);

  get token(): string | null {
    return localStorage.getItem(TOKEN);
  }

  get ownerToken(): string | null {
    return sessionStorage.getItem(OWNER);
  }

  sendOtp(mobileNumber: string) {
    return this.http.post<ApiResponse<{ expiresIn: number; resendIn: number; devOtp?: string }>>(`${this.base}/auth/send-otp`, { mobileNumber });
  }

  verifyOtp(mobileNumber: string, otp: string): Observable<VerifyResult> {
    return this.http.post<ApiResponse<VerifyResult>>(`${this.base}/auth/verify-otp`, { mobileNumber, otp }).pipe(
      map((r) => r.data),
      tap((d) => {
        this.setShops(d.shops);
        if (d.token && d.seller) this.store(d.token, d.seller);
        else if (d.ownerToken) sessionStorage.setItem(OWNER, d.ownerToken);
      })
    );
  }

  /** Picks (or switches to) a shop of the same owner. */
  selectShop(shopId: string): Observable<Seller> {
    const token = this.token || this.ownerToken;
    return this.http
      .post<ApiResponse<{ token: string; seller: Seller }>>(`${this.base}/auth/select-shop`, { shopId }, { headers: { Authorization: `Bearer ${token}` } })
      .pipe(
        map((r) => r.data),
        tap((d) => {
          sessionStorage.removeItem(OWNER);
          this.store(d.token, d.seller);
        }),
        map((d) => d.seller)
      );
  }

  loadShops() {
    return this.http.get<ApiResponse<ShopSummary[]>>(`${this.base}/auth/shops`).pipe(tap((r) => this.setShops(r.data)));
  }

  refreshMe() {
    return this.http.get<ApiResponse<Seller>>(`${this.base}/auth/me`).pipe(tap((r) => this.setSeller(r.data)));
  }

  setSeller(s: Seller) {
    this.seller.set(s);
    localStorage.setItem(SELLER, JSON.stringify(s));
  }

  logout(callServer = true, reason?: string) {
    const done = () => {
      this.clear();
      this.router.navigate(['/login'], reason ? { queryParams: { reason } } : {});
    };
    if (callServer && this.token) this.http.post(`${this.base}/auth/logout`, {}).subscribe({ complete: done, error: done });
    else done();
  }

  clear() {
    [TOKEN, SELLER, SHOPS].forEach((k) => localStorage.removeItem(k));
    sessionStorage.removeItem(OWNER);
    this.seller.set(null);
    this.shops.set([]);
  }

  private store(token: string, seller: Seller) {
    localStorage.setItem(TOKEN, token);
    this.setSeller(seller);
  }

  private setShops(shops: ShopSummary[]) {
    this.shops.set(shops);
    localStorage.setItem(SHOPS, JSON.stringify(shops));
  }

  private read(key: string) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
