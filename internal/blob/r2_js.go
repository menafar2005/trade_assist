//go:build js && wasm

package blob

import (
	"bytes"
	"context"
	"io"

	"github.com/syumai/workers-go/cloudflare/r2"
)

// R2 stores objects in a Cloudflare R2 bucket binding.
type R2 struct{ Bucket *r2.Bucket }

func (s R2) Put(_ context.Context, key, contentType string, data []byte) error {
	_, err := s.Bucket.Put(key, io.NopCloser(bytes.NewReader(data)), &r2.PutOptions{
		HTTPMetadata: r2.HTTPMetadata{ContentType: contentType},
	})
	return err
}

func (s R2) Get(_ context.Context, key string) ([]byte, error) {
	o, err := s.Bucket.Get(key)
	if err != nil {
		return nil, err
	}
	if o == nil {
		return nil, ErrNotFound
	}
	return io.ReadAll(o.Body)
}

func (s R2) Delete(_ context.Context, key string) error { return s.Bucket.Delete(key) }
