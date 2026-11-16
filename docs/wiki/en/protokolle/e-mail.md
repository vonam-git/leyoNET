---
titel: E-mail: SMTP, POP3 and IMAP
kurz: How a mail travels from the sender via mail servers and MX records into the mailbox, and how it is fetched.
---
## The path of a mail

1. Anna writes to `ben@schule.example` in her mail program and sends via **SMTP** (port 25) to her mail server.
2. If Ben is on another server, Anna’s server asks DNS for the **MX record** of `schule.example` and delivers the mail there via SMTP.
3. The mail lies in Ben’s mailbox.
4. Ben fetches it: via **POP3** (port 110, the mail is downloaded and deleted) or via **IMAP** (port 143, the mail stays on the server, several devices see the same state).

## The SMTP dialogue

```
S: 220 mail.schule.example
C: HELO pc1
S: 250 OK
C: MAIL FROM:<anna@schule.example>
C: RCPT TO:<ben@schule.example>
C: DATA
C: Subject: Hello
C: …
C: .
S: 250 OK
C: QUIT
```

Every reply starts with a three-digit code: 2xx means success, 5xx a permanent error.

## In leyoNET

A server becomes a mail server with domain and mailboxes under Advanced → Services. The mail program on the desktop shows the whole protocol dialogue; in the packet list “Follow TCP stream” reads it line by line.
