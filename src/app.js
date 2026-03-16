import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';

import router from './api/routes/index.js';
import errorMiddleware from './api/middlewares/error.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/', router);

// Error handling middleware
app.use(errorMiddleware);

export default app;
