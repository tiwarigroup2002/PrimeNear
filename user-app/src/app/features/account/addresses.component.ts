import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../core/services/confirm.service';
import { Address } from '../../core/models/api.models';
import { errorMessage } from '../../core/interceptors/auth.interceptor';
import { AddressFormComponent, PageHeaderComponent, SheetComponent, StateComponent } from '../../shared';

@Component({
  selector: 'app-addresses',
  imports: [PageHeaderComponent, SheetComponent, StateComponent, AddressFormComponent],
  template: `
    <app-page-header title="My addresses" back="/account" backLabel="Account">
      <button class="btn btn-sm btn-primary" (click)="edit(null)"><i class="bi bi-plus-lg me-1"></i>Add</button>
    </app-page-header>
    <app-state [loading]="loading()" [empty]="!loading() && !items().length" icon="bi-geo-alt" emptyText="No saved addresses yet" />
    <div class="d-grid gap-2">
      @for (a of items(); track a._id) {
        <div class="card card-body py-3">
          <div class="d-flex gap-3">
            <i class="bi fs-4 text-primary" [class.bi-house]="a.type === 'Home'" [class.bi-briefcase]="a.type === 'Work'" [class.bi-geo-alt]="a.type === 'Other'"></i>
            <div class="flex-grow-1 min-w-0">
              <div class="fw-semibold">{{ a.name || a.type }} <span class="badge bg-secondary-subtle text-secondary-emphasis">{{ a.type }}</span> @if (a.isDefault) { <span class="badge bg-primary">Default</span> }</div>
              <div class="small text-muted">{{ line(a) }}</div>
              @if (!a.zipCode) { <div class="small text-danger">Add a PIN code: it is needed for delivery and bills.</div> }
              @if (a.phoneNumber) { <div class="small text-muted"><i class="bi bi-telephone"></i> {{ a.phoneNumber }}</div> }
              <div class="d-flex gap-3 mt-2 small">
                <a href="" (click)="$event.preventDefault(); edit(a)">Edit</a>
                @if (!a.isDefault) { <a href="" (click)="$event.preventDefault(); makeDefault(a)">Set as default</a> }
                <a href="" class="text-danger" (click)="$event.preventDefault(); remove(a)">Delete</a>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
    <app-sheet [open]="open()" [title]="editing() ? 'Edit address' : 'Add address'" (closed)="open.set(false)">
      <app-address-form [address]="editing()" (saved)="open.set(false); load()" />
    </app-sheet>
  `,
})
export class AddressesComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  items = signal<Address[]>([]);
  loading = signal(true);
  open = signal(false);
  editing = signal<Address | null>(null);

  ngOnInit() {
    this.load();
  }

  load() {
    this.api.get<Address[]>('/addresses').subscribe({ next: (a) => { this.items.set(a); this.loading.set(false); }, error: () => this.loading.set(false) });
  }

  line(a: Address) {
    return [a.fullAddress, a.city !== a.taluka ? a.city : '', a.taluka, a.district, a.state].filter(Boolean).join(', ') + ` - ${a.zipCode || 'no PIN code'}`;
  }

  edit(a: Address | null) {
    this.editing.set(a);
    this.open.set(true);
  }

  makeDefault(a: Address) {
    this.api.post<Address[]>(`/addresses/${a._id}/set-default`).subscribe({ next: (r) => { this.items.set(r.data); this.toast.success('Default address updated'); }, error: (e) => this.toast.error(errorMessage(e)) });
  }

  async remove(a: Address) {
    if (!(await this.confirm.confirm('Delete address?', a.fullAddress, 'danger', 'Delete'))) return;
    this.api.delete(`/addresses/${a._id}`).subscribe({ next: () => { this.load(); this.auth.refreshMe().subscribe({ error: () => {} }); }, error: (e) => this.toast.error(errorMessage(e)) });
  }
}
