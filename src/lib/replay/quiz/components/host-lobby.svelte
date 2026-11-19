<script lang="ts">
	/**
	 * The teacher's lobby: a big count, and the names of the players popping in
	 * as chips with their avatars (the service reports newcomers about twice a
	 * second; leavers are not reported, the count is the truth).
	 */
	import { t } from '../../i18n/strings.svelte';
	import UsersIcon from '@lucide/svelte/icons/users';
	import type { StageRoom } from '../stage-room';
	import AvatarDisc from './avatar-disc.svelte';
	import './quiz-motion.css';

	let { room }: { room: StageRoom } = $props();

	const game = $derived(room.game);
	const SHOWN = 120;
	const names = $derived(game.joined.slice(-SHOWN));
</script>

<div class="flex min-h-0 min-w-0 flex-1 flex-col items-center gap-2 text-center sm:gap-4">
	<p class="sr-only" role="status" aria-live="polite">
		{t('quiz.host.joined', { count: game.players })}
	</p>
	<UsersIcon
		class="text-primary size-8 shrink-0 sm:size-12 [@media(max-height:560px)]:hidden"
		aria-hidden="true"
	/>
	{#key game.players}
		<p
			class="qz-pop shrink-0 text-5xl leading-none font-black tabular-nums sm:text-8xl [@media(max-height:560px)]:text-4xl"
			aria-hidden="true"
		>
			{game.players}
		</p>
	{/key}
	<p class="text-muted-foreground shrink-0 text-sm font-semibold sm:text-lg">
		{t('quiz.host.joined', { count: game.players })} ·
		{t('quiz.host.questions', { count: game.questionCount })}
	</p>
	{#if names.length === 0}
		<p class="text-muted-foreground shrink-0 text-sm">{t('quiz.lobby.waitingNames')}</p>
	{:else}
		<ul
			class="flex min-h-0 w-full max-w-3xl flex-1 flex-wrap content-start justify-center gap-2 overflow-y-auto"
			aria-label={t('quiz.lobby.names')}
		>
			{#each names as name, i (`${name}:${i}`)}
				<li
					class="qz-pop bg-card flex max-w-full min-w-0 items-center gap-2 rounded-full border py-1 pr-3 pl-1.5"
				>
					<AvatarDisc {name} size="md" />
					<span class="max-w-32 truncate text-sm font-bold">{name}</span>
				</li>
			{/each}
			{#if game.joined.length > SHOWN}
				<li class="text-muted-foreground flex items-center px-2 text-sm font-semibold">
					{t('quiz.lobby.more', { n: game.joined.length - SHOWN })}
				</li>
			{/if}
		</ul>
	{/if}
</div>
