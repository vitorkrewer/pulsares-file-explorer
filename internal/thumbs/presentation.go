package thumbs

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/binary"
	"encoding/xml"
	"io"
	"os"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf16"
)

// PresentationSlide representa um slide extraído de uma apresentação (.pptx, .ppsx, .potx, .odp, .otp, .fodp, .ppt).
type PresentationSlide struct {
	Index    int      `json:"index"`
	Title    string   `json:"title"`
	Subtitle string   `json:"subtitle,omitempty"`
	Bullets  []string `json:"bullets,omitempty"`
	Notes    string   `json:"notes,omitempty"`
	Images   []string `json:"images,omitempty"`
}

func isPresentationExt(ext string) bool {
	switch strings.ToLower(strings.TrimPrefix(ext, ".")) {
	case "pptx", "ppsx", "potx", "ppt", "pps", "pot", "odp", "otp", "fodp":
		return true
	default:
		return false
	}
}

func presentationMime(ext string) string {
	switch strings.ToLower(strings.TrimPrefix(ext, ".")) {
	case "pptx":
		return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
	case "ppsx":
		return "application/vnd.openxmlformats-officedocument.presentationml.slideshow"
	case "potx":
		return "application/vnd.openxmlformats-officedocument.presentationml.template"
	case "odp":
		return "application/vnd.oasis.opendocument.presentation"
	case "otp":
		return "application/vnd.oasis.opendocument.presentation-template"
	case "fodp":
		return "application/vnd.oasis.opendocument.presentation-flat-xml"
	default:
		return "application/vnd.ms-powerpoint"
	}
}

// extractPresentationThumbnail tenta extrair a miniatura embutida de um arquivo .pptx ou .odp.
func extractPresentationThumbnail(filePath string) (string, error) {
	zr, err := zip.OpenReader(filePath)
	if err != nil {
		return "", err
	}
	defer zr.Close()

	for _, f := range zr.File {
		lower := strings.ToLower(f.Name)
		if lower == "docprops/thumbnail.jpeg" || lower == "docprops/thumbnail.jpg" ||
			lower == "docprops/thumbnail.png" || lower == "thumbnails/thumbnail.png" {
			if f.UncompressedSize64 > 4*1024*1024 {
				continue
			}
			rc, err := f.Open()
			if err != nil {
				continue
			}
			raw, err := io.ReadAll(io.LimitReader(rc, 4*1024*1024))
			rc.Close()
			if err != nil || len(raw) == 0 {
				continue
			}
			mime := "image/jpeg"
			if strings.HasSuffix(lower, ".png") {
				mime = "image/png"
			}
			return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(raw), nil
		}
	}
	return "", os.ErrNotExist
}

// readPresentationPreview extrai os slides estruturados de arquivos PowerPoint (.pptx/.ppsx/.potx/.ppt) e LibreOffice Impress (.odp/.otp/.fodp).
func readPresentationPreview(filePath, ext string) ([]PresentationSlide, string, error) {
	cleanExt := strings.ToLower(strings.TrimPrefix(ext, "."))
	switch cleanExt {
	case "pptx", "ppsx", "potx":
		return parsePPTX(filePath)
	case "odp", "otp":
		return parseODP(filePath)
	case "fodp":
		raw, err := os.ReadFile(filePath)
		if err != nil {
			return nil, "", err
		}
		slides, err := parseODPContentXML(raw, nil)
		return slides, "", err
	case "ppt", "pps", "pot":
		slides, err := parseLegacyPPT(filePath)
		return slides, "", err
	default:
		return parsePPTX(filePath)
	}
}

var slideNumRegex = regexp.MustCompile(`(?i)^ppt/slides/slide(\d+)\.xml$`)

type xmlRel struct {
	ID     string `xml:"Id,attr"`
	Target string `xml:"Target,attr"`
}

type xmlRelationships struct {
	Rels []xmlRel `xml:"Relationship"`
}

