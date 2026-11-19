<script lang="ts">
	/**
	 * A closed question on the teacher's screen, laid out as the open one so
	 * nothing moves. The one scrolling region holds the question text and the
	 * tiles: the right tiles glow and
	 * the others dim, each with its final count; the explanation slides in; a
	 * banner says when the top two are within a hundred points; and the
	 * standings become final, their rows sliding from where the live ranking
	 * had them.
	 */
	import { t } from '../../i18n/strings.svelte';
	import { cn } from '#lib/utils.js';
	import SwordsIcon from '@lucide/svelte/icons/swords';
	import { questionSize, tileColumns } from '../fit';
	import { hasBit } from '../protocol';
	import type { StageRoom } from '../stage-room';
	import OptionTile from './option-tile.svelte';
	import Standings from './standings.svelte';
	import './quiz-motion.css';

	let { room }: { room: StageRoom } = $props();

	const game = $derived(room.game);
	const reveal = $derived(game.reveal);
	// After a reload the question's text may be unknown: the tile keeps its shape and number.
	const options = $derived(game.question?.options ?? (reveal?.counts ?? []).map(() => ''));
	const stage = $derived(game.stage);
	let gridWidth = $state(0);
	const columns = $derived(tileColumns(gridWidth, Math.max(0, ...options.map((o) => o.length))));
	const biggest = $derived(Math.max(1, ...(reveal?.counts ?? [0])));
	const earlier = $derived(game.ranking.length ? game.ranking : game.prevTop);
	const gap = $derived(
		reveal && reveal.top.length >= 2 ? reveal.top[0].score - reveal.top[1].score : Infinity
	);
</script>

{#if reveal}
	<div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2 sm:gap-3">
		<p class="sr-only" role="status" aria-live="polite">{t('quiz.announce.reveal')}</p>
		<!-- The same layout as the open question, so the tiles do not move when it is revealed. -->
		<div class="@container min-h-0 min-w-0 flex-1 overflow-y-auto">
			<div
				class="grid min-w-0 content-start gap-2 @2xl:grid-cols-[minmax(0,1fr)_17rem] sm:gap-3"
			>
				<div class="min-w-0 space-y-2 sm:space-y-3">
					{#if game.question}
						<h2
							data-quiz-question
							class={cn(
								'leading-tight font-extrabold text-balance [overflow-wrap:anywhere]',
								questionSize(game.question.text.length)
							)}
						>
							{game.question.text}
						</h2>
					{/if}
					<ul
						class={cn(
							'grid min-w-0 auto-rows-fr gap-2 sm:gap-3 [@media(max-height:460px)]:grid-cols-3 [@media(max-height:460px)]:gap-1',
							columns === 1 ? 'grid-cols-1' : 'grid-cols-2'
						)}
						aria-label={t('quiz.distribution')}
						bind:clientWidth={gridWidth}
					>
						{#each options as option, i (i)}
							<li class="flex min-w-0">
								<OptionTile
									index={i}
									text={option}
									state={hasBit(reveal.correct, i) ? 'correct' : 'wrong'}
									count={stage >= 1
										? (reveal.counts[i] ?? 0)
										: (game.counts[i] ?? 0)}
									fraction={stage >= 1
										? (reveal.counts[i] ?? 0) / biggest
										: (game.counts[i] ?? 0) / Math.max(1, ...game.counts)}
								/>
							</li>
						{/each}
					</ul>

					{#if stage >= 1 && reveal.explanation}
						<p
							class="qz-slide bg-muted/60 rounded-2xl border p-3 text-sm sm:text-base"
							style:--delay="250ms"
						>
							<span class="font-bold">{t('quiz.explanation')}</span>
							{reveal.explanation}
						</p>
					{/if}

					{#if stage >= 2 && gap <= 100}
						<p
							class="qz-slide flex items-center gap-2 rounded-2xl bg-amber-100 p-3 text-sm font-bold text-amber-950 sm:text-base dark:bg-amber-950/60 dark:text-amber-100"
							style:--delay="450ms"
							role="status"
						>
							<SwordsIcon class="size-6 shrink-0" />
							{t('quiz.closeRace', { points: gap })}
						</p>
					{/if}
				</div>

				<!-- Before the ranking stage the rows stay as the live ranking left them; then they slide. -->
				{#if reveal.top.length > 0}
					<div class="min-w-0 [@media(max-height:460px)]:hidden">
						<Standings lines={stage >= 2 ? reveal.top : earlier} from={earlier} />
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
