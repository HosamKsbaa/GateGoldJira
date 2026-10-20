import type {
  IssueView,
  ModernIssueView,
  IssueSummary,
  ModernIssueSummary,
  ModernEditable,
} from '../../api/generated/types.gen';
import { statusName, statusCategory } from '../boards/board-workflow';

export type IssueRecord = IssueView | ModernIssueView;
export type IssueCard = IssueSummary | ModernIssueSummary;
export function isModernIssue(issue: IssueRecord): issue is ModernIssueView {
  return 'stage' in issue.summary;
}
export function issueTypeName(issue: IssueCard): string {
  return typeof issue.type === 'string' ? issue.type : issue.type.name;
}
export function issueTypeKey(issue: IssueCard): string {
  return typeof issue.type === 'string'
    ? issue.type
    : issue.type.behavior === 'subtask'
      ? 'subtask'
      : issue.type.key;
}
export function issueStageName(issue: IssueCard): string {
  return 'stage' in issue ? issue.stage.name : (issue.statusName ?? statusName(issue.status));
}
export function issueStageCategory(issue: IssueCard): string {
  return 'stage' in issue ? issue.stage.category : statusCategory(issue.status);
}
export function modernEditable(issue: ModernIssueView): ModernEditable {
  return {
    title: issue.summary.title,
    description: issue.description,
    descriptionFormat: issue.descriptionFormat,
    typeId: issue.summary.type.id,
    priorityId: issue.summary.priority.id,
    assigneeId: issue.summary.assignee?.id ?? null,
    dueDate: issue.summary.dueDate,
    labelIds: issue.summary.labels.map(label => label.id),
  };
}
