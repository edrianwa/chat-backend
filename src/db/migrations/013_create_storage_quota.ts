import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('storage_quota', (table) => {
    table.uuid('user_id').primary().references('id').inTable('users').onDelete('CASCADE');
    table.bigInteger('used_bytes').defaultTo(0).notNullable();
    table.bigInteger('max_bytes').defaultTo(524288000).notNullable(); // 500MB default
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('storage_quota');
}
