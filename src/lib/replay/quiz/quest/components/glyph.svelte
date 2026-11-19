<script lang="ts" module>
	export type GlyphKind =
		'coin' | 'jackpot' | 'booster' | 'shield' | 'steal' | 'slip' | 'chest' | 'chestOpen';
</script>

<script lang="ts">
	/**
	 * The small pictures of Quest, drawn by us from plain shapes: a coin, a
	 * jackpot, the booster's bolt, a shield, the stealing hand, a slip, a chest
	 * (closed or open). Static, outlined so they read in both themes.
	 */
	let { kind, class: className = '' }: { kind: GlyphKind; class?: string } = $props();

	const INK = '#1e293b';
</script>

<svg
	viewBox="0 0 64 64"
	class={className}
	fill="none"
	stroke={INK}
	stroke-width="2.2"
	stroke-linejoin="round"
	stroke-linecap="round"
	aria-hidden="true"
	focusable="false"
>
	{#if kind === 'coin'}
		<circle cx="32" cy="32" r="22" fill="#fbbf24" />
		<circle cx="32" cy="32" r="15" fill="#fde68a" />
		<path
			d="M32 22V42M26 28Q26 24 32 24 38 24 38 28 38 32 32 32 26 32 26 36 26 40 32 40 38 40 38 36"
		/>
	{:else if kind === 'jackpot'}
		<path d="M32 4 39 22 58 22 43 34 49 54 32 42 15 54 21 34 6 22 25 22Z" fill="#f59e0b" />
		<circle cx="32" cy="32" r="11" fill="#fde68a" />
		<path d="M28 32H36M32 28V36" />
	{:else if kind === 'booster'}
		<path d="M36 4 14 36H29L25 60 50 26H35Z" fill="#facc15" />
	{:else if kind === 'shield'}
		<path d="M32 5 54 13V32Q54 50 32 59 10 50 10 32V13Z" fill="#38bdf8" />
		<path d="M32 13 46 18V32Q46 44 32 51Z" fill="#e0f2fe" stroke="none" />
		<path d="M32 5 54 13V32Q54 50 32 59 10 50 10 32V13Z" />
	{:else if kind === 'steal'}
		<rect x="14" y="28" width="32" height="26" rx="8" fill="#fb923c" />
		<rect x="14" y="10" width="7" height="24" rx="3.5" fill="#fb923c" />
		<rect x="23" y="6" width="7" height="28" rx="3.5" fill="#fb923c" />
		<rect x="32" y="8" width="7" height="26" rx="3.5" fill="#fb923c" />
		<rect x="41" y="14" width="7" height="22" rx="3.5" fill="#fb923c" />
		<path d="M14 40 5 33Q3 30 7 29L16 34" fill="#fb923c" />
		<circle cx="52" cy="50" r="9" fill="#fbbf24" />
	{:else if kind === 'slip'}
		<circle cx="32" cy="32" r="22" fill="#cbd5e1" />
		<path d="M32 10 28 24 37 30 29 40 34 54" />
		<path d="M20 34H44" />
	{:else if kind === 'chest'}
		<path d="M8 28Q8 10 32 10 56 10 56 28Z" fill="#b45309" />
		<rect x="8" y="28" width="48" height="26" rx="4" fill="#92400e" />
		<path d="M8 28H56" />
		<rect x="26" y="22" width="12" height="14" rx="3" fill="#fbbf24" />
		<circle cx="32" cy="29" r="2" fill={INK} stroke="none" />
		<path d="M18 11V28M46 11V28M18 28V54M46 28V54" stroke-width="1.8" />
	{:else}
		<path d="M10 24 14 4H50L54 24Z" fill="#b45309" transform="rotate(-8 32 24)" />
		<rect x="8" y="26" width="48" height="28" rx="4" fill="#92400e" />
		<path d="M10 28H54V32Q32 40 10 32Z" fill="#fde68a" stroke="none" />
		<path d="M8 26H56" />
		<path d="M18 26V54M46 26V54" stroke-width="1.8" />
	{/if}
</svg>
