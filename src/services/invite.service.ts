import { v4 as uuidv4 } from 'uuid';
import db from '../db/connection';

export interface Invite {
  id: string;
  code: string;
  created_by: string | null;
  used_by: string | null;
  is_used: boolean;
  expires_at: Date | null;
  created_at: Date;
}

export class InviteService {
  /**
   * Generate a unique invite code (8 char alphanumeric).
   */
  static generateCode(): string {
    return uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
  }

  /**
   * Create a new invite code.
   */
  static async createInvite(createdBy: string, expiresInHours?: number): Promise<Invite> {
    const code = this.generateCode();
    const expiresAt = expiresInHours
      ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
      : null;

    const [invite] = await db('invites')
      .insert({
        code,
        created_by: createdBy,
        expires_at: expiresAt,
      })
      .returning('*');

    return invite;
  }

  /**
   * Validate an invite code — checks existence, usage, and expiry.
   */
  static async validateInvite(code: string): Promise<{ valid: boolean; invite?: Invite; error?: string }> {
    const invite = await db('invites').where('code', code).first();

    if (!invite) {
      return { valid: false, error: 'Invalid invite code' };
    }

    if (invite.is_used) {
      return { valid: false, error: 'Invite code already used' };
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return { valid: false, error: 'Invite code expired' };
    }

    return { valid: true, invite };
  }

  /**
   * Mark an invite as used.
   */
  static async markUsed(code: string, usedBy: string): Promise<void> {
    await db('invites')
      .where('code', code)
      .update({ is_used: true, used_by: usedBy });
  }

  /**
   * List all invites (for admin).
   */
  static async listInvites(page = 1, limit = 50): Promise<Invite[]> {
    return db('invites')
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset((page - 1) * limit);
  }
}
