import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { PageHeaderComponent, StateComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-ticket',
  imports: [DatePipe, FormsModule, PageHeaderComponent, StateComponent, StatusBadgeComponent],
  template: `
    <app-page-header [title]="t()?.ticketId || 'Ticket'" back="/support" backLabel="Support" />
    <app-state [loading]="!t() && !error()" [error]="error()" />
    @if (t(); as t) {
      <div class="card mb-3"><div class="card-body">
        <div class="mb-1"><app-status-badge [status]="t.status" /> <span class="badge text-bg-light border">{{ t.category }}</span></div>
        <h2 class="h6 fw-bold">{{ t.title }}</h2>
        <p class="small text-pre mb-1">{{ t.description }}</p>
        <div class="small text-muted">{{ t.createdAt | date: 'd MMM y, h:mm a' }}@if (t.orderId) { · Order {{ t.orderId.orderId }} }</div>
        @if (t.images?.length) { <div class="d-flex gap-2 mt-2">@for (i of t.images; track $index) { <a [href]="i" target="_blank"><img [src]="i" class="thumb" alt="" /></a> }</div> }
        @if (t.resolution) { <div class="alert alert-success small mt-3 mb-0"><strong>Resolution:</strong> {{ t.resolution }}</div> }
      </div></div>
      <div class="card">
        <div class="card-header"><span class="card-title">Messages</span></div>
        <div class="card-body">
          @for (c of t.comments; track c._id) {
            <div class="d-flex mb-2" [class.justify-content-end]="c.byType === 'User'">
              <div class="rounded p-2 small" style="max-width: 85%" [class.bg-primary-subtle]="c.byType === 'User'" [class.bg-body-tertiary]="c.byType !== 'Seller'">
                <div class="fw-semibold">{{ c.byType === 'User' ? 'You' : c.byType === 'Admin' ? 'PrimeNear support' : c.byName }}</div>
                @if (c.text) { <div class="text-pre">{{ c.text }}</div> }
                @if (c.attachments?.length) { <div class="d-flex gap-1 mt-1">@for (a of c.attachments; track $index) { <a [href]="a" target="_blank"><img [src]="a" class="thumb" alt="" /></a> }</div> }
                <div class="small text-muted">{{ c.at | date: 'd MMM, h:mm a' }}</div>
              </div>
            </div>
          } @empty { <div class="text-muted small text-center py-3">Our team will reply here.</div> }
          @if (t.status !== 'Closed') {
            <div class="input-group mt-3">
              <label class="btn btn-outline-secondary mb-0" title="Attach photo"><i class="bi bi-paperclip"></i><input type="file" hidden accept="image/*" multiple (change)="files = $any($event.target).files" /></label>
              <input class="form-control" placeholder="Type a message" [(ngModel)]="text" (keyup.enter)="send()" />
              <button class="btn btn-primary" (click)="send()"><i class="bi bi-send"></i></button>
            </div>
            @if (files?.length) { <div class="small text-muted mt-1">{{ files!.length }} file(s) attached</div> }
          }
        </div>
      </div>
    }
  `,
})
export class TicketComponent implements OnInit {
  @Input() id!: string;
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  t = signal<any>(null);
  error = signal<string | null>(null);
  text = '';
  files: FileList | null = null;

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.get<any>(`/support/${this.id}`).subscribe({ next: (t) => this.t.set(t), error: (e) => this.error.set(errorMessage(e)) });
  }

  send() {
    if (!this.text.trim() && !this.files?.length) return;
    const fd = new FormData();
    fd.append('text', this.text);
    Array.from(this.files ?? []).forEach((f) => fd.append('attachments', f));
    this.http.post(`${this.api.base}/support/${this.id}/comments`, fd).subscribe({
      next: () => { this.text = ''; this.files = null; this.load(); },
      error: (e) => this.toast.error(errorMessage(e)),
    });
  }
}
