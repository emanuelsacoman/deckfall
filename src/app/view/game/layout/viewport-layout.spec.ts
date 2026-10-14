import { computed, signal, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthSession, isAdminSession } from '../../../model/interfaces/Auth/auth-session';
import { PlayerOwnedCard } from '../../../model/interfaces/Collection/player-card-collection';
import { AuthService } from '../../../model/services/fire/auth.service';
import { PLAYER_INITIALIZATION_CLIENT, PlayerInitializationService } from '../../../model/services/fire/player-initialization.service';
import { PublishedCardStorageService } from '../../../model/services/fire/published-card-storage.service';
import { PlayerCollectionService } from '../../../model/services/cruds/collection/player-collection.service';
import { PlayerPackService } from '../../../model/services/cruds/packs/player-pack.service';
import { defaultCardData } from '../../../model/services/tools/card-canvas-factory';
import { CollectionComponent } from '../collection/collection.component';
import { HomeComponent } from '../home/home.component';
import { PacksComponent } from '../packs/packs.component';
import { testPlayerPack } from '../packs/pack-ui-fixtures';
import { ProfileComponent } from '../profile/profile.component';
import { GameLayoutComponent } from './game-layout.component';

const viewports = [
  [320, 568], [360, 640], [390, 844], [412, 915], [768, 1024], [1024, 768],
  [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [640, 360], [844, 390]
] as const;
const tolerance = 1;

/**
 * Real Angular DOM and scoped styles, laid out by Chrome in finite same-origin
 * iframe viewports. This measures fixture geometry, not a live route or session.
 */
describe('Deckfall viewport geometry', () => {
  const fixtures: ComponentFixture<unknown>[] = [];
  const frames: HTMLIFrameElement[] = [];
  let shellSnapshot: string;
  let currentUser: ReturnType<typeof signal<AuthSession | null>>;

  function ownedCard(index: number): PlayerOwnedCard {
    const id = 'geometry-card-' + index;
    const name = index === 0 ? 'CartaComUmNomeMuitoLongoSemEspacos'.repeat(4) : 'Carta de teste ' + index;
    return {
      collection: { cardId: id, quantity: index + 1, firstAcquiredAt: null, lastAcquiredAt: null },
      card: { ...defaultCardData(), id, name, status: 'published', rarity: 'legendary',
        slug: id, art: null, createdAt: null, updatedAt: null }
    };
  }

  beforeEach(async () => {
    currentUser = signal<AuthSession | null>({
      uid: 'geometry-player', email: 'geometry@example.test',
      displayName: 'NomeDeJogadorMuitoLongoSemEspacos'.repeat(3),
      contactEmail: 'contato'.repeat(12) + '@example.test', role: 'admin', roleId: 'admin'
    });
    await TestBed.configureTestingModule({
      imports: [GameLayoutComponent, HomeComponent, CollectionComponent, PacksComponent, ProfileComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: {
          currentUser, isAdmin: computed(() => isAdminSession(currentUser())),
          logout: jasmine.createSpy('logout').and.resolveTo()
        } },
        { provide: PLAYER_INITIALIZATION_CLIENT, useValue: {
          initialize: jasmine.createSpy('initialize').and.resolveTo({
            initialized: true, alreadyInitialized: false, starterPackGranted: true, starterPackInstanceId: 'starter'
          })
        } },
        { provide: PlayerPackService, useValue: {
          getCurrentUser: jasmine.createSpy('getCurrentUser').and.resolveTo(testPlayerPack()),
          listCurrentUser: jasmine.createSpy('listCurrentUser').and.resolveTo([
            testPlayerPack(), { ...testPlayerPack(true), id: 'geometry-opened-pack' }
          ])
        } },
        { provide: PlayerCollectionService, useValue: {
          listCurrentUser: jasmine.createSpy('listCurrentUser').and.resolveTo(Array.from({ length: 7 }, (_, index) => ownedCard(index)))
        } },
        { provide: PublishedCardStorageService, useValue: {
          getPreviewBlob: jasmine.createSpy('getPreviewBlob').and.rejectWith(new Error('Fixture has no remote PNG'))
        } }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(GameLayoutComponent);
    fixtures.push(fixture);
    fixture.detectChanges();
    await TestBed.inject(PlayerInitializationService).initialize();
    fixture.detectChanges();
    shellSnapshot = snapshotHost(fixture, 'app-game-layout');
  });

  afterEach(() => {
    for (const frame of frames.splice(0)) frame.remove();
    for (const fixture of fixtures.splice(0)) fixture.destroy();
  });

  function snapshotHost<T>(fixture: ComponentFixture<T>, selector: string): string {
    // TestBed may use a div host. Keep its real scoping attrs on the routed tag:
    // html:has(app-game-layout) must see the same selector as the application.
    const original: HTMLElement = fixture.nativeElement;
    const host = document.createElement(selector);
    for (const attribute of Array.from(original.attributes)) host.setAttribute(attribute.name, attribute.value);
    host.innerHTML = original.innerHTML;
    return host.outerHTML;
  }

  async function pageSnapshot<T>(component: Type<T>, selector: string): Promise<string> {
    const fixture = TestBed.createComponent(component);
    fixtures.push(fixture);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return snapshotHost(fixture, selector);
  }

  function injectedStyles(): string {
    // Preserve full @supports and @media rules; do not flatten the active parent
    // viewport or silently omit sheets whose access unexpectedly fails.
    return Array.from(document.styleSheets)
      .map(sheet => Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n'))
      .join('\n');
  }

  function withContent(page = '', paragraphs = 0): string {
    const container = document.createElement('div');
    container.innerHTML = shellSnapshot;
    const main = container.querySelector<HTMLElement>('.game-content')!;
    main.innerHTML = page;
    for (let index = 0; index < paragraphs; index++) {
      const paragraph = document.createElement('p');
      paragraph.textContent = 'Conteúdo de geometria ' + index + '. ' +
        'A jornada deve crescer com o conteúdo e manter o fim da página acessível. '.repeat(3);
      main.appendChild(paragraph);
    }
    if (paragraphs) {
      // Use an actual rendered control as the last element in the stress content.
      const action = container.querySelector<HTMLButtonElement>('button.logout')!.cloneNode(true) as HTMLButtonElement;
      action.className = 'geometry-last-action';
      action.textContent = 'Última ação da página';
      main.appendChild(action);
    }
    return container.innerHTML;
  }

  async function inViewport(width: number, height: number, html: string, styles: string,
    check: (doc: Document, win: Window) => void): Promise<void> {
    const frame = document.createElement('iframe');
    frames.push(frame);
    frame.title = 'Isolated Deckfall geometry fixture';
    // Offscreen retains a real layout viewport; display:none/visibility:hidden
    // would not provide usable measurements or focus scrolling.
    frame.style.cssText = 'position:fixed;left:-20000px;top:0;border:0;width:' + width + 'px;height:' + height + 'px';
    const loaded = new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve();
      frame.onerror = () => reject(new Error('Geometry iframe did not load'));
    });
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><style>' + styles +
      '</style></head><body><app-root>' + html + '</app-root></body></html>';
    document.body.appendChild(frame);
    try {
      await loaded;
      const doc = frame.contentDocument!;
      const win = frame.contentWindow!;
      await doc.fonts.ready;
      expect(win.innerWidth).withContext('Iframe width ' + width + '×' + height).toBe(width);
      expect(win.innerHeight).withContext('Iframe height ' + width + '×' + height).toBe(height);
      check(doc, win);
    } finally {
      frame.remove();
      frames.splice(frames.indexOf(frame), 1);
    }
  }

  function assertGeometry(doc: Document, win: Window, context: string, empty = false): void {
    const root = doc.documentElement;
    const shell = doc.querySelector<HTMLElement>('.game-shell')!;
    const host = doc.querySelector<HTMLElement>('app-game-layout')!;
    const content = doc.querySelector<HTMLElement>('.game-content')!;
    const footer = doc.querySelector<HTMLElement>('.game-footer')!;
    expect(root.scrollWidth - root.clientWidth).withContext(context + ': global horizontal overflow').toBeLessThanOrEqual(tolerance);
    expect(shell.getBoundingClientRect().height).withContext(context + ': shell fills viewport')
      .toBeGreaterThanOrEqual(win.innerHeight - tolerance);
    expect(footer.getBoundingClientRect().top).withContext(context + ': footer follows content')
      .toBeGreaterThanOrEqual(content.getBoundingClientRect().bottom - tolerance);
    expect(win.getComputedStyle(doc.body).backgroundColor).withContext(context + ': game canvas matches shell')
      .toBe(win.getComputedStyle(host).backgroundColor);
    if (empty) {
      expect(footer.getBoundingClientRect().bottom).withContext(context + ': short page footer at viewport bottom')
        .toBeCloseTo(win.innerHeight, 0);
    }
    footer.scrollIntoView({ block: 'end' });
    expect(footer.getBoundingClientRect().bottom).withContext(context + ': footer can be reached by scrolling')
      .toBeLessThanOrEqual(win.innerHeight + tolerance);
    const controls = Array.from(content.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea'))
      .filter(control => control.getBoundingClientRect().width > 0 && control.getBoundingClientRect().height > 0);
    for (const control of controls) assertReachable(control, win, context);
  }

  function assertReachable(control: HTMLElement, win: Window, context: string): void {
    control.scrollIntoView({ block: 'center', inline: 'nearest' });
    control.focus({ preventScroll: true });
    const rect = control.getBoundingClientRect();
    expect(rect.top).withContext(context + ': control above viewport ' + control.textContent?.trim()).toBeGreaterThanOrEqual(-tolerance);
    expect(rect.bottom).withContext(context + ': control below viewport ' + control.textContent?.trim()).toBeLessThanOrEqual(win.innerHeight + tolerance);
    for (let ancestor = control.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = win.getComputedStyle(ancestor);
      const bounds = ancestor.getBoundingClientRect();
      if (['hidden', 'clip', 'auto', 'scroll'].includes(style.overflowY)) {
        expect(rect.top).withContext(context + ': control clipped above by ' + ancestor.tagName + '.' + ancestor.className)
          .toBeGreaterThanOrEqual(bounds.top + ancestor.clientTop - tolerance);
        expect(rect.bottom).withContext(context + ': control clipped below by ' + ancestor.tagName + '.' + ancestor.className)
          .toBeLessThanOrEqual(bounds.top + ancestor.clientTop + ancestor.clientHeight + tolerance);
      }
    }
  }

  it('keeps empty, medium and long player shells reachable at every required viewport', async () => {
    const styles = injectedStyles();
    for (const [width, height] of viewports) {
      for (const [label, paragraphs] of [['empty', 0], ['medium', 4], ['long', 64]] as const) {
        await inViewport(width, height, withContent('', paragraphs), styles,
          (doc, win) => assertGeometry(doc, win, width + '×' + height + ' ' + label, paragraphs === 0));
      }
    }
  }, 20000);

  it('lays out actual Home, Collection, Packs and Profile snapshots with long data without clipping controls', async () => {
    const pages = [
      ['Home', await pageSnapshot(HomeComponent, 'app-game-home')],
      ['Collection', await pageSnapshot(CollectionComponent, 'app-game-collection')],
      ['Packs', await pageSnapshot(PacksComponent, 'app-game-packs')],
      ['Profile', await pageSnapshot(ProfileComponent, 'app-game-profile')]
    ] as const;
    const styles = injectedStyles();
    for (const [width, height] of viewports) {
      for (const [name, html] of pages) {
        await inViewport(width, height, withContent(html), styles,
          (doc, win) => assertGeometry(doc, win, width + '×' + height + ' ' + name));
      }
    }
  }, 20000);

  it('keeps the desktop sidebar bounded and lets its actual logout control scroll into view at low height', async () => {
    await inViewport(844, 390, withContent('', 64), injectedStyles(), (doc, win) => {
      const sidebar = doc.querySelector<HTMLElement>('.game-sidebar')!;
      const logout = sidebar.querySelector<HTMLElement>('button.logout')!;
      expect(sidebar.getBoundingClientRect().height).toBeLessThanOrEqual(win.innerHeight + tolerance);
      expect(sidebar.scrollHeight).withContext('Low desktop needs sidebar overflow to exercise scrolling').toBeGreaterThan(sidebar.clientHeight);
      sidebar.scrollTop = sidebar.scrollHeight;
      expect(sidebar.scrollTop).withContext('Sidebar overflow must allow real scrolling').toBeGreaterThan(0);
      assertReachable(logout, win, '844×390 desktop sidebar');
    });
  });
});
