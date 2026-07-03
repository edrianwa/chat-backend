import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('signed_pre_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
    table.integer('key_id').notNullable();
    table.text('public_key').notNullable();
    table.text('signature').notNullable();
    table.timestamp('timestamp').defaultTo(knex.fn.now()).notNullable();
    table.boolean('is_current').defaultTo(true).notNullable();

    table.index('user_id');
    table.unique(['user_id', 'key_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('signed_pre_keys');
}
