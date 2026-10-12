import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-game-decks',
  standalone: true,
  templateUrl: './decks.component.html',
  styleUrls: ['../game-page.css', './decks.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecksComponent {}
