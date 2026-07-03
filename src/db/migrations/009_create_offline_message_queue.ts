import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('offline_message_queue', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('message_id').notNullable();
    table.uuid('sender_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
    table.uuid('recipient_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
    table.text('ciphertext').notNullable();
    table.integer('sequence_number').notNullable();
    table.timestamp('timestamp').defaultTo(knex.fn.now()).notNullable();
    table.boolean('delivered').defaultTo(false).notNullable();

    table.index(['recipient_id', 'delivered']);
    table.index('message_id');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('offline_message_queue');
}
