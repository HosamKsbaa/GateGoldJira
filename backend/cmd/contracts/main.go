package main

import (
	"encoding/json"
	"fmt"
	"os"

	"gategoldjira/backend/internal/app"
)

func main() {
	api, err := app.Contracts()
	if err != nil {
		fmt.Fprintln(os.Stderr, "contract registration failed")
		os.Exit(1)
	}
	data, err := json.MarshalIndent(api.OpenAPI(), "", "  ")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if _, err := os.Stdout.Write(append(data, '\n')); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
