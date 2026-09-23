import { Component, Input } from '@angular/core';
import { passwordStrength } from '../validators/password';

@Component({
  selector: 'app-password-strength',
  template: `
    @if (value) {
      <div class="progress mt-2" style="height: 5px">
        <div class="progress-bar bg-{{ s.color }}" [style.width.%]="(s.score / 5) * 100"></div>
      </div>
      <div class="small text-{{ s.color }} mt-1">{{ s.label }} · use 8+ characters with upper & lower case, a number and a symbol</div>
    }
  `,
})
export class PasswordStrengthComponent {
  @Input() value = '';
  get s() { return passwordStrength(this.value || ''); }
}
