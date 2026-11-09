//go:build !windows

package platform

// ApplyWindowIcon é um no-op em plataformas não-Windows.
func ApplyWindowIcon(windowClass string, iconType string) {}

