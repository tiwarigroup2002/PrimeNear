import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse, Shop, User } from '../models/api.models';

const TOKEN = 'pn_user_token';
const USER = 'pn_user';
const SHOPS = 'pn_user_shops';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private base = environment.apiUrl;

  readonly user = signal<User | null>(this.read(USER));
  readonly shops = signal<Shop[]>(this.read(SHOPS) ?? []);
  readonly activeSellerId = signal<string | null>(this.user()?.currentActiveSellerId ?? null);
  readonly activeShop = computed<Shop | null>(() => this.shops().find((s) => s._id === this.activeSellerId()) ?? this.shops()[0] ?? null);
  readonly isLoggedIn = computed(() => !!this.user() && !!this.token);

  get token() {
    return localStorage.getItem(TOKEN);
  }

  sendOtp(mobileNumber: string) {
    return this.http.post<ApiResponse<{ resendIn: number; devOtp?: string }>>(`${this.base}/auth/send-otp`, { mobileNumber });
  }

  verifyOtp(mobileNumber: string, otp: string) {
    return this.http.post<ApiResponse<{ token: string; user: User; sellers: Shop[]; activeSellerId: string }>>(`${this.base}/auth/verify-otp`, { mobileNumber, otp }).pipe(
      map((r) => r.data),
      tap((d) => {
        localStorage.setItem(TOKEN, d.token);
        this.apply(d.user, d.sellers, d.activeSellerId);
      })
    );
  }

  refreshMe() {
    return this.http.get<ApiResponse<{ user: User; sellers: Shop[]; activeSellerId: string }>>(`${this.base}/auth/me`).pipe(tap((r) => this.apply(r.data.user, r.data.sellers, r.data.activeSellerId)));
  }

  setUser(u: User) {
    this.user.set(u);
    localStorage.setItem(USER, JSON.stringify(u));
  }

  setActiveSeller(id: string) {
    this.activeSellerId.set(id);
    const u = this.user();
    if (u) this.setUser({ ...u, currentActiveSellerId: id });
  }

  logout(callServer = true) {
    const done = () => {
      [TOKEN, USER, SHOPS, 'pn_user_cart_count'].forEach((k) => localStorage.removeItem(k));
      this.user.set(null);
      this.shops.set([]);
      this.router.navigate(['/login']);
    };
    if (callServer && this.token) this.http.post(`${this.base}/auth/logout`, {}).subscribe({ complete: done, error: done });
    else done();
  }

  private apply(user: User, shops: Shop[], active: string) {
    this.setUser(user);
    this.shops.set(shops);
    localStorage.setItem(SHOPS, JSON.stringify(shops));
    this.activeSellerId.set(active || user.currentActiveSellerId || shops[0]?._id || null);
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
