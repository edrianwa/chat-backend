import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('one_time_pre_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
    table.integer('key_id').notNullable();
    table.text('public_key').notNullable();
    table.boolean('is_used').defaultTo(false).notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('used_at').nullable();

    table.index(['user_id', 'is_used']);
    table.unique(['user_id', 'key_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('one_time_pre_keys');
}
