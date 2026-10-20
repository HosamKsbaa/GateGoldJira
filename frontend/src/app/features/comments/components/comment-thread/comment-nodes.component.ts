import { AttachmentReferenceComponent } from '../../../attachments/components/attachment-reference/attachment-reference.component';
import { ChangeDetectionStrategy, Component, input, computed } from '@angular/core';
import { PictureImageComponent } from '../../../pictures/components/picture-image/picture-image.component';
import { parseCommentNodes, type CommentNode } from '../../comment-renderer';
@Component({
  selector: 'gg-comment-nodes',
  imports: [AttachmentReferenceComponent, PictureImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (node of nodes(); track $index) {
      @switch (node.kind) {
        @case ('text') {
          <span class="preserve-space">{{ node.text }}</span>
        }
        @case ('attachment') {
          <gg-attachment-reference [attachmentId]="node.attachmentId">{{
            node.label
          }}</gg-attachment-reference>
        }
        @case ('mention') {
          <bdi class="mention-chip" [attr.data-user-id]="node.userId">{{ node.label }}</bdi>
        }
        @case ('picture') {
          <gg-picture-image [pictureId]="node.pictureId" [description]="node.description" />
        }
        @case ('table') {
          <div class="rich-table-scroll"
            ><table
              ><tbody>
                @for (row of node.rows; track $index) {
                  <tr>
                    @for (cell of row; track $index) {
                      @if (cell.header) {
                        <th
                          [attr.colspan]="cell.colspan"
                          [attr.rowspan]="cell.rowspan"
                          [attr.dir]="cell.direction"
                          ><gg-comment-nodes
                            [nodes]="cell.children"
                            [attachmentIds]="attachmentIds()"
                        /></th>
                      } @else {
                        <td
                          [attr.colspan]="cell.colspan"
                          [attr.rowspan]="cell.rowspan"
                          [attr.dir]="cell.direction"
                          ><gg-comment-nodes
                            [nodes]="cell.children"
                            [attachmentIds]="attachmentIds()"
                        /></td>
                      }
                    }
                  </tr>
                }</tbody></table
          ></div>
        }
        @case ('checklist') {
          <ul class="rich-checklist">
            @for (item of node.items; track $index) {
              <li [attr.dir]="item.direction" [class.checked]="item.checked"
                ><span
                  class="checklist-mark"
                  role="img"
                  [attr.aria-label]="
                    item.checked ? 'Completed checklist item' : 'Incomplete checklist item'
                  "
                  >{{ item.checked ? '☑' : '☐' }}</span
                ><div
                  ><gg-comment-nodes
                    [nodes]="item.children"
                    [attachmentIds]="attachmentIds()" /></div
              ></li>
            }
          </ul>
        }
        @case ('link') {
          @if (attachmentID(node.href); as id) {
            <gg-attachment-reference [attachmentId]="id"
              ><gg-comment-nodes [nodes]="node.children" [attachmentIds]="attachmentIds()"
            /></gg-attachment-reference>
          } @else {
            <a [href]="node.href" target="_blank" rel="noopener noreferrer"
              ><gg-comment-nodes [nodes]="node.children" [attachmentIds]="attachmentIds()"
            /></a>
          }
        }
        @case ('format') {
          @switch (node.tag) {
            @case ('p') {
              <p [attr.dir]="node.direction"
                ><gg-comment-nodes [nodes]="node.children" [attachmentIds]="attachmentIds()"
              /></p>
            }
            @case ('h1') {
              <h1 [attr.dir]="node.direction"
                ><gg-comment-nodes [nodes]="node.children" [attachmentIds]="attachmentIds()"
              /></h1>
            }
            @case ('h2') {
              <h2 [attr.dir]="node.direction"
                ><gg-comment-nodes [nodes]="node.children" [attachmentIds]="attachmentIds()"
              /></h2>
            }
            @case ('h3') {
              <h3 [attr.dir]="node.direction"
                ><gg-comment-nodes [nodes]="node.children" [attachmentIds]="attachmentIds()"
              /></h3>
            }
            @case ('h4') {
              <h4 [attr.dir]="node.direction"
                ><gg-comment-nodes [nodes]="node.children" [attachmentIds]="attachmentIds()"
              /></h4>
            }
            @case ('h5') {
              <h5 [attr.dir]="node.direction"
                ><gg-comment-nodes [nodes]="node.children" [attachmentIds]="attachmentIds()"
              /></h5>
            }
            @case ('h6') {
              <h6 [attr.dir]="node.direction"
                ><gg-comment-nodes [nodes]="node.children" [attachmentIds]="attachmentIds()"
              /></h6>
            }
            @case ('strong') {
              <strong
                ><gg-comment-nodes [nodes]="node.children" [attachmentIds]="attachmentIds()"
              /></strong>
            }
            @case ('em') {
              <em
                ><gg-comment-nodes [nodes]="node.children" [attachmentIds]="attachmentIds()"
              /></em>
            }
            @case ('u') {
              <u><gg-comment-nodes [nodes]="node.children" [attachmentIds]="attachmentIds()" /></u>
            }
            @case ('ul') {
              <ul
                ><gg-comment-nodes [nodes]="node.children" [attachmentIds]="attachmentIds()"
              /></ul>
            }
            @case ('ol') {
              <ol
                ><gg-comment-nodes [nodes]="node.children" [attachmentIds]="attachmentIds()"
              /></ol>
            }
            @case ('li') {
              <li [attr.dir]="node.direction"
                ><gg-comment-nodes [nodes]="node.children" [attachmentIds]="attachmentIds()"
              /></li>
            }
            @case ('blockquote') {
              <blockquote [attr.dir]="node.direction"
                ><gg-comment-nodes [nodes]="node.children" [attachmentIds]="attachmentIds()"
              /></blockquote>
            }
            @case ('br') {
              <br />
            }
            @case ('pre') {
              <pre
                [attr.dir]="node.direction"
              ><gg-comment-nodes [nodes]="node.children" [attachmentIds]="attachmentIds()" /></pre>
            }
            @case ('code') {
              <code
                ><gg-comment-nodes [nodes]="node.children" [attachmentIds]="attachmentIds()"
              /></code>
            }
          }
        }
      }
    }
  `,
})
export class CommentNodesComponent {
  attachmentID(href: string): string | null {
    try {
      const url = new URL(href, location.origin);
      const id = url.searchParams.get('attachment');
      return (url.origin === location.origin || this.attachmentIds().includes(id ?? '')) &&
        /^\/issues\/[0-9a-f-]{36}$/.test(url.pathname) &&
        id &&
        /^[0-9a-f-]{36}$/.test(id)
        ? id
        : null;
    } catch {
      return null;
    }
  }
  readonly attachmentIds = input<readonly string[]>([]);
  readonly nodes = input.required<CommentNode[]>();
}
@Component({
  selector: 'gg-comment-content',
  imports: [CommentNodesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="comment-content" dir="auto"
    ><gg-comment-nodes [nodes]="nodes()" [attachmentIds]="attachmentIds()"
  /></div>`,
})
export class CommentContentComponent {
  readonly attachmentIds = input<readonly string[]>([]);
  readonly html = input.required<string>();
  readonly nodes = computed(() => parseCommentNodes(this.html()));
}
