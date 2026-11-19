<script lang="ts">
	/** The question's countdown ring: calm, then warm, then red and pulsing in the last five seconds. */
	import { t } from '../../i18n/strings.svelte';
	import type { createCountdown } from '../countdown.svelte';
	import Ring from './ring.svelte';

	let {
		countdown,
		done = false,
		class: className = ''
	}: {
		countdown: ReturnType<typeof createCountdown>;
		done?: boolean;
		class?: string;
	} = $props();

	const tone = $derived(
		countdown.urgent
			? 'text-red-700 dark:text-red-400'
			: countdown.seconds <= 10
				? 'text-amber-600 dark:text-amber-400'
				: 'text-primary'
	);
</script>

<Ring
	class={className}
	fraction={done ? 0 : countdown.fraction}
	{tone}
	pulse={!done && countdown.urgent}
	label={t('quiz.secondsLeft', { n: done ? 0 : countdown.seconds })}
>
	{done ? 0 : countdown.seconds}
</Ring>
