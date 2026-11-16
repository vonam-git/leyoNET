---
titel: HTTP
kurz: How the browser fetches a web page: URL, DNS, TCP connection, GET request, status code and response – byte by byte.
---
## Fetching a page

The address `http://www.schule.example/stundenplan.html` consists of scheme (`http`), host name and path. The browser:

1. asks [[dns]] for the address of `www.schule.example`,
2. opens a [[tcp]] connection to port 80,
3. sends a **request**,
4. receives the **response** with status code and content and displays it.

```
GET /stundenplan.html HTTP/1.1
Host: www.schule.example

HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 412

<h1>Timetable</h1>…
```

![Browser fetches a page: DNS, TCP connection, HTTP](web)

## Status codes

| Code | Meaning |
|---|---|
| 200 OK | all fine |
| 301 / 302 | moved, the new address follows |
| 404 Not Found | the page does not exist |
| 500 | error on the server |

`Content-Length` counts **bytes**, not characters: a “ü” needs two bytes in UTF-8.

## In leyoNET

A server becomes a web server under Advanced → Services; the pages are your own HTML, also with small images. The browser on the desktop shows every step (DNS, TCP, GET, response) and the page; links in it trigger new simulated requests. HTTPS with real encryption is not available.
