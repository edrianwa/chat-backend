import { Server, Socket } from "socket.io";
import { AuthService, TokenPayload } from "../services/auth.service";
import { UserService } from "../services/user.service";
import { MessageService } from "../services/message.service";
import { PresenceService } from "../services/presence.service";

// Extend Socket to include authenticated user
interface AuthenticatedSocket extends Socket {
  user?: TokenPayload;
}

// Track online users: userId -> socketId
const onlineUsers = new Map<string, string>();

/**
 * Set up Socket.io with JWT authentication and messaging handlers.
 */
export function setupSocket(io: Server): void {
  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token =
      socket.handshake.auth.token ||
      socket.handshake.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("Authentication token required"));
    }

    const payload = AuthService.verifyAccessToken(token);
    if (!payload) {
      return next(new Error("Invalid or expired token"));
    }

    // Check if user is still active
    const user = await UserService.findById(payload.userId);
    if (!user || user.status !== "active") {
      return next(new Error("Account is not active"));
    }

    socket.user = payload;
    next();
  });

  // Connection handler
  io.on("connection", async (socket: AuthenticatedSocket) => {
    const user = socket.user;
    if (!user) return;

    console.log(`[Socket.io] User connected: ${user.uniqueId} (${socket.id})`);

    // Track online status
    onlineUsers.set(user.userId, socket.id);
    socket.join(`user:${user.userId}`);

    // Presence: mark online and broadcast
    await PresenceService.setOnline(user.userId);
    socket.broadcast.emit("presence:online", {
      userId: user.userId,
      timestamp: Date.now(),
    });

    // Flush offline messages on connect
    await flushOfflineMessages(io, socket, user.userId);

    // --- Message Handlers ---

    /**
     * message:send — Client sends an encrypted message.
     * Payload: { messageId, recipientId, ciphertext, sequenceNumber }
     */
    socket.on("message:send", async (data, callback) => {
      try {
        const { messageId, recipientId, ciphertext, sequenceNumber } = data;

        if (
          !messageId ||
          !recipientId ||
          !ciphertext ||
          sequenceNumber === undefined
        ) {
          if (typeof callback === "function") {
            callback({ error: "Missing required fields" });
          }
          return;
        }

        // Record metadata (no plaintext on server)
        await MessageService.createMetadata(
          messageId,
          user.userId,
          recipientId,
        );

        // Check if recipient is online
        const recipientSocketId = onlineUsers.get(recipientId);

        if (recipientSocketId) {
          // Deliver directly
          io.to(`user:${recipientId}`).emit("message:receive", {
            messageId,
            senderId: user.userId,
            senderUniqueId: user.uniqueId,
            ciphertext,
            sequenceNumber,
            timestamp: Date.now(),
          });

          // Mark as delivered
          await MessageService.markDelivered(messageId);

          // Send delivery receipt back to sender
          socket.emit("message:delivered", {
            messageId,
            recipientId,
            timestamp: Date.now(),
          });
        } else {
          // Queue for offline delivery
          await MessageService.queueOfflineMessage({
            messageId,
            senderId: user.userId,
            recipientId,
            ciphertext,
            sequenceNumber,
          });
        }

        // ACK to sender
        if (typeof callback === "function") {
          callback({ success: true, messageId });
        }
      } catch (err) {
        console.error("[Socket.io] message:send error:", err);
        if (typeof callback === "function") {
          callback({ error: "Failed to send message" });
        }
      }
    });

    /**
     * message:delivered — Client confirms delivery receipt.
     * Payload: { messageId, senderId }
     */
    socket.on("message:delivered", async (data) => {
      try {
        const { messageId, senderId } = data;
        if (!messageId || !senderId) return;

        await MessageService.markDelivered(messageId);

        // Forward receipt to sender
        io.to(`user:${senderId}`).emit("message:delivered", {
          messageId,
          recipientId: user.userId,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.error("[Socket.io] message:delivered error:", err);
      }
    });

    /**
     * message:read — Client marks messages as read.
     * Payload: { messageIds, senderId } OR { senderId } (mark all)
     */
    socket.on("message:read", async (data) => {
      try {
        const { messageIds, senderId } = data;
        if (!senderId) return;

        let readIds: string[];

        if (messageIds && Array.isArray(messageIds)) {
          // Mark specific messages
          for (const id of messageIds) {
            await MessageService.markRead(id);
          }
          readIds = messageIds;
        } else {
          // Mark all from sender as read
          readIds = await MessageService.markAllRead(user.userId, senderId);
        }

        // Forward read receipt to sender
        if (readIds.length > 0) {
          io.to(`user:${senderId}`).emit("message:read", {
            messageIds: readIds,
            readerId: user.userId,
            timestamp: Date.now(),
          });
        }
      } catch (err) {
        console.error("[Socket.io] message:read error:", err);
      }
    });

    // --- Utility handlers ---

    socket.on("ping", (callback) => {
      if (typeof callback === "function") {
        callback({ pong: true, timestamp: Date.now() });
      }
    });

    socket.on("disconnect", async () => {
      console.log(
        `[Socket.io] User disconnected: ${user.uniqueId} (${socket.id})`,
      );
      onlineUsers.delete(user.userId);

      // Presence: mark offline and broadcast
      await PresenceService.setOffline(user.userId);
      socket.broadcast.emit("presence:offline", {
        userId: user.userId,
        timestamp: Date.now(),
      });
    });

    /**
     * presence:subscribe — Client wants to know when specific contacts come online.
     * Payload: { userIds: string[] }
     */
    socket.on("presence:subscribe", async (data) => {
      const { userIds } = data;
      if (!Array.isArray(userIds)) return;
      const statuses = await PresenceService.getOnlineStatuses(userIds);
      socket.emit("presence:status", { statuses });
    });
  });
}

/**
 * Flush all pending offline messages to a newly connected user.
 */
async function flushOfflineMessages(
  io: Server,
  socket: AuthenticatedSocket,
  userId: string,
): Promise<void> {
  try {
    const pendingMessages = await MessageService.getPendingMessages(userId);
    if (pendingMessages.length === 0) return;

    console.log(
      `[Socket.io] Flushing ${pendingMessages.length} offline messages to ${userId}`,
    );

    const deliveredIds: string[] = [];

    for (const msg of pendingMessages) {
      socket.emit("message:receive", {
        messageId: msg.message_id,
        senderId: msg.sender_id,
        ciphertext: msg.ciphertext,
        sequenceNumber: msg.sequence_number,
        timestamp: msg.timestamp,
      });

      // Mark as delivered
      await MessageService.markDelivered(msg.message_id);
      deliveredIds.push(msg.message_id);

      // Notify sender of delivery
      io.to(`user:${msg.sender_id}`).emit("message:delivered", {
        messageId: msg.message_id,
        recipientId: userId,
        timestamp: Date.now(),
      });
    }

    // Clean up delivered messages from queue
    await MessageService.clearDeliveredMessages(deliveredIds);
  } catch (err) {
    console.error("[Socket.io] Flush offline messages error:", err);
  }
}

export { onlineUsers };
