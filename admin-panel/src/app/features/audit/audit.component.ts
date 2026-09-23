import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { PagedList } from '../../core/utils/paged-list';
import { ModalComponent, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent, TimeAgoPipe } from '../../shared';

type Tab = 'audit' | 'activity' | 'system' | 'logins';

@Component({
  selector: 'app-audit',
  imports: [DatePipe, JsonPipe, FormsModule, PageHeaderComponent, PaginationComponent, StateComponent, StatusBadgeComponent, ModalComponent, TimeAgoPipe],
  templateUrl: './audit.component.html',
})
export class AuditComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);
  tab = signal<Tab>((inject(ActivatedRoute).snapshot.queryParamMap.get('tab') as Tab) || 'audit');

  audit = new PagedList<any>('/audit-logs', { action: '', entityType: '', admin: '', status: '', from: '', to: '' }, false);
  system = new PagedList<any>('/system-logs', { level: '', search: '', from: '', to: '' }, false);
  logins = new PagedList<any>('/login-history', { status: '', admin: '', from: '', to: '' }, false);
  admins = signal<any[]>([]);
  feed = signal<any[]>([]);
  detail = signal<any>(null);
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit() {
    this.api.get<any>('/admins', { limit: 200 }).subscribe({ next: (r) => this.admins.set(r.items), error: () => {} });
    this.setTab(this.tab());
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }

  setTab(t: Tab) {
    this.tab.set(t);
    this.router.navigate([], { queryParams: { tab: t }, replaceUrl: true });
    clearInterval(this.timer);
    if (t === 'audit') this.audit.load();
    if (t === 'system') this.system.load();
    if (t === 'logins') this.logins.load();
    if (t === 'activity') {
      this.loadFeed();
      this.timer = setInterval(() => this.loadFeed(), 10000); // live-ish monitor
    }
  }

  loadFeed() {
    this.api.get<any[]>('/audit-logs/feed').subscribe((f) => this.feed.set(f));
  }

  open(log: any) {
    this.api.get<any>(`/audit-logs/${log._id}`).subscribe((d) => this.detail.set(d));
  }

  actionColor(a: string) {
    if (/Delete|Block|Cancel|Reject|Disable/i.test(a)) return 'danger';
    if (/Create|Unblock|Enable|Resolve|Complete/i.test(a)) return 'success';
    if (/Refund|Payout/i.test(a)) return 'warning';
    return 'primary';
  }
}
