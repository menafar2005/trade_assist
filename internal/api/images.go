package api

import (
	"errors"
	"io"
	"net/http"
	"strconv"

	"tradejournal/internal/blob"
	"tradejournal/internal/store"
)

// imageType sniffs the real content type; only raster formats are accepted so
// an uploaded file can never be served back as HTML or SVG.
func imageType(b []byte) string {
	switch ct := http.DetectContentType(b); ct {
	case "image/png", "image/jpeg", "image/gif", "image/webp":
		return ct
	}
	return ""
}

func blobKey(id string) string { return "images/" + id }

func (a *API) uploadImage(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxImageBody)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		fail(w, 413, "too_large", "حجم تصویر بیش از ۸ مگابایت است")
		return
	}
	ct := imageType(data)
	if ct == "" {
		fail(w, 415, "bad_type", "فقط تصویر PNG، JPEG، GIF یا WebP پذیرفته می‌شود")
		return
	}
	im := store.Image{ID: newID(), ContentType: ct, Size: int64(len(data)), CreatedAt: a.Now()}
	if err := a.bl.Put(r.Context(), blobKey(im.ID), ct, data); err != nil {
		serverError(w, err)
		return
	}
	if err := a.st.PutImage(r.Context(), im); err != nil {
		serverError(w, err)
		return
	}
	writeJSON(w, 201, map[string]any{"id": im.ID, "url": "/api/images/" + im.ID, "contentType": ct, "size": im.Size})
}

func (a *API) getImage(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validID(id) {
		fail(w, 404, "not_found", "تصویر پیدا نشد")
		return
	}
	im, err := a.st.GetImage(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		fail(w, 404, "not_found", "تصویر پیدا نشد")
		return
	}
	if err != nil {
		serverError(w, err)
		return
	}
	data, err := a.bl.Get(r.Context(), blobKey(id))
	if errors.Is(err, blob.ErrNotFound) {
		fail(w, 404, "not_found", "تصویر پیدا نشد")
		return
	}
	if err != nil {
		serverError(w, err)
		return
	}
	h := w.Header()
	h.Set("Content-Type", im.ContentType)
	h.Set("Content-Length", strconv.Itoa(len(data)))
	h.Set("Cache-Control", "private, max-age=31536000, immutable")
	h.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	_, _ = w.Write(data)
}