func parsePPTX(filePath string) ([]PresentationSlide, string, error) {
	zr, err := zip.OpenReader(filePath)
	if err != nil {
		return nil, "", err
	}
	defer zr.Close()

	fileMap := make(map[string]*zip.File, len(zr.File))
	type slideEntry struct {
		num  int
		file *zip.File
	}
	var slideFiles []slideEntry
	var coverThumb string

	for _, f := range zr.File {
		normName := strings.ReplaceAll(f.Name, "\\", "/")
		fileMap[normName] = f
		lower := strings.ToLower(normName)
		if lower == "docprops/thumbnail.jpeg" || lower == "docprops/thumbnail.jpg" || lower == "docprops/thumbnail.png" {
			if uri, ok := readZipImageDataURI(f, 2*1024*1024); ok {
				coverThumb = uri
			}
		}
		if m := slideNumRegex.FindStringSubmatch(normName); len(m) == 2 {
			n, _ := strconv.Atoi(m[1])
			slideFiles = append(slideFiles, slideEntry{num: n, file: f})
		}
	}

	sort.Slice(slideFiles, func(i, j int) bool {
		return slideFiles[i].num < slideFiles[j].num
	})

	slides := make([]PresentationSlide, 0, len(slideFiles))
	for idx, se := range slideFiles {
		relsPath := "ppt/slides/_rels/slide" + strconv.Itoa(se.num) + ".xml.rels"
		relMap := parseSlideRels(fileMap[relsPath])

		slideData := parsePPTXSlideXML(se.file, idx+1, relMap, fileMap)

		notesPath := "ppt/notesSlides/notesSlide" + strconv.Itoa(se.num) + ".xml"
		if nf, ok := fileMap[notesPath]; ok {
			slideData.Notes = parsePPTXNotesXML(nf)
		}

		slides = append(slides, slideData)
	}

	return slides, coverThumb, nil
}

func parseSlideRels(relFile *zip.File) map[string]string {
	res := make(map[string]string)
	if relFile == nil {
		return res
	}
	rc, err := relFile.Open()
	if err != nil {
		return res
	}
	defer rc.Close()

	raw, err := io.ReadAll(io.LimitReader(rc, 512*1024))
	if err != nil {
		return res
	}
	var rels xmlRelationships
	if err := xml.Unmarshal(raw, &rels); err != nil {
		return res
	}
	for _, r := range rels.Rels {
		if r.ID != "" && r.Target != "" {
			cleanTarget := path.Clean("ppt/slides/" + strings.TrimPrefix(r.Target, "/"))
			if strings.HasPrefix(r.Target, "/ppt/") {
				cleanTarget = strings.TrimPrefix(r.Target, "/")
			}
			res[r.ID] = cleanTarget
		}
	}
	return res
}

