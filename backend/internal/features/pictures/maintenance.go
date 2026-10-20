package pictures

import (
	"context"
)

type MaintenanceResult struct {
	Paused         bool  `json:"paused"`
	ExpiredDrafts  int32 `json:"expiredDrafts"`
	RemovedStaging int32 `json:"removedStaging"`
	RemovedRetries int64 `json:"removedRetries"`
}

func (s *Service) Maintain(ctx context.Context) (MaintenanceResult, error) {
	result, err := s.assetStorage.MaintainAssets(ctx)
	return MaintenanceResult{
		Paused:         result.Paused,
		ExpiredDrafts:  result.ExpiredDrafts,
		RemovedStaging: result.RemovedStaging,
		RemovedRetries: result.RemovedRetries,
	}, err
}
