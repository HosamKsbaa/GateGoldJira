package command

import "github.com/danielgtaylor/huma/v2"

// Position is positive ordering data, encoded as a decimal string so all
// PostgreSQL bigint digits survive JavaScript, JSON and cursor round trips.
type Position int64

func (p Position) MarshalJSON() ([]byte, error) { return Revision(p).MarshalJSON() }
func (p *Position) UnmarshalJSON(data []byte) error {
	var value Revision
	if err := value.UnmarshalJSON(data); err != nil {
		return err
	}
	*p = Position(value)
	return nil
}
func (Position) Schema(registry huma.Registry) *huma.Schema { return Revision(1).Schema(registry) }
