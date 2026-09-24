import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-maintenance',
  template: `
    <div class="auth-wrap">
      <div class="card auth-card text-center"><div class="card-body p-5">
        <i class="bi bi-cone-striped display-4 text-warning"></i>
        <h1 class="h4 mt-3">Under maintenance</h1>
        <p class="text-muted">{{ message || 'हम कुछ सुधार कर रहे हैं। कृपया थोड़ी देर बाद प्रयास करें।' }}</p>
        <button class="btn btn-primary" (click)="reload()">Try again</button>
      </div></div>
    </div>
  `,
})
export class MaintenanceComponent {
  message = inject(ActivatedRoute).snapshot.queryParamMap.get('message');
  reload() {
    location.href = '/';
  }
}
