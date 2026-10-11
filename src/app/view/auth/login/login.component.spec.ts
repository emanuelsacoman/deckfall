import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LoginComponent } from './login.component';

describe('Login — placeholder', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideRouter([])]
    }).compileComponents();
  });

  it('abre sem providers Firebase e mantém somente a apresentação e o link do painel', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('h1')?.textContent).toBe('Login');
    expect(page.querySelector('form, input, button')).toBeNull();
    expect(page.querySelector('a[href="/admin/dashboard"]')).not.toBeNull();
  });
});
