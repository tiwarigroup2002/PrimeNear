import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (auth.isLoggedIn()) return true;
  return inject(Router).createUrlTree(['/auth/login'], { queryParams: { returnUrl: state.url } });
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? inject(Router).createUrlTree(['/dashboard']) : true;
};

/** Route data: { permissions: ['sellers.view'] } - any one is enough. */
export const permissionGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const needed: string[] = route.data?.['permissions'] ?? [];
  if (!needed.length || auth.can(...needed)) return true;
  inject(ToastService).error('You do not have access to that page');
  return inject(Router).createUrlTree(['/dashboard']);
};
