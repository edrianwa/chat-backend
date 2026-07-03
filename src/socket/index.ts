import { Server, Socket } from 'socket.io';
import { AuthService, TokenPayload } from '../services/auth.service';
import { UserService } from '../services/user.service';

// Extend Socket to include authenticated user
interface AuthenticatedSocket extends Socket {
  user?: TokenPayload;
}

/**
 * Set up Socket.io with JWT authentication middleware.
 */
export function setupSocket(io: Server): void {
  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const payload = AuthService.verifyAccessToken(token);
    if (!payload) {
      return next(new Error('Invalid or expired token'));
    }

    // Check if user is still active
    const user = await UserService.findById(payload.userId);
    if (!user || user.status !== 'active') {
      return next(new Error('Account is not active'));
    }

    socket.user = payload;
    next();
  });

  // Connection handler
  io.on('connection', (socket: AuthenticatedSocket) => {
    const user = socket.user;
    console.log(`[Socket.io] User connected: ${user?.uniqueId} (${socket.id})`);

    // Join user to their personal room
    if (user) {
      socket.join(`user:${user.userId}`);
    }

    socket.on('ping', (callback) => {
      if (typeof callback === 'function') {
        callback({ pong: true, timestamp: Date.now() });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.io] User disconnected: ${user?.uniqueId} (${socket.id})`);
    });
  });
}
