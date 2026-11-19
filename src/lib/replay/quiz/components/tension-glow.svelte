<script lang="ts">
	/** The last five seconds: a soft red glow at the edges of the stage, pulsing (clipped to it). */
	let { active }: { active: boolean } = $props();
</script>

{#if active}
	<div
		class="qz-edge pointer-events-none absolute inset-0 z-30 shadow-[inset_0_0_90px_12px_rgb(239_68_68/0.45)]"
		aria-hidden="true"
	></div>
{/if}
