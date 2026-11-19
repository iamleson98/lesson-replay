<script lang="ts">
	/**
	 * The host's switch for the live results of an open question (see
	 * `live-results.svelte.ts`): a small icon button of one fixed size, so
	 * flipping it moves nothing. It is a real switch for the keyboard and for
	 * screen readers.
	 */
	import { t } from '../../i18n/strings.svelte';
	import { cn } from '#lib/utils.js';
	import EyeIcon from '@lucide/svelte/icons/eye';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import { hideLive } from '../live-results.svelte';

	let { class: className = '' }: { class?: string } = $props();
	const hintId = $props.id();
</script>

<button
	type="button"
	role="switch"
	aria-checked={hideLive.hidden}
	aria-label={t('quiz.host.hideLive')}
	aria-describedby={hintId}
	title={`${t('quiz.host.hideLive')}: ${t('quiz.host.hideLiveHint')}`}
	onclick={() => hideLive.toggle()}
	class={cn(
		'focus-visible:ring-ring flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none',
		hideLive.hidden
			? 'border-primary bg-primary text-primary-foreground'
			: 'bg-card text-muted-foreground hover:bg-accent',
		className
	)}
>
	{#if hideLive.hidden}
		<EyeOffIcon class="size-4" aria-hidden="true" />
	{:else}
		<EyeIcon class="size-4" aria-hidden="true" />
	{/if}
	<span id={hintId} class="sr-only">{t('quiz.host.hideLiveHint')}</span>
</button>
