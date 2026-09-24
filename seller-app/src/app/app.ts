import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmHostComponent } from './shared/components/confirm-host.component';
import { ToastHostComponent } from './shared/components/toast-host.component';
import { AppConfigService } from './core/services/app-config.service';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHostComponent, ConfirmHostComponent],
  template: `<router-outlet /><app-toast-host /><app-confirm-host />`,
})
export class App implements OnInit {
  private cfg = inject(AppConfigService);
  private theme = inject(ThemeService); // applies saved theme on start

  ngOnInit() {
    this.cfg.load();
  }
}
