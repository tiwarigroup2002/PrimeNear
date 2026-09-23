import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../core/services/auth.service';
import { ApiService } from '../core/services/api.service';
import { ThemeService } from '../core/services/theme.service';
import { PlatformService } from '../core/services/platform.service';
import { IdleService } from '../core/services/idle.service';
import { ConfirmService } from '../core/services/confirm.service';
import { StatusBadgeComponent } from '../shared/components/status-badge.component';
import { TimeAgoPipe } from '../shared/pipes/time-ago.pipe';
import { NAV } from './nav';

interface AdminNotification { _id: string; title: string; message?: string; createdAt: string; isRead: boolean; link?: string; type?: string }

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, StatusBadgeComponent, TimeAgoPipe],
  templateUrl: './shell.component.html',
})
export class ShellComponent implements OnInit {
  auth = inject(AuthService);
  theme = inject(ThemeService);
  platform = inject(PlatformService);
  private api = inject(ApiService);
  private idle = inject(IdleService);
  private router = inject(Router);
  private confirm = inject(ConfirmService);
  private destroyRef = inject(DestroyRef);

  collapsed = signal(localStorage.getItem('pn_sidebar') === 'collapsed');
  mobileOpen = signal(false);
  profileOpen = signal(false);
  bellOpen = signal(false);
  notifications = signal<AdminNotification[]>([]);
  unread = signal(0);

  nav = computed(() =>
    NAV.map((s) => ({ ...s, items: s.items.filter((i) => !i.permissions || this.auth.can(...i.permissions)) })).filter((s) => s.items.length)
  );

  initials = computed(() =>
    (this.auth.admin()?.fullName || '?')
      .split(' ')
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  );

  ngOnInit() {
    this.platform.load();
    this.idle.start(this.platform.config().sessionTimeout);
    // Refresh the admin profile so permission changes apply without re-login
    this.auth.refreshMe().subscribe({ error: () => {} });
    this.loadNotifications();
    const timer = setInterval(() => this.loadNotifications(), 60000);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      this.idle.stop();
    });
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.mobileOpen.set(false);
      this.profileOpen.set(false);
      this.bellOpen.set(false);
    });
  }

  toggleSidebar() {
    this.collapsed.update((v) => !v);
    localStorage.setItem('pn_sidebar', this.collapsed() ? 'collapsed' : 'open');
  }

  loadNotifications() {
    this.api.get<any>('/notifications', { limit: 8 }).subscribe({
      next: (r) => {
        this.notifications.set(r.items);
        this.unread.set(r.unreadCount);
      },
      error: () => {},
    });
  }

  openNotification(n: AdminNotification) {
    if (!n.isRead) this.api.put(`/notifications/${n._id}/read`).subscribe(() => this.loadNotifications());
    if (n.link) this.router.navigateByUrl(n.link);
    this.bellOpen.set(false);
  }

  markAllRead() {
    this.api.post('/notifications/mark-all-read').subscribe(() => this.loadNotifications());
  }

  async logout() {
    if (await this.confirm.confirm('Logout', 'Do you want to logout?', 'primary', 'Logout')) this.auth.logout();
  }
}
