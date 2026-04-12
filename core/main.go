package main

import (
	"log"
	"net/http"

	"terminal/core/session"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Println("upgrade:", err)
			return
		}

		s, err := session.New(conn)
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
