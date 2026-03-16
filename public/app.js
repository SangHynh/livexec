// State Management
let editor;
let currentSessionId = null;
let isExecuting = false;
let requestStartTime = 0;

// Config
const API_BASE = window.location.origin;

// Initialize Monaco Editor
require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.41.0/min/vs' } });

require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('monaco-editor'), {
        value: 'console.log("Hello LIVEXEC!");\n\n// Gõ code của bạn ở đây...',
        language: 'javascript',
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 14,
        fontFamily: 'JetBrains Mono',
        minimap: { enabled: false },
        padding: { top: 16 },
        lineNumbersMinChars: 3,
        scrollBeyondLastLine: false,
    });

    // Auto-create session on load
    createSession();
});

// Create a new code session
async function createSession() {
    try {
        const lang = document.getElementById('language-select').value;
        const response = await fetch(`${API_BASE}/code-sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: lang, source_code: '' })
        });
        const result = await response.json();
        currentSessionId = result.data.id;
        console.log('Session Created:', currentSessionId);
    } catch (error) {
        logSystem('Error creating session: ' + error.message, true);
    }
}

// Run Code Logic
document.getElementById('run-btn').addEventListener('click', async () => {
    if (isExecuting || !currentSessionId) return;

    requestStartTime = Date.now();
    const sourceCode = editor.getValue();
    const language = document.getElementById('language-select').value;

    setUIState('RUNNING');
    clearConsole();
    logSystem(`Preparing ${language} execution...`);

    try {
        // 1. Update session with latest code
        await fetch(`${API_BASE}/code-sessions/${currentSessionId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_code: sourceCode, language: language })
        });

        // 2. Trigger execution
        const execResponse = await fetch(`${API_BASE}/code-sessions/${currentSessionId}/run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const execResult = await execResponse.json();
        const executionId = execResult.data.id;

        logSystem('Execution queued. Waiting for worker...');
        
        // 3. Start Polling
        pollExecutionResult(executionId);

    } catch (error) {
        logSystem('Execution error: ' + error.message, true);
        setUIState('IDLE');
    }
});

// Polling Logic
async function pollExecutionResult(executionId) {
    const pollInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/executions/${executionId}`);
            const result = await response.json();
            const data = result.data;

            if (data.status === 'RUNNING') {
                logSystem('Code is running in sandbox...');
                updateBadge('running', 'RUNNING');
            }

            if (['COMPLETED', 'FAILED', 'TIMEOUT'].includes(data.status)) {
                clearInterval(pollInterval);
                const latency = Date.now() - requestStartTime;
                displayResult(data, latency);
                setUIState('IDLE');
            }
        } catch (error) {
            clearInterval(pollInterval);
            logSystem('Polling error: ' + error.message, true);
            setUIState('IDLE');
        }
    }, 1000);
}

// UI Utilities
function displayResult(data, latency) {
    clearConsole();
    const stdout = document.getElementById('stdout');
    const stderr = document.getElementById('stderr');
    const meta = document.getElementById('execution-meta');
    
    stdout.textContent = data.stdout || '';
    stderr.textContent = data.stderr || '';
    
    document.getElementById('time-val').textContent = (data.execution_time_ms || 0) + 'ms';
    document.getElementById('latency-val').textContent = (latency || 0) + 'ms';
    updateBadge(data.status.toLowerCase(), data.status);
    meta.classList.remove('hidden');

    if (!data.stdout && !data.stderr) {
        logSystem('Execution finished with no output.');
    }
}

function setUIState(state) {
    const btn = document.getElementById('run-btn');
    if (state === 'RUNNING') {
        isExecuting = true;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Running...</span>';
    } else {
        isExecuting = false;
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-play"></i> <span>Run Code</span>';
    }
}

function updateBadge(type, text) {
    const badge = document.getElementById('status-badge');
    badge.className = 'badge ' + type;
    badge.textContent = text;
}

function logSystem(msg, isError = false) {
    const log = document.getElementById('system-log');
    log.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    if (isError) log.style.color = 'var(--error)';
    else log.style.color = 'var(--text-secondary)';
}

function clearConsole() {
    document.getElementById('stdout').textContent = '';
    document.getElementById('stderr').textContent = '';
    document.getElementById('system-log').textContent = '';
    document.getElementById('execution-meta').classList.add('hidden');
}

// Handle language change
document.getElementById('language-select').addEventListener('change', (e) => {
    const lang = e.target.value;
    if (editor) {
        monaco.editor.setModelLanguage(editor.getModel(), lang);
        const defaultValue = lang === 'javascript' ? 'console.log("Hello LIVEXEC!");' : 'print("Hello from Python!")';
        editor.setValue(defaultValue);
    }
    createSession(); // Create fresh session for new language
});
