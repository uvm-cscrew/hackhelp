import { generateSessionToken, createSession, setSessionTokenCookie } from '$lib/server/auth';
import { githubOAuth } from '$lib/server/auth';

import type { RequestEvent } from '@sveltejs/kit';
import type { OAuth2Tokens } from 'arctic';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { octokit } from '$lib/github';

export async function GET(event: RequestEvent): Promise<Response> {
	const code = event.url.searchParams.get('code');
	const state = event.url.searchParams.get('state');
	const storedState = event.cookies.get('github_oauth_state') ?? null;
	if (code === null || state === null || storedState === null) {
		return new Response(null, {
			status: 400
		});
	}
	if (state !== storedState) {
		return new Response(null, {
			status: 400
		});
	}

	let tokens: OAuth2Tokens;
	try {
		tokens = await githubOAuth.validateAuthorizationCode(code);
	} catch (e: unknown) {
		const err = e as Error;
		// Invalid code or client credentials
		return new Response(
			JSON.stringify(
				{
					message: err.message
				},
				null,
				2
			),
			{
				status: 400
			}
		);
	}

	const githubUserResponse = await octokit.rest.users.getAuthenticated({
		headers: {
			Authorization: `Bearer ${tokens.accessToken()}`
		}
	});

	// TODO: Replace this with your own DB query.
	const [existingUser] = await db
		.select({ id: schema.user.id })
		.from(schema.user)
		.where(eq(schema.user.githubId, githubUserResponse.data.id));

	if (existingUser) {
		const sessionToken = generateSessionToken();
		const session = await createSession(sessionToken, existingUser.id);
		setSessionTokenCookie(event, sessionToken, session.expiresAt);
		return new Response(null, {
			status: 302,
			headers: {
				Location: '/'
			}
		});
	}

	const [user] = await db
		.insert(schema.user)
		.values({
			username: githubUserResponse.data.login,
			githubId: githubUserResponse.data.id,
			fullName: githubUserResponse.data.name
		})
		.returning();

	const sessionToken = generateSessionToken();
	const session = await createSession(sessionToken, user.id);
	setSessionTokenCookie(event, sessionToken, session.expiresAt);

	return new Response(null, {
		status: 302,
		headers: {
			Location: '/'
		}
	});
}
