<script lang="ts">
	/**
	 * "Question 2 of 5" scales in over the stage and fades out in under 700 ms.
	 * It never blocks: the question is already open and the server's timer is
	 * running, so it is an overlay that takes no clicks.
	 */
	import { t } from '../../i18n/strings.svelte';

	let { q, count }: { q: number; count: number } = $props();
</script>

{#key q}
	<div
		class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
		aria-hidden="true"
	>
		<div
			class="qz-splash bg-primary text-primary-foreground rounded-3xl px-8 py-5 text-3xl font-extrabold shadow-2xl sm:text-5xl"
		>
			{t('quiz.questionOf', { n: q, total: count })}
		</div>
	</div>
{/key}
