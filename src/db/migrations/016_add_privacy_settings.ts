import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.enum('last_seen_visibility', ['everyone', 'contacts', 'nobody']).defaultTo('everyone').notNullable();
    table.boolean('read_receipts_enabled').defaultTo(true).notNullable();
    table.enum('profile_photo_visibility', ['everyone', 'contacts', 'nobody']).defaultTo('everyone').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('last_seen_visibility');
    table.dropColumn('read_receipts_enabled');
    table.dropColumn('profile_photo_visibility');
  });
}
