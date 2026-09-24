import { Injectable, signal } from '@angular/core';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary' | 'warning' | 'success';
  /** When set, the dialog asks for a text input (e.g. a reason). */
  input?: { label: string; placeholder?: string; required?: boolean; minLength?: number; value?: string };
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: { confirmed: boolean; value?: string }) => void;
}

/** Promise based confirmation dialog rendered by <app-confirm-host>. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly current = signal<PendingConfirm | null>(null);

  open(options: ConfirmOptions): Promise<{ confirmed: boolean; value?: string }> {
    return new Promise((resolve) => this.current.set({ confirmText: 'Confirm', cancelText: 'Cancel', variant: 'primary', ...options, resolve }));
  }

  async confirm(title: string, message: string, variant: ConfirmOptions['variant'] = 'danger', confirmText = 'Confirm'): Promise<boolean> {
    return (await this.open({ title, message, variant, confirmText })).confirmed;
  }

  /** Asks for a reason; resolves to the text or null when cancelled. */
  async prompt(title: string, message: string, label = 'Reason', confirmText = 'Submit', variant: ConfirmOptions['variant'] = 'danger'): Promise<string | null> {
    const r = await this.open({ title, message, variant, confirmText, input: { label, required: true, minLength: 3 } });
    return r.confirmed ? (r.value ?? '') : null;
  }

  close(confirmed: boolean, value?: string) {
    const c = this.current();
    this.current.set(null);
    c?.resolve({ confirmed, value });
  }
}
