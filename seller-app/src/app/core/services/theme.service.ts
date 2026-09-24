import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<'light' | 'dark'>((localStorage.getItem('pn_seller_theme') as 'light' | 'dark') || 'light');

  constructor() {
    this.apply();
  }

  toggle() {
    this.theme.set(this.theme() === 'light' ? 'dark' : 'light');
    localStorage.setItem('pn_seller_theme', this.theme());
    this.apply();
  }

  private apply() {
    document.documentElement.setAttribute('data-bs-theme', this.theme());
  }
}
