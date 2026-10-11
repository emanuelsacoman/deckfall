import { Routes } from '@angular/router';
import { authChildGuard, authGuard } from './model/guards/auth.guard';
import { cardEditorLeaveGuard } from './model/guards/card-editor-leave.guard';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Conta e acesso | Deckfall',
    loadComponent: () => import('./view/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    canActivateChild: [authChildGuard],
    loadComponent: () => import('./view/admin/layout/layout.component').then((m) => m.LayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        title: 'Painel | Deckfall',
        loadComponent: () => import('./view/admin/admin-components/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      { path: 'cartas', pathMatch: 'full', redirectTo: 'cartas/lista' },
      {
        path: 'cartas/lista',
        title: 'Cartas | Deckfall',
        loadComponent: () => import('./view/admin/admin-components/cards/card-list/card-list.component').then((m) => m.CardListComponent),
      },
      {
        path: 'cartas/criar',
        canDeactivate: [cardEditorLeaveGuard],
        title: 'Criar carta | Deckfall',
        loadComponent: () => import('./view/admin/admin-components/cards/card-create/card-create.component').then((m) => m.CardCreateComponent),
      },
      {
        path: 'cartas/editar/:id',
        canDeactivate: [cardEditorLeaveGuard],
        title: 'Editar carta | Deckfall',
        loadComponent: () => import('./view/admin/admin-components/cards/card-edit/card-edit.component').then((m) => m.CardEditComponent),
      },
      { path: 'usuarios', pathMatch: 'full', redirectTo: 'usuarios/lista' },
      {
        path: 'usuarios/lista',
        title: 'Usuários | Deckfall',
        loadComponent: () => import('./view/admin/admin-components/users/user-list/user-list.component').then((m) => m.UserListComponent),
      },
      {
        path: 'usuarios/criar',
        title: 'Vincular usuário | Deckfall',
        loadComponent: () => import('./view/admin/admin-components/users/user-create/user-create.component').then((m) => m.UserCreateComponent),
      },
      {
        path: 'usuarios/editar/:uid',
        title: 'Editar usuário | Deckfall',
        loadComponent: () => import('./view/admin/admin-components/users/user-edit/user-edit.component').then((m) => m.UserEditComponent),
      },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: '**', redirectTo: 'login' },
];
