package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"terminal/core/llm"
	"terminal/core/llm/config"
	"terminal/core/llm/providers"
	"terminal/core/session"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// resolveProvider picks the best available LLM provider at startup.
// Returns (provider, reason) — provider is nil when unavailable, reason explains why.
func resolveProvider(cfg config.Config) (llm.Provider, string) {
	if !cfg.Enabled {
		log.Println("llm: disabled in config")
		return nil, "AI is disabled in config (~/.config/term/settings.json)"
	}

	switch cfg.Provider {
	case "ollama":
		p := providers.NewOllamaProvider(cfg)
		reason, ok := p.CheckAvailability()
		if ok {
			log.Printf("llm: using ollama (model=%s)", cfg.Model)
			return p, ""
		}
		log.Printf("llm: %s", reason)
		return nil, reason

	case "llama-server":
		p, err := providers.NewLlamaServerProvider(cfg)
		if err != nil {
			msg := "llama-server unavailable: " + err.Error()
			log.Printf("llm: %s", msg)
			return nil, msg
		}
		reason, ok := p.CheckAvailability()
		if ok {
			log.Printf("llm: using llama-server (model=%s)", cfg.Model)
			return p, ""
		}
		log.Printf("llm: %s", reason)
		return nil, reason
	}

	msg := "unknown provider '" + cfg.Provider + "' — set provider to 'ollama' or 'llama-server'"
	log.Println("llm:", msg)
	return nil, msg
}

func main() {
	// Resolve the LLM provider once at startup — shared across all sessions.
	// llama-server is heavy (loads model into memory), so one instance is correct.
	// The provider is not yet wired to any session feature; it is loaded here so
	// future features can access it without startup delay.
	cfg := config.Load()
	provider, _ := resolveProvider(cfg)

	// If using llama-server, stop the subprocess cleanly on exit.
	if lsp, ok := provider.(*providers.LlamaServerProvider); ok {
		sigs := make(chan os.Signal, 1)
		signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
		go func() {
			<-sigs
			lsp.Stop()
			os.Exit(0)
		}()
	}

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		log.Println("new connection from", r.RemoteAddr)
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Println("upgrade:", err)
			return
		}

		s, err := session.New(conn, provider)
		if err != nil {
			log.Println("session:", err)
			conn.Close()
			return
		}
		defer s.Close()
		s.Start()
	})

	log.Println("core listening on :7070")
	log.Fatal(http.ListenAndServe(":7070", nil))
}
