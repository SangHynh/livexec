import app from './src/app.js';
import config from './src/config/index.js';

import { runMigrations } from './src/db/index.js';

const PORT = config.PORT;

const startServer = async () => {
  try {
    // Run database migrations before starting the server
    await runMigrations();

    const server = app.listen(PORT, () => {
      console.log('---------------------------------------------------------');
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`🏥 Health: http://localhost:${PORT}/health`);
      console.log(`🔗 Live: http://localhost:${PORT}`);
      console.log('---------------------------------------------------------');
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
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
