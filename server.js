import app from './src/app.js';
import config from './src/config/index.js';

import { runMigrations } from './src/db/index.js';

const PORT = config.PORT;

const startServer = async () => {
  try {
    // Run database migrations before starting the server
    await runMigrations();

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

  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