func parsePPTXSlideXML(
	slideFile *zip.File,
	slideIndex int,
	relMap map[string]string,
	fileMap map[string]*zip.File,
) PresentationSlide {
	slide := PresentationSlide{
		Index: slideIndex,
	}
	if slideFile == nil {
		return slide
	}
	rc, err := slideFile.Open()
	if err != nil {
		return slide
	}
	defer rc.Close()

	dec := xml.NewDecoder(io.LimitReader(rc, 4*1024*1024))
	var inShape bool
	var shapeKind string // "title", "subtitle", "body"
	var shapeParagraphs []string
	var inParagraph bool
	var paraBuf strings.Builder
	var inText bool
	var seenImages = make(map[string]bool)

	flushShape := func() {
		for _, p := range shapeParagraphs {
			trimmed := strings.TrimSpace(p)
			if trimmed == "" {
				continue
			}
			switch shapeKind {
			case "title":
				if slide.Title == "" {
					slide.Title = trimmed
				} else {
					slide.Bullets = append(slide.Bullets, trimmed)
				}
			case "subtitle":
				if slide.Subtitle == "" {
					slide.Subtitle = trimmed
				} else {
					slide.Bullets = append(slide.Bullets, trimmed)
				}
			default:
				if slide.Title == "" && len(slide.Bullets) == 0 && len(trimmed) <= 120 {
					slide.Title = trimmed
				} else {
					slide.Bullets = append(slide.Bullets, trimmed)
				}
			}
		}
		shapeParagraphs = nil
		shapeKind = ""
	}

	for {
		tok, err := dec.Token()
		if err != nil {
			break
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "sp":
				inShape = true
				shapeKind = "body"
				shapeParagraphs = nil
			case "ph":
				if inShape {
					for _, attr := range t.Attr {
						if attr.Name.Local == "type" {
							v := strings.ToLower(attr.Value)
							if v == "title" || v == "ctrtitle" {
								shapeKind = "title"
							} else if v == "subtitle" {
								shapeKind = "subtitle"
							}
						}
					}
				}
			case "p":
				inParagraph = true
				paraBuf.Reset()
			case "br":
				if inParagraph {
					paraBuf.WriteString(" ")
				}
			case "t":
				if inParagraph {
					inText = true
				}
			case "blip":
				if len(slide.Images) < 3 {
					for _, attr := range t.Attr {
						if attr.Name.Local == "embed" && attr.Value != "" {
							targetPath := relMap[attr.Value]
							if targetPath != "" && !seenImages[targetPath] {
								seenImages[targetPath] = true
								if imgFile, ok := fileMap[targetPath]; ok {
									if uri, ok := readZipImageDataURI(imgFile, 2*1024*1024); ok {
										slide.Images = append(slide.Images, uri)
									}
								}
							}
						}
					}
				}
			}
		case xml.CharData:
			if inText && inParagraph {
				paraBuf.Write(t)
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "t":
				inText = false
			case "p":
				if inParagraph {
					text := strings.TrimSpace(paraBuf.String())
					if text != "" {
						if inShape {
							shapeParagraphs = append(shapeParagraphs, text)
						} else {
							slide.Bullets = append(slide.Bullets, text)
						}
					}
					inParagraph = false
				}
			case "sp":
				if inShape {
					flushShape()
					inShape = false
				}
			}
		}
	}

	if slide.Title == "" {
		slide.Title = "Slide " + strconv.Itoa(slideIndex)
	}
	return slide
}

func parsePPTXNotesXML(notesFile *zip.File) string {
	if notesFile == nil {
		return ""
	}
	rc, err := notesFile.Open()
	if err != nil {
		return ""
	}
	defer rc.Close()

	dec := xml.NewDecoder(io.LimitReader(rc, 1024*1024))
	var paragraphs []string
	var inParagraph bool
	var inText bool
	var buf strings.Builder

	for {
		tok, err := dec.Token()
		if err != nil {
			break
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if t.Name.Local == "p" {
				inParagraph = true
				buf.Reset()
			} else if t.Name.Local == "t" && inParagraph {
				inText = true
			}
		case xml.CharData:
			if inText && inParagraph {
				buf.Write(t)
			}
		case xml.EndElement:
			if t.Name.Local == "t" {
				inText = false
			} else if t.Name.Local == "p" && inParagraph {
				s := strings.TrimSpace(buf.String())
				// Ignora número puro do slide no rodapé das notas
				if s != "" && !isDigitsOnly(s) {
					paragraphs = append(paragraphs, s)
				}
				inParagraph = false
			}
		}
	}
	return strings.Join(paragraphs, "\n")
}

