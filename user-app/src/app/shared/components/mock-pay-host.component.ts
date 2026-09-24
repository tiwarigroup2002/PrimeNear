import { Component, inject } from '@angular/core';
import { PaymentService } from '../../core/services/payment.service';
import { SheetComponent } from './bottom-sheet.component';
import { InrPipe } from '../pipes/inr.pipe';

/** Test-mode stand-in for the Razorpay popup (used only when the server has no Razorpay keys). */
@Component({
  selector: 'app-mock-pay-host',
  imports: [SheetComponent, InrPipe],
  template: `
    @if (pay.mock(); as m) {
      <app-sheet [open]="true" title="Test payment" (closed)="pay.mockResult('dismiss')">
        <div class="text-center">
          <span class="brand-mark mb-2" style="width:52px;height:52px;font-size:1.5rem"><i class="bi bi-credit-card-2-front"></i></span>
          <div class="text-muted small">Order {{ m.orderCode }}</div>
          <div class="display-6 fw-bold my-1">{{ m.amount | inr }}</div>
          <div class="alert alert-warning small py-2 mt-3 text-start"><i class="bi bi-cone-striped me-1"></i>Razorpay keys are not configured on the server, so this is a <strong>test payment</strong>. No real money is charged.</div>
          <button class="btn btn-success btn-lg w-100 mb-2" [disabled]="pay.mockBusy()" (click)="pay.mockResult('success')">@if (pay.mockBusy()) { <span class="spinner-border spinner-border-sm me-2"></span> }<i class="bi bi-check-circle me-1"></i>Pay successfully</button>
          <button class="btn btn-outline-danger w-100" [disabled]="pay.mockBusy()" (click)="pay.mockResult('fail')">Simulate failure</button>
        </div>
      </app-sheet>
    }
  `,
})
export class MockPayHostComponent {
  pay = inject(PaymentService);
}
