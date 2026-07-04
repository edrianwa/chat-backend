import crypto from "crypto";
import { getRedis } from "../db/redis";
import db from "../db/connection";
import { config } from "../config";

const ACTIVE_CALLS_PREFIX = "call:active:";
const CALL_TIMEOUT_MS = 30000; // 30 seconds

export interface CallLog {
  id: string;
  caller_id: string;
  callee_id: string;
  status: "answered" | "missed" | "rejected" | "failed";
  started_at: Date;
  answered_at: Date | null;
  ended_at: Date | null;
  duration_seconds: number;
}

export interface TurnCredentials {
  urls: string[];
  username: string;
  credential: string;
  ttl: number;
}

export class CallService {
  /**
   * Generate temporary TURN server credentials.
   * Uses the shared-secret mechanism (coturn REST API compatible).
   */
  static generateTurnCredentials(userId: string): TurnCredentials {
    const turnSecret = process.env.TURN_SECRET || "turn-dev-secret";
    const turnHost = process.env.TURN_HOST || "turn.example.com";
    const ttl = 86400; // 24 hours

    const timestamp = Math.floor(Date.now() / 1000) + ttl;
    const username = `${timestamp}:${userId}`;
    const credential = crypto
      .createHmac("sha1", turnSecret)
      .update(username)
      .digest("base64");

    return {
      urls: [
        `stun:stun.l.google.com:19302`,
        `stun:stun1.l.google.com:19302`,
        `turn:${turnHost}:3478?transport=udp`,
        `turn:${turnHost}:3478?transport=tcp`,
        `turns:${turnHost}:5349?transport=tcp`,
      ],
      username,
      credential,
      ttl,
    };
  }

  /**
   * Mark a user as in an active call.
   */
  static async setInCall(userId: string, callId: string): Promise<void> {
    const redis = getRedis();
    await redis.set(`${ACTIVE_CALLS_PREFIX}${userId}`, callId, "EX", 3600);
  }

  /**
   * Check if a user is currently in a call.
   */
  static async isInCall(userId: string): Promise<boolean> {
    const redis = getRedis();
    const result = await redis.get(`${ACTIVE_CALLS_PREFIX}${userId}`);
    return result !== null;
  }

  /**
   * Clear active call state for a user.
   */
  static async clearCallState(userId: string): Promise<void> {
    const redis = getRedis();
    await redis.del(`${ACTIVE_CALLS_PREFIX}${userId}`);
  }

  /**
   * Create a call log entry when call starts.
   */
  static async createCallLog(
    callerId: string,
    calleeId: string,
    callType: "voice" | "video" = "voice",
  ): Promise<string> {
    const [log] = await db("call_logs")
      .insert({
        caller_id: callerId,
        callee_id: calleeId,
        status: "missed",
        call_type: callType,
      })
      .returning("id");
    return log.id || log;
  }

  /**
   * Mark call as answered.
   */
  static async markAnswered(callId: string): Promise<void> {
    await db("call_logs")
      .where("id", callId)
      .update({ status: "answered", answered_at: new Date() });
  }

  /**
   * Mark call as ended and record duration.
   */
  static async markEnded(callId: string, status?: string): Promise<void> {
    const log = await db("call_logs").where("id", callId).first();
    if (!log) return;

    const endedAt = new Date();
    let duration = 0;
    if (log.answered_at) {
      duration = Math.round(
        (endedAt.getTime() - new Date(log.answered_at).getTime()) / 1000,
      );
    }

    const finalStatus = status || (log.answered_at ? "answered" : "missed");

    await db("call_logs")
      .where("id", callId)
      .update({
        status: finalStatus,
        ended_at: endedAt,
        duration_seconds: duration,
      });
  }

  /**
   * Mark call as rejected.
   */
  static async markRejected(callId: string): Promise<void> {
    await db("call_logs")
      .where("id", callId)
      .update({ status: "rejected", ended_at: new Date() });
  }

  /**
   * Get call history for a user.
   */
  static async getCallHistory(userId: string, limit = 50): Promise<CallLog[]> {
    return db("call_logs")
      .where("caller_id", userId)
      .orWhere("callee_id", userId)
      .orderBy("started_at", "desc")
      .limit(limit);
  }

  static get CALL_TIMEOUT_MS(): number {
    return CALL_TIMEOUT_MS;
  }
}
