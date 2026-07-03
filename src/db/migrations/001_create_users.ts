import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('unique_id_number', 12).unique().notNullable();
    table.string('display_name', 64).notNullable();
    table.string('password_hash', 256).notNullable();
    table.string('avatar_url', 512).nullable();
    table.enum('role', ['user', 'admin']).defaultTo('user').notNullable();
    table.enum('status', ['active', 'suspended', 'banned']).defaultTo('active').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();

    table.index('unique_id_number');
    table.index('status');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('users');
}
