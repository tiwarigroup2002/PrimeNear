import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const router = inject(Router);
  const token = auth.token;
  const request = token && !req.headers.has('Authorization') ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((err: HttpErrorResponse) => {
      const msg: string = err.error?.message || '';
      if (err.status === 503 && err.error?.maintenance) {
        router.navigate(['/maintenance'], { queryParams: { message: msg }, skipLocationChange: true });
      } else if (err.status === 401 && auth.isLoggedIn() && !req.url.includes('/auth/verify-otp')) {
        toast.warning(msg || 'Session expired, please login again');
        auth.logout(false);
      } else if (err.status === 403 && /blocked/i.test(msg) && auth.isLoggedIn()) {
        toast.error(msg);
        auth.logout(false, 'blocked');
      } else if (err.status === 0) {
        toast.error('No internet / server not reachable');
      } else if (err.status >= 500) {
        toast.error(msg || 'Server error, please try again');
      }
      return throwError(() => err);
    })
  );
};

export function errorMessage(err: any, fallback = 'Something went wrong'): string {
  return err?.error?.message || err?.message || fallback;
}
