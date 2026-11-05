package vfs

import (
	"context"
	"errors"
	"io"
	"time"
)

var (
	ErrNotFound      = errors.New("not found")
	ErrPermission    = errors.New("permission denied")
	ErrExists        = errors.New("already exists")
	ErrNotEmpty      = errors.New("directory not empty")
	ErrCrossDevice   = errors.New("cross device link/move")
	ErrUnsupported   = errors.New("unsupported operation")
	ErrInvalidPath   = errors.New("invalid path")
)

type Kind string

const (
	KindFile    Kind = "file"
	KindDir     Kind = "dir"
	KindSymlink Kind = "symlink"
	KindOther   Kind = "other"
)

type Location struct {
	Provider string `json:"provider"` // "local", "zip", "sftp"...
	Root     string `json:"root"`     // "C:\", "/", "sftp://host"
	Path     string `json:"path"`     // Caminho normalizado dentro do provedor
}

type Attrs struct {
	Hidden   bool `json:"hidden"`
	System   bool `json:"system"`
	ReadOnly bool `json:"readOnly"`
}

type Entry struct {
	Name     string    `json:"name"`
	Location Location  `json:"location"`
	Kind     Kind      `json:"kind"`
	Size     int64     `json:"size"`
	ModTime  time.Time `json:"modTime"`
	Attrs    Attrs     `json:"attrs"`
	Target   *Location `json:"target,omitempty"` // Destino se for symlink
}

type FileSystem interface {
	Stat(ctx context.Context, loc Location) (Entry, error)
	ReadDir(ctx context.Context, loc Location, batch int) (<-chan []Entry, <-chan error)
	Open(ctx context.Context, loc Location) (io.ReadCloser, error)
}

