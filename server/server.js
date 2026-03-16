import app from './src/app.js';
import config from './src/config/index.js';

const PORT = config.PORT;

const server = app.listen(PORT, () => {
  console.log(`Running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down...');
  server.close(() => {
    console.log('Closed');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
