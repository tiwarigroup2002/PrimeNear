import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { ApiService } from './api.service';
import { Category, District, Tahsil } from '../models/api.models';

/** Cached reference data used by forms and filters. */
@Injectable({ providedIn: 'root' })
export class LookupService {
  private api = inject(ApiService);
  private cache = new Map<string, Observable<any>>();

  private cached<T>(key: string, factory: () => Observable<T>): Observable<T> {
    if (!this.cache.has(key)) this.cache.set(key, factory().pipe(shareReplay({ bufferSize: 1, refCount: false })));
    return this.cache.get(key)!;
  }

  districts(): Observable<District[]> {
    return this.cached('districts', () => this.api.get<District[]>('/locations/districts'));
  }

  tahsils(): Observable<Tahsil[]> {
    return this.cached('tahsils', () => this.api.get<Tahsil[]>('/locations/tahsils'));
  }

  categories(): Observable<Category[]> {
    return this.cached('categories', () => this.api.get<Category[]>('/categories'));
  }

  settings(): Observable<any> {
    return this.cached('settings', () => this.api.get<any>('/settings'));
  }

  invalidate(key?: string) {
    if (key) this.cache.delete(key);
    else this.cache.clear();
  }
}
