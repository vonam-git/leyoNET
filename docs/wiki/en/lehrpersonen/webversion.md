---
titel: Web version: sessions, classes and watching
kurz: Work saved under a code, class sessions, watching work live, the admin console at /admin with statistics and two-factor sign-in.
---
## Sessions instead of accounts

In the web version ([app.leyonet.ch](https://app.leyonet.ch) or on the school server) leyoNET saves the work under a **session code** such as `K7QX-3MPA`. Whoever knows the code continues on another device. Only the network configuration is stored, no names; after a configurable time the session is deleted.

## Classes

In the **admin console** you open a class with a label such as “INF22a” and show the **class code** on the projector with “Show code large”. Learners choose the **Join a class** button under “Session”. You then see all sessions of the class; the list refreshes by itself:

- **Progress**: goals met in the loaded task, checked by the learner's browser by itself (nobody needs to submit). Orange: at least half, green: all met.
- **Ask for help**: learners press “🙋 Ask for help”, the row turns magenta; “Help done” acknowledges it.
- **Identify**: the session's screen flashes red and shows seat and code, so you can see who is sitting at which session.
- **View**: read-only, reloaded every 5 seconds, the goals checked green or red right away. Useful for troubleshooting with the class on the projector.
- **Open**: you edit the session yourself. The changes go straight to the learners, who can only watch meanwhile.

“End” brings back your own project.

For each class you show or hide exercises and whole modules and enable the [[klassen-verbund]].

## The admin console

The admin console is a page of its own: **`/admin`** (e.g. `https://app.leyonet.ch/admin`). “Admin” or Alt+A in the simulator opens it in its own tab that can stay open next to the lesson. The sections are on the left; the **overview** shows running exams, classes, active sessions and the security state. While an exam is running, a red bar at the top shows progress and time left.

**Sessions and statistics** lists all active sessions with key figures; each can be watched live, opened in the editor, extended or deleted. Only technical data is stored and shown.

## Two-factor sign-in

Under **Security** you set up an authenticator app (e.g. Aegis, 2FAS, Google or Microsoft Authenticator): scan the QR code, confirm a code, keep the eight recovery codes safe. From then on signing in needs the password or key **and** the code from the app. The app computes only on the phone; leyoNET knows neither phone number nor e-mail. The main admin can require two-factor for all access keys.

## Own access keys

If several teachers or schools work on the same instance, the main admin creates **access keys**: a label (without personal names) and a key `LN-…` that is shown only once. Each access key only sees its own classes and exams, a school also those of its teachers.

Setting up your own server: [Plesk](https://github.com/vonam-git/leyoNET/blob/main/docs/plesk.md) or [installation with Docker](https://github.com/vonam-git/leyoNET/blob/main/docs/installation.md) (in German).
