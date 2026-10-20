package notifications

import (
	"bufio"
	"context"
	"io"
	"mime"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestSMTPUsesLocalSinkStableIdentityAndEncodedArabicText(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	data := make(chan string, 1)
	serverError := make(chan error, 1)
	go func() {
		conn, err := listener.Accept()
		if err != nil {
			serverError <- err
			return
		}
		defer conn.Close()
		_ = conn.SetDeadline(time.Now().Add(3 * time.Second))
		reader := bufio.NewReader(conn)
		write := func(value string) error { _, err := io.WriteString(conn, value+"\r\n"); return err }
		if err = write("220 local fixture SMTP"); err != nil {
			serverError <- err
			return
		}
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				serverError <- err
				return
			}
			switch {
			case strings.HasPrefix(line, "EHLO"):
				err = write("250 localhost")
			case strings.HasPrefix(line, "HELO"), strings.HasPrefix(line, "MAIL FROM:"), strings.HasPrefix(line, "RCPT TO:"):
				err = write("250 OK")
			case strings.HasPrefix(line, "DATA"):
				if err = write("354 Send data"); err != nil {
					serverError <- err
					return
				}
				var message strings.Builder
				for {
					part, readErr := reader.ReadString('\n')
					if readErr != nil {
						serverError <- readErr
						return
					}
					if part == ".\r\n" {
						break
					}
					message.WriteString(part)
				}
				data <- message.String()
				err = write("250 Accepted")
			case strings.HasPrefix(line, "QUIT"):
				err = write("221 Bye")
				serverError <- err
				return
			default:
				err = write("500 Unsupported")
			}
			if err != nil {
				serverError <- err
				return
			}
		}
	}()
	sender, err := NewSMTPSender(SMTPConfig{
		Address:             listener.Addr().String(),
		From:                "jira@fixture.test",
		AllowLocalPlaintext: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	id := uuid.New()
	email := Email{
		ID:      id,
		To:      "member@fixture.test",
		Subject: "عمل عربي · DEMO-2",
		Text:    "مرحبا\nDue today: DEMO-2\n",
	}
	if err = sender.Send(context.Background(), email); err != nil {
		t.Fatal(err)
	}
	if err = <-serverError; err != nil {
		t.Fatal(err)
	}
	message, err := mail.ReadMessage(strings.NewReader(<-data))
	if err != nil {
		t.Fatal(err)
	}
	if message.Header.Get("Message-ID") != "<"+id.String()+"@gategoldjira>" {
		t.Fatal("unstable delivery identity")
	}
	subject, err := (&mime.WordDecoder{}).DecodeHeader(message.Header.Get("Subject"))
	if err != nil || subject != email.Subject {
		t.Fatal("Arabic subject changed", err)
	}
	text, err := io.ReadAll(quotedprintable.NewReader(message.Body))
	if err != nil || strings.ReplaceAll(string(text), "\r\n", "\n") != email.Text {
		t.Fatal("Arabic body changed", err)
	}
}

func TestSMTPRejectsUntrustedPlaintextAndHeaderInjection(t *testing.T) {
	for _, config := range []SMTPConfig{
		{
			Address:             "smtp.example.test:25",
			From:                "jira@example.test",
			AllowLocalPlaintext: true,
		},
		{
			Address: "localhost:25",
			From:    "jira@example.test\r\nBcc: secret@example.test",
		},
		{
			Address:  "localhost:25",
			From:     "jira@example.test",
			Username: "user",
		},
	} {
		if _, err := NewSMTPSender(config); err == nil {
			t.Fatal("invalid SMTP configuration accepted")
		}
	}
	sender, err := NewSMTPSender(SMTPConfig{Address: "localhost:25", From: "jira@fixture.test", AllowLocalPlaintext: true})
	if err != nil {
		t.Fatal(err)
	}
	if err = sender.Send(context.Background(), Email{
		ID:      uuid.New(),
		To:      "member@fixture.test",
		Subject: "Title\r\nBcc: other@fixture.test",
		Text:    "Body",
	}); err == nil {
		t.Fatal("header injection accepted")
	}
}
