import { protectedAttachmentExtension } from '../../../attachments/editor-attachment';
import { IconComponent, type IconName } from '../../../../shared/ui/icon.component';
import { FileQueueComponent } from '../../../attachments/components/file-queue/file-queue.component';
import type { AttachmentView } from '../../../../api/generated/types.gen';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { Editor } from '@tiptap/core';
import * as z from 'zod';
import type {
  CommentBody,
  CommentView,
  PictureView,
  UserSummary,
} from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { PicturesApi } from '../../../pictures/pictures.api';
import { MentionPickerComponent } from '../mention-picker/mention-picker.component';
import {
  commentChildren,
  commentNodesHTML,
  parseCommentNodes,
  safeLink,
  type CommentNode,
  type TextDirection,
} from '../../comment-renderer';
import {
  editTable,
  loadRichTextBlocks,
  tableActions,
  type TableAction,
} from '../../rich-text-blocks';
const pictureAttributes = z.object({ pictureId: z.uuid(), description: z.string() });
const mentionAttributes = z.object({ userId: z.uuid(), label: z.string() });
type Format =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'bulletList'
  | 'orderedList'
  | 'blockquote'
  | 'paragraph'
  | 'hardBreak'
  | 'codeBlock'
  | 'taskList';
@Component({
  selector: 'gg-comment-editor',
  imports: [IconComponent, FileQueueComponent, ReactiveFormsModule, MentionPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../../../../shared/ui/rich-text-editor.css',
  templateUrl: './comment-editor.component.html',
})
export class CommentEditorComponent {
  readonly issueId = input.required<string>();
  readonly projectId = input.required<string>();
  readonly mentionQuery = signal<string | null>(null);
  private mentionRange: { from: number; to: number } | null = null;
  private readonly picker = viewChild(MentionPickerComponent);
  readonly current = input<CommentView | null>(null);
  private readonly commentIdentity = computed(() => this.current()?.id ?? null);
  readonly busy = input(false);
  readonly reset = input(0);
  readonly save = output<CommentBody>();
  readonly draftRevision = output<string | null>();
  private readonly drafts = inject(DraftsService);
  private draftKey = '';
  readonly cancel = output<void>();
  private readonly host = viewChild<ElementRef<HTMLElement>>('editorHost');
  private readonly auth = inject(AuthService);
  private readonly pictures = inject(PicturesApi);
  private editor: Editor | null = null;
  private generation = 0;
  private focusRequested = false;
  private scope = new AbortController();
  readonly ready = signal(false);
  readonly error = signal('');
  readonly characters = signal(0);
  readonly bytes = signal(0);
  readonly pictureCount = signal(0);
  readonly activeFormats = signal<Format[]>([]);
  readonly tableActions = tableActions;
  readonly tableActive = signal(false);
  readonly link = new FormControl('', { nonNullable: true });
  readonly source = new FormControl('', { nonNullable: true });
  readonly sourceMode = signal(false);
  readonly showLinks = signal(false);
  readonly controlId = 'comment-editor-' + crypto.randomUUID();
  readonly attachmentsOpen = signal(false);
  attachFiles(): void {
    if (this.busy() || this.sourceMode()) return;
    this.attachmentsOpen.set(true);
    this.fileQueue()?.chooseFiles();
  }
  readonly actions: { format: Format; label: string; text?: string; icon?: IconName }[] = [
    { format: 'bold', label: 'Bold', text: 'B' },
    { format: 'italic', label: 'Italic', text: 'I' },
    { format: 'underline', label: 'Underline', text: 'U' },
    { format: 'bulletList', label: 'Bullet list', icon: 'list' },
    { format: 'orderedList', label: 'Numbered list', icon: 'list-ordered' },
    { format: 'blockquote', label: 'Quote', icon: 'quote' },
    { format: 'hardBreak', label: 'Line break', icon: 'corner-down-left' },
    { format: 'codeBlock', label: 'Code block', icon: 'code' },
    { format: 'taskList', label: 'Checklist', icon: 'check-square' },
  ];
  constructor() {
    effect(() => {
      const host = this.host();
      this.issueId();
      this.auth.sessionEpoch();
      this.commentIdentity();
      this.reset();
      untracked(() => {
        if (host) void this.initialize(host.nativeElement);
      });
    });
    effect(() => {
      const busy = this.busy();
      untracked(() => {
        this.editor?.setEditable(!busy, false);
        this.applyRequestedFocus();
      });
    });
    this.source.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (this.sourceMode()) this.remember(this.source.value);
    });
    inject(DestroyRef).onDestroy(() => {
      this.drafts.release(this.draftKey);
      this.dispose();
    });
  }
  private dispose(): void {
    this.generation++;
    this.scope.abort();
    this.scope = new AbortController();
    this.editor?.destroy();
    this.editor = null;
    this.ready.set(false);
    this.mentionRange = null;
    this.mentionQuery.set(null);
  }
  private async initialize(element: HTMLElement): Promise<void> {
    this.drafts.release(this.draftKey);
    this.draftKey = 'comment:' + this.issueId() + ':' + (this.current()?.id ?? 'new');
    const draft = this.drafts.comments.get(this.draftKey);
    this.drafts.activate(this.draftKey, !!draft);
    this.draftRevision.emit(draft?.revision ?? this.current()?.revision ?? null);
    this.dispose();
    const generation = this.generation;
    this.error.set('');
    this.sourceMode.set(false);
    this.showLinks.set(false);
    this.attachmentsOpen.set(false);
    this.source.reset();
    try {
      const [{ Editor: TiptapEditor, Node, Extension }, { default: StarterKit }, richBlocks] =
        await Promise.all([
          import('@tiptap/core'),
          import('@tiptap/starter-kit'),
          loadRichTextBlocks(),
        ]);
      if (generation !== this.generation || !this.auth.me()) return;
      const ProtectedPicture = Node.create({
        name: 'protectedPicture',
        group: 'inline',
        inline: true,
        atom: true,
        addAttributes: () => ({
          pictureId: {
            default: null,
            parseHTML: element => element.getAttribute('data-picture-id'),
          },
          description: {
            default: 'Uploaded picture',
            parseHTML: element => element.getAttribute('alt') ?? 'Uploaded picture',
          },
        }),
        parseHTML: () => [{ tag: 'img[data-picture-id]' }],
        renderHTML: ({ node }) => {
          const attrs = pictureAttributes.parse(node.attrs);
          return ['img', { 'data-picture-id': attrs.pictureId, alt: attrs.description }];
        },
        addNodeView:
          () =>
          ({ node }) => {
            const attrs = pictureAttributes.parse(node.attrs);
            const dom = document.createElement('span');
            dom.className = 'editor-picture';
            dom.contentEditable = 'false';
            const caption = document.createElement('span');
            caption.textContent = attrs.description;
            dom.append(caption);
            const controller = new AbortController();
            const scope = this.scope;
            const abort = () => controller.abort();
            scope.signal.addEventListener('abort', abort);
            let source: string | null = null,
              removed = false;
            void this.pictures
              .content(attrs.pictureId, controller.signal)
              .then(blob => {
                if (removed || scope.signal.aborted) return;
                source = URL.createObjectURL(blob);
                const image = document.createElement('img');
                image.src = source;
                image.alt = attrs.description;
                dom.prepend(image);
              })
              .catch(() => {
                if (!removed) caption.textContent = 'Picture unavailable: ' + attrs.description;
              });
            return {
              dom,
              ignoreMutation: () => true,
              destroy: () => {
                removed = true;
                controller.abort();
                scope.signal.removeEventListener('abort', abort);
                if (source) URL.revokeObjectURL(source);
              },
            };
          },
      });
      const SelectedMention = Node.create({
        name: 'selectedMention',
        group: 'inline',
        inline: true,
        atom: true,
        addAttributes: () => ({
          userId: { default: null, parseHTML: element => element.getAttribute('data-user-id') },
          label: { default: '', parseHTML: element => element.textContent ?? '' },
        }),
        parseHTML: () => [{ tag: 'span[data-user-id]' }],
        renderHTML: ({ node }) => {
          const attrs = mentionAttributes.parse(node.attrs);
          return ['span', { 'data-user-id': attrs.userId }, attrs.label];
        },
        renderText: ({ node }) => mentionAttributes.parse(node.attrs).label,
      });
      const Direction = Extension.create({
        name: 'commentDirection',
        addGlobalAttributes: () => [
          {
            types: [
              'paragraph',
              'heading',
              'blockquote',
              'listItem',
              'taskItem',
              'tableCell',
              'tableHeader',
            ],
            attributes: {
              dir: {
                default: 'auto',
                parseHTML: element => {
                  const dir = element.getAttribute('dir');
                  return dir === 'rtl' || dir === 'ltr' ? dir : 'auto';
                },
                renderHTML: attrs => {
                  const parsed = z.object({ dir: z.enum(['auto', 'rtl', 'ltr']) }).safeParse(attrs);
                  return parsed.success ? { dir: parsed.data.dir } : {};
                },
              },
            },
          },
        ],
      });
      this.editor = new TiptapEditor({
        element,
        extensions: [
          StarterKit.configure({
            code: false,
            horizontalRule: false,
            strike: false,
            link: { openOnClick: false, autolink: false, protocols: ['http', 'https'] },
          }),
          ...richBlocks,
          ProtectedPicture,
          protectedAttachmentExtension(Node, this.issueId()),
          SelectedMention,
          Direction,
        ],
        content: draft?.html ?? this.current()?.safeHtml ?? '<p dir="auto"></p>',
        editable: !this.busy(),
        editorProps: {
          attributes: {
            role: 'textbox',
            'aria-label': 'Comment text',
            'aria-multiline': 'true',
            'data-placeholder': 'Write a comment…',
            dir: 'auto',
          },
          handleKeyDown: (_view, event) => this.picker()?.handleKeyDown(event) ?? false,
          handlePaste: (_view, event) => this.pastePicture(event.clipboardData?.files),
          handleDrop: (_view, event) => this.pastePicture(event.dataTransfer?.files),
        },
        onUpdate: () => {
          this.updateCounters();
          this.updateMentionTrigger();
          this.remember(this.editor?.getHTML() ?? '');
        },
        onSelectionUpdate: () => {
          this.updateMentionTrigger();
          this.updateFormats();
        },
        onCreate: () => this.updateCounters(),
      });
      this.ready.set(true);
      this.updateCounters();
      if (this.current()) this.editor.commands.focus();
      this.applyRequestedFocus();
    } catch {
      if (generation === this.generation)
        this.error.set('The editor could not load. Reload the issue to try again.');
    }
  }
  private remember(html: string): void {
    if (!this.draftKey) return;
    const existing = this.drafts.comments.get(this.draftKey);
    this.drafts.comments.set(this.draftKey, {
      html,
      revision: existing?.revision ?? this.current()?.revision ?? null,
    });
    const current = this.current();
    const dirty = current
      ? html !== current.safeHtml
      : this.sourceMode()
        ? html.trim() !== '' && html !== '<p dir="auto"></p>'
        : !!this.editor?.getText().trim() || this.pictureCount() > 0;
    this.drafts.activate(this.draftKey, dirty);
  }
  saved(): void {
    this.drafts.clearComment(this.draftKey);
    this.fileQueue()?.clearCompleted();
    this.attachmentsOpen.set(false);
  }
  confirmClose(): boolean {
    return this.drafts.mayLeave();
  }
  private pastePicture(files: FileList | undefined): boolean {
    const file = files?.[0];
    if (!file) return false;
    if (this.busy() || !this.fileQueue() || this.pictureCount() >= 5) {
      this.error.set('Finish the upload or remove a picture before pasting another.');
      return true;
    }
    this.attachmentsOpen.set(true);
    void this.fileQueue()?.pasteAndUpload(file);
    return true;
  }
  focusEditor(): void {
    this.focusRequested = true;
    this.applyRequestedFocus();
  }
  private applyRequestedFocus(): void {
    if (!this.focusRequested || !this.editor || !this.ready() || this.busy()) return;
    if (this.sourceMode() && !this.applySource()) return;
    this.sourceMode.set(false);
    this.focusRequested = false;
    this.host()?.nativeElement.scrollIntoView({ block: 'center' });
    this.editor.commands.focus('end', { scrollIntoView: false });
  }
  private body(): CommentBody {
    const users = new Set<string>(),
      pictures = new Set<string>(),
      files = new Set<string>();
    this.editor?.state.doc.descendants(node => {
      if (node.type.name === 'protectedAttachment') {
        const parsed = z.object({ attachmentId: z.uuid() }).safeParse(node.attrs);
        if (parsed.success) files.add(parsed.data.attachmentId);
      }
      if (node.type.name === 'selectedMention') {
        const parsed = mentionAttributes.safeParse(node.attrs);
        if (parsed.success) users.add(parsed.data.userId);
      }
      if (node.type.name === 'protectedPicture') {
        const parsed = pictureAttributes.safeParse(node.attrs);
        if (parsed.success) pictures.add(parsed.data.pictureId);
      }
    });
    return {
      html: this.editor?.getHTML() ?? '',
      mentionUserIds: [...users].sort(),
      pictureIds: [...pictures].sort(),
      attachmentIds: [...files].sort(),
    };
  }
  private updateFormats(): void {
    this.activeFormats.set(
      this.actions
        .filter(action => this.editor?.isActive(action.format))
        .map(action => action.format),
    );
    this.tableActive.set(this.editor?.isActive('table') ?? false);
  }
  table(action: TableAction): void {
    if (this.editor && !this.busy() && !this.sourceMode()) editTable(this.editor, action);
  }
  showSource(): void {
    if (!this.editor || this.busy() || this.sourceMode()) return;
    this.closeMention();
    this.source.setValue(this.editor.getHTML());
    this.sourceMode.set(true);
  }
  showVisual(): void {
    if (this.busy() || !this.applySource()) return;
    this.sourceMode.set(false);
    this.focusEditor();
  }
  private applySource(): boolean {
    if (!this.sourceMode()) return true;
    if (!this.editor || new TextEncoder().encode(this.source.value).length > 65536) {
      this.error.set('Use at most 64 KiB of HTML. Your source remains here.');
      return false;
    }
    const allowed = this.body(),
      nodes = parseCommentNodes(this.source.value);
    const referencesValid = (values: CommentNode[]): boolean =>
      values.every(node => {
        if (node.kind === 'picture') return allowed.pictureIds.includes(node.pictureId);
        if (node.kind === 'attachment')
          return allowed.attachmentIds?.includes(node.attachmentId) ?? false;
        if (node.kind === 'mention') return allowed.mentionUserIds.includes(node.userId);
        return referencesValid(commentChildren(node));
      });
    if (!referencesValid(nodes)) {
      this.error.set(
        'Add pictures and mentions using their controls before referencing them in HTML. Your source remains here.',
      );
      return false;
    }
    this.editor.commands.setContent(commentNodesHTML(nodes));
    this.updateCounters();
    this.error.set('');
    return true;
  }
  private updateCounters(): void {
    this.editor?.view.dom.setAttribute('data-empty', String(this.editor.isEmpty));
    this.updateFormats();
    const body = this.body();
    this.characters.set(Array.from(this.editor?.getText() ?? '').length);
    this.bytes.set(new TextEncoder().encode(body.html).length);
    let pictureCount = 0;
    this.editor?.state.doc.descendants(node => {
      if (node.type.name === 'protectedPicture') pictureCount++;
    });
    this.pictureCount.set(pictureCount);
  }
  format(format: Format): void {
    if (!this.editor || this.busy()) return;
    // Toolbar focus must return before the next keystroke, not on a later animation frame.
    this.editor.view.focus();
    const chain = this.editor.chain().focus();
    switch (format) {
      case 'bold':
        chain.toggleBold().run();
        break;
      case 'italic':
        chain.toggleItalic().run();
        break;
      case 'underline':
        chain.toggleUnderline().run();
        break;
      case 'bulletList':
        chain.toggleBulletList().run();
        break;
      case 'orderedList':
        chain.toggleOrderedList().run();
        break;
      case 'blockquote':
        chain.toggleBlockquote().run();
        break;
      case 'paragraph':
        chain.setParagraph().run();
        break;
      case 'hardBreak':
        chain.setHardBreak().run();
        break;
      case 'codeBlock':
        chain.toggleCodeBlock().run();
        break;
      case 'taskList':
        chain.toggleTaskList().run();
        break;
    }
  }
  heading(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement) || !this.editor) return;
    this.editor.view.focus();
    const level = Number(event.target.value);
    if (level === 0) this.editor.chain().focus().setParagraph().run();
    else if (level === 1 || level === 2 || level === 3 || level === 4 || level === 5 || level === 6)
      this.editor.chain().focus().toggleHeading({ level }).run();
  }
  direction(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const value = event.target.value;
    if (value === 'auto' || value === 'rtl' || value === 'ltr') this.setDirection(value);
  }
  private setDirection(direction: TextDirection): void {
    if (!this.editor) return;
    this.editor.view.focus();
    this.editor
      .chain()
      .focus()
      .updateAttributes(this.editor.isActive('heading') ? 'heading' : 'paragraph', {
        dir: direction,
      })
      .run();
  }
  addLink(): void {
    const href = safeLink(this.link.value.trim());
    if (!href) {
      this.error.set('Enter an HTTP or HTTPS link address.');
      return;
    }
    this.editor?.view.focus();
    this.editor?.chain().focus().extendMarkRange('link').setLink({ href }).run();
    this.error.set('');
  }
  removeLink(): void {
    this.editor?.view.focus();
    this.editor?.chain().focus().unsetLink().run();
  }
  private updateMentionTrigger(): void {
    if (!this.editor) return;
    const selection = this.editor.state.selection;
    if (!selection.empty) {
      this.mentionRange = null;
      this.mentionQuery.set(null);
      return;
    }
    const text = selection.$from.parent.textBetween(0, selection.$from.parentOffset, '', '\uFFFC');
    const match = /(?:^|\s)@([^\s@]{0,100})$/u.exec(text);
    if (!match) {
      this.mentionRange = null;
      this.mentionQuery.set(null);
      return;
    }
    const query = match[1] ?? '';
    this.mentionRange = { from: selection.from - query.length - 1, to: selection.from };
    this.mentionQuery.set(query);
  }
  beginMention(): void {
    if (!this.editor || this.busy()) return;
    const position = this.editor.state.selection.to;
    this.mentionRange = { from: position, to: position };
    this.mentionQuery.set('');
  }
  closeMention(): void {
    this.mentionRange = null;
    this.mentionQuery.set(null);
  }
  insertMention(user: UserSummary): void {
    if (!this.editor || !this.mentionRange || this.busy()) return;
    const range = this.mentionRange;
    this.closeMention();
    this.editor
      .chain()
      .focus()
      .insertContentAt(range, {
        type: 'selectedMention',
        attrs: { userId: user.id, label: user.displayName },
      })
      .insertContent(' ')
      .run();
    this.closeMention();
  }
  readonly fileQueue = viewChild(FileQueueComponent);
  insertAttachment(file: AttachmentView): void {
    if (!this.editor) return;
    this.editor
      .chain()
      .focus()
      .setTextSelection(this.editor.state.selection.to)
      .insertContent({
        type: 'protectedAttachment',
        attrs: { attachmentId: file.id, label: file.filename },
      })
      .run();
  }
  insertPicture(picture: PictureView): void {
    if (!this.editor || this.pictureCount() >= 5) return;
    // An upload finishes after focus has moved into its form. Keep any selected
    // draft text and insert after the selection instead of replacing it.
    this.editor
      .chain()
      .focus()
      .setTextSelection(this.editor.state.selection.to)
      .insertContent({
        type: 'protectedPicture',
        attrs: { pictureId: picture.id, description: picture.description },
      })
      .run();
  }
  submit(): void {
    if (!this.editor || this.busy() || !this.applySource()) return;
    if (this.fileQueue()?.busy() || this.fileQueue()?.pending()) {
      this.error.set(
        'Finish uploading the selected files before posting. Your draft remains here.',
      );
      return;
    }
    this.updateCounters();
    if (this.characters() > 5000 || this.pictureCount() > 5) {
      this.error.set('Shorten the comment to fit the displayed limits. Your draft remains here.');
      return;
    }
    if ((this.body().attachmentIds?.length ?? 0) > 20) {
      this.error.set('Use at most 20 files in one comment.');
      return;
    }
    if (this.bytes() > 65536) {
      this.error.set(
        'This formatting exceeds the comment size limit. Simplify the formatting and try again. Your draft remains here.',
      );
      return;
    }
    this.error.set('');
    this.save.emit(this.body());
  }
}
