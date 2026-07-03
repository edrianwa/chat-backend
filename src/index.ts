import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { config } from "./config";
import { applySecurity, authRateLimit } from "./middleware/security.middleware";
import { healthRouter } from "./routes/health";
import { authRouter } from "./routes/auth";
import { adminRouter } from "./routes/admin";
import { keysRouter } from "./routes/keys";
import { usersRouter } from "./routes/users";
import { setupSocket } from "./socket";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Security middleware
applySecurity(app);

// Body parsing
app.use(express.json());

// Routes
app.use("/api/health", healthRouter);
app.use("/api/auth", authRateLimit, authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/keys", keysRouter);
app.use("/api/users", usersRouter);

// Make io accessible from route handlers
app.set("io", io);

// Socket.io setup
setupSocket(io);

// Start server (skip in test mode)
if (!config.isTest) {
  httpServer.listen(config.port, () => {
    console.log(`[Server] SecureChat server running on port ${config.port}`);
    console.log(`[Server] Environment: ${config.nodeEnv}`);
    console.log(
      `[Server] Health check: http://localhost:${config.port}/api/health`,
    );
  });
}

export { app, httpServer, io };
