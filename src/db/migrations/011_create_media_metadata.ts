import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('media_metadata', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('uploader_id').references('id').inTable('users').onDelete('CASCADE').notNullable();
    table.uuid('chat_id').notNullable(); // recipient user ID for 1-on-1
    table.string('file_name', 256).notNullable();
    table.integer('file_size').notNullable(); // bytes
    table.string('mime_type', 64).notNullable();
    table.string('storage_path', 512).notNullable();
    table.timestamp('uploaded_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('expires_at').nullable();
    table.boolean('is_deleted').defaultTo(false).notNullable();
    table.timestamp('deleted_at').nullable();

    table.index('uploader_id');
    table.index('chat_id');
    table.index(['is_deleted', 'expires_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('media_metadata');
}
