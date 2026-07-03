import dotenv from 'dotenv';
dotenv.config();

import { config } from '../../config';
import db from '../connection';
import { UserService } from '../../services/user.service';

/**
 * Seed the database with the first admin user.
 * Run with: npm run seed
 */
async function seedAdmin(): Promise<void> {
  console.log('[Seed] Starting admin user seed...');

  try {
    // Run migrations first
    await db.migrate.latest({
      directory: __dirname + '/../migrations',
    });
    console.log('[Seed] Migrations applied.');

    // Check if admin already exists
    const existingAdmin = await db('users').where('role', 'admin').first();
    if (existingAdmin) {
      console.log(`[Seed] Admin user already exists: ID ${existingAdmin.unique_id_number}`);
      process.exit(0);
    }

    // Create admin user
    const admin = await UserService.createUser({
      displayName: config.admin.displayName,
      password: config.admin.password,
      role: 'admin',
    });

    console.log('[Seed] Admin user created successfully!');
    console.log(`[Seed]   Display Name: ${admin.display_name}`);
    console.log(`[Seed]   Unique ID: ${admin.unique_id_number}`);
    console.log(`[Seed]   Role: ${admin.role}`);
    console.log('[Seed]   Password: (as configured in .env ADMIN_PASSWORD)');
  } catch (err) {
    console.error('[Seed] Error:', err);
    process.exit(1);
  } finally {
    await db.destroy();
    process.exit(0);
  }
}

seedAdmin();
