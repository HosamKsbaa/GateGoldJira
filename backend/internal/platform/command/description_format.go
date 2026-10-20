package command

import "github.com/danielgtaylor/huma/v2"

type DescriptionFormat string

const (
	PlainDescription DescriptionFormat = "plain"
	HTMLDescription  DescriptionFormat = "html"
)

func (format DescriptionFormat) Valid() bool {
	return format == "" || format == PlainDescription || format == HTMLDescription
}
func (format DescriptionFormat) Stored() string {
	if format == HTMLDescription {
		return "html"
	}
	return "plain"
}
func (DescriptionFormat) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{Type: "string", Enum: []any{"plain", "html"}}
}
