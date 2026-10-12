import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-game-play',
  standalone: true,
  templateUrl: './play.component.html',
  styleUrls: ['../game-page.css', './play.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlayComponent {}
