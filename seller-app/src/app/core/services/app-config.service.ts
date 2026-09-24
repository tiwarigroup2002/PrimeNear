import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

export interface AppConfig {
  platformName: string;
  platformLogo?: string;
  supportPhone?: string;
  supportEmail?: string;
  gstSlabs: { percentage: number; description: string }[];
  lowStockThreshold: number;
  maintenanceMode: boolean;
  maintenanceMessage?: string;
}

/** Public platform settings (branding, GST slabs, support contact). */
@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private api = inject(ApiService);
  readonly config = signal<AppConfig>({ platformName: 'PrimeNear', gstSlabs: [0, 5, 12, 18, 28].map((p) => ({ percentage: p, description: `${p}%` })), lowStockThreshold: 5, maintenanceMode: false });

  load() {
    this.api.get<AppConfig>('/config').subscribe({
      next: (c) => {
        this.config.set(c);
        document.title = `${c.platformName} Seller`;
      },
      error: () => {},
    });
  }
}
