<script lang="ts">
	/**
	 * The race's screens, read only: the lobby, the open question, the reveal and
	 * the podium, as the game's state says. The teacher's stage wraps them with its
	 * controls; a recording's replay shows them as they are.
	 */
	import type { StageRoom } from '../stage-room';
	import HostLobby from './host-lobby.svelte';
	import HostReveal from './host-reveal.svelte';
	import PodiumView from './podium-view.svelte';
	import QuestionView from './question-view.svelte';

	let { room }: { room: StageRoom } = $props();

	const phase = $derived(room.game.phase);
</script>

{#if phase === 'lobby'}
	<HostLobby {room} />
{:else if phase === 'question'}
	<QuestionView {room} />
{:else if phase === 'reveal'}
	<HostReveal {room} />
{:else}
	<PodiumView {room} />
{/if}
