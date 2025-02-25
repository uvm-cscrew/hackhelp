import { protectedProcedure, t } from '../shared';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { serverEnv } from '$lib/env/server';
import { createTeamSchema } from '$lib/schemas';

/**
 * This file contains most actions that a competitor will need. It is broken out into multiple routers depending on what the different actions
 * pertain to. These actions include; creating their team, updating it, creating tickets, updating tickets, handling repositories, etc.
 */

const enforceUserIsInTeam = t.middleware(async ({ ctx, next }) => {
	if (!ctx.user || !ctx.session) {
		throw new TRPCError({ code: 'UNAUTHORIZED' });
	}

	if (!ctx.user.teamId) {
		throw new TRPCError({ code: 'FORBIDDEN' });
	}

	const [team] = await ctx.db
		.select()
		.from(ctx.dbSchema.team)
		.where(eq(ctx.dbSchema.team.id, ctx.user.teamId));

	if (!team) {
		throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });
	}

	return next({
		ctx: {
			user: { ...ctx.user, teamId: ctx.user.teamId },
			session: ctx.session,
			team
		}
	});
});

const teamProcedure = protectedProcedure.use(enforceUserIsInTeam);

// #############################################
// #               TEAM ROUTER                 #
// #############################################

const teamRouter = t.router({
	get: teamProcedure.query(async ({ ctx }) => {
		const members = await ctx.db
			.select({
				id: ctx.dbSchema.user.id,
				username: ctx.dbSchema.user.username,
				fullName: ctx.dbSchema.user.fullName
			})
			.from(ctx.dbSchema.user)
			.where(eq(ctx.dbSchema.user.teamId, ctx.team.id))
			.leftJoin(ctx.dbSchema.profile, eq(ctx.dbSchema.user.id, ctx.dbSchema.profile.linkedUserId));
		return { team: ctx.team, members };
	}),
	updateProperties: teamProcedure
		.input(
			z.object({
				name: z.string().nonempty(),
				description: z.string().default('')
			})
		)
		.mutation(async ({ ctx, input }) => {
			const ghUpdate = await ctx.githubApp.rest.teams.updateInOrg({
				org: serverEnv.PUBLIC_GITHUB_ORGNAME,
				team_slug: ctx.team.githubSlug,
				name: input.name,
				description: input.description
			});

			const [team] = await ctx.db
				.update(ctx.dbSchema.team)
				.set({ name: input.name, githubId: ghUpdate.data.id, githubSlug: ghUpdate.data.slug })
				.where(eq(ctx.dbSchema.team.id, ctx.user.teamId))
				.returning();
			if (!team) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });
			}
			return { team };
		}),
	updateJoinable: teamProcedure
		.input(z.object({ canJoin: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			if (ctx.team.canJoin === input.canJoin) {
				return { teamIsJoinable: input.canJoin };
			}

			const [team] = await ctx.db
				.update(ctx.dbSchema.team)
				.set({ canJoin: input.canJoin })
				.where(eq(ctx.dbSchema.team.id, ctx.user.teamId))
				.returning();

			if (!team) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });
			}

			return { teamIsJoinable: input.canJoin };
		}),
	create: protectedProcedure.input(createTeamSchema).mutation(async ({ ctx, input }) => {
		const ghTeam = await ctx.githubApp.rest.teams.create({
			org: serverEnv.PUBLIC_GITHUB_ORGNAME,
			name: input.name,
			description: input.description
		});

		const [team] = await ctx.db
			.insert(ctx.dbSchema.team)
			.values({
				name: input.name,
				githubId: ghTeam.data.id,
				githubSlug: ghTeam.data.slug
			})
			.returning();

		await ctx.db
			.update(ctx.dbSchema.user)
			.set({ teamId: team.id })
			.where(eq(ctx.dbSchema.user.id, ctx.user.id));

		await ctx.githubApp.rest.teams.addOrUpdateMembershipForUserInOrg({
			org: serverEnv.PUBLIC_GITHUB_ORGNAME,
			team_slug: team.githubSlug,
			username: ctx.user.username
		});

		return { team };
	}),
	joinTeam: protectedProcedure
		.input(z.object({ teamJoinCode: z.string().nonempty().max(6).min(6) }))
		.mutation(async ({ ctx, input }) => {
			if (ctx.user.teamId !== null) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'User is already in a team' });
			}

			const [team] = await ctx.db
				.select()
				.from(ctx.dbSchema.team)
				.where(eq(ctx.dbSchema.team.joinCode, input.teamJoinCode));

			if (!team) {
				throw new TRPCError({ code: 'NOT_FOUND', message: 'Team not found' });
			}

			if (!team.canJoin) {
				throw new TRPCError({ code: 'FORBIDDEN', message: 'Team is not accepting new members' });
			}

			await ctx.db
				.update(ctx.dbSchema.user)
				.set({ teamId: team.id })
				.where(eq(ctx.dbSchema.user.id, ctx.user.id));

			await ctx.githubApp.rest.teams.addOrUpdateMembershipForUserInOrg({
				org: serverEnv.PUBLIC_GITHUB_ORGNAME,
				team_slug: team.githubSlug,
				username: ctx.user.username
			});

			return { team };
		}),
	leaveTeam: teamProcedure.mutation(async ({ ctx }) => {
		await ctx.db
			.update(ctx.dbSchema.user)
			.set({ teamId: null })
			.where(eq(ctx.dbSchema.user.id, ctx.user.id));

		await ctx.githubApp.rest.teams.removeMembershipForUserInOrg({
			org: serverEnv.PUBLIC_GITHUB_ORGNAME,
			team_slug: ctx.team.githubSlug,
			username: ctx.user.username
		});

		return { team: ctx.team };
	})
});

