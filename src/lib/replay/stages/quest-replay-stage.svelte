<script lang="ts">
	/**
	 * A recorded Quest game: the lobby's head count, the board while the game
	 * runs (the time left, players, answers and accuracy, the top ten) and the
	 * podium's top three. Watching only.
	 */
	import { untrack } from 'svelte';
	import { t } from '../i18n/strings.svelte';
	import { createCountdown } from '../quiz/countdown.svelte.js';
	import Ring from '../quiz/components/ring.svelte';
	import PodiumView from '../quiz/components/podium-view.svelte';
	import CharacterDisc from '../quiz/quest/components/character-disc.svelte';
	import QuestBoard from '../quiz/quest/components/quest-board.svelte';
	import { fallbackCharacter } from '../quiz/quest/characters.js';
	import { accuracy, clock } from '../quiz/quest/format.js';
	import '../quiz/components/quiz-motion.css';
	import '../quiz/quest/components/quest-motion.css';
	import { QuestReplay } from '../player/quest-replay.svelte';
	import type { QuizReplay } from '../player/quiz-replay.svelte';

	let { replay }: { replay: QuizReplay } = $props();

	// svelte-ignore state_referenced_locally
	const replayed = new QuestReplay(replay.records);
	const quest = $derived(replayed.game);

	// Reading `replay.now()` tracks the clock; seeking writes the game's own state.
	$effect(() => {
		const time = replay.now();
		untrack(() => replayed.seek(time));
	});

	// svelte-ignore state_referenced_locally
	const countdown = createCountdown(
		() =>
			quest.endsAt
				? { endsAt: quest.endsAt, limitMs: quest.seconds * 1000, offset: 0 }
				: null,
		replay.now
	);
	const percent = $derived(accuracy(quest.board.correct, quest.board.answers));
</script>

{#snippet avatar(name: string, size: 'sm' | 'md', className: string)}
	<CharacterDisc
		id={quest.characterOf(name) ?? fallbackCharacter(name)}
		{size}
		class={className}
	/>
{/snippet}

<div
	data-quiz-stage
	class="bg-background text-foreground relative flex size-full min-h-0 min-w-0 flex-col gap-2 overflow-hidden p-3 pt-11 pb-14 [contain:layout_paint] sm:p-5 sm:pt-12 sm:pb-16 [@media(max-height:620px)]:gap-1.5 [@media(max-height:620px)]:p-2 [@media(max-height:620px)]:pt-10 [@media(max-height:620px)]:pb-12"
>
	{#if quest.phase === 'none'}
		<p class="text-muted-foreground m-auto text-sm" role="status">{t('replay.quiz.none')}</p>
	{:else}
		<h2
			class="hidden shrink-0 truncate text-sm font-bold sm:text-base [@media(min-height:561px)]:block"
		>
			{quest.title}
		</h2>
		<div class="flex min-h-0 min-w-0 flex-1 flex-col">
			{#if quest.phase === 'lobby'}
				<div class="m-auto text-center">
					<p class="text-5xl font-black tabular-nums sm:text-8xl">{quest.players}</p>
					<p class="text-muted-foreground text-sm font-semibold sm:text-lg">
						{t('quiz.host.joined', { count: quest.players })} ·
						{t('quiz.host.questions', { count: quest.questionCount })}
					</p>
				</div>
			{:else if quest.phase === 'running'}
				<div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2 sm:gap-3">
					<div class="flex shrink-0 items-center justify-between gap-2">
						<div
							class="flex min-w-0 flex-wrap items-center gap-1.5 text-xs font-bold sm:text-sm"
						>
							<span class="bg-card rounded-full border px-3 py-1 tabular-nums">
								{t('quest.host.players')}: {quest.board.players || quest.players}
							</span>
							<span class="bg-card rounded-full border px-3 py-1 tabular-nums">
								{t('quest.host.answers')}: {quest.board.answers}
							</span>
							<span class="bg-card rounded-full border px-3 py-1 tabular-nums">
								{t('quest.host.accuracy')}: {percent === null ? '-' : `${percent}%`}
							</span>
						</div>
						<Ring
							class="size-12 sm:size-16 [@media(max-height:460px)]:size-9"
							fraction={countdown.fraction}
							tone={countdown.left <= 30_000
								? 'text-red-700 dark:text-red-400'
								: 'text-primary'}
							pulse={false}
							label={t('quest.timeLeft', { time: clock(countdown.left) })}
						>
							<span class="text-[11px] sm:text-sm">{clock(countdown.left)}</span>
						</Ring>
					</div>
					<div class="min-h-0 min-w-0 flex-1 overflow-y-auto">
						{#if quest.board.top.length === 0}
							<p class="text-muted-foreground p-4 text-center text-sm" role="status">
								{t('quest.host.boardEmpty')}
							</p>
						{:else}
							<QuestBoard rows={quest.board.top} />
						{/if}
					</div>
				</div>
			{:else if quest.podium}
				<PodiumView
					room={replay}
					podium={{ top: quest.podium.top.slice(0, 3) }}
					{avatar}
					points={(n) => t('quest.podium.coins', { n })}
				/>
			{/if}
		</div>
	{/if}
</div>
