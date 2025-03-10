<script lang="ts">
	import { goto } from '$app/navigation';
	import TicketStatusBadge from '$lib/components/ticket-status-badge.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { clientEnv } from '$lib/env/client';
	import mutations from '$lib/trpc/client/mutations.svelte';
	import queries from '$lib/trpc/client/queries.svelte';
	import { useQueryClient } from '@tanstack/svelte-query';
	import { formatDistance } from 'date-fns';
	import SquareChevronRight from 'lucide-svelte/icons/square-chevron-right';
	import UserXIcon from 'lucide-svelte/icons/user-x';

	import { MarkGithub24 as GithubIcon } from 'svelte-octicons';

	let tixQuery = queries.adminGetMyAssignedTickets();

	let unassignMutation = mutations.adminUnassignTicket();

	let queryClient = useQueryClient();
</script>

<Card.Card class="max-h-full overflow-y-scroll">
	<Card.Header class="flex flex-row items-center justify-between">
		<span class="flex flex-col gap-y-2">
			<Card.Title class="h-full">My Tickets</Card.Title>
			<Card.Description>Help Tickets assigned to me</Card.Description>
		</span>
		<Button
			size="default"
			onclick={async () =>
				await queryClient.invalidateQueries({ queryKey: ['admin', 'mytickets'] })}>Refresh</Button
		>
	</Card.Header>
	<Card.Content>
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-max">Title</Table.Head>
					<Table.Head class="max-w-40">Issue Link</Table.Head>
					<Table.Head>Challenge Link</Table.Head>
					<Table.Head class="">Created</Table.Head>
					<Table.Head class="">Room</Table.Head>
					<Table.Head class="">Status</Table.Head>
					<Table.Head class="">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#if $tixQuery.data}
					{#each $tixQuery.data.tickets as ticket}
						<Table.Row>
							<Table.Cell>{ticket.title}</Table.Cell>
							<Table.Cell class="max-w-40 overflow-x-scroll"
								><Button
									href={`https://github.com/${clientEnv.PUBLIC_GITHUB_ORGNAME}/${ticket.repository}/issues/${ticket.issueNumber}`}
									variant="link"
									target="_blank"
									class="max-w-40 overflow-x-scroll px-0"
								>
									<GithubIcon
										class="fill-primary size-5!"
									/>{ticket.repository}#{ticket.issueNumber}
								</Button></Table.Cell
							>
							<Table.Cell>
								{#if ticket.challengeRepo}
									<Button
										href={`https://github.com/${clientEnv.PUBLIC_GITHUB_ORGNAME}/${ticket.challengeRepo}`}
										variant="link"
										target="_blank"
									>
										<GithubIcon class="fill-foreground size-6" />{ticket.challengeRepo}
									</Button>
								{:else}
									No challenge
								{/if}
							</Table.Cell>
							<Table.Cell title={ticket.createdAt.toString()}
								>{formatDistance(ticket.createdAt, Date.now(), { addSuffix: true })}</Table.Cell
							>
							<Table.Cell>{ticket.location}</Table.Cell>

							<Table.Cell><TicketStatusBadge status={ticket.resolutionStatus} /></Table.Cell>
							<Table.Cell>
								<Button
									variant="outline"
									size="icon"
									disabled={$unassignMutation.isPending}
									title="Unassign this ticket from myself"
									onclick={async () => {
										await $unassignMutation.mutateAsync({ ticketId: ticket.id });
									}}><UserXIcon class="size-4" /></Button
								>
								<Button
									variant="outline"
									size="icon"
									onclick={async () => {
										await goto(`/admin?ticketId=${ticket.id}`);
									}}><SquareChevronRight class="size-4" /></Button
								>
							</Table.Cell>
						</Table.Row>
					{/each}
					{#if $tixQuery.data.tickets.length === 0}
						<Table.Row>
							<Table.Cell colspan={6} class="text-muted-foreground text-center italic">
								No tickets assigned to you
							</Table.Cell>
						</Table.Row>
					{/if}
				{/if}
			</Table.Body>
		</Table.Root>
	</Card.Content>
</Card.Card>
