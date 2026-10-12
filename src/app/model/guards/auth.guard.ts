import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { isAdminSession, isAuthenticatedSession } from '../interfaces/Auth/auth-session';
import { AuthService } from '../services/fire/auth.service';

export const authenticatedGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = await auth.waitForSession();
  return isAuthenticatedSession(user) || router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const authenticatedChildGuard: CanActivateChildFn = (route, state) => authenticatedGuard(route, state);

export const adminGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = await auth.waitForSession();
  return isAdminSession(user) || router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

export const adminChildGuard: CanActivateChildFn = (route, state) => adminGuard(route, state);
