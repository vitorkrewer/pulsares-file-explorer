package app

import (
	"fmt"
	"strings"

	"pulsares-file-explorer/internal/platform"
	"pulsares-file-explorer/internal/storage"
)

func (a *App) GetAvailableDriveLetters() []string {
	return platform.GetAvailableDriveLetters()
}

func (a *App) ListSavedNetworkDrives() ([]storage.SavedNetworkDrive, error) {
	if a.storage == nil {
		return []storage.SavedNetworkDrive{}, nil
	}
	return a.storage.ListSavedNetworkDrives()
}

func (a *App) SaveNetworkDrive(d storage.SavedNetworkDrive) (int64, error) {
	if a.storage == nil {
		return 0, nil
	}
	proto, host, share, _ := platform.ParseNetworkAddress(d.Address)
	if strings.TrimSpace(d.Protocol) == "" && proto != "" {
		d.Protocol = proto
	}
	if strings.TrimSpace(d.Label) == "" && host != "" {
		if share != "" {
			d.Label = fmt.Sprintf("%s (%s)", share, host)
		} else {
			d.Label = host
		}
	}
	return a.storage.SaveNetworkDrive(d)
}

func (a *App) DeleteSavedNetworkDrive(id int64) error {
	if a.storage == nil {
		return nil
	}
	return a.storage.DeleteSavedNetworkDrive(id)
}

func (a *App) ConnectNetworkDrive(req platform.NetworkMountRequest, saveShortcut bool) (*platform.NetworkMountResult, error) {
	res, err := platform.ConnectNetworkDrive(req)
	if err != nil {
		return nil, err
	}

	if saveShortcut && a.storage != nil {
		proto, host, share, _ := platform.ParseNetworkAddress(req.Address)
		if proto == "" {
			proto = "smb"
		}
		addrToSave := strings.TrimSpace(res.RemoteTarget)
		if addrToSave == "" {
			addrToSave = strings.TrimSpace(req.Address)
		}
		label := strings.TrimSpace(req.Label)
		if label == "" {
			if share != "" && host != "" {
				label = fmt.Sprintf("%s (%s)", share, host)
			} else if host != "" {
				label = host
			} else {
				label = addrToSave
			}
		}
		_, _ = a.storage.SaveNetworkDrive(storage.SavedNetworkDrive{
			Label:       label,
			Address:     addrToSave,
			Protocol:    proto,
			Username:    strings.TrimSpace(req.Username),
			Domain:      strings.TrimSpace(req.Domain),
			DriveLetter: strings.ToUpper(strings.TrimRight(strings.TrimSpace(req.DriveLetter), `\`)),
		})
	}

	return res, nil
}

func (a *App) DisconnectNetworkDrive(target string) error {
	return platform.DisconnectNetworkDrive(target)
}

