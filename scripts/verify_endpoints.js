const test = async () => {
  const baseUrl = 'http://localhost:3000';
  
  try {
    console.log('--- Testing /health ---');
    const health = await fetch(`${baseUrl}/health`).then(r => r.json());
    console.log('Health:', health);

    console.log('\n--- Testing POST /code-sessions ---');
    const sessionResponse = await fetch(`${baseUrl}/code-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'javascript',
        source_code: 'console.log("Hello from verification script")'
      })
    }).then(r => r.json());
    console.log('Session Created:', sessionResponse);
    const sessionId = sessionResponse.data.id;

    console.log('\n--- Testing GET /code-sessions/:id ---');
    const sessionGet = await fetch(`${baseUrl}/code-sessions/${sessionId}`).then(r => r.json());
    console.log('Session Get:', sessionGet);

    console.log('\n--- Testing PATCH /code-sessions/:id ---');
    const sessionUpdate = await fetch(`${baseUrl}/code-sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_code: 'console.log("Updated code")'
      })
    }).then(r => r.json());
    console.log('Session Updated:', sessionUpdate);

    console.log('\n--- Testing POST /executions ---');
    const executionResponse = await fetch(`${baseUrl}/executions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    }).then(r => r.json());
    console.log('Execution Created:', executionResponse);
    const executionId = executionResponse.data.id;

    console.log('\n--- Testing GET /executions/:id ---');
    const executionGet = await fetch(`${baseUrl}/executions/${executionId}`).then(r => r.json());
    console.log('Execution Get:', executionGet);

    console.log('\n--- Testing 404 Not Found ---');
    const notFound = await fetch(`${baseUrl}/non-existent`).then(r => r.json());
    console.log('404 Response:', notFound);

  } catch (error) {
    console.error('Verification failed:', error);
  }
};

test();