// #############################################
// #            REPOSITORY ROUTER              #
// #############################################
const repositoryRouter = t.router({
	getAll: teamProcedure.query(async ({ ctx }) => {
		return {
			repos: (
				await ctx.githubApp.rest.teams.listReposInOrg({
					org: serverEnv.PUBLIC_GITHUB_ORGNAME,
					team_slug: ctx.team.githubSlug
				})
			).data.map((repo) => {
				return {
					id: repo.id,
					name: repo.name,
					fullName: repo.full_name,
					description: repo.description,
					private: repo.private,
					htmlUrl: repo.html_url,
					language: repo.language
				};
			})
		};
	}),
	repoSlugIsTaken: teamProcedure
		.input(z.object({ repoName: z.string().nonempty() }))
		.query(async ({ ctx, input }) => {
			const repos = await ctx.githubApp.rest.repos.listForOrg({
				org: serverEnv.PUBLIC_GITHUB_ORGNAME
			});
			return { repoExists: repos.data.some((repo) => repo.name === input.repoName) };
		}),
	create: teamProcedure
		.input(
			z.object({
				repoName: z.string().nonempty(),
				description: z.string().default('')
			})
		)
		.mutation(async ({ ctx, input }) => {
			// Create the repository
			const ghRepo = await ctx.githubApp.rest.repos.createInOrg({
				org: serverEnv.PUBLIC_GITHUB_ORGNAME,
				name: input.repoName,
				description: input.description,
				private: true
			});

			// Update the permissions
			await ctx.githubApp.rest.teams.addOrUpdateRepoPermissionsInOrg({
				org: serverEnv.PUBLIC_GITHUB_ORGNAME,
				team_slug: ctx.team.githubSlug,
				owner: serverEnv.PUBLIC_GITHUB_ORGNAME,
				repo: ghRepo.data.name,
				permission: 'admin'
			});
		})
});

// #############################################
// #              TICKET ROUTER                #
// #############################################

const ticketRouter = t.router({});

// #############################################
// #            COMPETITOR ROUTER              #
// #############################################

export const competitorRouter = t.router({
	tickets: ticketRouter,
	team: teamRouter,
	repositories: repositoryRouter
});
