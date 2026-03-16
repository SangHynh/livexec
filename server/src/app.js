import express from 'express';
import cors from 'cors';

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

// Error handling middleware (PHASE 2.5)
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: err.message || 'Something went wrong',
    },
  });
});

export default app;
