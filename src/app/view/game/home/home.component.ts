import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../model/services/fire/auth.service';

@Component({
  selector: 'app-game-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.component.html',
  styleUrls: ['../game-page.css', './home.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  readonly auth = inject(AuthService);
  readonly greeting = computed(() => {
    const name = this.auth.currentUser()?.displayName?.trim();
    return name ? `Bem-vindo, ${name}.` : 'Bem-vindo ao Deckfall.';
  });
}
