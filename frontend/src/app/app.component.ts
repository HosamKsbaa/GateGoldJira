import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from './core/auth/auth.service';
import * as z from 'zod';
import type { BoardSummary, ModernIssueSummary, ProjectView } from './api/generated/types.gen';
import { ApiError } from './core/api/api-result';
import { WorkspaceApi } from './core/workspace/workspace-api.service';
import { positionAnchoredPopup } from './shared/ui/position-anchored-popup';
import { IconComponent } from './shared/ui/icon.component';

@Component({
  selector: 'gg-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent, CdkTrapFocus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#main-content" (click)="skipToContent($event)">Skip to content</a>
    <header class="app-header">
      @if (auth.me()) {
        <button
          class="icon-button desktop-menu"
          type="button"
          [attr.aria-label]="sidebarCollapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
          [attr.aria-expanded]="!sidebarCollapsed()"
          aria-controls="workspace-sidebar"
          (click)="sidebarCollapsed.set(!sidebarCollapsed())"
          ><gg-icon name="menu" /></button
        ><button
          class="icon-button mobile-menu"
          type="button"
          aria-label="Toggle navigation"
          [attr.aria-expanded]="sidebarOpen()"
          aria-controls="workspace-sidebar"
          (click)="sidebarOpen.set(!sidebarOpen())"
          ><gg-icon name="menu"
        /></button>
      }
      <a class="brand" routerLink="/" aria-label="GateGoldJira home"
        ><span class="brand-symbol" aria-hidden="true"><i></i><i></i><i></i></span>GateGold<span
          >Jira</span
        ></a
      >
      @if (auth.me(); as me) {
        <form #globalSearchAnchor class="global-search" (submit)="search($event)">
          <gg-icon name="search" /><input
            id="global-issue-query"
            aria-label="Search all issues"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="global-issue-options"
            [attr.aria-expanded]="globalSearchOpen()"
            [attr.aria-busy]="globalSearchPending()"
            [attr.aria-activedescendant]="
              globalActive() >= 0 ? 'global-issue-option-' + globalActive() : null
            "
            [value]="searchText()"
            (input)="onSearchInput($event)"
            (focus)="focusGlobalSearch()"
            (keydown)="globalSearchKey($event)"
            placeholder="Search issues…"
            maxlength="200"
            autocomplete="off"
            dir="auto"
          /><kbd>↵</kbd>
          <div
            #globalSearchPanel
            class="global-search-results"
            popover="auto"
            (toggle)="globalSearchToggled()"
            aria-label="Issue search results"
          >
            <div class="global-search-heading"
              >Issues <span>Search by number, key or title</span></div
            >
            @if (globalSearchPending()) {
              <p class="global-search-message" role="status">Searching issues…</p>
            }
            @if (globalSearchError()) {
              <p class="global-search-message" role="alert">{{ globalSearchError() }}</p
              ><button
                type="button"
                class="secondary global-search-retry"
                (click)="scheduleGlobalSearch()"
                >Retry search</button
              >
            }
            <ul
              id="global-issue-options"
              role="listbox"
              aria-label="Matching issues"
              [attr.aria-busy]="globalSearchPending()"
            >
              @for (issue of globalMatches(); track issue.id; let index = $index) {
                <li
                  role="option"
                  [id]="'global-issue-option-' + index"
                  [attr.aria-selected]="globalActive() === index"
                  [class.active]="globalActive() === index"
                  ><a [routerLink]="['/issues', issue.id]" (click)="closeGlobalSearch()"
                    ><gg-icon [name]="issue.type.key === 'bug' ? 'bug' : 'check-square'" /><span
                      ><small
                        ><bdi>{{ issue.key }}</bdi> · {{ issue.stage.name }}</small
                      ><bdi>{{ issue.title }}</bdi></span
                    ></a
                  ></li
                >
              }
            </ul>
            @if (!globalSearchPending() && !globalSearchError() && !globalMatches().length) {
              <p class="global-search-message" role="status">No matching issues.</p>
            }
            <button type="submit" class="global-search-all" [disabled]="!searchText().trim()"
              >View all results
              @if (!globalSearchPending() && !globalSearchError()) {
                <span>{{ globalTotal() }}</span>
              }
              <gg-icon name="arrow-right"
            /></button>
          </div>
        </form>
        <div class="header-actions">
          @if (issueCreationProject(); as project) {
            <a
              class="button create-global"
              aria-label="Create issue"
              routerLink="/issues"
              [queryParams]="creationQuery(project.id)"
              ><gg-icon name="plus" /><span>Create issue</span></a
            >
          }
          <a
            class="icon-button notification-button"
            routerLink="/notifications"
            aria-label="Notifications"
            ><gg-icon name="bell" />
            @if (workspaceApi.unreadCount()) {
              <span class="notification-dot"></span>
            }
          </a>
          <a class="icon-button" routerLink="/account/mcp-tokens" aria-label="Account MCP tokens" title="MCP tokens"><gg-icon name="settings" /></a>
          <span class="avatar avatar-current" [attr.title]="me.displayName" dir="auto">{{
            initials(me.displayName)
          }}</span>
          <button
            type="button"
            class="text-button sign-out-button"
            aria-label="Sign out"
            (click)="signOut()"
            ><gg-icon name="logout" /><span>Sign out</span></button
          >
        </div>
      }
    </header>
    <div
      class="app-layout"
      [class.signed-in]="!!auth.me()"
      [class.navigation-open]="sidebarOpen()"
      [class.sidebar-collapsed]="sidebarCollapsed()"
    >
      @if (auth.me(); as me) {
        @if (sidebarOpen()) {
          <button
            type="button"
            class="sidebar-backdrop"
            aria-label="Close navigation"
            (click)="sidebarOpen.set(false)"
          ></button>
        }
        @if (
          (!compactNavigation() && !sidebarCollapsed()) || (compactNavigation() && sidebarOpen())
        ) {
          <aside
            id="workspace-sidebar"
            class="workspace-sidebar"
            [cdkTrapFocus]="compactNavigation()"
            [cdkTrapFocusAutoCapture]="compactNavigation()"
            [attr.role]="compactNavigation() ? 'dialog' : null"
            [attr.aria-modal]="compactNavigation() ? 'true' : null"
            [attr.aria-label]="compactNavigation() ? 'Workspace navigation' : null"
            (keydown.escape)="sidebarOpen.set(false)"
          >
            <div class="company-switcher"
              ><span class="company-avatar">G</span
              ><div><strong>GateGold</strong><span>Team workspace</span></div></div
            >
            <nav aria-label="Main navigation" class="primary-nav">
              <a
                routerLink="/"
                routerLinkActive="active"
                [routerLinkActiveOptions]="{ exact: true }"
                ><gg-icon name="home" />Workspace</a
              >
              <a
                routerLink="/issues"
                [class.active]="url().startsWith('/issues') && !projectIssueRoute()"
                [attr.aria-current]="
                  url().startsWith('/issues') && !projectIssueRoute() ? 'page' : null
                "
                ><gg-icon name="list" />Issues</a
              >
              <a routerLink="/projects" routerLinkActive="active"
                ><gg-icon name="folder" />Projects</a
              >
              <a routerLink="/notifications" routerLinkActive="active"
                ><gg-icon name="bell" />Inbox
                @if (workspaceApi.unreadCount(); as unread) {
                  <span class="nav-count">{{ unread }}<span class="sr-only"> unread</span></span>
                }
              </a>
            </nav>
            @if (selectedProject(); as project) {
              <div class="nav-section-heading">Current project</div>
              <a class="project-context" [routerLink]="['/projects', project.id]"
                ><span class="project-avatar">{{ project.key.slice(0, 2) }}</span
                ><div
                  ><strong dir="auto">{{ project.name }}</strong
                  ><span>{{ project.key }} · {{ project.effectiveRole }}</span></div
                ></a
              >
              <nav aria-label="Project navigation" class="project-nav">
                <a
                  [routerLink]="
                    board() ? ['/boards', board()?.id] : ['/boards/project', project.id]
                  "
                  [class.active]="url().startsWith('/boards/')"
                  ><gg-icon name="board" />Board</a
                >
                <a
                  routerLink="/issues"
                  [queryParams]="{ projectId: project.id }"
                  [class.active]="projectIssueRoute()"
                  [attr.aria-current]="projectIssueRoute() ? 'page' : null"
                  ><gg-icon name="check-square" />Project issues</a
                >
                <a
                  [routerLink]="['/backlog', project.id]"
                  [class.active]="url().startsWith('/backlog/')"
                  ><gg-icon name="list" />Project backlog</a
                >
                <a [routerLink]="['/projects', project.id, 'planning']"
                  ><gg-icon name="folder" />Epics & releases</a
                >
                <a [routerLink]="['/projects', project.id, 'reports']"
                  ><gg-icon name="activity" />Project reports</a
                >
                <a [routerLink]="['/projects', project.id, 'import-export']"
                  ><gg-icon name="arrow-down" />Import & export</a
                >
                @if (project.effectiveRole === 'administrator' || project.effectiveRole === 'project_admin') {
                  <a [routerLink]="['/projects', project.id, 'automation']"
                    ><gg-icon name="settings" />Automation</a
                  >
                }
                <a [routerLink]="['/boards/project', project.id]"
                  ><gg-icon name="settings" />Manage boards</a
                >
              </nav>
            }
            @if (projects().length) {
              <div class="nav-section-heading"
                >Your projects<a routerLink="/projects" aria-label="View all projects"
                  ><gg-icon name="more" /></a
              ></div>
              <nav aria-label="Recent projects" class="recent-projects">
                @for (project of projects().slice(0, 4); track project.id) {
                  <a
                    [routerLink]="['/projects', project.id]"
                    [attr.aria-label]="'Open ' + project.name"
                    ><span class="small-project-avatar">{{ project.key.slice(0, 1) }}</span
                    ><span dir="auto">{{ project.name }}</span></a
                  >
                }
              </nav>
            }
            @if (me.administrator) {
              <div class="nav-section-heading">Administration</div
              ><nav class="admin-nav" aria-label="Administration">
                <a routerLink="/admin/users" routerLinkActive="active"
                  ><gg-icon name="users" />Users</a
                ><a routerLink="/admin/activity" routerLinkActive="active"
                  ><gg-icon name="activity" />Activity</a
                >
              </nav>
            }
            <div class="sidebar-footer"
              ><span class="connection-dot"></span><span>Team workspace</span
              ><span class="workspace-role">{{
                me.administrator ? 'Admin' : (selectedProject()?.effectiveRole ?? 'User')
              }}</span></div
            >
          </aside>
        }
      }
      <main
        id="main-content"
        tabindex="-1"
        [inert]="compactNavigation() && sidebarOpen()"
        [class.auth-content]="!auth.me()"
        ><router-outlet
      /></main>
    </div>
  `,
})
export class AppComponent {
  private readonly document = inject(DOCUMENT);
  readonly auth = inject(AuthService);
  readonly workspaceApi = inject(WorkspaceApi);
  skipToContent(event: Event): void {
    event.preventDefault();
    this.document.getElementById('main-content')?.focus();
  }
  private readonly destroyed = inject(DestroyRef);
  private readonly compactViewport =
    inject(DOCUMENT).defaultView?.matchMedia?.('(max-width: 700px)');
  readonly compactNavigation = signal(this.compactViewport?.matches ?? false);
  private readonly router = inject(Router);
  readonly url = signal(this.router.url);
  readonly projectIssueRoute = computed(() => {
    const tree = this.router.parseUrl(this.url());
    const segments = tree.root.children['primary']?.segments ?? [];
    return (
      segments[0]?.path === 'issues' &&
      (segments.length > 1 || z.uuid().safeParse(tree.queryParams['projectId']).success)
    );
  });
  readonly sidebarOpen = signal(false);
  readonly sidebarCollapsed = signal(false);
  readonly projects = signal<ProjectView[]>([]);
  readonly selectedProject = signal<ProjectView | null>(null);
  readonly issueCreationProject = computed(() => {
    const selected = this.selectedProject();
    return selected && !selected.archived && selected.effectiveRole !== 'viewer'
      ? selected
      : this.projects().find(project => !project.archived && project.effectiveRole !== 'viewer');
  });
  readonly board = signal<Pick<BoardSummary, 'id' | 'projectId' | 'name'> | null>(null);
  readonly searchText = signal('');
  readonly globalMatches = signal<ModernIssueSummary[]>([]);
  readonly globalTotal = signal(0);
  readonly globalSearchPending = signal(false);
  readonly globalSearchError = signal('');
  readonly globalSearchOpen = signal(false);
  readonly globalActive = signal(-1);
  private readonly globalSearchAnchor = viewChild<ElementRef<HTMLElement>>('globalSearchAnchor');
  private readonly globalSearchPanel = viewChild<ElementRef<HTMLElement>>('globalSearchPanel');
  private globalSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private globalSearchAbort: AbortController | null = null;
  private globalSearchGeneration = 0;
  private changingGlobalPopover = false;
  private contextGeneration = 0;
  private contextKey = '';
  private navigationIdentity = '';
  constructor() {
    const placeGlobal = (): void => this.placeGlobalSearch();
    window.addEventListener('resize', placeGlobal);
    window.visualViewport?.addEventListener('resize', placeGlobal);
    window.visualViewport?.addEventListener('scroll', placeGlobal);
    this.destroyed.onDestroy(() => {
      this.cancelGlobalSearch();
      window.removeEventListener('resize', placeGlobal);
      window.visualViewport?.removeEventListener('resize', placeGlobal);
      window.visualViewport?.removeEventListener('scroll', placeGlobal);
    });
    const updateViewport = (event: MediaQueryListEvent): void => {
      this.compactNavigation.set(event.matches);
      this.sidebarOpen.set(false);
    };
    this.compactViewport?.addEventListener('change', updateViewport);
    inject(DestroyRef).onDestroy(() =>
      this.compactViewport?.removeEventListener('change', updateViewport),
    );
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(event => {
        const previousPath = this.router
          .parseUrl(this.url())
          .root.children['primary']?.segments.map(segment => segment.path)
          .join('/');
        const nextPath = this.router
          .parseUrl(event.urlAfterRedirects)
          .root.children['primary']?.segments.map(segment => segment.path)
          .join('/');
        this.url.set(event.urlAfterRedirects);
        this.sidebarOpen.set(false);
        if (previousPath !== nextPath) this.closeGlobalSearch();
        if (this.auth.me()) {
          if (previousPath !== nextPath)
            void this.workspaceApi.refreshSummary().catch(() => undefined);
          void this.loadContext(event.urlAfterRedirects);
        }
      });
    effect(() => {
      const me = this.auth.me();
      const epoch = this.auth.sessionEpoch();
      if (this.auth.sessionDenied() && !me && !this.router.url.startsWith('/sign-in')) {
        void this.router.navigateByUrl('/sign-in');
      } else if (me && !me.administrator && this.router.url.startsWith('/admin/'))
        void this.router.navigateByUrl('/');
      untracked(() => {
        if (!me) {
          this.navigationIdentity = '';
          this.contextKey = '';
          this.contextGeneration++;
          this.projects.set([]);
          this.selectedProject.set(null);
          this.board.set(null);
          this.sidebarOpen.set(false);
          this.closeGlobalSearch();
          this.globalMatches.set([]);
          this.globalTotal.set(0);
          this.searchText.set('');
        } else {
          const identity = epoch + ':' + me.userId + ':' + me.administrator;
          if (identity !== this.navigationIdentity) {
            this.closeGlobalSearch();
            this.globalMatches.set([]);
            this.contextKey = '';
            this.navigationIdentity = identity;
            void this.loadProjects(epoch);
          }
        }
      });
    });
  }
  creationQuery(projectId: string) {
    return {
      create: 'true',
      projectId,
      ...(this.url().startsWith('/backlog/') ? { view: 'backlog' } : {}),
    };
  }
  initials(name: string): string {
    return Array.from(name.trim()).slice(0, 2).join('').toLocaleUpperCase();
  }
  private async loadProjects(epoch: number): Promise<void> {
    try {
      const page = await this.workspaceApi.projects(false);
      if (epoch !== this.auth.sessionEpoch() || !this.auth.me()) return;
      this.projects.set(page.items);
      await this.loadContext(this.router.url);
    } catch {
      /* Page-level errors remain visible; navigation never grants access. */
    }
  }
  private async loadContext(url: string): Promise<void> {
    const tree = this.router.parseUrl(url);
    const segments = tree.root.children['primary']?.segments.map(segment => segment.path) ?? [];
    const queryId = z.uuid().safeParse(tree.queryParams['projectId']);
    const epoch = this.auth.sessionEpoch();
    const key = epoch + ':' + segments.join('/') + ':' + (queryId.success ? queryId.data : '');
    if (key === this.contextKey) return;
    this.contextKey = key;
    const generation = ++this.contextGeneration;
    const current = () =>
      generation === this.contextGeneration && epoch === this.auth.sessionEpoch() && !!this.auth.me();
    let projectId = queryId.success ? queryId.data : undefined;
    let activeBoard: Pick<BoardSummary, 'id' | 'projectId' | 'name'> | undefined;
    try {
      if (segments[0] === 'backlog' && segments[1]) projectId = z.uuid().parse(segments[1]);
      if (segments[0] === 'projects' && segments[1]) projectId = z.uuid().parse(segments[1]);
      if (segments[0] === 'boards' && segments[1] === 'project' && segments[2])
        projectId = z.uuid().parse(segments[2]);
      else if (segments[0] === 'boards' && segments[1]) {
        activeBoard = (await this.workspaceApi.board(z.uuid().parse(segments[1]))).board;
        projectId = activeBoard.projectId;
      }
      if (segments[0] === 'issues' && segments[1])
        projectId = (await this.workspaceApi.issue(z.uuid().parse(segments[1]))).summary.projectId;
      if (!current()) return;
      projectId ??= this.selectedProject()?.id ?? this.projects()[0]?.id;
      if (!projectId) return;
      const project = await this.workspaceApi.project(projectId);
      if (!current()) return;
      let board = activeBoard;
      if (!board) {
        let cursor: string | undefined;
        do {
          const page = await this.workspaceApi.boards(projectId, cursor);
          if (!current()) return;
          board = page.items.find(item => item.default);
          cursor = page.nextCursor ?? undefined;
        } while (!board && cursor);
      }
      if (!current()) return;
      this.selectedProject.set(project);
      this.board.set(board ?? null);
      this.projects.update(items =>
        project.archived
          ? items.filter(item => item.id !== project.id)
          : items.some(item => item.id === project.id)
            ? items.map(item => (item.id === project.id ? project : item))
            : [project, ...items].slice(0, 25),
      );
    } catch {
      if (generation === this.contextGeneration && epoch === this.auth.sessionEpoch()) {
        this.contextKey = '';
        this.selectedProject.set(null);
        this.board.set(null);
      }
    }
  }
  private cancelGlobalSearch(): void {
    this.globalSearchGeneration++;
    if (this.globalSearchTimer !== null) clearTimeout(this.globalSearchTimer);
    this.globalSearchTimer = null;
    this.globalSearchAbort?.abort();
    this.globalSearchAbort = null;
    this.globalSearchPending.set(false);
  }
  closeGlobalSearch(): void {
    this.cancelGlobalSearch();
    this.globalSearchOpen.set(false);
    this.globalActive.set(-1);
    const panel = this.globalSearchPanel()?.nativeElement;
    if (panel?.matches(':popover-open') && !this.changingGlobalPopover) {
      this.changingGlobalPopover = true;
      try {panel.hidePopover();} finally {this.changingGlobalPopover = false;}
    }
  }
  globalSearchToggled(): void {
    if (!this.globalSearchPanel()?.nativeElement.matches(':popover-open')) this.closeGlobalSearch();
  }
  private placeGlobalSearch(): void {
    const anchor = this.globalSearchAnchor()?.nativeElement,
      panel = this.globalSearchPanel()?.nativeElement;
    if (anchor && panel?.matches(':popover-open'))
      positionAnchoredPopup(
        panel,
        anchor,
        Math.max(420, anchor.getBoundingClientRect().width),
        420,
      );
  }
  onSearchInput(event: Event): void {
    this.searchText.set((event.target as HTMLInputElement).value);
    this.scheduleGlobalSearch();
  }
  focusGlobalSearch(): void {
    // Hiding a popover can synchronously return focus to this input. Reopening
    // it from that focus event would reenter the browser's hide operation.
    if (!this.changingGlobalPopover && this.searchText().trim()) this.scheduleGlobalSearch();
  }
  scheduleGlobalSearch(): void {
    this.cancelGlobalSearch();
    this.globalMatches.set([]);
    this.globalTotal.set(0);
    this.globalSearchError.set('');
    this.globalActive.set(-1);
    const query = this.searchText().trim(),
      panel = this.globalSearchPanel()?.nativeElement;
    if (!query || !this.auth.me() || query.length > 200 || !panel) {
      this.closeGlobalSearch();
      return;
    }
    this.globalSearchOpen.set(true);
    this.globalSearchPending.set(true);
    if (!panel.matches(':popover-open')) {
      this.changingGlobalPopover = true;
      try {panel.showPopover();} finally {this.changingGlobalPopover = false;}
    }
    this.placeGlobalSearch();
    const generation = this.globalSearchGeneration,
      epoch = this.auth.sessionEpoch();
    this.globalSearchTimer = setTimeout(() => {
      this.globalSearchTimer = null;
      void this.findGlobalIssues(query, generation, epoch);
    }, 120);
  }
  private async findGlobalIssues(query: string, generation: number, epoch: number): Promise<void> {
    const controller = new AbortController();
    this.globalSearchAbort = controller;
    const current = (): boolean =>
      generation === this.globalSearchGeneration &&
      epoch === this.auth.sessionEpoch() &&
      !this.destroyed.destroyed;
    try {
      const page = await this.workspaceApi.search(query, controller.signal);
      if (!current()) return;
      this.globalMatches.set(page.items.slice(0, 8));
      this.globalTotal.set(page.totalMatching);
    } catch (error: unknown) {
      if (current())
        this.globalSearchError.set(
          error instanceof ApiError ? error.message : 'Search could not be completed. Try again.',
        );
    } finally {
      if (current()) {
        this.globalSearchPending.set(false);
        this.globalSearchAbort = null;
        queueMicrotask(() => this.placeGlobalSearch());
      }
    }
  }
  globalSearchKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeGlobalSearch();
      return;
    }
    if (event.key === 'Enter' && this.globalActive() >= 0 && !this.globalSearchPending()) {
      const issue = this.globalMatches()[this.globalActive()];
      if (issue) {
        event.preventDefault();
        this.closeGlobalSearch();
        void this.router.navigate(['/issues', issue.id]);
      }
      return;
    }
    if (
      !['ArrowDown', 'ArrowUp'].includes(event.key) ||
      !this.globalSearchOpen() ||
      this.globalSearchPending()
    )
      return;
    event.preventDefault();
    const last = this.globalMatches().length - 1;
    this.globalActive.set(
      event.key === 'ArrowDown'
        ? Math.min(last, this.globalActive() + 1)
        : Math.max(0, this.globalActive() - 1),
    );
    document
      .getElementById('global-issue-option-' + this.globalActive())
      ?.scrollIntoView({ block: 'nearest' });
  }
  async search(event: Event): Promise<void> {
    event.preventDefault();
    this.closeGlobalSearch();
    await this.router.navigate(['/issues'], { queryParams: { query: this.searchText().trim() } });
  }
  async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/sign-in');
  }
}
