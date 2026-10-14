import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthSession, isAdminSession } from '../../../model/interfaces/Auth/auth-session';
import { CardService } from '../../../model/services/cruds/cards/card.service';
import { CardTemplateService } from '../../../model/services/cruds/cards/card-template.service';
import { AuthService } from '../../../model/services/fire/auth.service';
import { CardStorageService } from '../../../model/services/fire/card-storage.service';
import { LoginComponent } from '../../auth/login/login.component';
import { CardEditorComponent } from '../admin-components/cards/card-editor/card-editor.component';
import { DashboardComponent } from '../admin-components/dashboard/dashboard.component';
import { LayoutComponent } from './layout.component';

const viewports = [
  [320, 568], [360, 640], [390, 844], [412, 915], [768, 1024], [1024, 768],
  [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [640, 360], [844, 390]
] as const;
const tolerance = 1;

/** Chrome layout of actual scoped Angular snapshots; not live Firebase route QA. */
describe('Admin, auth and editor viewport geometry', () => {
  const fixtures: ComponentFixture<unknown>[] = [];
  const frames: HTMLIFrameElement[] = [];
  let currentUser: ReturnType<typeof signal<AuthSession | null>>;
  let shellSnapshot: string;

  beforeEach(async () => {
    currentUser = signal<AuthSession | null>({
      uid: 'geometry-admin-' + 'uid'.repeat(30),
      email: 'contato'.repeat(15) + '@example.test', displayName: 'Administrador de teste',
      role: 'admin', roleId: 'admin'
    });
    const storage = jasmine.createSpyObj<CardStorageService>('Storage', ['validateImage', 'getAssetBlob', 'isOwnedAsset']);
    storage.isOwnedAsset.and.returnValue(false);
    const cards = jasmine.createSpyObj<CardService>('Cards', ['getById', 'create', 'update', 'delete']);
    const templates = jasmine.createSpyObj<CardTemplateService>('Templates', ['list', 'create']);
    templates.list.and.resolveTo([]);
    await TestBed.configureTestingModule({
      imports: [LayoutComponent, LoginComponent, DashboardComponent, CardEditorComponent],
      providers: [provideRouter([]),
        { provide: AuthService, useValue: {
          currentUser, isAdmin: computed(() => isAdminSession(currentUser())),
          redirecting: signal(false), sessionError: signal(null), googleError: signal(null),
          googleLinked: signal(true), passwordLinked: signal(false), completedSignInRedirect: signal(false),
          clearSignInRedirect: jasmine.createSpy('clearSignInRedirect'),
          login: jasmine.createSpy('login').and.resolveTo(), register: jasmine.createSpy('register').and.resolveTo(),
          loginWithGoogle: jasmine.createSpy('loginWithGoogle').and.resolveTo(),
          addPassword: jasmine.createSpy('addPassword').and.resolveTo(),
          sendPasswordReset: jasmine.createSpy('sendPasswordReset').and.resolveTo(),
          logout: jasmine.createSpy('logout').and.resolveTo()
        } },
        { provide: CardService, useValue: cards }, { provide: CardTemplateService, useValue: templates },
        { provide: CardStorageService, useValue: storage }
      ]
    }).compileComponents();
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    const fixture = TestBed.createComponent(LayoutComponent);
    fixtures.push(fixture);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    shellSnapshot = snapshotHost(fixture, 'app-admin-layout');
  });

  afterEach(() => {
    for (const frame of frames.splice(0)) frame.remove();
    for (const fixture of fixtures.splice(0)) fixture.destroy();
  });

  function snapshotHost<T>(fixture: ComponentFixture<T>, selector: string): string {
    const original = fixture.nativeElement as HTMLElement;
    const host = document.createElement(selector);
    for (const attribute of Array.from(original.attributes)) host.setAttribute(attribute.name, attribute.value);
    host.innerHTML = original.innerHTML;
    return host.outerHTML;
  }

  function actualStyles(): string {
    return Array.from(document.styleSheets)
      .map(sheet => Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n')).join('\n');
  }

  function withAdminContent(page = '', paragraphs = 0): string {
    const container = document.createElement('div');
    container.innerHTML = shellSnapshot;
    const main = container.querySelector<HTMLElement>('.admin-content')!;
    main.innerHTML = page;
    for (let index = 0; index < paragraphs; index++) {
      const paragraph = document.createElement('p');
      paragraph.textContent = 'Conteúdo administrativo ' + index + '. ' +
        'A página deve crescer e conservar campos e ações alcançáveis. '.repeat(4);
      main.appendChild(paragraph);
    }
    if (paragraphs) {
      const control = container.querySelector<HTMLButtonElement>('.sidebar-footer button')!.cloneNode(true) as HTMLButtonElement;
      control.className = 'geometry-last-control';
      control.textContent = 'Última ação administrativa';
      main.appendChild(control);
    }
    return container.innerHTML;
  }

  async function inViewport(width: number, height: number, html: string, styles: string,
    check: (doc: Document, win: Window) => void): Promise<void> {
    const frame = document.createElement('iframe');
    frames.push(frame);
    frame.title = 'Isolated admin geometry fixture';
    frame.style.cssText = 'position:fixed;left:-20000px;top:0;border:0;width:' + width + 'px;height:' + height + 'px';
    const loaded = new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve(); frame.onerror = () => reject(new Error('Admin geometry iframe failed to load'));
    });
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>' + styles +
      '</style></head><body><app-root>' + html + '</app-root></body></html>';
    document.body.appendChild(frame);
    try {
      await loaded;
      const doc = frame.contentDocument!, win = frame.contentWindow!;
      await doc.fonts.ready;
      expect(win.innerWidth).withContext('Iframe width').toBe(width);
      expect(win.innerHeight).withContext('Iframe height').toBe(height);
      expect(doc.documentElement.scrollWidth - doc.documentElement.clientWidth)
        .withContext(width + '×' + height + ': global horizontal overflow').toBeLessThanOrEqual(tolerance);
      check(doc, win);
    } finally {
      frame.remove(); frames.splice(frames.indexOf(frame), 1);
    }
  }

  function assertReachable(control: HTMLElement, win: Window, context: string): void {
    control.scrollIntoView({ block: 'center', inline: 'nearest' });
    control.focus({ preventScroll: true });
    const rect = control.getBoundingClientRect();
    expect(rect.top).withContext(context + ': control above viewport').toBeGreaterThanOrEqual(-tolerance);
    expect(rect.bottom).withContext(context + ': control below viewport').toBeLessThanOrEqual(win.innerHeight + tolerance);
    for (let ancestor = control.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = win.getComputedStyle(ancestor), bounds = ancestor.getBoundingClientRect();
      if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY)) {
        expect(rect.top).withContext(context + ': control clipped above by ' + ancestor.className)
          .toBeGreaterThanOrEqual(bounds.top + ancestor.clientTop - tolerance);
        expect(rect.bottom).withContext(context + ': control clipped below by ' + ancestor.className)
          .toBeLessThanOrEqual(bounds.top + ancestor.clientTop + ancestor.clientHeight + tolerance);
      }
    }
  }

  it('fills every required viewport and keeps empty, medium and long administrative pages scrollable', async () => {
    const styles = actualStyles();
    for (const [width, height] of viewports) {
      for (const [label, paragraphs] of [['empty', 0], ['medium', 4], ['long', 64]] as const) {
        await inViewport(width, height, withAdminContent('', paragraphs), styles, (doc, win) => {
          const context = width + '×' + height + ' ' + label;
          expect(doc.querySelector('.admin-shell')!.getBoundingClientRect().height)
            .withContext(context + ': admin fills viewport').toBeGreaterThanOrEqual(win.innerHeight - tolerance);
          const logout = doc.querySelector<HTMLElement>('.sidebar-footer button')!;
          assertReachable(logout, win, context + ' logout');
          if (paragraphs) assertReachable(doc.querySelector<HTMLElement>('.geometry-last-control')!, win, context + ' final action');
        });
      }
    }
  }, 20000);

  it('keeps actual login, registration, recovery and long account forms reachable', async () => {
    const admin = currentUser();
    currentUser.set(null);
    const fixture = TestBed.createComponent(LoginComponent);
    fixtures.push(fixture);
    const snapshots: Array<readonly [string, string]> = [];
    for (const mode of ['login', 'register', 'reset'] as const) {
      fixture.componentInstance.changeMode(mode);
      fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
      snapshots.push([mode, snapshotHost(fixture, 'app-login')]);
    }
    currentUser.set(admin);
    fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    snapshots.push(['account', snapshotHost(fixture, 'app-login')]);
    const styles = actualStyles();
    for (const [width, height] of viewports) {
      for (const [name, html] of snapshots) {
        await inViewport(width, height, html, styles, (doc, win) => {
          const context = width + '×' + height + ' ' + name;
          expect(doc.querySelector('.login-page')!.getBoundingClientRect().height)
            .withContext(context + ': auth fills viewport').toBeGreaterThanOrEqual(win.innerHeight - tolerance);
          const controls = Array.from(doc.querySelectorAll<HTMLElement>('input, button, a[href]'))
            .filter(control => control.getBoundingClientRect().height > 0);
          for (const control of controls) assertReachable(control, win, context);
          if (name === 'account') expect(doc.querySelector('#confirm-password')).not.toBeNull();
        });
      }
    }
  }, 20000);

  it('lays out the real dashboard and editor without page overflow or unreachable final fields', async () => {
    const dashboard = TestBed.createComponent(DashboardComponent);
    fixtures.push(dashboard); dashboard.detectChanges();
    const editor = TestBed.createComponent(CardEditorComponent);
    fixtures.push(editor); editor.componentRef.setInput('mode', 'create');
    editor.detectChanges(); await editor.whenStable(); editor.detectChanges();
    editor.componentInstance.state.setMode('data'); editor.detectChanges();
    for (const details of Array.from((editor.nativeElement as HTMLElement).querySelectorAll<HTMLDetailsElement>('.persistence details'))) {
      details.open = true;
    }
    const snapshots = [
      ['dashboard', snapshotHost(dashboard, 'app-dashboard')],
      ['editor', snapshotHost(editor, 'app-card-editor')]
    ] as const;
    const styles = actualStyles();
    for (const [width, height] of viewports) {
      for (const [name, html] of snapshots) {
        await inViewport(width, height, withAdminContent(html), styles, (doc, win) => {
          const context = width + '×' + height + ' ' + name;
          if (name === 'dashboard') {
            const last = Array.from(doc.querySelectorAll<HTMLElement>('.quick-action')).at(-1)!;
            assertReachable(last, win, context + ' final dashboard action');
            return;
          }
          const fields = doc.querySelectorAll<HTMLElement>('app-card-data input, app-card-data select, app-card-data textarea');
          expect(fields.length).withContext(context + ': real data fields').toBeGreaterThan(0);
          assertReachable(fields[fields.length - 1], win, context + ' final editor field');
          const canvas = doc.querySelector<HTMLElement>('.canvas-viewport')!;
          const canvasBounds = canvas.getBoundingClientRect();
          expect(canvasBounds.width).withContext(context + ': canvas has width').toBeGreaterThan(0);
          expect(canvasBounds.height).withContext(context + ': canvas height bounded').toBeLessThanOrEqual(Math.max(240, height));
          expect(win.getComputedStyle(canvas).overflowY).withContext(context + ': canvas has explicit scrolling').toBe('auto');
          canvas.scrollTop = canvas.scrollHeight;
          if (canvas.scrollHeight > canvas.clientHeight) expect(canvas.scrollTop).toBeGreaterThan(0);
          assertReachable(canvas, win, context + ' canvas');
          if (width <= 700 || height <= 600) {
            const menu = doc.querySelector<HTMLElement>('.menu-content')!;
            expect(win.getComputedStyle(menu).position).withContext(context + ': short viewport menu stays in flow').toBe('static');
            const actions = menu.querySelectorAll<HTMLElement>('button');
            assertReachable(actions[actions.length - 1], win, context + ' final toolbar menu action');
          }
        });
      }
    }
  }, 20000);

  it('lets the actual sidebar logout scroll into view on short desktop viewports', async () => {
    for (const [width, height] of [[1366, 768], [844, 390]] as const) {
      await inViewport(width, height, withAdminContent('', 64), actualStyles(), (doc, win) => {
        const sidebar = doc.querySelector<HTMLElement>('.sidebar')!;
        expect(sidebar.getBoundingClientRect().height).toBeLessThanOrEqual(win.innerHeight + tolerance);
        expect(sidebar.scrollHeight).withContext('Sidebar content exercises scrolling').toBeGreaterThan(sidebar.clientHeight);
        sidebar.scrollTop = sidebar.scrollHeight;
        expect(sidebar.scrollTop).toBeGreaterThan(0);
        assertReachable(sidebar.querySelector<HTMLElement>('button')!, win, width + '×' + height + ' sidebar logout');
      });
    }
  });
});
