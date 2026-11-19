<script lang="ts">
	/**
	 * The open question. The header (question number, the player's rank, the
	 * rings) and the question text stay pinned; the option tiles are the one
	 * region that scrolls, if a short screen leaves them too little room, and
	 * the player's status or confirm button stays pinned below. A player taps
	 * a tile (keys 1 to 6): a single-choice or true/false tile answers at once,
	 * a multiple-choice one toggles and is confirmed with a big button; the
	 * tile chosen pops and the others dim until the server's ack. The host sees
	 * the tiles filling as the class answers, the live standings (beside the
	 * tiles on a wide stage, below them on a narrow one), the "answered N of M"
	 * ring and the countdown.
	 */
	import { SuiButton } from '#lib/sui/button/index.js';
	import { t } from '../../i18n/strings.svelte';
	import { cn } from '#lib/utils.js';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import { bitCount, hasBit, maskOf, toggleBit } from '../protocol';
	import { createCountdown } from '../countdown.svelte';
	import { questionSize, tileColumns } from '../fit';
	import { hideLive } from '../live-results.svelte';
	import type { StageRoom } from '../stage-room';
	import CountdownRing from './countdown-ring.svelte';
	import HideLiveToggle from './hide-live-toggle.svelte';
	import OptionTile, { type TileState } from './option-tile.svelte';
	import QuestionSplash from './question-splash.svelte';
	import RaceStrip from './race-strip.svelte';
	import RankChip from './rank-chip.svelte';
	import Ring from './ring.svelte';
	import Standings from './standings.svelte';
	import TensionGlow from './tension-glow.svelte';
	import './quiz-motion.css';

	let { room }: { room: StageRoom } = $props();

	const game = $derived(room.game);
	const question = $derived(game.question);
	const player = $derived(!room.host);

	// The clock is the room's for its whole life: a live room has none, a replay one.
	// svelte-ignore state_referenced_locally
	const countdown = createCountdown(
		() =>
			question
				? { endsAt: question.endsAt, limitMs: question.limitMs, offset: room.clockOffset }
				: null,
		room.now
	);

	// A multiple-choice pick not yet sent; a new question starts blank.
	// Keyed on the number, not the object: a resent question keeps the pick.
	let picked = $state(0);
	let pickedFor = $state(0);
	$effect(() => {
		const q = question?.q ?? 0;
		if (q !== pickedFor) {
			pickedFor = q;
			picked = 0;
		}
	});

	const multiple = $derived(question?.kind === 1);
	const chosen = $derived(game.myMask ?? (multiple ? picked : 0));
	const canAnswer = $derived(
		player &&
			game.myMask === null &&
			!game.locked &&
			!game.refused &&
			!countdown.over &&
			!game.closing
	);
	// The teacher may hide what moves with the answers (counts, bars, the ranking) while the question is open.
	const masked = $derived(!player && hideLive.hidden);
	const biggest = $derived(Math.max(1, ...game.counts));
	// One column when a half-width tile would cut the longest option into too many lines.
	let gridWidth = $state(0);
	const columns = $derived(
		tileColumns(gridWidth, Math.max(0, ...(question?.options ?? []).map((o) => o.length)))
	);
	const standings = $derived(game.ranking.length > 0 ? game.ranking : game.standings);

	// A new question takes keyboard and screen-reader focus (the tile that was tapped is gone),
	// unless the person is typing somewhere else, like the chat.
	let heading = $state<HTMLElement | null>(null);
	$effect(() => {
		if (!question || !heading) return;
		const active = document.activeElement;
		if (
			!active ||
			active === document.body ||
			heading.closest('[data-quiz-stage]')?.contains(active)
		)
			heading.focus({ preventScroll: true });
	});

	function choose(position: number) {
		if (!canAnswer || !question) return;
		if (multiple) picked = toggleBit(picked, position);
		else room.answer(maskOf([position]));
	}

	function confirm() {
		if (canAnswer && multiple && bitCount(picked) > 0) room.answer(picked);
	}

	function stateOf(i: number): TileState {
		if (!player || chosen === 0) return 'idle';
		return hasBit(chosen, i) ? 'picked' : game.locked ? 'dim' : 'idle';
	}

	function onKey(e: KeyboardEvent) {
		if (!question || e.ctrlKey || e.metaKey || e.altKey) return;
		if (
			(e.target as HTMLElement | null)?.closest(
				'input, textarea, select, [contenteditable="true"]'
			)
		)
			return;
		const n = Number(e.key);
		if (Number.isInteger(n) && n >= 1 && n <= question.options.length) {
			e.preventDefault();
			choose(n - 1);
		} else if (e.key === 'Enter' && multiple && bitCount(picked) > 0) {
			e.preventDefault();
			confirm();
		}
	}

	const announcement = $derived(
		!question
			? ''
			: game.refused
				? t('quiz.waitNext')
				: game.locked
					? t('quiz.locked')
					: t('quiz.questionOf', { n: question.q, total: question.count })
	);
</script>

<svelte:window onkeydown={player ? onKey : undefined} />

