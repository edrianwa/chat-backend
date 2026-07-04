import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('call_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('caller_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
    table.uuid('callee_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
    table.enum('status', ['answered', 'missed', 'rejected', 'failed']).notNullable();
    table.timestamp('started_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('answered_at').nullable();
    table.timestamp('ended_at').nullable();
    table.integer('duration_seconds').defaultTo(0).notNullable();

    table.index('caller_id');
    table.index('callee_id');
    table.index(['caller_id', 'started_at']);
    table.index(['callee_id', 'started_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('call_logs');
}
