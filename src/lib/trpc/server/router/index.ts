import { z } from 'zod';
import { protectedProcedure, t } from '../shared';
import { eq } from 'drizzle-orm';
import { serverEnv } from '$lib/env/server';
import type { Context } from '../context';
import { TRPCError } from '@trpc/server';

async function hasPendingInvite(ctx: Context & { user: { username: string } }) {
	const invites = await ctx.githubApp.rest.orgs.listPendingInvitations({
		org: serverEnv.PUBLIC_GITHUB_ORGNAME
	});

	const hasPendingInvite = invites.data.some((invite) => invite.login === ctx.user.username);

	return hasPendingInvite;
}

const accountRouter = t.router({
	get: protectedProcedure.query(({ ctx }) => {
		return { user: ctx.user };
	}),
	getWithStatus: protectedProcedure.query(async ({ ctx }) => {
		const [userStatus] = await ctx.db
			.select()
			.from(ctx.dbSchema.userStatus)
			.where(eq(ctx.dbSchema.userStatus.linkedUserId, ctx.user.id));
		return { user: ctx.user, session: ctx.session, userStatus };
	}),
	hasPendingInvite: protectedProcedure.query(async ({ ctx }) => {
		const pendingInvite = await hasPendingInvite(ctx);
		return { hasPendingInvite: pendingInvite };
	}),
	sendInvite: protectedProcedure.mutation(async ({ ctx }) => {
		const pendingInvite = await hasPendingInvite(ctx);
		if (pendingInvite) {
			throw new TRPCError({ message: 'You already have a pending invite', code: 'UNAUTHORIZED' });
		}

		await ctx.githubApp.rest.orgs.createInvitation({
			org: serverEnv.PUBLIC_GITHUB_ORGNAME,
			invitee_id: ctx.user.githubId,
			role: 'direct_member'
		});

		return { invited: true };
	})
});

export const appRouter = t.router({
	hello: t.procedure.input(z.string()).query((opts) => {
		return { greeting: `Hello, ${opts.input}!` };
	}),
	account: accountRouter
});
