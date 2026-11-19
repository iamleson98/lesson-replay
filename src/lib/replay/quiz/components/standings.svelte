<script lang="ts">
	/**
	 * The teacher's standings. While a question is open it is the provisional
	 * top ten (every answer scored on arrival, refreshed about twice a second),
	 * labelled live; at the reveal it is the final top five, its rows sliding
	 * from where the live ranking had them. It is a fixed-height list that
	 * lives inside the stage's one scrolling region, so it never pushes the
	 * layout.
	 */
	import { t } from '../../i18n/strings.svelte';
	import type { ScoreLine } from '../protocol';
	import StandingsRow from './standings-row.svelte';

	let {
		lines,
		from = [],
		live = false
	}: { lines: ScoreLine[]; from?: ScoreLine[]; live?: boolean } = $props();

	const ROW = 48;
	/** A key per line that stays the same for the same name (the nth of equal names counts apart). */
	const keyed = (list: ScoreLine[]) =>
		list.map((l, i) => ({
			...l,
			key: `${l.name}#${list.slice(0, i).filter((x) => x.name === l.name).length}`
		}));
	const rows = $derived(keyed(lines));
	const before = $derived(keyed(from));
</script>

<section class="min-w-0 space-y-2">
	<h3 class="text-muted-foreground flex items-center gap-2 text-sm font-bold">
		{live ? t('quiz.standings.live') : t('quiz.topFive')}
		{#if live}
			<span class="relative flex size-2.5" aria-hidden="true">
				<span class="qz-ring-pulse absolute inline-flex size-full rounded-full bg-red-500"
				></span>
				<span class="relative inline-flex size-2.5 rounded-full bg-red-500"></span>
			</span>
		{/if}
	</h3>
	<ol
		class="relative"
		style:height={`${Math.max(lines.length, 1) * ROW}px`}
		aria-label={live ? t('quiz.standings.live') : t('quiz.topFive')}
	>
		{#each rows as line, i (line.key)}
			{@const was = before.findIndex((l) => l.key === line.key)}
			<StandingsRow
				index={i}
				startIndex={was >= 0 ? was : i}
				name={line.name}
				score={line.score}
				startScore={was >= 0 ? before[was].score : 0}
				row={ROW}
			/>
		{/each}
	</ol>
	{#if lines.length === 0}
		<p class="text-muted-foreground text-sm">{t('quiz.standings.empty')}</p>
	{/if}
</section>
