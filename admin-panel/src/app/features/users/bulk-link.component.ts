import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { PageHeaderComponent, StatusBadgeComponent } from '../../shared';

@Component({
  selector: 'app-bulk-link',
  imports: [PageHeaderComponent, RouterLink, StatusBadgeComponent],
  template: `
    <app-page-header title="Bulk link users" icon="bi-upload" back="/users" backLabel="Users" subtitle="Upload a CSV to create users and link them to sellers in one go." />
    <div class="row g-3">
      <div class="col-lg-4">
        <div class="card mb-3">
          <div class="card-header"><span class="card-title">1. Download template</span></div>
          <div class="card-body small">
            <p>Columns: <code>mobileNumber, name, sellerName, customerType</code></p>
            <ul class="ps-3">
              <li><b>mobileNumber</b> – 10 digits (+91 / 0 prefix allowed)</li>
              <li><b>sellerName</b> – exact shop name (case-insensitive)</li>
              <li><b>customerType</b> – Retail / Wholesale (optional)</li>
            </ul>
            <button class="btn btn-sm btn-outline-primary" (click)="template()"><i class="bi bi-download me-1"></i>Download CSV template</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">2. Upload file</span></div>
          <div class="card-body">
            <div class="border border-2 rounded p-4 text-center mb-3" style="border-style: dashed !important" [class.border-primary]="dragging()" (dragover)="$event.preventDefault(); dragging.set(true)" (dragleave)="dragging.set(false)" (drop)="drop($event)">
              <i class="bi bi-filetype-csv fs-1 text-muted"></i>
              <div class="small text-muted mb-2">Drag & drop a CSV here or</div>
              <label class="btn btn-sm btn-outline-secondary mb-0">Choose file<input type="file" accept=".csv,text/csv" hidden (change)="choose($event)" /></label>
              @if (file()) { <div class="small mt-2 fw-semibold">{{ file()!.name }} ({{ (file()!.size / 1024).toFixed(1) }} KB)</div> }
            </div>
            <div class="d-grid gap-2">
              <button class="btn btn-outline-primary" [disabled]="!file() || busy()" (click)="run(true)"><i class="bi bi-eye me-1"></i>Preview (dry run)</button>
              <button class="btn btn-primary" [disabled]="!file() || busy() || !previewed()" (click)="run(false)">@if (busy()) { <span class="spinner-border spinner-border-sm me-1"></span> }<i class="bi bi-link-45deg me-1"></i>Process upload</button>
            </div>
            @if (busy()) { <div class="progress mt-3" style="height: 6px"><div class="progress-bar progress-bar-striped progress-bar-animated w-100"></div></div> }
          </div>
        </div>
      </div>
      <div class="col-lg-8">
        <div class="card h-100">
          <div class="card-header"><span class="card-title">3. Result</span></div>
          @if (result(); as r) {
            <div class="card-body pb-0">
              <div class="row g-2 text-center mb-3">
                <div class="col"><div class="border rounded p-2"><div class="small text-muted">Rows</div><div class="fs-5 fw-semibold">{{ r.totalRows }}</div></div></div>
                @if (!r.dryRun) {
                  <div class="col"><div class="border rounded p-2"><div class="small text-muted">Linked</div><div class="fs-5 fw-semibold text-success">{{ r.linkedCount }}</div></div></div>
                  <div class="col"><div class="border rounded p-2"><div class="small text-muted">New users</div><div class="fs-5 fw-semibold">{{ r.newUsers }}</div></div></div>
                  <div class="col"><div class="border rounded p-2"><div class="small text-muted">Already linked</div><div class="fs-5 fw-semibold">{{ r.alreadyLinked }}</div></div></div>
                }
                <div class="col"><div class="border rounded p-2"><div class="small text-muted">Errors</div><div class="fs-5 fw-semibold text-danger">{{ r.failedCount }}</div></div></div>
              </div>
              @if (r.dryRun) { <div class="alert alert-info small py-2">Preview only – nothing was saved. Fix errors if needed, then click <b>Process upload</b>.</div> }
              @else { <div class="alert alert-success small py-2"><i class="bi bi-check-circle me-1"></i>{{ r.linkedCount }} user(s) linked successfully. <a routerLink="/users">View users</a></div> }
            </div>
            <div class="table-responsive" style="max-height: 480px">
              <table class="table table-sm">
                <thead class="sticky-top"><tr><th>Row</th><th>Mobile</th><th>Name</th><th>Seller</th><th>Result</th><th>Message</th></tr></thead>
                <tbody>
                  @for (row of r.results; track row.row) {
                    <tr [class.table-danger]="row.status === 'error'">
                      <td>{{ row.row }}</td><td>{{ row.mobileNumber }}</td><td>{{ row.name }}</td><td>{{ row.sellerName }}</td>
                      <td><app-status-badge [status]="row.status === 'ok' ? 'Success' : row.status === 'error' ? 'Failed' : 'Closed'" /></td>
                      <td class="small">{{ row.message }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="card-body text-center text-muted py-5"><i class="bi bi-table fs-1 d-block opacity-50"></i>Upload a file and click Preview to see the rows here.</div>
          }
        </div>
      </div>
    </div>
  `,
})
export class BulkLinkComponent {
  private api = inject(ApiService);
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  file = signal<File | null>(null);
  result = signal<any>(null);
  busy = signal(false);
  previewed = signal(false);
  dragging = signal(false);

  template() {
    this.api.download('/users/bulk-link/template', 'bulk-link-template.csv').subscribe();
  }

  choose(e: Event) {
    this.setFile((e.target as HTMLInputElement).files?.[0] ?? null);
  }

  drop(e: DragEvent) {
    e.preventDefault();
    this.dragging.set(false);
    this.setFile(e.dataTransfer?.files?.[0] ?? null);
  }

  private setFile(f: File | null) {
    if (f && !/\.csv$/i.test(f.name)) {
      this.toast.error('Please choose a .csv file');
      return;
    }
    this.file.set(f);
    this.result.set(null);
    this.previewed.set(false);
  }

  run(dryRun: boolean) {
    const f = this.file();
    if (!f) return;
    const fd = new FormData();
    fd.append('csvFile', f);
    fd.append('dryRun', String(dryRun));
    this.busy.set(true);
    this.http.post<any>(`${this.api.base}/users/bulk-link`, fd).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.result.set(r.data);
        if (dryRun) this.previewed.set(true);
        else {
          this.toast.success(`${r.data.linkedCount} user(s) linked`);
          this.previewed.set(false);
        }
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(errorMessage(e));
      },
    });
  }
}
