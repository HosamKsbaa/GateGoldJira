package configuration

import (
	"gategoldjira/backend/internal/platform/command"
	"github.com/danielgtaylor/huma/v2"
)

type FieldView = command.FieldDefinition
type FieldOptionView struct {
	ID        command.FieldOptionID `json:"id"`
	ProjectID command.ProjectID     `json:"projectId"`
	FieldID   command.FieldID       `json:"fieldId"`
	Name      string                `json:"name" minLength:"1" maxLength:"60"`
	Position  command.Position      `json:"position"`
	Retired   bool                  `json:"retired"`
}
type FieldSaved struct {
	Configuration ConfigurationView `json:"configuration"`
	Field         FieldView         `json:"field"`
}
type FieldOptionSaved struct {
	Configuration ConfigurationView `json:"configuration"`
	Option        FieldOptionView   `json:"option"`
}
type SaveFieldFields struct {
	ExpectedRevision command.Revision    `json:"expectedRevision"`
	Key              string              `json:"key" pattern:"^[a-z][a-z0-9_]{0,31}$"`
	Name             string              `json:"name" minLength:"1" maxLength:"60"`
	Kind             command.ValueKind   `json:"kind" enum:"text,number,date,choice,user"`
	Required         bool                `json:"required"`
	Retired          bool                `json:"retired"`
	DefaultValue     *command.FieldValue `json:"defaultValue"`
}
type SaveFieldInput struct {
	ProjectID command.ProjectID `json:"projectId"`
	FieldID   command.FieldID   `json:"fieldId"`
	SaveFieldFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type SaveFieldOptionFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
	Name             string           `json:"name" minLength:"1" maxLength:"60"`
	Position         command.Position `json:"position"`
	Retired          bool             `json:"retired"`
}
type SaveFieldOptionInput struct {
	ProjectID command.ProjectID     `json:"projectId"`
	FieldID   command.FieldID       `json:"fieldId"`
	OptionID  command.FieldOptionID `json:"optionId"`
	SaveFieldOptionFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type FieldOptionsInput struct {
	ProjectID      command.ProjectID   `json:"projectId"`
	FieldID        command.FieldID     `json:"fieldId"`
	Page           command.PageRequest `json:"page,omitempty"`
	IncludeRetired bool                `json:"includeRetired,omitempty"`
}

type BackfillFieldFields struct {
	ExpectedRevision command.Revision `json:"expectedRevision"`
	Limit            int              `json:"limit" minimum:"1" maximum:"100"`
}
type BackfillFieldInput struct {
	ProjectID command.ProjectID `json:"projectId"`
	FieldID   command.FieldID   `json:"fieldId"`
	BackfillFieldFields
	RetryReference string `json:"retryReference" format:"uuid"`
}
type BackfillFieldResult struct {
	Configuration ConfigurationView `json:"configuration"`
	Changed       int32             `json:"changed" minimum:"0" maximum:"100"`
	Remaining     int64             `json:"remaining" minimum:"0"`
}

func (SaveFieldFields) TransformSchema(_ huma.Registry, schema *huma.Schema) *huma.Schema {
	command.NullableFieldValue(schema, "defaultValue")
	return schema
}

func (SaveFieldInput) TransformSchema(_ huma.Registry, schema *huma.Schema) *huma.Schema {
	command.NullableFieldValue(schema, "defaultValue")
	return schema
}
