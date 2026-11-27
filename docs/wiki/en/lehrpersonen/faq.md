---
titel: Frequently asked questions
kurz: Privacy, internet access, saving, devices in the classroom and what leyoNET deliberately cannot do.
---
## Privacy and operation

**Do learners need an account?** No. The web version only uses session codes, and only the network configuration is stored. There are no cookies, no tracking and no external resources.

**May the school use leyoNET?** leyoNET is designed for the Swiss Data Protection Act and the GDPR. For the assessment at a school there is an [ISDS concept](https://github.com/vonam-git/leyoNET/blob/main/docs/isds-konzept.md) and a [DPIA assessment](https://github.com/vonam-git/leyoNET/blob/main/docs/dsfa-abklaerung.md) (both in German).

**Does it work without internet?** Yes. The single file `leyonet.html` runs offline, even from a USB stick; it technically cannot open a connection.

## In the classroom

**Where is work saved?** In the single file and the desktop version, in the browser or program of the device; additionally as a project file (Ctrl+S). In the web version under the session code.

**Which devices?** Any current browser on Windows, macOS, Linux or Chromebook. Tablets work for watching; for building, mouse and keyboard are more comfortable.

**How do I present something?** File → Demo networks → “Present”, many demos with a tour. Or run any demo network as a [showcase](https://app.leyonet.ch/?schaufenster) on the projector.

## Limits

**Does it replace real devices?** No, it complements them. leyoNET shows what happens in the packets, which is rarely visible in the rack. Operating real devices (console, firmware, cabling) remains a lesson of its own.

**What is deliberately missing?** HTTPS/TLS with real encryption, multicast routing, MSTP, HSRP (VRRP, the open standard, is included) and bit errors on the line. How each protocol is simplified is listed on every protocol page under “What leyoNET simplifies”.
