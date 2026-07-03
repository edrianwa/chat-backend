import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('message_metadata', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('sender_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
    table.uuid('recipient_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
    table.enum('status', ['sent', 'delivered', 'read']).defaultTo('sent').notNullable();
    table.timestamp('sent_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('delivered_at').nullable();
    table.timestamp('read_at').nullable();

    table.index('sender_id');
    table.index('recipient_id');
    table.index(['recipient_id', 'status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('message_metadata');
}
