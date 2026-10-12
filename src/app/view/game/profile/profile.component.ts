import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../model/services/fire/auth.service';

@Component({
  selector: 'app-game-profile',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './profile.component.html',
  styleUrls: ['../game-page.css', './profile.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileComponent {
  readonly auth = inject(AuthService);
  readonly playerName = computed(() => this.auth.currentUser()?.displayName?.trim() || 'Jogador');
  readonly playerInitial = computed(() => this.playerName().charAt(0).toLocaleUpperCase('pt-BR'));
}
