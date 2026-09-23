import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

export interface PublicConfig {
  platformName: string;
  platformLogo?: string;
  supportEmail?: string;
  sessionTimeout: number;
}

@Injectable({ providedIn: 'root' })
export class PlatformService {
  private api = inject(ApiService);
  readonly config = signal<PublicConfig>({ platformName: 'PrimeNear', sessionTimeout: 30 });

  load() {
    this.api.get<PublicConfig>('/public-config').subscribe({
      next: (c) => {
        this.config.set(c);
        document.title = `${c.platformName} Admin`;
      },
      error: () => {},
    });
  }
}
