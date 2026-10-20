import { protectedAttachmentExtension } from '../../../attachments/editor-attachment';
import { IconComponent, type IconName } from '../../../../shared/ui/icon.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FileQueueComponent } from '../../../attachments/components/file-queue/file-queue.component';
import type { AttachmentView } from '../../../../api/generated/types.gen';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
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
import type { PictureView } from '../../../../api/generated/types.gen';
import { PicturesApi } from '../../../pictures/pictures.api';
import { protectedPictureExtension } from '../../../pictures/editor-picture';
import {
  commentNodesHTML,
  mapCommentChildren,
  parseCommentNodes,
  plainTextHTML,
  safeLink,
  type CommentNode,
} from '../../../comments/comment-renderer';
import {
  editTable,
  loadRichTextBlocks,
  tableActions,
  type TableAction,
} from '../../../comments/rich-text-blocks';

type Format =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'bulletList'
  | 'orderedList'
  | 'blockquote'
  | 'codeBlock'
  | 'taskList';
function descriptionNodes(nodes: CommentNode[]): CommentNode[] {
  return nodes.flatMap<CommentNode>(node => {
    if (node.kind === 'picture') return [node];
    if (node.kind === 'mention') return [{ kind: 'text' as const, text: node.label }];
    return [mapCommentChildren(node, descriptionNodes)];
  });
}

