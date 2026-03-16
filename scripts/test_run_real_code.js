const runTest = async () => {
  const baseUrl = 'http://localhost:3000';
  
  try {
    console.log('🚀 TESTING REAL CODE EXECUTION\n');

    // 1. Create a session with real code (Javascript)
    console.log('Step 1: Creating session (Javascript)...');
    const sessionRes = await fetch(`${baseUrl}/code-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'javascript',
        source_code: `
          const start = Date.now();
          console.log("Hello from Sandbox!");
          console.log("Calculated 2 + 2 =", 2 + 2);
          console.log("Environment check:", process.version);
        `
      })
    }).then(r => r.json());
    
    const sessionId = sessionRes.data.id;
    console.log('✅ Session ID:', sessionId);

    // 2. Trigger execution
    console.log('\nStep 2: Triggering execution...');
    const executionRes = await fetch(`${baseUrl}/executions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    }).then(r => r.json());
    
    const executionId = executionRes.data.id;
    console.log('✅ Execution ID:', executionId);
    console.log('Status: QUEUED (Waiting for worker...)');

    // 3. Polling for result
    console.log('\nStep 3: Polling for results (max 10s)...');
    let attempts = 0;
    while (attempts < 10) {
      await new Promise(r => setTimeout(r, 1000));
      const getRes = await fetch(`${baseUrl}/executions/${executionId}`).then(r => r.json());
      const status = getRes.data.status;

      console.log(`[${new Date().toLocaleTimeString()}] Attempt ${attempts + 1}: Status = ${status}`);

      if (['COMPLETED', 'FAILED', 'TIMEOUT'].includes(status)) {
        console.log('\n--- FINAL RESULT ---');
        console.log('Status:', status);
        console.log('STDOUT:\n', getRes.data.stdout);
        if (getRes.data.stderr) console.log('STDERR:\n', getRes.data.stderr);
        console.log('Execution Time:', getRes.data.execution_time_ms, 'ms');
        break;
      }
      attempts++;
    }

    // 4. Test Python
    console.log('\n\nStep 4: Testing Python code...');
    const pySession = await fetch(`${baseUrl}/code-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'python',
        source_code: 'import sys\nprint("Hello from Python!")\nprint(f"Python version: {sys.version}")'
      })
    }).then(r => r.json());
    
    const pyExec = await fetch(`${baseUrl}/executions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: pySession.data.id })
    }).then(r => r.json());

    await new Promise(r => setTimeout(r, 2000)); // Wait for worker
    const pyResult = await fetch(`${baseUrl}/executions/${pyExec.data.id}`).then(r => r.json());
    console.log('Python Output:\n', pyResult.data.stdout);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
};

runTest();
