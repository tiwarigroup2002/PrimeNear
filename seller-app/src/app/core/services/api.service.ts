import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api.models';

/** Thin wrapper around HttpClient that unwraps `{ success, data }` responses. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  readonly base = environment.apiUrl;

  static params(query: Record<string, any> = {}): HttpParams {
    let params = new HttpParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') params = params.set(k, String(v));
    });
    return params;
  }

  get<T>(url: string, query?: Record<string, any>): Observable<T> {
    return this.http.get<ApiResponse<T>>(this.base + url, { params: ApiService.params(query) }).pipe(map((r) => r.data));
  }

  /** Returns the full response (data + message). */
  post<T>(url: string, body: any = {}): Observable<ApiResponse<T>> {
    return this.http.post<ApiResponse<T>>(this.base + url, body);
  }

  put<T>(url: string, body: any = {}): Observable<ApiResponse<T>> {
    return this.http.put<ApiResponse<T>>(this.base + url, body);
  }

  delete<T>(url: string, body?: any): Observable<ApiResponse<T>> {
    return this.http.delete<ApiResponse<T>>(this.base + url, { body });
  }

  /** Downloads a file (report, CSV template) and saves it in the browser. */
  download(url: string, fallbackName = 'download'): Observable<void> {
    return this.http.get(this.base + url, { responseType: 'blob', observe: 'response' }).pipe(
      map((res) => {
        const cd = res.headers.get('Content-Disposition') || '';
        const name = /filename="?([^";]+)"?/.exec(cd)?.[1] || fallbackName;
        const href = URL.createObjectURL(res.body as Blob);
        const a = document.createElement('a');
        a.href = href;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(href), 1000);
      })
    );
  }

  fileUrl(path?: string | null): string {
    if (!path) return '';
    return /^https?:/.test(path) ? path : environment.fileBaseUrl + path;
  }
}
