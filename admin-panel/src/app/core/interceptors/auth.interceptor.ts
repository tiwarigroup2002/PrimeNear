import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

/** Adds the JWT and handles auth / network errors globally. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const token = auth.token;
  const request = token && !req.headers.has('Authorization') ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((err: HttpErrorResponse) => {
      const isAuthCall = req.url.includes('/auth/login') || req.url.includes('/auth/verify-2fa');
      if (err.status === 401 && !isAuthCall && auth.isLoggedIn()) {
        toast.warning(err.error?.message || 'Session expired, please login again');
        auth.logout(false);
      } else if (err.status === 0) {
        toast.error('Cannot reach the server. Check your connection.');
      } else if (err.status >= 500) {
        toast.error(err.error?.message || 'Server error, please try again');
      }
      return throwError(() => err);
    })
  );
};

/** Extracts a user friendly message from an HTTP error. */
export function errorMessage(err: any, fallback = 'Something went wrong'): string {
  return err?.error?.message || err?.message || fallback;
}
