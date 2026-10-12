import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-game-collection',
  standalone: true,
  templateUrl: './collection.component.html',
  styleUrls: ['../game-page.css', './collection.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CollectionComponent {}
