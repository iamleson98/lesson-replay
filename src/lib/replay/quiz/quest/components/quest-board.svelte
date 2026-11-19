<script lang="ts">
	/**
	 * The teacher's live board: the top ten by coins. Each row is placed with a
	 * transform inside a clipped box of fixed height, so a row that passes another
	 * slides to its new place; its coins count up. Names are cut with an ellipsis
	 * (they are people's names, not questions).
	 */
	import { t } from '../../../i18n/strings.svelte';
	import { cn } from '#lib/utils.js';
	import CountUp from '../../components/count-up.svelte';
	import type { Row } from '../quest-protocol';
	import CharacterDisc from './character-disc.svelte';
	import Glyph from './glyph.svelte';
	import './quest-motion.css';

	let { rows }: { rows: Row[] } = $props();

	/** Names may repeat; a row's key must not. */
	const keyed = $derived.by(() => {
		const seen: Record<string, number> = Object.create(null);
		return rows.map((row, rank) => {
			const n = (seen[row.name] ?? 0) + 1;
			seen[row.name] = n;
			return { row, rank, key: n > 1 ? `${row.name}#${n}` : row.name };
		});
	});
	// Stable order of the DOM, so a moving row is the same element.
	const byKey = $derived([...keyed].sort((a, b) => (a.key < b.key ? -1 : 1)));
</script>

<ol
	class={cn(
		'relative min-w-0 overflow-hidden contain-[layout_paint]',
		'[--row-h:2.75rem] [@media(max-height:700px)]:[--row-h:2.25rem] [@media(max-height:560px)]:[--row-h:1.875rem]'
	)}
	style:height={`calc(var(--row-h) * ${Math.max(rows.length, 1)})`}
	aria-label={t('quest.host.board')}
>
	{#each byKey as { row, rank, key } (key)}
		<li
			class="qq-row absolute inset-x-0 top-0 h-(--row-h) py-0.5"
			style:transform={`translateY(calc(var(--row-h) * ${rank}))`}
			aria-posinset={rank + 1}
			aria-setsize={rows.length}
		>
			<div
				class={cn(
					'bg-card flex size-full min-w-0 items-center gap-2 rounded-xl border px-2 text-sm sm:gap-3 sm:px-3',
					rank === 0 && 'border-amber-500 bg-amber-50 dark:bg-amber-950/40'
				)}
			>
				<span
					class="w-5 shrink-0 text-center text-xs font-black tabular-nums sm:w-6 sm:text-sm"
					>{rank + 1}</span
				>
				<CharacterDisc
					id={row.character}
					size="sm"
					class="[@media(max-height:560px)]:size-6"
				/>
				<span class="min-w-0 flex-1 truncate font-bold sm:text-base">{row.name}</span>
				<span class="flex shrink-0 items-center gap-1 font-black tabular-nums sm:text-base">
					<Glyph kind="coin" class="size-4 sm:size-5" />
					<CountUp value={row.coins} from={row.coins} />
				</span>
			</div>
		</li>
	{/each}
</ol>
