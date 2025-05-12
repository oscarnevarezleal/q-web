document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const setupPanel = document.getElementById('setup-panel');
  const terminalPanel = document.getElementById('terminal-panel');
  const startBtn = document.getElementById('start-btn');
  const terminateBtn = document.getElementById('terminate-btn');
  const terminalElement = document.getElementById('terminal');
  const statusBar = document.getElementById('status-bar');
  const logoutBtn = document.getElementById('logout-btn');
  const usernameDisplay = document.getElementById('username-display');

  // Check authentication before initializing
  checkAuthentication()
    .then(isAuthenticated => {
      if (!isAuthenticated && !window.location.pathname.includes('/login')) {
        // Redirect to login if not authenticated
        window.location.href = '/login';
        return;
      }
      
      // Only initialize the app if authenticated or on login page
      if (isAuthenticated) {
        initializeApp();
      }
    })
    .catch(error => {
      console.error('Authentication check failed:', error);
      // Redirect to login on error
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    });

  // Check if user is authenticated
  function checkAuthentication() {
    return fetch('/api/user')
      .then(response => {
        if (response.ok) {
          return response.json().then(data => !!data.username);
        }
        return false;
      })
      .catch(() => false);
  }

  // Initialize the application
  function initializeApp() {
    // Socket.io connection
    const socket = io();

    // XTerm.js setup
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#f0f0f0'
      },
      allowProposedApi: true
    });

    const fitAddon = new FitAddon.FitAddon();
    const webLinksAddon = new WebLinksAddon.WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    let terminalInitialized = false;
    let currentLine = '';
    let cursorPosition = 0;

    // Display username from cookie or session
    function displayUsername() {
      fetch('/api/user')
        .then(response => response.json())
        .then(data => {
          if (data.username) {
            usernameDisplay.textContent = `Logged in as: ${data.username}`;
          }
        })
        .catch(error => {
          console.error('Error fetching user info:', error);
        });
    }

    // Initialize terminal
    function initTerminal() {
      if (!terminalInitialized) {
        term.open(terminalElement);
        
        // Clear the terminal to ensure it's empty
        term.clear();
        
        // Write a test message to verify terminal is working
        term.write('Terminal initialized. Starting session...\r\n');
        
        // Set up direct input handling
        term.onKey(({ key, domEvent }) => {
          const printable = !domEvent.altKey && !domEvent.ctrlKey && !domEvent.metaKey;
          
          // Handle special keys
          if (domEvent.keyCode === 13) { // Enter key
            // Send the current line to the server
            if (currentLine.trim()) {
              socket.emit('terminal-input', currentLine + '\r\n');
              console.log('Sending terminal input:', currentLine);
            }
            currentLine = '';
            cursorPosition = 0;
          } else if (domEvent.keyCode === 8) { // Backspace
            // Handle backspace
            if (cursorPosition > 0) {
              currentLine = currentLine.substring(0, cursorPosition - 1) + currentLine.substring(cursorPosition);
              cursorPosition--;
              
              // Move cursor back and clear to end of line
              term.write('\b \b');
            }
          } else if (domEvent.keyCode === 27) { // Escape key
            // Send escape character
            socket.emit('terminal-input', '\x1B');
            console.log('Sending ESC key');
          } else if (domEvent.ctrlKey && key.length === 1) {
            // Handle Ctrl+key combinations
            const ctrlChar = String.fromCharCode(key.charCodeAt(0) - 64); // Convert to control character
            socket.emit('terminal-input', ctrlChar);
            console.log('Sending Ctrl+' + key + ' (' + ctrlChar.charCodeAt(0) + ')');
          } else if (printable) {
            // Add printable characters to the current line
            currentLine = currentLine.substring(0, cursorPosition) + key + currentLine.substring(cursorPosition);
            cursorPosition++;
            
            // Echo the character
            term.write(key);
          }
        });
        
        terminalInitialized = true;
      }

      // Make sure to fit the terminal to its container
      setTimeout(() => {
        fitAddon.fit();
        
        // Notify server of terminal size
        socket.emit('resize-terminal', {
          cols: term.cols,
          rows: term.rows
        });
        
        console.log('Terminal size:', term.cols, 'x', term.rows);
      }, 100);
    }

    // Start a new terminal session
    function startSession() {
      // Send start session request with default worker (q)
      socket.emit('start-session', {
        workers: ['q'],
        rounds: 1
      });

      updateStatus('Starting terminal session...');
    }

    // Update the status bar
    function updateStatus(message, type = 'info') {
      statusBar.textContent = message;
      statusBar.className = 'status-bar ' + type;
    }

    // Terminate the current session
    function terminateSession() {
      if (confirm('Are you sure you want to terminate the current session?')) {
        socket.emit('terminate-session');
        updateStatus('Terminating session...');
      }
    }

    // Switch to terminal view
    function showTerminalView() {
      setupPanel.style.display = 'none';
      terminalPanel.style.display = 'flex';
      initTerminal();

      // Handle terminal resize
      const resizeObserver = new ResizeObserver(() => {
        if (terminalInitialized) {
          fitAddon.fit();
          socket.emit('resize-terminal', {
            cols: term.cols,
            rows: term.rows
          });
        }
      });

      resizeObserver.observe(terminalElement);
      
      // Focus the terminal
      term.focus();
    }

    // Switch to setup view
    function showSetupView() {
      terminalPanel.style.display = 'none';
      setupPanel.style.display = 'flex';
      term.clear();
    }

    // Handle logout
    function logout() {
      fetch('/logout', { method: 'POST' })
        .then(() => {
          window.location.href = '/login';
        })
        .catch(error => {
          console.error('Error logging out:', error);
        });
    }

    // Socket event handlers
    socket.on('connect', () => {
      updateStatus('Connected to server');
      displayUsername();
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      updateStatus('Connection error - authentication may have failed', 'error');
      
      // Redirect to login if authentication failed
      setTimeout(() => {
        window.location.href = '/login';
      }, 2000);
    });

    socket.on('disconnect', () => {
      updateStatus('Disconnected from server', 'error');
      showSetupView();
    });

    socket.on('error', (data) => {
      updateStatus(`Error: ${data.message}`, 'error');
    });

    socket.on('session-started', (data) => {
      updateStatus(`Session started with ID: ${data.id}`);
      showTerminalView();
    });

    socket.on('session-ended', (data) => {
      const message = data.message || `Session ended with exit code ${data.exitCode}`;
      updateStatus(message);
      setTimeout(() => {
        showSetupView();
      }, 2000);
    });

    socket.on('terminal-output', (data) => {
      console.log('Received terminal output:', data);
      
      // Make sure we have valid data
      if (data && typeof data === 'string') {
        try {
          // Ensure the terminal is initialized
          if (!terminalInitialized) {
            initTerminal();
          }
          
          // Write the data to the terminal
          term.write(data);
        } catch (error) {
          console.error('Error writing to terminal:', error);
        }
      } else {
        console.warn('Received invalid terminal data:', data);
      }
    });

    // Event listeners
    startBtn.addEventListener('click', startSession);
    terminateBtn.addEventListener('click', terminateSession);
    logoutBtn.addEventListener('click', logout);

    // Handle window resize
    window.addEventListener('resize', () => {
      if (terminalInitialized && terminalPanel.style.display !== 'none') {
        fitAddon.fit();
        socket.emit('resize-terminal', {
          cols: term.cols,
          rows: term.rows
        });
      }
    });

    // Initialize the application
    updateStatus('Ready to start a terminal session');
  }
});
