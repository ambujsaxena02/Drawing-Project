# Collaborative Canvas

This is a real-time, multi-user drawing application built for the Flam placement task. It allows multiple users to draw on a single canvas simultaneously, with all actions, cursors, and user statuses synced live.



## 🌟 Features

* **Real-time Drawing:** Draw with a brush, select custom colors, and adjust stroke width.
* **Multi-User Sync:** See other users' drawings appear on your screen as they draw.
* **User Indicators:** View other users' cursors moving in real-time.
* **User Management:** See a live list of all users currently in the application.
* **Global Undo/Redo:** A server-authoritative undo/redo system that works for all users.
* **Global Clear:** A "Clear All" button that syncs across all clients.
* **Eraser Tool:** An eraser for correcting mistakes.

## 💻 Tech Stack

* **Frontend:** Vanilla JavaScript (ES6+), HTML5 Canvas, CSS3
* **Backend:** Node.js, Express
* **Real-time Communication:** Socket.io (WebSockets)

## 🚀 Setup and Running the Project

### Prerequisites

* Node.js (v14 or higher)
* npm (Node Package Manager)

### 1. Install Dependencies

Navigate to the `server` folder (or your project's root) where `package.json` is located and install the required Node.js packages:

```bash
npm install
```

### 2. Deployment link : https://drawing-project-1-a7n9.onrender.com
