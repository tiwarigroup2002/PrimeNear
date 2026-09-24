import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<'light' | 'dark'>((localStorage.getItem('pn_user_theme') as 'light' | 'dark') || 'light');

  constructor() {
    this.apply();
  }

  toggle() {
    this.theme.set(this.theme() === 'light' ? 'dark' : 'light');
    localStorage.setItem('pn_user_theme', this.theme());
    this.apply();
  }

  set(t: 'light' | 'dark') {
    this.theme.set(t);
    localStorage.setItem('pn_user_theme', t);
    this.apply();
  }

  private apply() {
    document.documentElement.setAttribute('data-bs-theme', this.theme());
  }
}
