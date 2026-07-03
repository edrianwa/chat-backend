import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('admin_settings', (table) => {
    table.string('key', 64).primary();
    table.string('value', 256).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
  });

  // Insert default settings
  await knex('admin_settings').insert([
    { key: 'user_cap', value: '100' },
    { key: 'registration_enabled', value: 'true' },
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('admin_settings');
}
