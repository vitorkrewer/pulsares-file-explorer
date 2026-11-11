package platform

// SystemClipboardSnapshot representa o conteúdo atual da área de transferência do SO.
type SystemClipboardSnapshot struct {
	Sequence uint64   `json:"sequence"`
	Busy     bool     `json:"busy,omitempty"`
	Kind     string   `json:"kind"` // "files" | "image" | "text" | ""
	Text     string   `json:"text,omitempty"`
	Paths    []string `json:"paths,omitempty"`
	Cut      bool     `json:"cut,omitempty"`
	ImageB64 string   `json:"imageB64,omitempty"` // data:image/png;base64,...
	Width    int      `json:"width,omitempty"`
	Height   int      `json:"height,omitempty"`
}

