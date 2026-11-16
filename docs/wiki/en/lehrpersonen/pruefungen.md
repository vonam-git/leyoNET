---
titel: Running exams
kurz: Exam file and key, variants per seat, exam mode, Safe Exam Browser, web version with seat codes and automatic evaluation.
---
## Principle

An exam consists of two files: the **exam file** for the learners (task, starting network, points per part, without check blocks and solutions) and the **key** for you (all check blocks, solutions, code to end the exam). Evaluation uses the key.

## Creating an exam

- **Generator:** Tools → Create exam generates a company network with three sites, 75 points, grade = 5 × points / 75 + 1. A separate variant per seat is possible.
- **Any task as an exam:** Tools → Save as exam, with an empty starting network, devices only, the current network or as **troubleshooting** with random faults per seat.
- **With an AI:** Tools → Tasks with AI creates instructions with rules, the schema of all checks and the open task as an example. You paste the AI's reply back; leyoNET checks it strictly and opens it in the task editor. Solve it once yourself, then save it as an exam. leyoNET sends nothing to an AI; do not give it personal data.
- **Fairer marking:** partial points, follow-on errors (gateway “a router in its own network”), questions directly in leyoNET, “manual” blocks.

## During the exam

Opening the exam file starts the **exam mode**: catalog, demos, task editor and opening other files are locked, a bar shows title, seat and time. It survives a reload and only ends with your code. For locked-down computers leyoNET generates a configuration for the **Safe Exam Browser**.

## In the web version

Upload exam file and key in the admin console, print seat cards with seat codes, start. Work is saved every 20 seconds; when time is up it is handed in automatically. The exam cockpit shows per seat whether it is connected, allows extra time (+5′, +15′) and live “watching”. At the end leyoNET evaluates all seats, with manual correction and a report.

Procedure, limits and what leyoNET can do against copying: [exams](https://github.com/vonam-git/leyoNET/blob/main/docs/pruefungen.md) (in German).
