import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('fcm_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
    table.text('token').notNullable();
    table.string('device_id', 128).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();

    table.unique(['user_id', 'device_id']);
    table.index('user_id');
    table.index('token');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('fcm_tokens');
}
