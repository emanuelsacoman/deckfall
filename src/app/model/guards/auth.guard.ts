import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { isAdminSession } from '../interfaces/Auth/auth-session';
import { AuthService } from '../services/fire/auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = await auth.waitForSession();
  return isAdminSession(user) || router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const authChildGuard: CanActivateChildFn = (route, state) => authGuard(route, state);
