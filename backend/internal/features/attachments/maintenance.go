package attachments

import (
	"context"
)

type MaintenanceResult struct {
	Paused         bool  `json:"paused"`
	RemovedStaging int32 `json:"removedStaging"`
}

func (s *Service) Maintain(ctx context.Context) (MaintenanceResult, error) {
	result, err := s.MaintainAssets(ctx)
	return MaintenanceResult{Paused: result.Paused, RemovedStaging: result.RemovedStaging}, err
}
