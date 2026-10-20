package notifications

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"mime"
	"mime/quotedprintable"
	"net"
	"net/mail"
	"net/smtp"
	"strconv"
	"strings"
	"time"
)

type SMTPConfig struct {
	Address  string
	From     string
	Username string
	Password string
	// Local sinks may use plaintext. Production STARTTLS is mandatory.
	AllowLocalPlaintext bool
}
type SMTPSender struct {
	config SMTPConfig
	host   string
}

func NewSMTPSender(config SMTPConfig) (*SMTPSender, error) {
	host, port, err := net.SplitHostPort(config.Address)
	numericPort, portErr := strconv.ParseUint(port, 10, 16)
	from, mailErr := mail.ParseAddress(config.From)
	if err != nil || host == "" || portErr != nil || numericPort == 0 || mailErr != nil || from.Address != config.From || strings.ContainsAny(config.Address+config.From+config.Username, "\r\n") {
		return nil, errors.New("invalid SMTP address or sender")
	}
	if (config.Username == "") != (config.Password == "") {
		return nil, errors.New("SMTP username and password must be configured together")
	}
	if config.AllowLocalPlaintext && host != "localhost" && host != "127.0.0.1" && host != "::1" {
		return nil, errors.New("plaintext SMTP is restricted to a local sink")
	}
	return &SMTPSender{config: config, host: host}, nil
}

func (s *SMTPSender) Send(ctx context.Context, email Email) error {
	to, err := mail.ParseAddress(email.To)
	if err != nil || to.Address != email.To || email.ID.String() == "00000000-0000-0000-0000-000000000000" || strings.ContainsAny(email.To+email.Subject, "\r\n") {
		return errors.New("invalid email envelope")
	}
	conn, err := (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, "tcp", s.config.Address)
	if err != nil {
		return errors.New("SMTP connection unavailable")
	}
	defer conn.Close()
	deadline := time.Now().Add(10 * time.Second)
	if requested, ok := ctx.Deadline(); ok && requested.Before(deadline) {
		deadline = requested
	}
	_ = conn.SetDeadline(deadline)
	client, err := smtp.NewClient(conn, s.host)
	if err != nil {
		return errors.New("SMTP handshake failed")
	}
	defer client.Close()
	if !s.config.AllowLocalPlaintext {
		if ok, _ := client.Extension("STARTTLS"); !ok {
			return errors.New("SMTP server requires STARTTLS support")
		}
		if err = client.StartTLS(&tls.Config{ServerName: s.host, MinVersion: tls.VersionTLS12}); err != nil {
			return errors.New("SMTP TLS handshake failed")
		}
	}
	if s.config.Username != "" {
		if err = client.Auth(smtp.PlainAuth("", s.config.Username, s.config.Password, s.host)); err != nil {
			return errors.New("SMTP authentication failed")
		}
	}
	if err = client.Mail(s.config.From); err != nil {
		return errors.New("SMTP sender rejected")
	}
	if err = client.Rcpt(email.To); err != nil {
		return errors.New("SMTP recipient rejected")
	}
	data, err := client.Data()
	if err != nil {
		return errors.New("SMTP message unavailable")
	}
	var payload bytes.Buffer
	fmt.Fprintf(&payload, "From: %s\r\nTo: %s\r\nSubject: %s\r\nMessage-ID: <%s@gategoldjira>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n", s.config.From, email.To, mime.QEncoding.Encode("UTF-8", email.Subject), email.ID.String())
	encoded := quotedprintable.NewWriter(&payload)
	if _, err = encoded.Write([]byte(email.Text)); err != nil {
		return err
	}
	if err = encoded.Close(); err != nil {
		return err
	}
	if _, err = data.Write(payload.Bytes()); err != nil {
		return errors.New("SMTP message not confirmed")
	}
	if err = data.Close(); err != nil {
		return errors.New("SMTP message not confirmed")
	}
	// DATA acceptance confirms receipt; a failing QUIT cannot turn acceptance
	// into a retry and cause an avoidable duplicate.
	_ = client.Quit()
	return nil
}
