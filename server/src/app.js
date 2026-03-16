import express from 'express';
import cors from 'cors';

import errorMiddleware from './api/middlewares/error.middleware.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Placeholder for routes (PHASE 2)
app.use('/code-sessions', (req, res, next) => {
  res.status(501).json({ message: 'Not Implemented' });
});

app.use('/executions', (req, res, next) => {
  res.status(501).json({ message: 'Not Implemented' });
});

// Error handling middleware
app.use(errorMiddleware);

export default app;
