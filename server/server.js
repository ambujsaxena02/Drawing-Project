const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = 3000;

const users = {};

// --- NEW HISTORY STACKS ---
let historyStack = []; // Stores all completed drawing actions
let redoStack = [];    // Stores actions that have been "undone"

function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

io.on('connection', (socket) => {
    console.log('A user connected! ID: ' + socket.id);

    users[socket.id] = {
        id: socket.id,
        username: 'Guest-' + socket.id.substring(0, 4),
        color: getRandomColor(),
        x: 0, y: 0
    };

    // 1. Send the full history *only to the new user*
    // This makes sure they get the drawing that already exists.
    socket.emit('redraw_all', historyStack);

    // 2. Tell everyone else about the new user
    io.emit('update_users', users);

    // --- Client Event Handlers ---

    // This is for REAL-TIME drawing (still needed)
    socket.on('drawing', (data) => {
        socket.broadcast.emit('drawing', data);
    });

    // This is for CURSOR movement (still needed)
    socket.on('cursor_move', (data) => {
        if (users[socket.id]) {
            users[socket.id].x = data.x;
            users[socket.id].y = data.y;
            socket.broadcast.emit('cursor_update', users[socket.id]);
        }
    });

    // --- NEW: When a user FINISHES a line (on mouseup) ---
    socket.on('finish_action', (action) => {
        // Add the completed action to the history
        historyStack.push(action);
        // Any new action clears the redo stack
        redoStack = [];
    });

    // --- NEW: Handle UNDO request ---
    socket.on('undo', () => {
        if (historyStack.length > 0) {
            // Move the last action from history to redo
            const actionToUndo = historyStack.pop();
            redoStack.push(actionToUndo);

            // Tell *everyone* to redraw the updated history
            io.emit('redraw_all', historyStack);
        }
    });

    // --- NEW: Handle REDO request ---
    socket.on('redo', () => {
        if (redoStack.length > 0) {
            // Move the last action from redo back to history
            const actionToRedo = redoStack.pop();
            historyStack.push(actionToRedo);

            // Tell *everyone* to redraw the updated history
            io.emit('redraw_all', historyStack);
        }
    });

    // --- MODIFIED: Clear Canvas ---
    socket.on('clear_canvas', () => {
        // Clear the history on the server
        historyStack = [];
        redoStack = [];
        // Tell everyone to clear
        io.emit('clear_all');
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected. ID: ' + socket.id);
        delete users[socket.id];
        io.emit('update_users', users);
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});