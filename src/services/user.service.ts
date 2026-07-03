import bcrypt from 'bcrypt';
import db from '../db/connection';

export interface User {
  id: string;
  unique_id_number: string;
  display_name: string;
  password_hash: string;
  avatar_url: string | null;
  role: 'user' | 'admin';
  status: 'active' | 'suspended' | 'banned';
  created_at: Date;
  updated_at: Date;
}

export class UserService {
  /**
   * Generate a unique 8-digit ID number for new users.
   */
  static async generateUniqueId(): Promise<string> {
    let id: string;
    let exists = true;

    do {
      // Generate random 8-digit number
      id = Math.floor(10000000 + Math.random() * 90000000).toString();
      const row = await db('users').where('unique_id_number', id).first();
      exists = !!row;
    } while (exists);

    return id;
  }

  /**
   * Create a new user with hashed password.
   */
  static async createUser(params: {
    displayName: string;
    password: string;
    role?: 'user' | 'admin';
  }): Promise<User> {
    const uniqueId = await this.generateUniqueId();
    const passwordHash = await bcrypt.hash(params.password, 12);

    const [user] = await db('users')
      .insert({
        unique_id_number: uniqueId,
        display_name: params.displayName,
        password_hash: passwordHash,
        role: params.role || 'user',
      })
      .returning('*');

    return user;
  }

  /**
   * Find user by unique ID number.
   */
  static async findByUniqueId(uniqueId: string): Promise<User | null> {
    const user = await db('users').where('unique_id_number', uniqueId).first();
    return user || null;
  }

  /**
   * Find user by primary key.
   */
  static async findById(id: string): Promise<User | null> {
    const user = await db('users').where('id', id).first();
    return user || null;
  }

  /**
   * Verify password against hash.
   */
  static async verifyPassword(plaintext: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plaintext, hash);
  }

  /**
   * List all users (for admin).
   */
  static async listUsers(page = 1, limit = 50): Promise<{ users: User[]; total: number }> {
    const offset = (page - 1) * limit;
    const [users, countResult] = await Promise.all([
      db('users')
        .select('id', 'unique_id_number', 'display_name', 'avatar_url', 'role', 'status', 'created_at')
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset),
      db('users').count('* as count').first(),
    ]);
    return { users, total: parseInt(countResult?.count as string, 10) || 0 };
  }

  /**
   * Update user status (admin action).
   */
  static async updateStatus(userId: string, status: 'active' | 'suspended' | 'banned'): Promise<User | null> {
    const [user] = await db('users')
      .where('id', userId)
      .update({ status, updated_at: new Date() })
      .returning('*');
    return user || null;
  }

  /**
   * Get user count (for cap checking).
   */
  static async getUserCount(): Promise<number> {
    const result = await db('users').count('* as count').first();
    return parseInt(result?.count as string, 10) || 0;
  }
}
