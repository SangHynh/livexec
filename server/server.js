import app from './src/app.js';
import config from './src/config/index.js';

const PORT = config.PORT;

const server = app.listen(PORT, () => {
  console.log(`[SERVER] Running on port ${PORT}`);
  console.log(`[SERVER] Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('[SERVER] Shutting down...');
  server.close(() => {
    console.log('[SERVER] Closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
