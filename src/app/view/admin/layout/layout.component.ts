import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../model/services/fire/auth.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly signingOut = signal(false);

  constructor() {
    effect(() => {
      if (this.auth.currentUser() !== undefined && !this.auth.isAdmin()) {
        void this.router.navigate(['/login'], { replaceUrl: true });
      }
    });
  }

  async logout(): Promise<void> {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    try {
      await this.auth.logout();
    } catch {
      // The login screen shows AuthService's session error.
    } finally {
      await this.router.navigate(['/login'], { replaceUrl: true });
      this.signingOut.set(false);
    }
  }
}
