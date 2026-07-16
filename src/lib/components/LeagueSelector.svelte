<script lang="ts">
	type Props = {
		selectedLeague: string;
		onLeagueChange: (league: string) => void;
	};

	const leagues = ['Runes of Aldur', 'HC Runes of Aldur', 'Standard', 'Hardcore'] as const;
	let { selectedLeague, onLeagueChange }: Props = $props();

	function handleChange(event: Event) {
		const target = event.currentTarget;
		if (target instanceof HTMLSelectElement) {
			onLeagueChange(target.value);
		}
	}
</script>

<label class="select-wrap">
	<span class="select-label">League</span>
	<select value={selectedLeague} onchange={handleChange}>
		{#each leagues as league (league)}
			<option value={league}>{league}</option>
		{/each}
	</select>
</label>

<style>
	.select-wrap {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: min(100%, 25rem);
		margin: 0 auto;
		font-family: var(--font-secondary);
	}

	.select-label {
		color: var(--text-accent);
		font-family: var(--font-primary);
		font-size: var(--font-size-sm);
		font-weight: var(--fw-medium);
		letter-spacing: 0.02em;
	}

	select {
		width: 100%;
		padding: 0.75rem 2.5rem 0.75rem 1rem;
		border: 1px solid var(--ui-border);
		border-radius: 0.75rem;
		background-color: var(--ui-element-bg);
		color: var(--text-primary);
		font: inherit;
		cursor: pointer;
		transition:
			border-color var(--transition-standard),
			background-color var(--transition-standard);
	}

	select:hover {
		border-color: var(--primary-accent);
	}

	select:focus-visible {
		outline: 2px solid var(--primary-accent);
		outline-offset: 2px;
	}

	select:active {
		background-color: var(--ui-active-bg);
	}

	@media (max-width: 420px) {
		.select-wrap {
			align-items: stretch;
			flex-direction: column;
			gap: 0.5rem;
		}
	}
</style>
