import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'

export const db = drizzle({
  connection: { url: process.env.DATABASE_URL ?? 'file:./data/sqlite.db' },
  schema,
})
