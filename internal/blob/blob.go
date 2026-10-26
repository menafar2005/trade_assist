// Package blob abstracts image storage: R2 on Cloudflare, a directory locally.
package blob

import (
	"context"
	"errors"
	"os"
	"path/filepath"
)

var ErrNotFound = errors.New("blob not found")

type Store interface {
	Put(ctx context.Context, key, contentType string, data []byte) error
	// Get returns the whole object; images are capped at a few MB.
	Get(ctx context.Context, key string) ([]byte, error)
	Delete(ctx context.Context, key string) error
}

// FS is a directory-backed Store for local development and tests.
type FS struct{ Dir string }

func (f FS) path(key string) string { return filepath.Join(f.Dir, filepath.Base(key)) }

func (f FS) Put(_ context.Context, key, _ string, data []byte) error {
	if err := os.MkdirAll(f.Dir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(f.path(key), data, 0o644)
}

func (f FS) Get(_ context.Context, key string) ([]byte, error) {
	b, err := os.ReadFile(f.path(key))
	if errors.Is(err, os.ErrNotExist) {
		return nil, ErrNotFound
	}
	return b, err
}

func (f FS) Delete(_ context.Context, key string) error {
	err := os.Remove(f.path(key))
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}
