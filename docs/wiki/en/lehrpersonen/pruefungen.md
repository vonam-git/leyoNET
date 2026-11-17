---
titel: Running exams
kurz: Exam file and key, variants per seat, exam mode, Safe Exam Browser, web version with seat codes and automatic evaluation.
---
## Principle

An exam consists of two files: the **exam file** for the learners (task, starting network, points per part, without check blocks and solutions) and the **key** for you (all check blocks, solutions, code to end the exam). Evaluation uses the key.

## Creating an exam

- **Generator:** Tools → Create exam generates a company network with three sites, 84 points (21 per site, transit networks 9, network services 12), grade = 5 × points / 84 + 1. For the transit networks, the addresses count and whether the right routers are connected, not the port number. A separate variant per seat is possible.
- **Any task as an exam:** Tools → Save as exam, with an empty starting network, devices only, the current network or as **troubleshooting** with random faults per seat.
- **With an AI** (web version only, after signing in with the admin password): Tools → Tasks with AI creates instructions with rules, the schema of all checks and the open task as an example. You paste the AI's reply back; leyoNET checks it strictly and opens it in the task editor. Solve it once yourself, then save it as an exam. leyoNET sends nothing to an AI; do not give it personal data.
- **Fairer marking:** partial points, follow-on errors (gateway “a router in its own network”), questions directly in leyoNET, “manual” blocks.

## During the exam

Opening the exam file starts the **exam mode**: catalog, demos, task editor and opening other files are locked, a bar shows title, seat and time. It survives a reload and only ends with your code. For locked-down computers leyoNET generates a configuration for the **Safe Exam Browser**.

## In the web version

Upload exam file and key in the admin console (`/admin`), **enter the exam time** (required), **print exam sheets** (one page per seat with seat code, time, procedure and task) and hand them out, start. The cockpit shows the exit code on click. Work is saved every 20 seconds. With **“📤 Submit”** in the exam bar learners submit themselves: the seat is closed at once, the cockpit shows “submitted 10:42”, and learners get an empty canvas without a link to the submission. When time is up leyoNET submits automatically. While an exam is running, the admin console shows a red bar at the top with “working · submitted · seats” and the time left. The exam cockpit shows per seat whether it is connected, allows extra time (+5′, +15′) and live “watching”. At the end leyoNET evaluates all seats, with manual correction and a report.

Procedure, limits and what leyoNET can do against copying: [exams](https://github.com/vonam-git/leyoNET/blob/main/docs/pruefungen.md) (in German).
