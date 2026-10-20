package issues

import (
	"context"
	"encoding/base64"
	"encoding/csv"
	"encoding/json"
	"errors"
	"gategoldjira/backend/internal/features/activity"
	"gategoldjira/backend/internal/platform/command"
	"gategoldjira/backend/internal/platform/database/dbgen"
	"github.com/google/uuid"
	"io"
	"strconv"
	"strings"
	"unicode/utf8"
)

type ImportMapping struct {
	Title             string `json:"title,omitempty"`
	Description       string `json:"description,omitempty"`
	DescriptionFormat string `json:"descriptionFormat,omitempty"`
	Type              string `json:"type,omitempty"`
	Priority          string `json:"priority,omitempty"`
	Assignee          string `json:"assignee,omitempty"`
	DueDate           string `json:"dueDate,omitempty"`
	Labels            string `json:"labels,omitempty"`
	SourceKey         string `json:"sourceKey,omitempty"`
	Status            string `json:"status,omitempty"`
}
type ImportPreviewFields struct {
	CSV     string        `json:"csv" minLength:"1" maxLength:"1048576"`
	Mapping ImportMapping `json:"mapping"`
}
type ImportPreviewInput struct {
	ProjectID command.ProjectID `json:"projectId"`
	ImportPreviewFields
}
type ImportPreviewRow struct {
	RowNumber        int                  `json:"rowNumber"`
	Title            string               `json:"title"`
	SourceKey        string               `json:"sourceKey"`
	Errors           []command.FieldError `json:"errors" nullable:"false"`
	DuplicateIssueID *command.IssueID     `json:"duplicateIssueId,omitempty"`
}
type ImportPreview struct {
	Headers    []string           `json:"headers" nullable:"false"`
	Rows       []ImportPreviewRow `json:"rows" nullable:"false"`
	ValidCount int                `json:"validCount"`
	ErrorCount int                `json:"errorCount"`
}
type ImportFields struct {
	ImportPreviewFields
	Backlog bool   `json:"backlog"`
	BatchID string `json:"batchId" format:"uuid"`
}
type ImportInput struct {
	ProjectID command.ProjectID `json:"projectId"`
	ImportFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type ImportRowResult struct {
	RowNumber int                  `json:"rowNumber"`
	Title     string               `json:"title"`
	Status    string               `json:"status" enum:"created,existing,failed"`
	IssueID   *command.IssueID     `json:"issueId,omitempty"`
	Key       string               `json:"key,omitempty"`
	Errors    []command.FieldError `json:"errors" nullable:"false"`
}
type ImportResult struct {
	Rows          []ImportRowResult `json:"rows" nullable:"false"`
	CreatedCount  int               `json:"createdCount"`
	ExistingCount int               `json:"existingCount"`
	FailedCount   int               `json:"failedCount"`
}
type ExportFields struct {
	Filters command.IssueFilter `json:"filters"`
	Page    command.PageRequest `json:"page,omitempty"`
}
type ExportInput struct {
	ProjectID command.ProjectID `json:"projectId"`
	ExportFields
}
type IssueExport struct {
	CSV           string  `json:"csv"`
	NextCursor    *string `json:"nextCursor,omitempty"`
	TotalMatching int32   `json:"totalMatching"`
}
type mappedImportRow struct {
	Modern  *ModernCreateFields
	Preview ImportPreviewRow
	Fields  CreateIssueFields
	Labels  []string
}
type mappedImport struct {
	Preview ImportPreview
	Rows    []mappedImportRow
}

func readCSV(text string) ([]string, [][]string, error) {
	if len(text) > 1048576 || !utf8.ValidString(text) {
		return nil, nil, validation("csv", "Use a UTF-8 CSV file up to1MiB.")
	}
	reader := csv.NewReader(strings.NewReader(strings.TrimPrefix(text, "\ufeff")))
	headers, err := reader.Read()
	if err != nil {
		return nil, nil, validation("csv", "The CSV needs a valid header row.")
	}
	if len(headers) > 30 {
		return nil, nil, validation("csv", "Use at most30 mapped columns.")
	}
	seen := map[string]bool{}
	for i, h := range headers {
		headers[i] = strings.TrimSpace(h)
		key := strings.ToLower(headers[i])
		if key == "" || seen[key] {
			return nil, nil, validation("csv", "Column headings must be nonempty and unique.")
		}
		seen[key] = true
	}
	rows := [][]string{}
	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, nil, validation("csv", "A row has malformed quoting or a different column count.")
		}
		if len(rows) == 100 {
			return nil, nil, validation("csv", "Import at most100 data rows per batch.")
		}
		rows = append(rows, row)
	}
	if len(rows) == 0 {
		return nil, nil, validation("csv", "The CSV needs at least one data row.")
	}
	return headers, rows, nil
}
func importColumn(headers []string, chosen string, aliases ...string) (int, error) {
	if chosen == "-" {
		return -1, nil
	}
	names := aliases
	if chosen != "" {
		names = []string{chosen}
	}
	for _, name := range names {
		for i, h := range headers {
			if strings.EqualFold(h, name) {
				return i, nil
			}
		}
	}
	if chosen != "" {
		return -1, validation("mapping", "A selected column is missing from this CSV.")
	}
	return -1, nil
}
func (s *Service) mappedImport(ctx context.Context, actor command.Actor, in ImportPreviewInput) (mappedImport, error) {
	headers, records, err := readCSV(in.CSV)
	if err != nil {
		return mappedImport{}, err
	}
	selections := []struct {
		Name, Chosen string
		Aliases      []string
	}{
		{
			"title",
			in.Mapping.Title,
			[]string{"title", "summary"},
		},
		{
			"description",
			in.Mapping.Description,
			[]string{"description"},
		},
		{
			"descriptionFormat",
			in.Mapping.DescriptionFormat,
			[]string{"descriptionFormat"},
		},
		{
			"type",
			in.Mapping.Type,
			[]string{"type", "issue type"},
		},
		{
			"priority",
			in.Mapping.Priority,
			[]string{"priority"},
		},
		{
			"assignee",
			in.Mapping.Assignee,
			[]string{"assigneeId", "assignee", "assigned to"},
		},
		{
			"dueDate",
			in.Mapping.DueDate,
			[]string{"dueDate", "due date"},
		},
		{
			"labels",
			in.Mapping.Labels,
			[]string{"labels"},
		},
		{
			"sourceKey",
			in.Mapping.SourceKey,
			[]string{"sourceKey", "key", "issue key"},
		},
		{
			"status",
			in.Mapping.Status,
			[]string{"status", "stage"},
		},
	}
	columns := map[string]int{}
	for _, selection := range selections {
		index, err := importColumn(headers, selection.Chosen, selection.Aliases...)
		if err != nil {
			return mappedImport{}, err
		}
		columns[selection.Name] = index
	}
	if columns["title"] < 0 {
		return mappedImport{}, validation("mapping.title", "Map a Title or Summary column.")
	}
	encodingColumn, _ := importColumn(headers, "", "sourceKeyEncoding")
	typeIDColumn, _ := importColumn(headers, "", "typeId")
	priorityIDColumn, _ := importColumn(headers, "", "priorityId")
	stageIDColumn, _ := importColumn(headers, "", "stageId")
	workflowIDColumn, _ := importColumn(headers, "", "workflowId")
	decodeSource := func(record []string) (string, error) {
		column := columns["sourceKey"]
		if column < 0 {
			return "", nil
		}
		value := strings.TrimSpace(record[column])
		if encodingColumn < 0 || !strings.EqualFold(headers[column], "sourceKey") || record[encodingColumn] == "" {
			return value, nil
		}
		if record[encodingColumn] != "base64url-v1" {
			return "", validation("sourceKey", "This CSV uses an unsupported source-key encoding.")
		}
		decoded, err := base64.RawURLEncoding.DecodeString(value)
		if err != nil || !utf8.Valid(decoded) {
			return "", validation("sourceKey", "The exported source identity is malformed.")
		}
		return string(decoded), nil
	}
	return command.Read(ctx, s.runner, actor, command.Access{
		Projects:       []command.ProjectScope{{ProjectID: in.ProjectID, Write: true}},
		RepeatableRead: true,
	}, func(ctx context.Context, m *command.Mutation) (mappedImport, error) {
		project, err := m.Queries.ReadProject(ctx, in.ProjectID.UUID)
		if err != nil {
			return mappedImport{}, err
		}
		var choices importChoices
		if project.CoreMode == "modern" {
			choices, err = readImportChoices(ctx, m, in.ProjectID)
			if err != nil {
				return mappedImport{}, err
			}
		}
		people, err := m.Queries.ImportAssignees(ctx, in.ProjectID.UUID)
		if err != nil {
			return mappedImport{}, err
		}
		if len(people) > 1000 {
			return mappedImport{}, validation("assignee", "This import exceeds the bounded assignee lookup. Use a smaller company import procedure.")
		}
		stages, err := m.Queries.ImportStages(ctx, in.ProjectID.UUID)
		if err != nil {
			return mappedImport{}, err
		}
		sourceKeys := []string{}
		if columns["sourceKey"] >= 0 {
			for _, record := range records {
				if key, err := decodeSource(record); err == nil && key != "" {
					sourceKeys = append(sourceKeys, key)
				}
			}
		}
		existingSources, err := m.Queries.ImportExistingSources(ctx, dbgen.ImportExistingSourcesParams{
			ProjectID: in.ProjectID.UUID,
			Column2:   sourceKeys,
		})
		if err != nil {
			return mappedImport{}, err
		}
		existingIDs := map[string]command.IssueID{}
		for _, source := range existingSources {
			existingIDs[source.SourceKey] = command.IssueID{UUID: source.IssueID}
		}
		result := mappedImport{
			Preview: ImportPreview{
				Headers: headers,
				Rows:    []ImportPreviewRow{},
			},
			Rows: []mappedImportRow{},
		}
		seenSourceRows := map[string]int{}
		for index, record := range records {
			cell := func(name string) string {
				column := columns[name]
				if column < 0 {
					return ""
				}
				return strings.TrimSpace(record[column])
			}
			row := mappedImportRow{
				Preview: ImportPreviewRow{
					RowNumber: index + 2,
					Title:     cell("title"),
					SourceKey: cell("sourceKey"),
					Errors:    []command.FieldError{},
				},
				Fields: CreateIssueFields{
					Title:             cell("title"),
					Description:       cell("description"),
					Type:              command.Task,
					Priority:          command.Medium,
					DescriptionFormat: command.PlainDescription,
				},
				Labels: []string{},
			}
			source, sourceErr := decodeSource(record)
			row.Preview.SourceKey = source
			if sourceErr != nil {
				row.Preview.Errors = append(row.Preview.Errors, command.FieldError{
					Field:   "sourceKey",
					Message: "Review this exported source identity and its encoding.",
				})
			}
			issueError := func(field, message string) {
				row.Preview.Errors = append(row.Preview.Errors, command.FieldError{Field: field, Message: message})
			}
			if v := strings.ToLower(cell("type")); v != "" && project.CoreMode != "modern" {
				row.Fields.Type = command.IssueType(v)
			}
			if v := strings.ToLower(cell("priority")); v != "" && project.CoreMode != "modern" {
				row.Fields.Priority = command.Priority(v)
			}
			if v := cell("descriptionFormat"); v != "" {
				row.Fields.DescriptionFormat = command.DescriptionFormat(v)
			}
			if v := cell("dueDate"); v != "" {
				date, err := command.ParseDate(v)
				if err != nil {
					issueError("dueDate", "Use YYYY-MM-DD.")
				} else {
					row.Fields.DueDate = &date
				}
			}
			if v := cell("assignee"); v != "" {
				matches := []command.UserID{}
				for _, person := range people {
					if strings.EqualFold(v, person.ID.String()) || strings.EqualFold(v, person.DisplayName) || strings.EqualFold(v, person.Email) {
						matches = append(matches, command.UserID{UUID: person.ID})
					}
				}
				if len(matches) != 1 {
					issueError("assignee", "Use a unique eligible display name, email or user ID.")
				} else {
					row.Fields.AssigneeID = &matches[0]
				}
			}
			if v := cell("status"); v != "" && project.CoreMode != "modern" {
				matches := []command.Status{}
				for _, stage := range stages {
					if strings.EqualFold(v, stage.Status) || strings.EqualFold(v, stage.StageName) {
						matches = append(matches, command.Status(stage.Status))
					}
				}
				if len(matches) != 1 {
					issueError("status", "Use one current stage name or identifier.")
				} else {
					row.Fields.InitialStatus = matches[0]
				}
			}
			labelSeen := map[string]bool{}
			for _, name := range strings.Split(cell("labels"), ";") {
				name = strings.TrimSpace(name)
				if name == "" {
					continue
				}
				if command.ValidateText(name, 1, 40) != nil {
					issueError("labels", "Label names must contain1–40 characters.")
					continue
				}
				key := strings.ToLower(name)
				if !labelSeen[key] {
					row.Labels = append(row.Labels, name)
					labelSeen[key] = true
				}
			}
			if len(row.Labels) > 10 {
				issueError("labels", "Use at most10 labels per issue.")
			}
			if command.ValidateText(row.Preview.SourceKey, 0, 200) != nil {
				issueError("sourceKey", "Use a source key up to200 characters.")
			}
			if row.Preview.SourceKey != "" {
				if previous, exists := seenSourceRows[row.Preview.SourceKey]; exists {
					issueError("sourceKey", "This source key already appears in row "+strconv.Itoa(previous)+". Use a unique identity for each row.")
				} else {
					seenSourceRows[row.Preview.SourceKey] = row.Preview.RowNumber
				}
			}
			if value, ok := existingIDs[row.Preview.SourceKey]; ok {
				row.Preview.DuplicateIssueID = &value
			}
			normalized, normalizeErr := normalizeEditable(IssueEditable{
				Title:             row.Fields.Title,
				Description:       row.Fields.Description,
				DescriptionFormat: row.Fields.DescriptionFormat,
				Type:              row.Fields.Type,
				Priority:          row.Fields.Priority,
				AssigneeID:        row.Fields.AssigneeID,
				DueDate:           row.Fields.DueDate,
				LabelIDs:          []command.LabelID{},
			})
			if normalizeErr == nil && row.Preview.DuplicateIssueID == nil {
				normalizeErr = validateNewDescription(normalized)
			}
			if err := normalizeErr; err != nil {
				var failure *command.Failure
				if errors.As(err, &failure) {
					row.Preview.Errors = append(row.Preview.Errors, failure.FieldErrors...)
				} else {
					issueError("row", "Review this row's fields.")
				}
			}
			if row.Fields.Type == command.Subtask {
				issueError("type", "Import parent tasks first; add subtasks through their parent.")
			}
			if row.Preview.SourceKey != "" {
				if value, exists := existingIDs[row.Preview.SourceKey]; exists {
					row.Preview.DuplicateIssueID = &value
				}
			}
			if project.CoreMode == "modern" {
				choose := func(index int, fallback string) string {
					if index >= 0 && strings.TrimSpace(record[index]) != "" {
						return strings.TrimSpace(record[index])
					}
					return fallback
				}
				flow := ""
				if workflowIDColumn >= 0 {
					flow = strings.TrimSpace(record[workflowIDColumn])
				}
				native, choiceErr := choices.fields(ctx, m, in.ProjectID, row, choose(typeIDColumn, cell("type")), choose(priorityIDColumn, cell("priority")), choose(stageIDColumn, cell("status")), flow, row.Preview.DuplicateIssueID != nil)
				if choiceErr != nil {
					row.Preview.Errors = append(row.Preview.Errors, importFieldErrors(choiceErr)...)
				} else {
					row.Modern = &native
				}
			}
			if len(row.Preview.Errors) == 0 {
				result.Preview.ValidCount++
			} else {
				result.Preview.ErrorCount++
			}
			result.Preview.Rows = append(result.Preview.Rows, row.Preview)
			result.Rows = append(result.Rows, row)
		}
		return result, nil
	})
}
func (s *Service) PreviewImport(ctx context.Context, actor command.Actor, in ImportPreviewInput) (ImportPreview, error) {
	value, err := s.mappedImport(ctx, actor, in)
	return value.Preview, err
}
func (s *Service) Import(ctx context.Context, actor command.Actor, in ImportInput) (command.SaveOutcome[ImportResult], error) {
	batch, err := uuid.Parse(in.BatchID)
	if err != nil || batch == uuid.Nil {
		return command.SaveOutcome[ImportResult]{}, validation("batchId", "Retain a valid batch identity when retrying this import.")
	}
	request := command.MutationRequest{
		Actor:          actor,
		Operation:      command.ImportIssues,
		RetryReference: in.RetryReference,
		Access:         command.Access{Projects: []command.ProjectScope{{ProjectID: in.ProjectID, Write: true}}},
	}
	replay, err := command.ReserveSave(ctx, s.runner, request, in, validateImportResult)
	if err != nil {
		return command.SaveOutcome[ImportResult]{}, err
	}
	if replay != nil {
		return *replay, nil
	}
	mapped, err := s.mappedImport(ctx, actor, ImportPreviewInput{in.ProjectID, in.ImportPreviewFields})
	if err != nil {
		return command.SaveOutcome[ImportResult]{}, err
	}
	result := ImportResult{Rows: []ImportRowResult{}}
	for _, row := range mapped.Rows {
		outcome := ImportRowResult{
			RowNumber: row.Preview.RowNumber,
			Title:     row.Preview.Title,
			Status:    "failed",
			Errors:    append([]command.FieldError{}, row.Preview.Errors...),
		}
		if len(outcome.Errors) == 0 {
			fields := row.Fields
			fields.Backlog = in.Backlog
			fields.ImportSourceKey = row.Preview.SourceKey
			if fields.ImportSourceKey == "" {
				fields.ImportSourceKey = "batch:" + batch.String() + ":" + strconvRow(row.Preview.RowNumber)
			}
			labelsFailed := false
			for _, name := range row.Labels {
				ref := uuid.NewSHA1(batch, []byte("label:"+name)).String()
				saved, err := s.CreateLabel(ctx, actor, CreateLabelInput{ProjectID: in.ProjectID, Name: name, RetryReference: ref})
				if err != nil {
					if shouldResumeImport(err) {
						return command.SaveOutcome[ImportResult]{}, err
					}
					outcome.Errors = append(outcome.Errors, command.FieldError{
						Field:   "labels",
						Message: "A label could not be created. Review access and retry this batch.",
					})
					labelsFailed = true
					break
				}
				fields.LabelIDs = append(fields.LabelIDs, saved.Body.Result.ID)
			}
			if !labelsFailed {
				saved, err := s.saveImportedIssue(ctx, actor, in.ProjectID, row, fields, uuid.NewSHA1(batch, []byte("row:"+strconvRow(row.Preview.RowNumber))).String())
				if err != nil {
					if shouldResumeImport(err) {
						return command.SaveOutcome[ImportResult]{}, err
					}
					var failure *command.Failure
					if errors.As(err, &failure) {
						outcome.Errors = append(outcome.Errors, failure.FieldErrors...)
						if len(outcome.Errors) == 0 {
							outcome.Errors = append(outcome.Errors, command.FieldError{Field: "row", Message: failure.Message})
						}
					} else {
						return command.SaveOutcome[ImportResult]{}, err
					}
				} else {
					id := saved.id
					outcome.IssueID = &id
					outcome.Key = saved.key
					outcome.Status = "created"
					if saved.status == 200 || row.Preview.DuplicateIssueID != nil {
						outcome.Status = "existing"
					}
				}
			}
		}
		switch outcome.Status {
		case "created":
			result.CreatedCount++
		case "existing":
			result.ExistingCount++
		default:
			result.FailedCount++
		}
		result.Rows = append(result.Rows, outcome)
	}
	return command.Save(ctx, s.runner, request, in, noExtraAuthorization, func(ctx context.Context, m *command.Mutation, _ ImportInput) (command.Change[ImportResult], error) {
		count := strconvRow(result.CreatedCount)
		event, err := activity.Append(ctx, m, activity.Draft{
			Action:       command.ImportIssues,
			ResourceKind: activity.ProjectResource,
			ResourceID:   in.ProjectID.UUID,
			ProjectID:    &in.ProjectID,
			Changes:      []activity.FieldChange{{Field: "importedCount", After: &count}},
		})
		if err != nil {
			return command.Change[ImportResult]{}, err
		}
		id := event.ID.String()
		return command.Change[ImportResult]{Result: result, EventID: &id, HTTPStatus: 200}, nil
	}, validateImportResult)
}
func validateImportResult(v ImportResult) error {
	if v.Rows == nil || len(v.Rows) < 1 || len(v.Rows) > 100 || v.CreatedCount < 0 || v.ExistingCount < 0 || v.FailedCount < 0 || v.CreatedCount+v.ExistingCount+v.FailedCount != len(v.Rows) {
		return errors.New("invalid import outcomes")
	}
	created, existing, failed := 0, 0, 0
	seen := map[int]bool{}
	for _, row := range v.Rows {
		if row.RowNumber < 2 || row.RowNumber > 101 || seen[row.RowNumber] || row.Errors == nil {
			return errors.New("invalid import row")
		}
		seen[row.RowNumber] = true
		switch row.Status {
		case "created", "existing":
			if row.IssueID == nil || row.IssueID.UUID == uuid.Nil || row.Key == "" || len(row.Errors) != 0 {
				return errors.New("invalid imported identity")
			}
			if row.Status == "created" {
				created++
			} else {
				existing++
			}
		case "failed":
			if len(row.Errors) == 0 || row.IssueID != nil {
				return errors.New("invalid import failure")
			}
			failed++
		default:
			return errors.New("unknown import row status")
		}
	}
	if created != v.CreatedCount || existing != v.ExistingCount || failed != v.FailedCount {
		return errors.New("import outcome totals differ")
	}
	return nil
}
func shouldResumeImport(err error) bool {
	var failure *command.Failure
	if !errors.As(err, &failure) {
		return true
	}
	return failure.Retryable || failure.Code == command.RetryReferenceReused || failure.Code == command.Forbidden || failure.Code == command.AccountInactive || failure.Code == command.Unauthenticated
}
func strconvRow(value int) string { return strconv.Itoa(value) }
func formulaSafe(value string) string {
	trimmed := strings.TrimLeft(value, " \t\r\n")
	if trimmed != "" && strings.ContainsRune("=+-@", rune(trimmed[0])) {
		return "'" + value
	}
	return value
}
func (s *Service) Export(ctx context.Context, actor command.Actor, in ExportInput) (IssueExport, error) {
	filters := in.Filters
	for _, id := range filters.ProjectIDs {
		if id != in.ProjectID {
			return IssueExport{}, validation("filters.projectIds", "Export one current project at a time.")
		}
	}
	filters.ProjectIDs = []command.ProjectID{in.ProjectID}
	page, err := s.SearchModern(ctx, actor, ModernSearchInput{Filters: filters, Page: in.Page})
	if err != nil {
		return IssueExport{}, err
	}
	ids := []uuid.UUID{}
	for _, item := range page.Items {
		ids = append(ids, item.ID.UUID)
	}
	return command.Read(ctx, s.runner, actor, command.Access{
		Projects:       []command.ProjectScope{{ProjectID: in.ProjectID}},
		RepeatableRead: true,
	}, func(ctx context.Context, m *command.Mutation) (IssueExport, error) {
		sources, err := m.Queries.ExportSourceKeys(ctx, dbgen.ExportSourceKeysParams{ProjectID: in.ProjectID.UUID, Column2: ids})
		if err != nil {
			return IssueExport{}, err
		}
		keys := map[uuid.UUID]string{}
		for _, source := range sources {
			keys[source.IssueID] = source.SourceKey
		}
		metadata, err := canonicalMetadata(ctx, m, ids)
		if err != nil {
			return IssueExport{}, err
		}
		var output strings.Builder
		writer := csv.NewWriter(&output)
		if err := writer.Write([]string{
			"key",
			"title",
			"description",
			"descriptionFormat",
			"type",
			"priority",
			"status",
			"assigneeId",
			"dueDate",
			"labels",
			"sourceKey",
			"sourceKeyEncoding",
			"typeId",
			"priorityId",
			"workflowId",
			"stageId",
		}); err != nil {
			return IssueExport{}, err
		}
		// Batch-fetch description bodies with the same current project permission snapshot.
		rows, err := m.Queries.ExportIssueBodies(ctx, dbgen.ExportIssueBodiesParams{ProjectID: in.ProjectID.UUID, Column2: ids})
		if err != nil {
			return IssueExport{}, err
		}
		bodies := map[uuid.UUID]dbgen.ExportIssueBodiesRow{}
		for _, row := range rows {
			bodies[row.ID] = row
		}
		for _, item := range page.Items {
			body, ok := bodies[item.ID.UUID]
			if !ok {
				return IssueExport{}, unavailableIssue()
			}
			assignee, due := "", ""
			if item.Assignee.Value != nil {
				assignee = item.Assignee.Value.ID.String()
			}
			if item.DueDate != nil {
				due = item.DueDate.String()
			}
			labels := []string{}
			for _, label := range item.Labels {
				labels = append(labels, label.Name)
			}
			source := keys[item.ID.UUID]
			if source == "" {
				source = item.Key
			}
			values := []string{
				item.Key,
				item.Title,
				body.Description,
				body.DescriptionFormat,
				item.Type.Key,
				item.Priority.Key,
				metadata[item.ID.UUID].LegacyStatus,
				assignee,
				due,
				strings.Join(labels, ";"),
				base64.RawURLEncoding.EncodeToString([]byte(source)),
				"base64url-v1",
				item.Type.ID.String(),
				item.Priority.ID.String(),
				item.Workflow.ID.String(),
				item.Stage.ID.String(),
			}
			for i := range values {
				values[i] = formulaSafe(values[i])
			}
			if err := writer.Write(values); err != nil {
				return IssueExport{}, err
			}
		}
		writer.Flush()
		if err := writer.Error(); err != nil {
			return IssueExport{}, err
		}
		if output.Len() > command.MaximumPageBytes {
			return IssueExport{}, validation("page.limit", "This CSV exceeds1MiB. Export a smaller page.")
		}
		result := IssueExport{CSV: output.String(), NextCursor: page.NextCursor, TotalMatching: page.TotalMatching}
		// CSV quoting and JSON escaping have separate costs. Check the actual
		// response before Huma starts writing so clients can retry a smaller page.
		encoded, err := json.Marshal(result)
		if err != nil {
			return IssueExport{}, err
		}
		if len(encoded)+1 > command.MaximumPageBytes {
			return IssueExport{}, validation("page.limit", "This CSV exceeds1MiB. Export a smaller page.")
		}
		return result, nil
	})
}
