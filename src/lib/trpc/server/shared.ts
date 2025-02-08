import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';
import { ZodError } from 'zod';
import superjson from 'superjson';
export const t = initTRPC.context<Context>().create({
	transformer: superjson,

	errorFormatter({ shape, error }) {
		return {
			...shape,
			data: {
				...shape.data,
				zodError: error.cause instanceof ZodError ? error.cause.flatten() : null
			}
		};
	}
});

export const router = t.router;

export const publicProcedure = t.procedure;

const enforceUserIsAuthed = t.middleware(({ ctx, next }) => {
	if (!ctx.user || !ctx.session) {
		throw new TRPCError({ code: 'UNAUTHORIZED' });
	}
	return next({
		ctx: {
			// infers the `user` and `session` as non-nullable
			user: ctx.user,
			session: ctx.session
		}
	});
});

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);