@Component({
  selector: 'gg-description-editor',
  imports: [IconComponent, FileQueueComponent, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['../../../../shared/ui/rich-text-editor.css', './description-editor.component.css'],
  templateUrl: './description-editor.component.html',
})
export class DescriptionEditorComponent {
  readonly issueId = input('');
  readonly queuedFiles = output<File[]>();
  readonly issueRevision = input('1');
  readonly uploadedRevision = output<string>();
  private readonly pictures = inject(PicturesApi);
  readonly fileQueue = viewChild(FileQueueComponent);
  private readonly newFileInput = viewChild<ElementRef<HTMLInputElement>>('newFileInput');
  readonly attachmentsOpen = signal(false);
  readonly showLinks = signal(false);
  readonly controlId = 'description-editor-' + crypto.randomUUID();
  attachFiles(): void {
    if (this.disabled() || this.sourceMode()) return;
    if (this.issueId()) {
      this.attachmentsOpen.set(true);
      this.fileQueue()?.chooseFiles();
    } else this.newFileInput()?.nativeElement.click();
  }
  selectFiles(event: Event): void {
    if (!(event.target instanceof HTMLInputElement) || this.disabled()) return;
    this.queuedFiles.emit(Array.from(event.target.files ?? []));
    event.target.value = '';
  }
  private scope = new AbortController();
  private ownRevision = '1';
  readonly initial = input('');
  readonly initialFormat = input<'plain' | 'html'>('plain');
  readonly disabled = input(false);
  readonly changed = output<string>();
  readonly ready = signal(false);
  readonly sourceMode = signal(false);
  readonly characters = signal(0);
  readonly error = signal('');
  readonly active = signal<Format[]>([]);
  readonly tableActions = tableActions;
  readonly tableActive = signal(false);
  readonly source = new FormControl('', { nonNullable: true });
  readonly link = new FormControl('', { nonNullable: true });
  readonly actions: { format: Format; label: string; text?: string; icon?: IconName }[] = [
    { format: 'bold', label: 'Bold', text: 'B' },
    { format: 'italic', label: 'Italic', text: 'I' },
    { format: 'underline', label: 'Underline', text: 'U' },
    { format: 'bulletList', label: 'Bullet list', icon: 'list' },
    { format: 'orderedList', label: 'Numbered list', icon: 'list-ordered' },
    { format: 'blockquote', label: 'Quote', icon: 'quote' },
    { format: 'codeBlock', label: 'Code block', icon: 'code' },
    { format: 'taskList', label: 'Checklist', icon: 'check-square' },
  ];
  private readonly host = viewChild<ElementRef<HTMLElement>>('editorHost');
  private editor: Editor | null = null;
  private generation = 0;
  constructor() {
    this.source.valueChanges.pipe(takeUntilDestroyed()).subscribe(html => {
      if (this.sourceMode()) this.changed.emit(html);
    });
    effect(() => {
      const host = this.host(),
        initial = this.initial(),
        format = this.initialFormat();
      untracked(() => {
        if (host) void this.initialize(host.nativeElement, initial, format);
      });
    });
    effect(() => {
      const disabled = this.disabled();
      untracked(() => this.editor?.setEditable(!disabled, false));
    });
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.scope.abort();
      this.editor?.destroy();
    });
  }
  private async initialize(
    host: HTMLElement,
    initial: string,
    format: 'plain' | 'html',
  ): Promise<void> {
    const generation = ++this.generation;
    this.scope.abort();
    this.scope = new AbortController();
    this.ownRevision = this.issueRevision();
    this.editor?.destroy();
    this.editor = null;
    this.ready.set(false);
    this.sourceMode.set(false);
    this.showLinks.set(false);
    this.attachmentsOpen.set(false);
    this.error.set('');
    try {
      const [{ Editor: TiptapEditor, Extension, Node }, { default: StarterKit }, richBlocks] =
        await Promise.all([
          import('@tiptap/core'),
          import('@tiptap/starter-kit'),
          loadRichTextBlocks(),
        ]);
      if (generation !== this.generation) return;
      const Direction = Extension.create({
        name: 'descriptionDirection',
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
        element: host,
        extensions: [
          StarterKit.configure({
            code: false,
            horizontalRule: false,
            strike: false,
            link: { openOnClick: false, autolink: false, protocols: ['http', 'https'] },
          }),
          ...richBlocks,
          Direction,
          protectedAttachmentExtension(Node, this.issueId()),
          protectedPictureExtension(Node, this.pictures, this.scope.signal),
        ],
        content:
          format === 'html'
            ? commentNodesHTML(descriptionNodes(parseCommentNodes(initial)))
            : plainTextHTML(initial),
        editable: !this.disabled(),
        editorProps: {
          attributes: {
            id: 'issue-description',
            role: 'textbox',
            'aria-label': 'Description',
            'aria-multiline': 'true',
            'data-placeholder': 'Add a description…',
            dir: 'auto',
          },
          handlePaste: (_view, event) => this.pastePicture(event.clipboardData?.files),
          handleDrop: (_view, event) => this.pastePicture(event.dataTransfer?.files),
        },
        onUpdate: () => {
          this.update();
          this.changed.emit(this.editor?.getHTML() ?? '');
        },
        onSelectionUpdate: () => this.update(),
      });
      this.ready.set(true);
      this.update();
    } catch {
      if (generation === this.generation)
        this.error.set('The description editor could not load. Reload to retry.');
    }
  }
  private pastePicture(files: FileList | undefined): boolean {
    const file = files?.[0];
    if (!file) return false;
    if (this.disabled() || this.sourceMode()) return true;
    if (!this.issueId()) {
      this.queuedFiles.emit(Array.from(files ?? []));
      return true;
    }
    this.attachmentsOpen.set(true);
    void this.fileQueue()?.pasteAndUpload(file);
    return true;
  }
  saved(): void {
    this.fileQueue()?.clearCompleted();
    this.attachmentsOpen.set(false);
  }
  advanceRevision(revision: string): void {
    if (BigInt(revision) === BigInt(this.ownRevision) + 1n) {
      this.ownRevision = revision;
      this.uploadedRevision.emit(revision);
    }
  }
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
    if (!this.editor) return;
    if (picture.issueRevision && BigInt(picture.issueRevision) === BigInt(this.ownRevision) + 1n) {
      this.ownRevision = picture.issueRevision;
      this.uploadedRevision.emit(picture.issueRevision);
    }
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
  uploadPending(): boolean {
    return !!this.fileQueue()?.busy() || !!this.fileQueue()?.pending();
  }
  private update(): void {
    this.editor?.view.dom.setAttribute('data-empty', String(this.editor.isEmpty));
    this.characters.set(Array.from(this.editor?.getText() ?? '').length);
    this.active.set(
      this.actions
        .filter(action => this.editor?.isActive(action.format))
        .map(action => action.format),
    );
    this.tableActive.set(this.editor?.isActive('table') ?? false);
  }
  table(action: TableAction): void {
    if (this.editor && !this.disabled() && !this.sourceMode()) editTable(this.editor, action);
  }
  showSource(): void {
    if (!this.editor || this.disabled() || this.sourceMode() || this.uploadPending()) return;
    this.source.setValue(this.editor.getHTML());
    this.sourceMode.set(true);
  }
  showVisual(): void {
    if (!this.commit()) return;
    this.sourceMode.set(false);
    this.editor?.commands.focus('end');
  }
  commit(): boolean {
    if (!this.editor || this.disabled()) return false;
    if (this.uploadPending()) {
      this.error.set(
        'Finish uploading the selected files before saving. Your description remains here.',
      );
      return false;
    }
    if (this.sourceMode()) {
      if (Array.from(this.source.value).length > 10000) {
        this.error.set(
          'Shorten the description HTML to 10,000 characters. Your source remains here.',
        );
        return false;
      }
      this.editor.commands.setContent(
        commentNodesHTML(descriptionNodes(parseCommentNodes(this.source.value))),
      );
      this.changed.emit(this.editor.getHTML());
      this.update();
    }
    if (Array.from(this.editor.getHTML()).length > 10000) {
      this.error.set(
        'Shorten the description or simplify its formatting to fit 10,000 characters.',
      );
      return false;
    }
    this.error.set('');
    return true;
  }
  format(value: Format): void {
    if (!this.editor || this.disabled() || this.sourceMode()) return;
    // Keep immediate typing in the editor when a toolbar control takes focus.
    this.editor.view.focus();
    const chain = this.editor.chain().focus();
    switch (value) {
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
    const level = event.target.value;
    if (level === '2' || level === '3')
      this.editor
        .chain()
        .focus()
        .toggleHeading({ level: level === '2' ? 2 : 3 })
        .run();
    else this.editor.chain().focus().setParagraph().run();
  }
  direction(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement) || !this.editor) return;
    const value = event.target.value;
    if (value === 'auto' || value === 'rtl' || value === 'ltr') {
      this.editor.view.focus();
      this.editor
        .chain()
        .focus()
        .updateAttributes(this.editor.isActive('heading') ? 'heading' : 'paragraph', { dir: value })
        .run();
    }
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
}
