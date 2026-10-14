import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../model/services/fire/auth.service';
import { PlayerInitializationService } from '../../../model/services/fire/player-initialization.service';
import { PlayerPackService } from '../../../model/services/cruds/packs/player-pack.service';
import { PlayerPack } from '../../../model/interfaces/Packs/player-pack';
import { isAuthenticatedSession } from '../../../model/interfaces/Auth/auth-session';

@Component({
  selector: 'app-game-home',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './home.component.html',
  styleUrls: ['../game-page.css', './home.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent implements OnDestroy {
  readonly auth = inject(AuthService);
  private readonly initialization = inject(PlayerInitializationService);
  private readonly packs = inject(PlayerPackService);
  private version = 0;
  private destroyed = false;
  readonly starter = signal<PlayerPack | null>(null);
  readonly packError = signal('');
  readonly greeting = computed(() => {
    const name = this.auth.currentUser()?.displayName?.trim();
    return name ? `Bem-vindo, ${name}.` : 'Bem-vindo ao Deckfall.';
  });

  constructor() {
    effect(() => {
      const session = this.auth.currentUser();
      const ready = this.initialization.ready();
      const id = this.initialization.result()?.starterPackInstanceId;
      untracked(() => {
        ++this.version;
        this.starter.set(null); this.packError.set('');
        if (ready && id && isAuthenticatedSession(session)) void this.loadStarter();
      });
    }, { allowSignalWrites: true });
  }

  async loadStarter(): Promise<void> {
    const session = this.auth.currentUser(), id = this.initialization.result()?.starterPackInstanceId;
    if (this.destroyed || !id || !isAuthenticatedSession(session) || !this.initialization.ready()) return;
    const uid = session.uid, version = ++this.version;
    this.starter.set(null); this.packError.set('');
    try {
      const pack = await this.packs.getCurrentUser(id);
      if (this.isCurrent(version, uid)) this.starter.set(pack?.state === 'sealed' ? pack : null);
    } catch {
      if (this.isCurrent(version, uid)) this.packError.set('Não foi possível conferir seu Starter Pack.');
    }
  }

  ngOnDestroy(): void { this.destroyed = true; ++this.version; }
  private isCurrent(version: number, uid: string): boolean {
    const session = this.auth.currentUser();
    return !this.destroyed && version === this.version && isAuthenticatedSession(session) && session.uid === uid;
  }
}
