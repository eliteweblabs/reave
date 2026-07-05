import { sql } from 'drizzle-orm';
import { text, timestamp, uuid, pgTable, index } from 'drizzle-orm/pg-core';

// Messages table — stores chat messages synced across devices
export const pgMessages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chatId: uuid('chat_id').notNull(),
    role: text('role').notNull(), // 'user' | 'assistant'
    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    chatIdIdx: index('messages_chat_id_idx').on(table.chatId),
    createdAtIdx: index('messages_created_at_idx').on(table.createdAt),
  })
);

export type Message = typeof pgMessages.$inferSelect;
export type NewMessage = typeof pgMessages.$inferInsert;

/**
 * Insert a message into the database
 */
export async function insertMessage(
  db: any,
  chatId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<Message> {
  const result = await db.insert(pgMessages).values({
    chatId,
    role,
    content,
  }).returning();
  return result[0];
}

/**
 * Get all messages for a chat, ordered by creation time
 */
export async function getMessagesForChat(
  db: any,
  chatId: string
): Promise<Message[]> {
  return db
    .select()
    .from(pgMessages)
    .where(sql`${pgMessages.chatId} = ${chatId}`)
    .orderBy(pgMessages.createdAt)
    .all();
}

/**
 * Get messages created/updated after a timestamp (for polling)
 */
export async function getMessagesSince(
  db: any,
  chatId: string,
  since: Date
): Promise<Message[]> {
  return db
    .select()
    .from(pgMessages)
    .where(
      sql`${pgMessages.chatId} = ${chatId} AND ${pgMessages.createdAt} > ${since}`
    )
    .orderBy(pgMessages.createdAt)
    .all();
}
