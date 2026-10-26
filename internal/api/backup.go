package api

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"path"
	"strings"
	"time"

	"tradejournal/internal/model"
	"tradejournal/internal/store"
)

const backupVersion = 1

// backupFile is the journal.json inside the backup ZIP; images live under images/<id>.
type backupFile struct {
	Version    int               `json:"version"`
	ExportedAt int64             `json:"exportedAt"`
	Settings   *model.Settings   `json:"settings"`
	Positions  []*model.Position `json:"positions"`
	Images     []store.Image     `json:"images"`
}

func (a *API) export(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	positions, err := a.st.All(ctx)
	if err != nil {
		serverError(w, err)
		return
	}
	settings, err := a.st.GetSettings(ctx)
	if err != nil {
		serverError(w, err)
		return
	}
	images, err := a.st.Images(ctx)
	if err != nil {
		serverError(w, err)
		return
	}
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	meta, _ := json.MarshalIndent(backupFile{Version: backupVersion, ExportedAt: a.Now(),
		Settings: &settings, Positions: positions, Images: images}, "", "  ")
	f, _ := zw.Create("journal.json")
	_, _ = f.Write(meta)
	for _, im := range images {
		data, err := a.bl.Get(ctx, blobKey(im.ID))
		if err != nil {
			continue // metadata without a file: skip rather than fail the whole backup
		}
		// images are already compressed
		fw, _ := zw.CreateHeader(&zip.FileHeader{Name: "images/" + im.ID, Method: zip.Store})
		_, _ = fw.Write(data)
	}
	if err := zw.Close(); err != nil {
		serverError(w, err)
		return
	}
	name := "trade-journal-" + time.UnixMilli(a.Now()).UTC().Format("2006-01-02") + ".zip"
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	_, _ = w.Write(buf.Bytes())
}

func readZipFile(f *zip.File, limit int64) ([]byte, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return io.ReadAll(io.LimitReader(rc, limit))
}

var validStatus = map[string]bool{
	model.StatusDraft: true, model.StatusOpen: true, model.StatusClosed: true,
	model.StatusReviewed: true, model.StatusAbandoned: true,
}

// importZip merges a backup into the journal: positions with the same id are
// replaced, everything else is kept.
func (a *API) importZip(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxZipBody)
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		fail(w, 413, "too_large", "فایل پشتیبان بیش از حد بزرگ است")
		return
	}
	zr, err := zip.NewReader(bytes.NewReader(raw), int64(len(raw)))
	if err != nil {
		fail(w, 400, "bad_zip", "فایل ZIP معتبر نیست")
		return
	}
	var meta *backupFile
	files := map[string]*zip.File{}
	for _, f := range zr.File {
		files[path.Clean(f.Name)] = f
	}
	jf, ok := files["journal.json"]
	if !ok {
		fail(w, 400, "bad_backup", "فایل journal.json در پشتیبان نیست")
		return
	}
	jb, err := readZipFile(jf, 32<<20)
	if err == nil {
		meta = new(backupFile)
		err = json.Unmarshal(jb, meta)
	}
	if err != nil || meta.Version != backupVersion {
		fail(w, 400, "bad_backup", "نسخه یا ساختار فایل پشتیبان پشتیبانی نمی‌شود")
		return
	}

	ctx := r.Context()
	nImages, nPositions := 0, 0
	for _, im := range meta.Images {
		f, ok := files["images/"+im.ID]
		if !ok || !validID(im.ID) || strings.Contains(im.ID, "/") {
			continue
		}
		data, err := readZipFile(f, maxImageBody)
		ct := imageType(data)
		if err != nil || ct == "" {
			continue
		}
		if err := a.bl.Put(ctx, blobKey(im.ID), ct, data); err != nil {
			serverError(w, err)
			return
		}
		if err := a.st.PutImage(ctx, store.Image{ID: im.ID, ContentType: ct, Size: int64(len(data)), CreatedAt: im.CreatedAt}); err != nil {
			serverError(w, err)
			return
		}
		nImages++
	}
	for _, p := range meta.Positions {
		if p == nil || !validID(p.ID) || !validStatus[p.Status] {
			continue
		}
		p.Pre = model.SanitizePre(p.Pre, newID)
		p.Result = model.SanitizeResult(p.Result)
		if p.CreatedAt == 0 {
			p.CreatedAt = a.Now()
		}
		if p.UpdatedAt == 0 {
			p.UpdatedAt = p.CreatedAt
		}
		if err := a.st.Upsert(ctx, p); err != nil {
			serverError(w, err)
			return
		}
		nPositions++
	}
	if meta.Settings != nil {
		s := model.SanitizeSettings(*meta.Settings, newID)
		if err := a.st.PutSettings(ctx, s); err != nil {
			serverError(w, err)
			return
		}
	}
	writeJSON(w, 200, map[string]int{"positions": nPositions, "images": nImages})
}
