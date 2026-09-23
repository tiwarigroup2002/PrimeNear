import { Injectable, NgZone, inject } from '@angular/core';
import { AuthService } from './auth.service';

/**
 * Logs the admin out after `sessionTimeout` minutes without mouse/keyboard activity
 * (Security settings → Session timeout).
 */
@Injectable({ providedIn: 'root' })
export class IdleService {
  private auth = inject(AuthService);
  private zone = inject(NgZone);
  private last = Date.now();
  private timer?: ReturnType<typeof setInterval>;
  private timeoutMs = 30 * 60000;
  private readonly events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
  private onActivity = () => (this.last = Date.now());

  start(minutes: number) {
    this.timeoutMs = Math.max(minutes, 5) * 60000;
    this.stop();
    this.last = Date.now();
    this.zone.runOutsideAngular(() => {
      this.events.forEach((e) => window.addEventListener(e, this.onActivity, { passive: true }));
      this.timer = setInterval(() => {
        if (this.auth.isLoggedIn() && Date.now() - this.last > this.timeoutMs) {
          this.zone.run(() => {
            this.stop();
            this.auth.logout(true, 'idle');
          });
        }
      }, 30000);
    });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.events.forEach((e) => window.removeEventListener(e, this.onActivity));
  }
}
