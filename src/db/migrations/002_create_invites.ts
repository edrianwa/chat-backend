import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('invites', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('code', 32).unique().notNullable();
    table.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    table.uuid('used_by').references('id').inTable('users').onDelete('SET NULL');
    table.boolean('is_used').defaultTo(false).notNullable();
    table.timestamp('expires_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();

    table.index('code');
    table.index('is_used');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('invites');
}
