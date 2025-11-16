window.addEventListener('load', () => {
    // Check if socket.io is loaded
    if (typeof io === 'undefined') {
        console.error('Socket.io library not loaded!');
        alert('Error: Could not connect to server. Please refresh.');
        return;
    }
    
    const socket = io('https://drawing-project-kzm2.onrender.com');

    // --- Canvas Setup ---
    const canvas = document.getElementById('drawingCanvas');
    const ctx = canvas.getContext('2d');
    const cursorCanvas = document.getElementById('cursorCanvas');
    const cursorCtx = cursorCanvas.getContext('2d');
    const userListDiv = document.getElementById('userList');

    // --- Tool Setup ---
    const colorPicker = document.getElementById('colorPicker');
    const strokeSlider = document.getElementById('strokeWidth');
    const brushBtn = document.getElementById('brushBtn');
    const eraserBtn = document.getElementById('eraserBtn');
    const clearBtn = document.getElementById('clearBtn');
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    // --- Canvas Dimensions ---
    canvas.width = cursorCanvas.width = 800;
    canvas.height = cursorCanvas.height = 600;

    // --- State Variables ---
    let isDrawing = false;
    let myId = null;
    let allUsers = {};
    let currentLine = null;
    
    // Store the user's "drawing" color
    let userColor = colorPicker.value; // Start with the default picker color
    let isEraserActive = false;
    
    // --- Drawing Functions ---
    function drawLineSegment(x0, y0, x1, y1, color, width) {
        if (!ctx) return; // Guard clause

        const originalColor = ctx.strokeStyle;
        const originalWidth = ctx.lineWidth;

        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();

        ctx.strokeStyle = originalColor;
        ctx.lineWidth = originalWidth;
    }
    
    function drawAction(action) {
        if (!action || !action.points) return; // Guard clause
        const { points, color, width } = action;
        
        for (let i = 1; i < points.length; i++) {
            if (!points[i-1] || !points[i]) continue; // Check for valid points
            const [lastX, lastY] = points[i-1];
            const [currentX, currentY] = points[i];
            drawLineSegment(lastX, lastY, currentX, currentY, color, width);
        }
    }

    // --- Cursor & UI Functions ---
    function drawCursors() {
        if (!cursorCtx) return; // Guard clause
        cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
        
        for (const id in allUsers) {
            if (id === myId) continue;
            
            const user = allUsers[id];
            if (!user || typeof user.x !== 'number' || typeof user.y !== 'number') continue; 

            // Draw a more advanced cursor
            cursorCtx.fillStyle = user.color || '#000000';
            cursorCtx.beginPath();
            cursorCtx.arc(user.x, user.y, 5, 0, Math.PI * 2);
            cursorCtx.fill();
            cursorCtx.strokeStyle = '#ffffff';
            cursorCtx.lineWidth = 2;
            cursorCtx.stroke();
            
            // Draw the username
            // cursorCtx.font = '14px Roboto';
            // cursorCtx.fillStyle = '#333';
            // cursorCtx.fillText(user.username || 'Guest', user.x + 10, user.y + 5);
        }
    }
    
    function updateUserListUI() {
        if (!userListDiv) return; // Guard clause
        userListDiv.innerHTML = '';
        
        for (const id in allUsers) {
            const user = allUsers[id];
            if (!user) continue;

            const userEl = document.createElement('div');
            userEl.className = 'user-item';
            
            const colorDot = document.createElement('span');
            colorDot.className = 'user-color-dot';
            colorDot.style.backgroundColor = user.color || '#000000';
            
            const userName = document.createTextNode(user.username || 'Guest');
            
            userEl.appendChild(colorDot);
            userEl.appendChild(userName);
            
            if (id === myId) {
                userEl.classList.add('you');
                const youText = document.createTextNode(' (You)');
                userEl.appendChild(youText);
            }
            
            userListDiv.appendChild(userEl);
        }
    }
    
    // Function to manage active tool state
    function setActiveTool(tool) {
        if (tool === 'brush') {
            isEraserActive = false;
            brushBtn.classList.add('active');
            eraserBtn.classList.remove('active');
        } else if (tool === 'eraser') {
            isEraserActive = true;
            brushBtn.classList.remove('active');
            eraserBtn.classList.add('active');
        }
    }

    // --- Event Handlers ---
    function startDrawing(e) {
        isDrawing = true;
        
        // Use the correct color based on the active tool
        let color = isEraserActive ? '#FFFFFF' : userColor; // Use 'userColor' memory
        
        currentLine = {
            points: [ [e.offsetX, e.offsetY] ],
            color: color,
            width: strokeSlider.value
        };
    }

    function stopDrawing() {
        if (!isDrawing) return;
        isDrawing = false;
        
        if (currentLine && currentLine.points.length > 1) {
            socket.emit('finish_action', currentLine);
        }
        currentLine = null;
    }

    function handleMouseMove(e) {
        const currentX = e.offsetX;
        const currentY = e.offsetY;

        // Always send cursor position
        socket.emit('cursor_move', { x: currentX, y: currentY });

        if (!isDrawing) return;
        
        if (!currentLine) return; // Guard clause

        const [lastX, lastY] = currentLine.points[currentLine.points.length - 1];
        
        // Draw locally
        drawLineSegment(lastX, lastY, currentX, currentY, currentLine.color, currentLine.width);

        // Send real-time data to server
        const drawData = {
            x0: lastX, y0: lastY,
            x1: currentX, y1: currentY,
            color: currentLine.color,
            width: currentLine.width
        };
        socket.emit('drawing', drawData);
        
        // Add to the line
        currentLine.points.push([currentX, currentY]);
    }

    // --- Local Event Listeners ---
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);
    canvas.addEventListener('mousemove', handleMouseMove);

    // --- Tool Listeners (Corrected) ---
    
    // **FIX:** Update userColor when the picker changes
    colorPicker.addEventListener('input', (e) => {
        userColor = e.target.value;
        setActiveTool('brush'); // Automatically switch to brush
    });

    brushBtn.addEventListener('click', () => {
        setActiveTool('brush');
    });

    eraserBtn.addEventListener('click', () => {
        setActiveTool('eraser');
    });

    clearBtn.addEventListener('click', () => {
        socket.emit('clear_canvas');
    });
    
    undoBtn.addEventListener('click', () => {
        socket.emit('undo');
    });
    
    redoBtn.addEventListener('click', () => {
        socket.emit('redo');
    });

    // --- Socket.io Event Listeners ---
    
    socket.on('connect', () => {
        myId = socket.id;
        console.log('Connected! My ID is ' + myId);
    });

    socket.on('connect_error', (err) => {
        console.error('Connection failed:', err.message);
        alert('Failed to connect to the server. Is it running?');
    });
    
    socket.on('update_users', (users) => {
        allUsers = users;
        updateUserListUI();
        drawCursors();
    });
    
    socket.on('cursor_update', (user) => {
        if (!user) return; // Guard clause
        if (user.id !== myId) {
            allUsers[user.id] = user;
            drawCursors();
        }
    });

    socket.on('drawing', (data) => {
        if (!data) return; // Guard clause
        drawLineSegment(data.x0, data.y0, data.x1, data.y1, data.color, data.width);
    });

    socket.on('clear_all', () => {
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    });
    
    socket.on('redraw_all', (history) => {
        if (!ctx || !history) return; // Guard clause

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        history.forEach(action => {
            drawAction(action);
        });
    });
});