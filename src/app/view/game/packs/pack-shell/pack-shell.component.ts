import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-pack-shell', standalone: true,
  template: '<div class="pack-shell" aria-hidden="true"><div class="pack-foil"></div><div class="pack-edge"></div><span class="pack-corner top"></span><span class="pack-corner bottom"></span><span class="pack-brand">DECKFALL</span><div class="pack-emblem"><span>D</span></div><span class="pack-name">STARTER PACK</span><div class="pack-wax-seal"><span>✦</span></div><span class="pack-seal">Sua jornada começa aqui</span></div>',
  styleUrl: './pack-shell.component.css', changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PackShellComponent {}
