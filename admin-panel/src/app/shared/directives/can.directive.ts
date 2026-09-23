import { Directive, Input, TemplateRef, ViewContainerRef, effect, inject, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

/**
 * Renders the element only when the admin has ANY of the permissions.
 *   <button *appCan="'sellers.manage'">Edit</button>
 *   <div *appCan="['payments.view', 'payouts.manage']">...</div>
 */
@Directive({ selector: '[appCan]' })
export class CanDirective {
  private tpl = inject(TemplateRef<any>);
  private vcr = inject(ViewContainerRef);
  private auth = inject(AuthService);
  private perms = signal<string[]>([]);
  private shown = false;

  @Input() set appCan(value: string | string[]) {
    this.perms.set(Array.isArray(value) ? value : [value]);
  }

  constructor() {
    effect(() => {
      const allowed = this.auth.can(...this.perms());
      if (allowed && !this.shown) {
        this.vcr.createEmbeddedView(this.tpl);
        this.shown = true;
      } else if (!allowed && this.shown) {
        this.vcr.clear();
        this.shown = false;
      }
    });
  }
}
