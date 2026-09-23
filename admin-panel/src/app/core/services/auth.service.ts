import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AdminUser, ApiResponse, LoginResult } from '../models/api.models';

const TOKEN_KEY = 'pn_admin_token';
const ADMIN_KEY = 'pn_admin_user';
const TEMP_KEY = 'pn_admin_2fa';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private base = environment.apiUrl + '/auth';

  readonly admin = signal<AdminUser | null>(this.readAdmin());
  readonly isLoggedIn = computed(() => !!this.admin() && !!this.token);
  readonly permissions = computed(() => new Set(this.admin()?.permissions ?? []));

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  }

  get tempToken(): string | null {
    return sessionStorage.getItem(TEMP_KEY);
  }

  can(...perms: string[]): boolean {
    const set = this.permissions();
    return perms.some((p) => set.has(p));
  }

  login(email: string, password: string, remember: boolean): Observable<LoginResult> {
    return this.http.post<ApiResponse<LoginResult>>(`${this.base}/login`, { email, password }).pipe(
      map((r) => r.data),
      tap((data) => {
        localStorage.setItem('pn_remember', remember ? '1' : '0');
        if (data.requires2fa && data.tempToken) sessionStorage.setItem(TEMP_KEY, data.tempToken);
        else this.storeSession(data);
      })
    );
  }

  verify2fa(code: string): Observable<LoginResult> {
    return this.http
      .post<ApiResponse<LoginResult>>(`${this.base}/verify-2fa`, { code }, { headers: { Authorization: `Bearer ${this.tempToken}` } })
      .pipe(
        map((r) => r.data),
        tap((data) => {
          sessionStorage.removeItem(TEMP_KEY);
          this.storeSession(data);
        })
      );
  }

  forgotPassword(email: string) {
    return this.http.post<ApiResponse<null>>(`${this.base}/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string) {
    return this.http.post<ApiResponse<null>>(`${this.base}/reset-password`, { token, newPassword });
  }

  /** Reloads the current admin (permissions may have changed). */
  refreshMe(): Observable<AdminUser> {
    return this.http.get<ApiResponse<AdminUser>>(`${this.base}/me`).pipe(
      map((r) => r.data),
      tap((admin) => this.setAdmin(admin))
    );
  }

  setAdmin(admin: AdminUser) {
    this.admin.set(admin);
    this.storage().setItem(ADMIN_KEY, JSON.stringify(admin));
  }

  /** Replaces the token (after password change). */
  setToken(token: string) {
    this.storage().setItem(TOKEN_KEY, token);
  }

  logout(callServer = true, reason?: string) {
    const done = () => {
      this.clear();
      this.router.navigate(['/auth/login'], reason ? { queryParams: { reason } } : {});
    };
    if (callServer && this.token) {
      this.http.post(`${this.base}/logout`, {}).subscribe({ complete: done, error: done });
    } else {
      done();
    }
  }

  clear() {
    [localStorage, sessionStorage].forEach((s) => {
      s.removeItem(TOKEN_KEY);
      s.removeItem(ADMIN_KEY);
    });
    sessionStorage.removeItem(TEMP_KEY);
    this.admin.set(null);
  }

  private storeSession(data: LoginResult) {
    if (!data.token || !data.admin) return;
    this.clear();
    const store = this.storage();
    store.setItem(TOKEN_KEY, data.token);
    store.setItem(ADMIN_KEY, JSON.stringify(data.admin));
    this.admin.set(data.admin);
  }

  private storage(): Storage {
    return localStorage.getItem('pn_remember') === '1' ? localStorage : sessionStorage;
  }

  private readAdmin(): AdminUser | null {
    const raw = localStorage.getItem(ADMIN_KEY) || sessionStorage.getItem(ADMIN_KEY);
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
