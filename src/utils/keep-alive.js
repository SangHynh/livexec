import https from 'https';
import http from 'http';
import config from '../config/index.js';

/**
 * Ping the application's own URL to keep it alive on platforms like Render.
 */
const keepAlive = () => {
  const url = config.APP_URL;

  if (!url) {
    console.log('⚠️ Keep-alive: APP_URL is not set. Skipping ping.');
    return;
  }

  const interval = config.KEEP_ALIVE_INTERVAL_MS;
  const protocol = url.startsWith('https') ? https : http;

  console.log(
    `📡 Keep-alive started: pinging ${url} every ${interval / 60000} minutes`
  );

  setInterval(() => {
    protocol
      .get(url, (res) => {
        console.log(
          `🛰️ Ping success: ${res.statusCode} at ${new Date().toISOString()}`
        );
      })
      .on('error', (err) => {
        console.error(
          `❌ Ping failed: ${err.message} at ${new Date().toISOString()}`
        );
      });
  }, interval);
};

export default keepAlive;