func parseODP(filePath string) ([]PresentationSlide, string, error) {
	zr, err := zip.OpenReader(filePath)
	if err != nil {
		return nil, "", err
	}
	defer zr.Close()

	fileMap := make(map[string]*zip.File, len(zr.File))
	var coverThumb string
	var contentFile *zip.File

	for _, f := range zr.File {
		normName := strings.ReplaceAll(f.Name, "\\", "/")
		fileMap[normName] = f
		lower := strings.ToLower(normName)
		if lower == "thumbnails/thumbnail.png" {
			if uri, ok := readZipImageDataURI(f, 2*1024*1024); ok {
				coverThumb = uri
			}
		}
		if lower == "content.xml" {
			contentFile = f
		}
	}

	if contentFile == nil {
		return nil, coverThumb, os.ErrNotExist
	}

	rc, err := contentFile.Open()
	if err != nil {
		return nil, coverThumb, err
	}
	defer rc.Close()

	raw, err := io.ReadAll(io.LimitReader(rc, 8*1024*1024))
	if err != nil {
		return nil, coverThumb, err
	}

	slides, err := parseODPContentXML(raw, fileMap)
	return slides, coverThumb, err
}

func parseODPContentXML(raw []byte, fileMap map[string]*zip.File) ([]PresentationSlide, error) {
	dec := xml.NewDecoder(bytes.NewReader(raw))

	var slides []PresentationSlide
	var curSlide *PresentationSlide
	var inPage bool
	var inNotes bool
	var frameClass string
	var inPara bool
	var paraBuf strings.Builder

	for {
		tok, err := dec.Token()
		if err != nil {
			break
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "page":
				inPage = true
				idx := len(slides) + 1
				pageName := ""
				for _, attr := range t.Attr {
					if attr.Name.Local == "name" {
						pageName = strings.TrimSpace(attr.Value)
					}
				}
				curSlide = &PresentationSlide{
					Index: idx,
					Title: pageName,
				}
			case "notes":
				if inPage {
					inNotes = true
				}
			case "frame":
				if inPage {
					frameClass = ""
					for _, attr := range t.Attr {
						if attr.Name.Local == "class" {
							frameClass = strings.ToLower(attr.Value)
						}
					}
				}
			case "p", "h":
				if inPage {
					inPara = true
					paraBuf.Reset()
				}
			case "s":
				if inPara {
					paraBuf.WriteString(" ")
				}
			case "tab":
				if inPara {
					paraBuf.WriteString("  ")
				}
			case "line-break":
				if inPara {
					paraBuf.WriteString("\n")
				}
			case "image":
				if inPage && curSlide != nil && len(curSlide.Images) < 3 && fileMap != nil {
					for _, attr := range t.Attr {
						if attr.Name.Local == "href" && attr.Value != "" {
							cleanHref := strings.TrimPrefix(strings.ReplaceAll(attr.Value, "\\", "/"), "./")
							if zf, ok := fileMap[cleanHref]; ok {
								if uri, ok := readZipImageDataURI(zf, 2*1024*1024); ok {
									curSlide.Images = append(curSlide.Images, uri)
								}
							}
						}
					}
				}
			}
		case xml.CharData:
			if inPage && inPara {
				paraBuf.Write(t)
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "p", "h":
				if inPage && inPara && curSlide != nil {
					txt := strings.TrimSpace(paraBuf.String())
					if txt != "" {
						if inNotes {
							if !isDigitsOnly(txt) {
								if curSlide.Notes == "" {
									curSlide.Notes = txt
								} else {
									curSlide.Notes += "\n" + txt
								}
							}
						} else if frameClass == "title" {
							curSlide.Title = txt
						} else if frameClass == "subtitle" && curSlide.Subtitle == "" {
							curSlide.Subtitle = txt
						} else {
							if (curSlide.Title == "" || strings.HasPrefix(strings.ToLower(curSlide.Title), "page") || strings.HasPrefix(strings.ToLower(curSlide.Title), "slide")) && len(curSlide.Bullets) == 0 && len(txt) <= 120 {
								curSlide.Title = txt
							} else {
								curSlide.Bullets = append(curSlide.Bullets, txt)
							}
						}
					}
					inPara = false
				}
			case "frame":
				frameClass = ""
			case "notes":
				inNotes = false
			case "page":
				if inPage && curSlide != nil {
					if curSlide.Title == "" {
						curSlide.Title = "Slide " + strconv.Itoa(curSlide.Index)
					}
					slides = append(slides, *curSlide)
					curSlide = nil
					inPage = false
				}
			}
		}
	}

	return slides, nil
}

