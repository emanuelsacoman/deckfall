import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { isAuthenticatedSession } from '../../../model/interfaces/Auth/auth-session';
import { PlayerPack } from '../../../model/interfaces/Packs/player-pack';
import { PlayerPackService } from '../../../model/services/cruds/packs/player-pack.service';
import { AuthService } from '../../../model/services/fire/auth.service';
import { PackShellComponent } from './pack-shell/pack-shell.component';

@Component({
  selector: 'app-game-packs', standalone: true, imports: [RouterLink, DatePipe, PackShellComponent],
  templateUrl: './packs.component.html', styleUrls: ['../game-page.css', './packs.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PacksComponent implements OnDestroy {
  private readonly service = inject(PlayerPackService);
  private readonly auth = inject(AuthService);
  private activeUid: string | null | undefined;
  private version = 0;
  private destroyed = false;
  readonly packs = signal<PlayerPack[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly sealed = computed(() => this.packs().filter(pack => pack.state === 'sealed'));
  readonly opened = computed(() => this.packs().filter(pack => pack.state === 'opened'));

  constructor() {
    effect(() => {
      const session = this.auth.currentUser();
      const uid = isAuthenticatedSession(session) ? session.uid : null;
      if (uid === this.activeUid) return;
      this.activeUid = uid;
      ++this.version;
      this.packs.set([]);
      this.error.set('');
      this.loading.set(false);
      if (uid) untracked(() => { void this.loadPacks(); });
    }, { allowSignalWrites: true });
  }

  async loadPacks(): Promise<void> {
    const session = this.auth.currentUser();
    if (this.destroyed || !isAuthenticatedSession(session)) return;
    const uid = session.uid, version = ++this.version;
    this.loading.set(true); this.error.set(''); this.packs.set([]);
    try {
      const packs = await this.service.listCurrentUser();
      if (this.isCurrent(version, uid)) this.packs.set(packs);
    } catch {
      if (this.isCurrent(version, uid)) this.error.set('Não foi possível carregar seus pacotes. Tente novamente.');
    } finally {
      if (this.isCurrent(version, uid)) this.loading.set(false);
    }
  }

  ngOnDestroy(): void { this.destroyed = true; ++this.version; }
  private isCurrent(version: number, uid: string): boolean {
    const session = this.auth.currentUser();
    return !this.destroyed && version === this.version && isAuthenticatedSession(session) && session.uid === uid;
  }
}
