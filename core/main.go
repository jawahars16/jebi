package main

import (
	"flag"
	"fmt"
	"log"
	"net"
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

// resolveProvider creates the configured LLM provider without blocking startup.
// Availability is checked lazily on first use.
func resolveProvider(cfg config.Config) llm.Provider {
	if !cfg.Enabled {
		return nil
	}
	switch cfg.Provider {
	case "ollama":
		return providers.NewOllamaProvider(cfg)
	case "llama-server":
		p, err := providers.NewLlamaServerProvider(cfg)
		if err != nil {
			log.Printf("llm: %v", err)
			return nil
		}
		return p
	}
	return nil
}

func main() {
	port := flag.Int("port", 7070, "port to listen on")
	flag.Parse()

	cfg := config.Load()
	provider := resolveProvider(cfg)

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
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Println("upgrade:", err)
			return
		}

		// If the renderer is reconnecting to an existing session, reattach to it.
		if sid := r.URL.Query().Get("sessionId"); sid != "" {
			if s, ok := session.Reattach(sid, conn); ok {
				log.Printf("reconnected session %s", sid)
				// Start() is already running in a goroutine — just return.
				// Reattach() flushed the replay buffer and the loop continues.
				_ = s
				return
			}
		}

		initialCwd := r.URL.Query().Get("cwd")
		s, err := session.New(conn, provider, initialCwd)
		if err != nil {
			log.Println("session:", err)
			conn.Close()
			return
		}
		defer s.Close()
		s.Start()
	})

	http.HandleFunc("/global", session.GlobalHandler(provider))

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", *port))
	if err != nil {
		log.Fatalf("core: failed to listen on port %d: %v", *port, err)
	}
	log.Printf("core listening on :%d", *port)
	log.Fatal(http.Serve(ln, nil))
}