{#if question}
	<div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2 sm:gap-3">
		<QuestionSplash q={question.q} count={question.count} />
		<TensionGlow active={countdown.urgent && !game.closing} />
		<p class="sr-only" role="status" aria-live="polite">{announcement}</p>

		<div class="flex shrink-0 items-center justify-between gap-2">
			<div class="flex min-w-0 flex-wrap items-center gap-1.5 text-sm font-bold">
				<span class="bg-primary/10 text-primary rounded-full px-3 py-1">
					{t('quiz.questionOf', { n: question.q, total: question.count })}
				</span>
				{#if multiple}
					<span class="bg-muted rounded-full px-3 py-1 text-xs"
						>{t('quiz.kind.multiple')}</span
					>
				{/if}
				{#if player}<RankChip {room} />{/if}
				{#if !player && game.closing}
					<span
						class="bg-muted text-muted-foreground flex items-center gap-2 rounded-full px-3 py-1"
						role="status"
					>
						{t('quiz.closing.host')}
						<span class="qz-dots flex gap-1" aria-hidden="true">
							<span class="size-1.5 rounded-full bg-current"></span>
							<span class="size-1.5 rounded-full bg-current"></span>
							<span class="size-1.5 rounded-full bg-current"></span>
						</span>
					</span>
				{/if}
			</div>
			<div class="flex shrink-0 items-center gap-2">
				{#if !player}
					<HideLiveToggle />
					<Ring
						class="size-11 sm:size-14 [@media(min-height:700px)]:size-16 [@media(max-height:460px)]:size-9"
						fraction={masked || game.players === 0 ? 0 : game.answered / game.players}
						tone="text-green-600 dark:text-green-400"
						label={masked
							? t('quiz.host.answersComing')
							: t('quiz.answered', { n: game.answered, total: game.players })}
					>
						<span class="text-[11px] sm:text-sm"
							>{masked ? '…' : `${game.answered}/${game.players}`}</span
						>
					</Ring>
				{/if}
				<CountdownRing
					class="size-11 sm:size-14 [@media(min-height:700px)]:size-16 [@media(max-height:460px)]:size-9"
					{countdown}
					done={game.closing}
				/>
			</div>
		</div>

		<!-- The one scrolling region: the question and the tiles (and, for the host, the live standings). -->
		<div class="@container min-h-0 min-w-0 flex-1 overflow-y-auto">
			<div
				class={cn(
					'grid min-w-0 content-start gap-2 sm:gap-3',
					!player && '@2xl:grid-cols-[minmax(0,1fr)_17rem]'
				)}
			>
				<div class="min-w-0 space-y-2 sm:space-y-3">
					<h2
						bind:this={heading}
						tabindex="-1"
						data-quiz-question
						class={cn(
							'leading-tight font-extrabold text-balance outline-none wrap-anywhere',
							questionSize(question.text.length)
						)}
					>
						{question.text}
					</h2>
					<ul
						class={cn(
							'grid min-w-0 auto-rows-fr gap-2 sm:gap-3 [@media(max-height:460px)]:grid-cols-3 [@media(max-height:460px)]:gap-1',
							columns === 1 ? 'grid-cols-1' : 'grid-cols-2'
						)}
						aria-label={t('quiz.options')}
						bind:clientWidth={gridWidth}
					>
						{#each question.options as option, i (i)}
							<li class="flex min-w-0">
								<OptionTile
									index={i}
									text={option}
									state={stateOf(i)}
									pick={player ? () => choose(i) : undefined}
									disabled={player && !canAnswer}
									count={player ? undefined : (game.counts[i] ?? 0)}
									fraction={player ? 0 : (game.counts[i] ?? 0) / biggest}
									{masked}
								/>
							</li>
						{/each}
					</ul>
				</div>
				{#if !player}
					<div class="min-w-0 [@media(max-height:460px)]:hidden">
						{#if masked}
							<section class="min-w-0 space-y-2">
								<h3 class="text-muted-foreground text-sm font-bold">
									{t('quiz.standings.live')}
								</h3>
								<p
									class="text-muted-foreground bg-muted/50 rounded-2xl border border-dashed p-3 text-sm"
								>
									{t('quiz.host.liveHidden')}
								</p>
							</section>
						{:else}
							<Standings
								lines={standings.slice(0, 10)}
								live={game.ranking.length > 0}
							/>
						{/if}
					</div>
				{:else}
					<div class="min-w-0 [@media(max-height:460px)]:hidden">
						<RaceStrip {room} />
					</div>
				{/if}
			</div>
		</div>

		{#if player}
			<div class="min-h-10 shrink-0 sm:min-h-12 [@media(max-height:700px)]:min-h-0">
				{#if game.closing}
					<p
						class="text-muted-foreground flex items-center gap-3 text-base font-bold"
						role="status"
					>
						{t('quiz.closing.player')}
						<span class="qz-dots flex gap-1" aria-hidden="true">
							<span class="size-2 rounded-full bg-current"></span>
							<span class="size-2 rounded-full bg-current"></span>
							<span class="size-2 rounded-full bg-current"></span>
						</span>
					</p>
				{:else if game.refused}
					<p class="text-muted-foreground flex items-center gap-2 text-sm font-semibold">
						<ClockIcon class="size-5" />{t('quiz.waitNext')}
					</p>
				{:else if game.locked}
					<p
						class="flex items-center gap-3 text-base font-bold text-green-800 dark:text-green-400"
					>
						{t('quiz.locked')}
						<span class="qz-dots flex gap-1" aria-hidden="true">
							<span class="size-2 rounded-full bg-current"></span>
							<span class="size-2 rounded-full bg-current"></span>
							<span class="size-2 rounded-full bg-current"></span>
						</span>
					</p>
				{:else if game.myMask !== null}
					<p class="text-muted-foreground text-base font-bold" role="status">
						{t('quiz.sending')}
					</p>
				{:else if countdown.over}
					<p class="text-muted-foreground text-sm font-semibold">{t('quiz.timeUp')}</p>
				{:else if multiple}
					<SuiButton
						size="lg"
						fullWidth
						disabled={bitCount(picked) === 0}
						onclick={confirm}
						aria-keyshortcuts="Enter"
						class="text-base font-extrabold"
					>
						{t('quiz.confirm')}
					</SuiButton>
				{/if}
			</div>
		{/if}
	</div>
{/if}
