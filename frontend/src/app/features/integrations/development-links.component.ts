import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { DevelopmentLinkView, DevelopmentLinkFields } from '../../api/generated/types.gen';
import { IntegrationsApi } from './integrations.api';
import { RetryIntent } from '../../core/api/api-result';
@Component({
  selector: 'gg-development-links',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="development"
    ><header
      ><h3>Development</h3>
      @if (canEdit() && !editing()) {
        <button type="button" class="secondary" (click)="add()">Add link</button>
      }</header
    ><p class="help">Link pull requests, commits or other work. Links are added by your team.</p>
    @if (error()) {
      <p role="alert"
        >{{ error() }}
        <button type="button" class="secondary" (click)="reload()">Reload links</button></p
      >
    }
    @if (loading()) {
      <p role="status">Loading development links…</p>
    }
    <ul>
      @for (link of links(); track link.id) {
        <li
          ><div
            ><span class="kind">{{ label(link.kind) }}</span
            ><a [href]="link.url" target="_blank" rel="noopener noreferrer" dir="auto"
              >{{ link.title }} ↗</a
            ><small>{{ domain(link.url) }}</small></div
          >
          @if (canEdit()) {
            <div class="link-actions"
              ><button type="button" class="secondary" (click)="edit(link)">Edit</button
              ><button type="button" class="secondary" [disabled]="saving()" (click)="remove(link)"
                >Remove</button
              ></div
            >
          }
        </li>
      }
    </ul>
    @if (!loading() && !links().length && !editing()) {
      <p class="empty">No development links yet.</p>
    }
    @if (cursor()) {
      <button type="button" class="secondary" [disabled]="loading()" (click)="more()"
        >Load more development links</button
      >
    }
    @if (editing()) {
      <form [formGroup]="form" (ngSubmit)="save()"
        ><label
          >Link type<select formControlName="kind"
            ><option value="pull_request">Pull request</option
            ><option value="commit">Commit</option
            ><option value="other">Other</option></select
          ></label
        ><label>Title<input formControlName="title" maxlength="200" dir="auto" /></label
        ><label
          >URL<input
            type="url"
            formControlName="url"
            placeholder="https://github.com/company/repo/pull/123" /></label
        ><div class="form-actions"
          ><button type="submit" [disabled]="saving() || form.invalid">{{
            saving() ? 'Saving…' : 'Save development link'
          }}</button
          ><button type="button" class="secondary" [disabled]="saving()" (click)="cancel()"
            >Cancel</button
          ></div
        ></form
      >
    }
  </section>`,
  styles: `
    .development {
      border-top: 1px solid var(--color-border);
      padding: 18px 0;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    h3 {
      font-size: 14px;
      margin: 0;
    }
    .help,
    .empty {
      font-size: 12px;
      color: var(--color-muted);
      line-height: 1.6;
    }
    ul {
      list-style: none;
      padding: 0;
      margin: 14px 0;
    }
    li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 14px;
      border: 1px solid var(--color-border);
      padding: 12px;
      border-radius: 7px;
      margin-bottom: 8px;
    }
    li > div:first-child {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    li a {
      font-size: 13px;
      overflow-wrap: anywhere;
      text-decoration: none;
    }
    .kind,
    small {
      font-size: 11px;
      color: var(--color-muted);
    }
    .kind {
      font-weight: 600;
    }
    .link-actions {
      display: flex;
      gap: 4px;
    }
    form {
      display: grid;
      gap: 12px;
      background: #f7f8f9;
      padding: 16px;
      border-radius: 8px;
    }
    label {
      display: grid;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
    }
    .form-actions {
      display: flex;
      gap: 8px;
    }
    p[role='alert'] {
      font-size: 12px;
      color: #ae2a19;
    }
    @media (max-width: 500px) {
      li {
        align-items: start;
        flex-direction: column;
      }
      .link-actions {
        align-self: flex-end;
      }
    }
  `,
})
export class DevelopmentLinksComponent {
  readonly issueId = input.required<string>();
  readonly canEdit = input(false);
  private readonly api = inject(IntegrationsApi);
  readonly links = signal<DevelopmentLinkView[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly editing = signal(false);
  readonly selected = signal<DevelopmentLinkView | null>(null);
  readonly form = new FormGroup({
    kind: new FormControl<'pull_request' | 'commit' | 'other'>('pull_request', {
      nonNullable: true,
    }),
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200)],
    }),
    url: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(2000)],
    }),
  });
  private linkId: string = crypto.randomUUID();
  private readonly intent = new RetryIntent<DevelopmentLinkFields>();
  private readonly detachIntent = new RetryIntent<{ id: string; body: DevelopmentLinkFields }>();
  constructor() {
    effect(() => {
      const id = this.issueId();
      this.cancel();
      void this.load(id, false);
    });
  }
  label(kind: DevelopmentLinkView['kind']) {
    return kind === 'pull_request' ? 'Pull request' : kind === 'commit' ? 'Commit' : 'Link';
  }
  domain(value: string) {
    try {
      return new URL(value).hostname;
    } catch {
      return '';
    }
  }
  reload() {
    void this.load(this.issueId(), false);
  }
  more() {
    void this.load(this.issueId(), true);
  }
  private async load(id: string, append: boolean) {
    this.loading.set(true);
    this.error.set('');
    try {
      const page = await this.api.links(id, append ? (this.cursor() ?? undefined) : undefined);
      if (this.issueId() !== id) return;
      this.links.set(append ? [...this.links(), ...page.items] : page.items);
      this.cursor.set(page.nextCursor);
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'Development links could not be loaded.',
      );
    } finally {
      this.loading.set(false);
    }
  }
  add() {
    this.linkId = crypto.randomUUID();
    this.selected.set(null);
    this.form.reset({ kind: 'pull_request', title: '', url: '' });
    this.intent.finish();
    this.editing.set(true);
  }
  edit(link: DevelopmentLinkView) {
    this.linkId = link.id;
    this.selected.set(link);
    this.form.reset({ kind: link.kind, title: link.title, url: link.url });
    this.intent.finish();
    this.editing.set(true);
  }
  cancel() {
    this.editing.set(false);
    this.selected.set(null);
  }
  async save() {
    if (this.saving() || this.form.invalid || !this.canEdit()) return;
    const values = this.form.getRawValue();
    const body: DevelopmentLinkFields = {
      ...values,
      title: values.title.trim(),
      url: values.url.trim(),
      expectedRevision: this.selected()?.revision ?? '0',
      removed: false,
    };
    this.saving.set(true);
    this.error.set('');
    try {
      await this.api.saveLink(this.issueId(), this.linkId, body, this.intent.reference(body));
      this.intent.finish();
      this.cancel();
      this.reload();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The link could not be saved.');
    } finally {
      this.saving.set(false);
    }
  }
  async remove(link: DevelopmentLinkView) {
    if (this.saving() || !this.canEdit()) return;
    const body: DevelopmentLinkFields = {
      url: link.url,
      title: link.title,
      kind: link.kind,
      expectedRevision: link.revision,
      removed: true,
    };
    this.saving.set(true);
    this.error.set('');
    try {
      await this.api.saveLink(
        this.issueId(),
        link.id,
        body,
        this.detachIntent.reference({ id: link.id, body }),
      );
      this.detachIntent.finish();
      this.reload();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'The link could not be removed.');
    } finally {
      this.saving.set(false);
    }
  }
}
