//go:build !windows

package platform

// SetWindowsAppID é um no-op em plataformas não-Windows.
func SetWindowsAppID(appID string) {}

// ApplyWindowIcon é um no-op em plataformas não-Windows.
func ApplyWindowIcon(windowClass string, iconType string) {}

