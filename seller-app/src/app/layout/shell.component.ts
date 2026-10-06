import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/services/auth.service';
import { ApiService } from '../core/services/api.service';
import { ThemeService } from '../core/services/theme.service';
import { AppConfigService } from '../core/services/app-config.service';
import { ToastService } from '../core/services/toast.service';
import { ConfirmService } from '../core/services/confirm.service';
import { errorMessage } from '../core/interceptors/auth.interceptor';
import { SheetComponent } from '../shared/components/bottom-sheet.component';
import { StatusBadgeComponent } from '../shared/components/status-badge.component';
import { InrPipe } from '../shared/pipes/inr.pipe';
import { TimeAgoPipe } from '../shared/pipes/time-ago.pipe';
import { NAV, TABS } from './nav';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, SheetComponent, StatusBadgeComponent, InrPipe, TimeAgoPipe],
  templateUrl: './shell.component.html',
})
export class ShellComponent implements OnInit {
  auth = inject(AuthService);
  theme = inject(ThemeService);
  cfg = inject(AppConfigService);
  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private destroyRef = inject(DestroyRef);

  nav = NAV;
  tabs = TABS;
  moreOpen = signal(false);
  shopOpen = signal(false);
  unread = signal(0);
  openOrders = signal(0);
  ordersOpen = signal(false);
  recentOrders = signal<any[] | null>(null);

  ngOnInit() {
    this.auth.refreshMe().subscribe({ error: () => {} });
    this.auth.loadShops().subscribe({ error: () => {} });
    this.loadUnread();
    const t = setInterval(() => this.loadUnread(), 60000);
    this.destroyRef.onDestroy(() => clearInterval(t));
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.moreOpen.set(false);
      this.shopOpen.set(false);
      this.ordersOpen.set(false);
      this.loadUnread();
    });
  }

  loadUnread() {
    this.api.get<any>('/notifications', { limit: 1 }).subscribe({ next: (r) => this.unread.set(r.unreadCount), error: () => {} });
    this.api.get<any>('/orders', { status: 'open', limit: 1 }).subscribe({ next: (r) => this.openOrders.set(r.totalCount), error: () => {} });
  }

  openRecentOrders() {
    this.recentOrders.set(null);
    this.ordersOpen.set(true);
    this.api.get<any>('/orders', { limit: 8 }).subscribe({ next: (r) => this.recentOrders.set(r.items), error: () => this.recentOrders.set([]) });
  }

  switchShop(id: string) {
    if (id === this.auth.seller()?._id) return this.shopOpen.set(false);
    this.auth.selectShop(id).subscribe({
      next: (s) => {
        this.shopOpen.set(false);
        this.toast.success(`Switched to ${s.shopName}`);
        // reload the current screen with the new shop's data
        const url = this.router.url;
        this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => this.router.navigateByUrl(url.split('/').slice(0, 2).join('/') || '/dashboard'));
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }

  async logout() {
    if (await this.confirm.confirm('Logout?', 'You will need an OTP to login again.', 'primary', 'Logout')) this.auth.logout();
  }
}
