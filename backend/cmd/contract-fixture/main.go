package main

import (
	"encoding/json"
	"os"

	"gategoldjira/backend/tests/contracts"
)

func main() {
	api, _ := contracts.API()
	encoded, err := json.MarshalIndent(api.OpenAPI(), "", "  ")
	if err != nil {
		os.Exit(1)
	}
	if _, err := os.Stdout.Write(append(encoded, '\n')); err != nil {
		os.Exit(1)
	}
}
