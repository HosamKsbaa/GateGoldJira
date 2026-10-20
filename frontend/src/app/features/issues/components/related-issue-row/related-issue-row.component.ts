import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  type IssueCard,
  issueTypeKey,
  issueTypeName,
  issueStageName,
  issueStageCategory,
} from '../../issue-model';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { statusCategory, statusName } from '../../../boards/board-workflow';

@Component({
  selector: 'gg-related-issue-row',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './related-issue-row.component.html',
  styleUrl: './related-issue-row.component.css',
})
export class RelatedIssueRowComponent {
  readonly issue = input.required<IssueCard>();
  readonly showDetails = input(false);
  readonly typeKey = issueTypeKey;
  readonly typeName = issueTypeName;
  readonly stageName = issueStageName;
  readonly category = issueStageCategory;
}
