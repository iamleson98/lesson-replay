<script lang="ts">
	/**
	 * The end of the game, as a drumroll: third place rises, then second, then
	 * first with a pop and confetti (CSS only, none with reduced motion). The
	 * host can skip to the end of it. A player also sees their own rank; the
	 * host the whole order.
	 */
	import type { Snippet } from 'svelte';
	import { t } from '../../i18n/strings.svelte';
	import { cn } from '#lib/utils.js';
	import CrownIcon from '@lucide/svelte/icons/crown';
	import { SuiButton } from '#lib/sui/button/index.js';
	import type { QuizGame } from '../game.svelte';
	import type { StageRoom } from '../stage-room';
	import AvatarDisc from './avatar-disc.svelte';
	import CountUp from './count-up.svelte';
	import ScoreList from './score-list.svelte';
	import './quiz-motion.css';

	let {
		room,
		podium: given,
		avatar,
		points
	}: {
		room: StageRoom;
		/** A podium other than the race's (Quest's, with coins as the score). */
		podium?: QuizGame['podium'];
		/** Draws a name's picture in place of the animal avatar. */
		avatar?: Snippet<[string, 'sm' | 'md', string]>;
		/** Writes a score in place of "n pts". */
		points?: (n: number) => string;
	} = $props();

	const podium = $derived(given ?? room.game.podium);
	let skipped = $state(false);

	// Third place, then second, then first.
	const STEPS = [
		{
			place: 2,
			height: 'h-16 [@media(min-height:701px)]:h-36 [@media(max-height:460px)]:h-9',
			tone: 'bg-slate-500',
			delay: 1100
		},
		{
			place: 1,
			height: 'h-24 [@media(min-height:701px)]:h-48 [@media(max-height:460px)]:h-14',
			tone: 'bg-amber-600',
			delay: 2200
		},
		{
			place: 3,
			height: 'h-12 [@media(min-height:701px)]:h-24 [@media(max-height:460px)]:h-7',
			tone: 'bg-orange-800',
			delay: 0
		}
	] as const;
	const CONFETTI = [
		'bg-red-500',
		'bg-blue-500',
		'bg-amber-500',
		'bg-green-500',
		'bg-violet-500',
		'bg-cyan-500'
	];
	const pieces = Array.from({ length: 36 }, (_, i) => i);
</script>

{#if podium}
	<div
		class={cn(
			'relative flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto',
			skipped && 'qz-skip'
		)}
	>
		<p class="sr-only" role="status" aria-live="polite">{t('quiz.announce.podium')}</p>
		<div class="flex shrink-0 items-center justify-between gap-3">
			<h2 class="text-xl font-extrabold sm:text-3xl [@media(max-height:560px)]:text-base">
				{t('quiz.podium')}
			</h2>
			{#if room.host && !skipped}
				<SuiButton variant="ghost" size="sm" onclick={() => (skipped = true)}>
					{t('quiz.podium.skip')}
				</SuiButton>
			{/if}
		</div>

		<ol
			class="flex shrink-0 items-end justify-center gap-2 sm:gap-4"
			aria-label={t('quiz.podium')}
		>
			{#each STEPS as step (step.place)}
				{@const line = podium.top[step.place - 1]}
				<li class="flex w-1/3 max-w-44 min-w-0 flex-col items-center gap-1">
					{#if line}
						<div
							class="qz-step-name flex w-full min-w-0 flex-col items-center gap-0.5 text-center"
							style:--delay={`${step.delay}ms`}
						>
							{#if step.place === 1}<CrownIcon
									class="size-7 fill-amber-400 text-amber-500 [@media(max-height:460px)]:size-4"
								/>{/if}
							{#if avatar}
								{@render avatar(
									line.name,
									'md',
									'[@media(max-height:460px)]:size-7'
								)}
							{:else}
								<AvatarDisc
									name={line.name}
									size="md"
									class="[@media(max-height:460px)]:size-7 [@media(max-height:460px)]:text-base"
								/>
							{/if}
							<span class="w-full truncate text-sm font-bold sm:text-base"
								>{line.name}</span
							>
							<span class="text-sm font-extrabold tabular-nums">
								{#if points}{points(line.score)}{:else}<CountUp
										value={line.score}
										from={skipped ? line.score : 0}
									/>{/if}
							</span>
						</div>
					{/if}
					<div
						class={cn(
							'qz-step flex w-full items-start justify-center rounded-t-2xl pt-1 text-3xl font-black text-white',
							step.height,
							step.tone,
							!line && 'opacity-30'
						)}
						style:--delay={`${step.delay}ms`}
					>
						{step.place}
					</div>
				</li>
			{/each}
		</ol>

		<div class="min-h-0 min-w-0 flex-1 space-y-2 overflow-y-auto">
			{#if podium.me}
				<p
					class="qz-slide bg-primary/10 text-primary rounded-2xl p-4 text-center text-lg font-extrabold tabular-nums"
					style:--delay="2800ms"
					role="status"
				>
					{podium.me.rank > 0
						? t('quiz.podium.yourRank', { n: podium.me.rank })
						: t('quiz.unranked')}
					· {points ? points(podium.me.score) : t('quiz.points', { n: podium.me.score })}
				</p>
			{/if}
			{#if podium.all}
				<ScoreList lines={podium.all} label={t('quiz.fullOrder')} {avatar} {points} />
			{/if}
		</div>

		<div
			class="qz-confetti pointer-events-none absolute inset-0 z-30 overflow-hidden"
			aria-hidden="true"
		>
			{#each pieces as i (i)}
				<i
					class={cn(
						'absolute top-0 block h-3 w-2 rounded-sm',
						CONFETTI[i % CONFETTI.length]
					)}
					style:left={`${(i * 29) % 100}%`}
					style:--x={`${i % 2 ? 70 : -70}px`}
					style:--r={`${360 + (i % 5) * 120}deg`}
					style:--dur={`${2.6 + (i % 5) * 0.35}s`}
					style:--d={`${(i % 9) * 140}ms`}
					style:--start="2300ms"
				></i>
			{/each}
		</div>
	</div>
{/if}
