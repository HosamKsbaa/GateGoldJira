package pictures

import mediavalidation "gategoldjira/backend/internal/features/attachments/validation"

func validateImage(data []byte, mime string) error { return mediavalidation.ValidateImage(data, mime) }