// parseLegacyPPT extrai blocos de texto legíveis de arquivos binários .ppt (OLE2 PowerPoint 97-2003).
func parseLegacyPPT(filePath string) ([]PresentationSlide, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	raw, err := io.ReadAll(io.LimitReader(f, 8*1024*1024))
	if err != nil {
		return nil, err
	}

	var extracted []string
	// Extrai blocos UTF-16LE e ASCII de registros TextCharsAtom (0x0FA0) e TextBytesAtom (0x0FA8) do formato PowerPoint binário
	for i := 0; i+8 <= len(raw); i++ {
		recType := binary.LittleEndian.Uint16(raw[i+2 : i+4])
		recLen := int(binary.LittleEndian.Uint32(raw[i+4 : i+8]))
		if recLen <= 0 || recLen > 65536 || i+8+recLen > len(raw) {
			continue
		}
		payload := raw[i+8 : i+8+recLen]
		switch recType {
		case 0x0FA0: // TextCharsAtom (UTF-16LE)
			if len(payload)%2 == 0 && len(payload) >= 4 {
				u16 := make([]uint16, len(payload)/2)
				for j := 0; j < len(u16); j++ {
					u16[j] = binary.LittleEndian.Uint16(payload[j*2 : j*2+2])
				}
				s := cleanSlideString(string(utf16.Decode(u16)))
				if len(s) >= 2 {
					extracted = append(extracted, s)
					i += 7 + recLen
				}
			}
		case 0x0FA8: // TextBytesAtom (Latin1 / ASCII)
			var runes []rune
			for _, b := range payload {
				runes = append(runes, rune(b))
			}
			s := cleanSlideString(string(runes))
			if len(s) >= 2 {
				extracted = append(extracted, s)
				i += 7 + recLen
			}
		}
	}

	if len(extracted) == 0 {
		return []PresentationSlide{
			{
				Index:   1,
				Title:   "Apresentação PowerPoint (.ppt)",
				Bullets: []string{"Formato binário legado detectado."},
			},
		}, nil
	}

	var slides []PresentationSlide
	chunkSize := 5
	for i := 0; i < len(extracted); i += chunkSize {
		end := i + chunkSize
		if end > len(extracted) {
			end = len(extracted)
		}
		group := extracted[i:end]
		slide := PresentationSlide{
			Index: len(slides) + 1,
			Title: group[0],
		}
		if len(group) > 1 {
			slide.Bullets = group[1:]
		}
		slides = append(slides, slide)
	}
	return slides, nil
}

func cleanSlideString(s string) string {
	s = strings.ReplaceAll(s, "\r\n", "\n")
	s = strings.ReplaceAll(s, "\r", "\n")
	var b strings.Builder
	for _, r := range s {
		if r == '\n' || r == '\t' || unicode.IsPrint(r) {
			b.WriteRune(r)
		}
	}
	return strings.TrimSpace(b.String())
}

func readZipImageDataURI(zf *zip.File, maxBytes int64) (string, bool) {
	if zf == nil || zf.UncompressedSize64 == 0 || int64(zf.UncompressedSize64) > maxBytes {
		return "", false
	}
	ext := strings.ToLower(strings.TrimPrefix(path.Ext(zf.Name), "."))
	switch ext {
	case "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp":
	default:
		return "", false
	}
	rc, err := zf.Open()
	if err != nil {
		return "", false
	}
	defer rc.Close()

	raw, err := io.ReadAll(io.LimitReader(rc, maxBytes))
	if err != nil || len(raw) == 0 {
		return "", false
	}
	mime := imageMime(ext)
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(raw), true
}

func isDigitsOnly(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
