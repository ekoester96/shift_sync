import './config/env';
import express from 'express';
import cors from 'cors';

import businessesRouter from './routes/businesses';
import employeesRouter from './routes/employees';
import shiftsRouter from './routes/shifts';
import ptoRequestsRouter from './routes/ptoRequests';
import shiftSwapsRouter from './routes/shiftSwaps';
import businessTypesRouter from './routes/businessTypes';
import signupRouter from './routes/signup';
import loginRouter from './routes/login';
import authRouter from './routes/auth';
import managerRouter from './routes/manager';
import employeeDashRouter from './routes/employeeDash';
import adminRouter from './routes/admin';
import opsAuthRoutes from "./routes/opsAuth";
import opsDataRoutes from "./routes/opsData";
import { opsAuth } from './middleware/opsAuth';
import notificationRouter from './routes/notifications';
import mlRouter from './routes/mlRoutes';
import opsMlRoutes from './routes/opsMl';

const app = express();
const PORT = 5000;
console.log('=== SERVER STARTING WITH DEBUG LOGGER ===');
app.use(cors());
app.use(express.json());

// Temporary debug — remove after fixing
app.use((req, res, next) => {
  console.log(`>>> [${req.method}] ${req.url}`);
  next();
});


app.use("/api/ops/auth", opsAuthRoutes);
app.use('/api/ops/ml', opsAuth, opsMlRoutes);
app.use("/api/ops", opsAuth, opsDataRoutes);
app.use('/api/business-types', businessTypesRouter);
app.use('/api/signup', signupRouter);
app.use('/api/businesses', businessesRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/shifts', shiftsRouter);
app.use('/api/pto-requests', ptoRequestsRouter);
app.use('/api/shift-swaps', shiftSwapsRouter);
app.use('/api/login', loginRouter);
app.use('/api/auth', authRouter);
app.use('/api/manager', managerRouter);
app.use('/api/employee', employeeDashRouter);
app.use('/api/admin', adminRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/ml', mlRouter);

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
