import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { isAuthenticatedSession } from '../../../model/interfaces/Auth/auth-session';
import { AuthService } from '../../../model/services/fire/auth.service';

@Component({
  selector: 'app-game-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './game-layout.component.html',
  styleUrl: './game-layout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameLayoutComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly hasSession = computed(() => isAuthenticatedSession(this.auth.currentUser()));
  readonly signingOut = signal(false);
  readonly playerName = computed(() => this.auth.currentUser()?.displayName?.trim() || 'Jogador');
  readonly playerInitial = computed(() => this.playerName().charAt(0).toLocaleUpperCase('pt-BR'));
  private redirectingToLogin = false;

  constructor() {
    effect(() => {
      const session = this.auth.currentUser();
      if (isAuthenticatedSession(session)) {
        this.redirectingToLogin = false;
      } else if (session !== undefined && !this.redirectingToLogin) {
        this.redirectingToLogin = true;
        void this.router.navigate(['/login'], {
          replaceUrl: true,
          queryParams: { returnUrl: this.router.url },
        });
      }
    });
  }

  async logout(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    this.redirectingToLogin = true;
    try {
      await this.auth.logout();
    } catch {
      // AuthService keeps the session error available on the account screen.
    } finally {
      try {
        await this.router.navigate(['/login'], { replaceUrl: true });
      } finally {
        this.signingOut.set(false);
      }
    }
  }
}
