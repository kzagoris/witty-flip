import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './drizzle',
  schema: './app/lib/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: 'file:./data/sqlite.db',
  },
})
