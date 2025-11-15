# Architecture Documentation: Collaborative Canvas

This document outlines the system architecture, data flow, and technical decisions made for the real-time collaborative drawing application.

---

## 1. Data Flow Diagram

Due to the real-time nature of this application, the data flow is event-driven. We can break the flow into two main types:

### A. Live Drawing & Cursor Flow

This flow describes the "fast" channel, used for events that happen many times per second (like mouse movement). Its goal is to feel responsive.

1.  **User A** moves their mouse on the canvas.
2.  The **Frontend (`main.js`)** captures the `mousemove` event.
3.  Two events are emitted to the server via Socket.io:
    * `socket.emit('cursor_move', {x, y})`: Sends the new cursor position.
    * `socket.emit('drawing', {x0, y0, x1, y1, ...})`: If the user is drawing, it sends just the tiny line *segment* they just drew.
4.  The **Node.js Server (`server.js`)** receives these events.
5.  The server immediately broadcasts these events to *all other clients*:
    * `socket.broadcast.emit('cursor_update', {user, x, y})`
    * `socket.broadcast.emit('drawing', {x0, y0, ...})`
6.  **User B's Frontend** receives these events via `socket.on(...)`.
7.  The app draws the line segment from User A onto **User B's canvas** and moves User A's cursor icon, creating the real-time effect.

### B. Global History & Undo/Redo Flow

This is the "slow" channel, used for actions that change the *permanent state* of the canvas. This flow is the **single source of truth**.

1.  **User A** finishes drawing a line and releases the mouse (`mouseup`).
2.  The **Frontend (`main.js`)** bundles all the points from that single line into one "action" object.
3.  It emits one event to the server: `socket.emit('finish_action', {action})`.
4.  The **Server** receives this action and pushes it onto a global `historyStack` array.

**When a User Clicks "Undo":**
1.  **User B** clicks the "Undo" button.
2.  The **Frontend** sends `socket.emit('undo')`.
3.  The **Server** receives the `undo` event. It `pop()`s the last action from the `historyStack` and `push()`es it to the `redoStack`.
4.  The server then emits a *new* event to **ALL CLIENTS** (including the sender): `io.emit('redraw_all', historyStack)`.
5.  **Every client** (User A and User B) receives the `redraw_all` event. They **completely clear their canvas** and redraw every single action from the new `historyStack` provided by the server.

This "clear and redraw" method guarantees that all clients are perfectly in sync and their state matches the server's, even if they missed a live `drawing` event.

---

## 2. WebSocket Protocol

The client and server communicate using a custom protocol of Socket.io events.

| Direction | Event Name | Data | Description |
| :--- | :--- | :--- | :--- |
| **C → S** | `cursor_move` | `{x, y}` | Sent on `mousemove` to update the user's cursor position. |
| **C → S** | `drawing` | `{x0, y0, x1, y1, color, width}` | Sent on `mousemove` while drawing a *live segment*. |
| **C → S** | `finish_action`| `{action}` | Sent on `mouseup` with the *full* line to be saved to history. |
| **C → S** | `undo` | (none) | Sent to request a global undo. |
| **C → S** | `redo` | (none) | Sent to request a global redo. |
| **C → S** | `clear_canvas` | (none) | Sent to request a global clear. |
| | | | |
| **S → C** | `update_users` | `{users}` | Sent to *all* clients when someone joins/leaves. |
| **S → C** | `cursor_update` | `{user}` | Broadcast to *others* to show a user's cursor movement. |
| **S → C** | `drawing` | `{data}` | Broadcast to *others* to show a *live segment* being drawn. |
| **S → C** | `redraw_all` | `[historyStack]` | Sent to *all* clients after an undo/redo. This is the new "source of truth". |
| **S → C** | `clear_all` | (none) | Sent to *all* clients to clear the canvas and server history. |

---

## 3. Undo/Redo Strategy

The global undo/redo functionality is the most complex part of this application.

* **Problem:** A client-side undo (`Ctrl+Z`) is insufficient. If User A draws, then User B draws, User A's "undo" must remove User B's line (the last *global* action), not their own.
* **Solution:** A **Server-Authoritative History Stack**.
    1.  The server maintains two arrays: `historyStack` (for all "done" actions) and `redoStack` (for all "undone" actions).
    2.  Clients only send *completed* drawing actions to the server (on `mouseup`) via `finish_action`.
    3.  When a client sends an `undo` event, the **server** is the only one who modifies these stacks. It moves one action from `historyStack` to `redoStack`.
    4.  The server then broadcasts the *entire, modified* `historyStack` to all clients via `redraw_all`.
    5.  All clients, upon receiving `redraw_all`, **must** clear their canvas and redraw it from scratch using the provided history.

* **Trade-off:** This is the most robust way to guarantee consistency. The trade-off is that it can be inefficient for a canvas with thousands of actions, as it requires a full redraw. This leads to our performance decisions.

---

## 4. Performance Decisions

Several key decisions were made to balance responsiveness with consistency.

* **Dual-Channel Drawing:** We send *both* `drawing` events (live, ephemeral) and `finish_action` events (history, permanent). This gives the *feel* of instant drawing (from the `drawing` event) while using the `finish_action` and `redraw_all` events as the slower, more reliable "truth." This is faster than triggering a `redraw_all` on every single pixel.
* **Stacked Canvases:** We use two separate, stacked `<canvas>` elements.
    1.  `#drawingCanvas` (bottom, z-index 1): The main drawing is here.
    2.  `#cursorCanvas` (top, z-index 2, transparent): Cursors are drawn here.
    * **Why?** Cursor positions update on *every* mouse movement. It would be extremely inefficient to clear and redraw the *entire* drawing canvas just to move a cursor. By separating them, we only clear the small, simple cursor canvas, which is vastly more performant.
* **Client-Side "Optimistic" Drawing:** When you draw, the line appears on your *own* screen instantly, even before the server confirms it. We send the data to the server, but we don't wait for a response. This makes the app feel fast and is a standard technique called "optimistic updates."

---

## 5. Conflict Resolution

* **Problem:** What happens if two users finish drawing at the exact same millisecond? Or if one user clicks "Undo" at the same time another user finishes drawing?
* **Strategy: "Last Write Wins" (Implicitly)**
* **Resolution:** We did not need to write complex conflict resolution logic (like CRDTs). The **Node.js/Socket.io** event loop handles this for us. Node.js is single-threaded, meaning it can only process *one event at a time*.
* **Example:** If `undo` from User A and `finish_action` from User B arrive "at the same time," the Node.js server will arbitrarily pick one to process first from its event queue.
    * If it processes `undo` first: It removes the last item, then processes `finish_action` and adds the new item.
    * If it processes `finish_action` first: It adds the new item, then processes `undo` and removes that *same* new item.
* In all cases, the server's state remains consistent and is simply "Last Write Wins." This is a deliberate and simple solution that is highly effective for this application's scale.