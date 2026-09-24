import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/services/auth.service';
import { CartService } from '../core/services/cart.service';
import { ApiService } from '../core/services/api.service';
import { AppConfigService } from '../core/services/app-config.service';
import { ToastService } from '../core/services/toast.service';
import { ConfirmService } from '../core/services/confirm.service';
import { errorMessage } from '../core/interceptors/auth.interceptor';
import { SheetComponent } from '../shared/components/bottom-sheet.component';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule, SheetComponent],
  templateUrl: './shell.component.html',
})
export class ShellComponent implements OnInit {
  auth = inject(AuthService);
  cart = inject(CartService);
  cfg = inject(AppConfigService);
  private api = inject(ApiService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private destroyRef = inject(DestroyRef);

  shopsOpen = signal(false);
  unread = signal(0);
  q = '';

  ngOnInit() {
    this.auth.refreshMe().subscribe({ error: () => {} });
    this.cart.load().subscribe({ error: () => {} });
    this.loadUnread();
    const t = setInterval(() => this.loadUnread(), 60000);
    this.destroyRef.onDestroy(() => clearInterval(t));
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => this.shopsOpen.set(false));
  }

  loadUnread() {
    this.api.get<any>('/notifications', { limit: 1 }).subscribe({ next: (r) => this.unread.set(r.unreadCount), error: () => {} });
  }

  search() {
    this.router.navigate(['/search'], { queryParams: { q: this.q || null } });
  }

  async switchShop(id: string) {
    if (id === this.auth.activeSellerId()) return this.shopsOpen.set(false);
    if (this.cart.count() && !(await this.confirm.confirm('Switch shop?', 'Your cart will be emptied because it has items from the current shop.', 'warning', 'Switch'))) return;
    this.api.post<any>('/sellers/switch', { sellerId: id }).subscribe({
      next: (r) => {
        this.auth.setActiveSeller(id);
        if (r.data.cartCleared) this.cart.reset(0);
        this.shopsOpen.set(false);
        this.toast.success(r.message || 'Shop switched');
        this.router.navigate(['/home']);
      },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}
