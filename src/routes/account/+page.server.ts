import { db, schema } from '$lib/server/db';
import { trpcCreateCaller } from '$lib/trpc/server';
import { createCallerContext, createContextFunc } from '$lib/trpc/server/context';
import { redirect, type ServerLoadEvent } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export const load = async (event: ServerLoadEvent) => {
	if (!event.locals.user) {
		return redirect(302, '/auth/login');
	}

	return trpcCreateCaller(createCallerContext(event)).account.getWithStatus();
};
