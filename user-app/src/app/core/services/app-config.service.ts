import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

export interface AppConfig { platformName: string; platformLogo?: string; supportPhone?: string; supportEmail?: string; supportHours?: any }

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private api = inject(ApiService);
  readonly config = signal<AppConfig>({ platformName: 'PrimeNear' });
  load() {
    this.api.get<AppConfig>('/config').subscribe({ next: (c) => { this.config.set(c); document.title = c.platformName; }, error: () => {} });
  }
}
