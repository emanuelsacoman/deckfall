import { TestBed } from '@angular/core/testing';
import { DecksComponent } from './decks/decks.component';
import { PlayComponent } from './play/play.component';

describe('Player area placeholders', () => {
  it('does not expose functional deck creation', () => {
    TestBed.configureTestingModule({ imports: [DecksComponent] });
    const fixture = TestBed.createComponent(DecksComponent);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector<HTMLButtonElement>('button')?.disabled).toBeTrue();
    expect(page.querySelector('a')).toBeNull();
    expect(page.textContent).toContain('Deck Builder em desenvolvimento');
  });

  it('does not enable either future game mode', () => {
    TestBed.configureTestingModule({ imports: [PlayComponent] });
    const fixture = TestBed.createComponent(PlayComponent);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    const actions = Array.from(page.querySelectorAll<HTMLButtonElement>('button'));
    expect(actions.length).toBe(2);
    expect(actions.every(button => button.disabled)).toBeTrue();
    expect(page.querySelector('a')).toBeNull();
    expect(page.textContent).toContain('Nenhum modo disponível nesta versão');
  });
});
