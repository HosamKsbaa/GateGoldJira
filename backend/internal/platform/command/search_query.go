package command

import (
	"strconv"
	"strings"
)

type SearchKind string

const (
	SearchEmpty      SearchKind = "empty"
	SearchNumber     SearchKind = "number"
	SearchLiteral    SearchKind = "text"
	SearchImpossible SearchKind = "none"
)

// SearchQuery is an internal typed SQL input, not an alternative API filter.
// ASCII digit-only input has exact numeric meaning. Other text stays literal.
type SearchQuery struct {
	Kind       SearchKind
	Raw        string
	Number     *int64
	Pattern    string
	ProjectKey string
	KeyNumber  *int64
}

func asciiDigits(value string) bool {
	if value == "" {
		return false
	}
	for _, digit := range value {
		if digit < '0' || digit > '9' {
			return false
		}
	}
	return true
}

func canonicalProjectKey(value string) bool {
	if len(value) < 2 || len(value) > 10 || value[0] < 'A' || value[0] > 'Z' {
		return false
	}
	for _, char := range value {
		if (char < 'A' || char > 'Z') && (char < '0' || char > '9') {
			return false
		}
	}
	return true
}

func ClassifySearch(value string) SearchQuery {
	value = strings.TrimSpace(value)
	query := SearchQuery{Raw: value, Kind: SearchEmpty}
	if value == "" {
		return query
	}
	if asciiDigits(value) {
		trimmed := strings.TrimLeft(value, "0")
		number, err := strconv.ParseInt(trimmed, 10, 64)
		if err != nil || number < 1 {
			query.Kind = SearchImpossible
			return query
		}
		query.Kind, query.Number = SearchNumber, &number
		return query
	}
	query.Kind = SearchLiteral
	query.Pattern = "%" + strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(value) + "%"
	if split := strings.LastIndexByte(value, '-'); split > 0 && split < len(value)-1 {
		key, digits := strings.ToUpper(value[:split]), value[split+1:]
		if canonicalProjectKey(key) && asciiDigits(digits) && digits[0] != '0' {
			number, err := strconv.ParseInt(digits, 10, 64)
			if err == nil && number > 0 {
				query.ProjectKey, query.KeyNumber = key, &number
			}
		}
	}
	return query
}
