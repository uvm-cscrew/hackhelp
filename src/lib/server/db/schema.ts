import { pgTable, text, integer } from 'drizzle-orm/pg-core';
import { createId as cuid2 } from '@paralleldrive/cuid2';
import { boolean } from 'drizzle-orm/pg-core';
import { timestamp } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
	id: text('id').primaryKey().$defaultFn(cuid2),
	githubId: integer('github_id').notNull(),
	username: text('username').notNull(),
	fullName: text('full_name'),
	isOrgAdmin: boolean().default(false).notNull(),
	isOrgMember: boolean().default(false).notNull(),
	teamId: text('team_id').references(() => team.id)
});

export type PersonRole = 'admin' | 'mentor' | 'competitor';

export const person = pgTable('person', {
	username: text('username').notNull().primaryKey(),
	role: text('role').notNull().$type<PersonRole>(),
	givenName: text('given_name'),
	eduEmail: text('edu_email'),
	isWhitelisted: boolean().default(false).notNull(),
	isBanned: boolean().default(false).notNull(),
	linkedUserId: text('linked_user_id').references(() => user.id)
});

export const session = pgTable('session', {
	id: text('id').primaryKey().$defaultFn(cuid2),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	expiresAt: timestamp('expires_at').notNull()
});

export const team = pgTable('team', {
	id: text('id').primaryKey().$defaultFn(cuid2),
	githubId: integer('github_id').notNull(),
	githubSlug: text('github_slug').notNull(),
	name: text('name').notNull()
});

export type Session = typeof session.$inferSelect;

export type User = typeof user.$inferSelect;

export type Team = typeof team.$inferSelect;
