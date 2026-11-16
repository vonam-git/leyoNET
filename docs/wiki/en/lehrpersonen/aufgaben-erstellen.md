---
titel: Creating your own tasks
kurz: Put learning goals together in a form, let leyoNET suggest goals from a model solution and share the task as a file.
---
## The way to your own task

1. Build the starting network: empty, devices only or already partly configured.
2. On the left under “Task”, click **Create**. Enter title, description and difficulty.
3. **Add goals:** each goal is a check block with a text, e.g. “PC 1 reaches 192.168.2.10 by ping”, “web page contains timetable”, “router has the address 10.0.0.1”, “area documents the network correctly”. leyoNET suggests a text.
4. Optionally add a **hint** per goal and **points** (for exams).
5. Save: the task is stored in the project file. Share this file.

It is quicker with a **model solution**: build the finished network and choose “Suggest goals from this network” in the task editor. leyoNET creates goals for devices, addresses, gateways, DHCP, DNS, areas and connections. Delete what does not fit and weight the rest.

With an **AI** (web version only, after signing in with the admin password): Tools → Tasks with AI creates instructions with all rules, the schema of the checks and the open task as an example. Paste the AI's reply (JSON in the format “leyonet-ki-aufgabe”) back; leyoNET builds the start network and the task from it and rejects anything faulty with the exact place. Check every AI task by solving it once yourself.

## Check blocks (selection)

| Block | checks |
|---|---|
| Ping | a device reaches a target (name or address) |
| Web page | a device fetches a page, optionally containing a text |
| Address, gateway, DNS | configuration of a device |
| DHCP | devices got their address via DHCP |
| Area | network, mask, hosts in the area and in the note |
| Costs | total below a budget |
| Answer | a question with free text or multiple choice |
| Manual | the teacher awards points during manual correction |

All blocks with their fields are described in the documentation [tasks](https://github.com/vonam-git/leyoNET/blob/main/docs/aufgaben.md) (in German).

> Because every goal is checked in the simulation, only what really works counts. A wrong gateway shows up in the ping, not only when marking.
