import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('call_logs', (table) => {
    table.enum('call_type', ['voice', 'video']).defaultTo('voice').notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('call_logs', (table) => {
    table.dropColumn('call_type');
  });
}
