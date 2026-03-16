import express from 'express';
import cors from 'cors';

import routes from './api/routes/index.js';
import errorMiddleware from './api/middlewares/error.middleware.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/', routes);

// Error handling middleware
app.use(errorMiddleware);

export default app;
