<script lang="ts">
	import { fetchStats, findStatId, extractValue } from '$lib/utils/stat-utils.js';
	import { parseItemText } from '$lib/utils/item-parser.js';
	import { ITEM_CLASS_MAP } from '../constants/item-class-map.js';

	type Props = {
		league: string;
	};

	let { league }: Props = $props();

	let itemText = $state('');
	let error = $state<string | null>(null);
	let loading = $state(false);
	let includeItemLevel = $state(false);
	let isStatsLoaded = $state(false);
	let itemDisplayHtml = $state('');

	$effect(() => {
		let cancelled = false;

		void fetchStats()
			.then(() => {
				if (!cancelled) isStatsLoaded = true;
			})
			.catch((err: unknown) => {
				if (cancelled) return;
				error = 'Failed to load item stats database';
				console.error('Failed to load stats:', err);
			});

		return () => {
			cancelled = true;
		};
	});

	async function handleSearch() {
		if (!itemText.trim()) {
			error = 'Please paste an item first';
			return;
		}

		if (!isStatsLoaded) {
			error = 'Item stats database is not ready yet. Please try again in a moment.';
			return;
		}

		loading = true;
		error = null;

		try {
			const parsedItem = parseItemText(itemText);

			if (parsedItem.itemClass && !ITEM_CLASS_MAP[parsedItem.itemClass]) {
				error = `Item type "${parsedItem.itemClass}" is not supported yet`;
				loading = false;
				return;
			}

			const baseQuery = {
				query: {
					status: { option: 'online' },
					stats: [{ type: 'and', filters: [], disabled: false }]
				},
				sort: { price: 'asc' }
			};

			let query;
			if (parsedItem.rarity === 'Unique' && parsedItem.name && parsedItem.baseType) {
				query = {
					...baseQuery,
					query: {
						...baseQuery.query,
						name: parsedItem.name,
						type: parsedItem.baseType,
						filters: {
							type_filters: {
								filters: {
									...(parsedItem.itemClass && {
										category: { option: ITEM_CLASS_MAP[parsedItem.itemClass] }
									}),
									...(parsedItem.itemLevel &&
										includeItemLevel && {
											ilvl: { min: parsedItem.itemLevel }
										})
								},
								disabled: false
							}
						}
					}
				};
			} else {
				const statFilters = parsedItem.stats
					.map((stat) => {
						const statId = findStatId(stat);
						if (!statId) {
							console.log('No stat ID found for:', stat);
							return null;
						}

						const value = extractValue(stat);
						console.log('Found stat:', {
							id: statId,
							value,
							originalStat: stat
						});

						return {
							id: statId,
							value: { min: value },
							disabled: false
						};
					})
					.filter((filter): filter is NonNullable<typeof filter> => filter !== null);

				if (statFilters.length === 0) {
					error = 'No valid stats found to search for';
					loading = false;
					return;
				}

				query = {
					...baseQuery,
					query: {
						...baseQuery.query,
						stats: [
							{
								type: 'and',
								filters: statFilters,
								disabled: false
							}
						],
						filters: {
							type_filters: {
								filters: {
									...(parsedItem.itemClass && {
										category: { option: ITEM_CLASS_MAP[parsedItem.itemClass] }
									}),
									...(parsedItem.itemLevel &&
										includeItemLevel && {
											ilvl: { min: parsedItem.itemLevel }
										})
								},
								disabled: false
							}
						}
					}
				};
			}

			const response = await fetch('/api/poe/search', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ query, league })
			});

			if (!response.ok) {
				const errorData: { error?: string } = await response.json();
				if (response.status === 429) {
					throw new Error('Too many requests. Please wait a moment and try again.');
				}
				throw new Error(errorData.error || 'Search failed');
			}

			type SearchResponse = { id: string };
			const data: SearchResponse = await response.json();

			if (data.id) {
				const tradeUrl = `https://www.pathofexile.com/trade2/search/${league}/${data.id}`;
				const newWindow = window.open(tradeUrl, '_blank');
				if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
					error = 'Popup was blocked. Please allow popups for this site and try again.';
					console.log('Trade URL:', tradeUrl);
				}
			} else {
				throw new Error('No search ID returned');
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'An error occurred';
			console.error('Search error:', err);
		} finally {
			loading = false;
		}
	}

	function formatItemText(text: string): string {
		if (!text) return '';

		return text
			.split('\n')
			.map((line, i) => {
				const safeLine = escapeHtml(line);

				if (line.includes('--------')) {
					return `<div class="separator">${safeLine}</div>`;
				}
				if (line.startsWith('Item Class:')) {
					return `<div class="item-class">${safeLine}</div>`;
				}
				if (line.startsWith('Item Level:')) {
					return `<div class="item-level">${safeLine}</div>`;
				}
				if (line.startsWith('Rarity:')) {
					return `<div class="rarity">${safeLine}</div>`;
				}
				if (line.match(/[0-9]+/)) {
					return `<div class="stat">${safeLine}</div>`;
				}
				if (line.includes('Requires')) {
					return `<div class="requirement">${safeLine}</div>`;
				}
				if (i <= 2 && line.trim() && !line.includes(':')) {
					return `<div class="item-name">${safeLine}</div>`;
				}
				return `<div class="regular-text">${safeLine || '<br>'}</div>`;
			})
			.join('');
	}

	function escapeHtml(text: string): string {
		return text.replace(
			/[&<>"']/g,
			(character) =>
				({
					'&': '&amp;',
					'<': '&lt;',
					'>': '&gt;',
					'"': '&quot;',
					"'": '&#039;'
				})[character] ?? character
		);
	}

	function handlePaste(e: ClipboardEvent) {
		e.preventDefault();
		const text = e.clipboardData?.getData('text') || '';
		itemText = text;
		itemDisplayHtml = formatItemText(text);
	}

	function handleInput(e: Event) {
		const target = e.target;
		if (target instanceof HTMLDivElement) {
			itemText = target.innerText || '';
		}
	}
</script>

<div class="item-checker">
	<div class="item-input-container">
		<div
			class="item-input"
			contenteditable
			role="textbox"
			tabindex="0"
			bind:innerHTML={itemDisplayHtml}
			onpaste={handlePaste}
			oninput={handleInput}
			aria-label="Path of Exile item data"
			aria-multiline="true"
			data-placeholder="Paste copied item data here"
			spellcheck="false"
		></div>
	</div>

	{#if error}
		<div class="error-message" role="alert">
			{error}
		</div>
	{/if}

	<div class="option-container">
		<span id="includeItemLevel-label" class="option-label">Include item level in search</span>
		<button
			role="switch"
			id="includeItemLevel"
			aria-checked={includeItemLevel}
			aria-labelledby="includeItemLevel-label"
			class="toggle-switch"
			class:active={includeItemLevel}
			onclick={() => (includeItemLevel = !includeItemLevel)}
		>
			<span class="toggle-knob"></span>
		</button>
	</div>

	<button
		class="search-button"
		data-umami-event="Search button"
		onclick={handleSearch}
		disabled={loading || !isStatsLoaded}
	>
		{#if loading}
			<div class="loading-indicator">
				<svg class="spinner" viewBox="0 0 24 24" aria-hidden="true">
					<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
					<path
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					/>
				</svg>
				Searching...
			</div>
		{:else if !isStatsLoaded}
			Loading item stats…
		{:else}
			Search on PoE Trade
		{/if}
	</button>
</div>

<style>
	.item-checker {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		border-radius: 0.75rem;
		width: 100%;
		font-family: var(--font-secondary);
		color: var(--text-primary);
	}

	.item-input-container {
		position: relative;
		isolation: isolate;
	}

	.item-input-container::before {
		content: '';
		position: absolute;
		inset: -4px;
		background: var(--primary-gradient);
		border-radius: 0.75rem;
		opacity: 0.15;
		z-index: -1;
		transition: opacity var(--transition-standard);
	}

	.item-input-container:hover::before {
		opacity: 0.25;
		transition-duration: 800ms;
	}

	.item-input {
		position: relative;
		width: 100%;
		height: 16rem;
		padding: 1rem;
		background-color: var(--primary-bg);
		border: 1px solid var(--ui-border);
		border-radius: 0.75rem;
		color: var(--text-primary);
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		line-height: var(--line-height-base);
		overflow: auto;
		white-space: pre-wrap;
		transition:
			border-color var(--transition-standard),
			box-shadow var(--transition-standard);
	}

	.item-input:empty::before {
		content: attr(data-placeholder);
		color: var(--text-secondary);
		pointer-events: none;
	}

	.item-input:focus {
		outline: none;
		border-color: rgba(209, 123, 70, 0.5);
		box-shadow: 0 0 0 1px rgba(209, 123, 70, 0.3);
	}

	.error-message {
		text-align: center;
		padding: 0.75rem;
		background-color: var(--ui-error-bg);
		border: 1px solid var(--ui-error-border);
		border-radius: 0.5rem;
		color: var(--ui-error-text);
		font-size: var(--font-size-sm);
	}

	.option-container {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		color: var(--text-secondary);
		padding: 0.25rem 0;
	}

	.option-label {
		font-size: var(--font-size-sm);
		font-family: var(--font-secondary);
		user-select: none;
	}

	.toggle-switch {
		position: relative;
		display: inline-flex;
		align-items: center;
		height: 1.5rem;
		width: 2.75rem;
		border-radius: 9999px;
		background-color: var(--ui-toggle-bg);
		transition: background-color var(--transition-standard);
		border: 1px solid var(--ui-border);
	}

	.toggle-switch:focus-visible {
		outline: 2px solid var(--primary-accent);
		outline-offset: 2px;
	}

	.toggle-switch.active {
		background: var(--primary-gradient);
		border-color: transparent;
	}

	.toggle-knob {
		position: absolute;
		left: 0.25rem;
		display: inline-block;
		height: 0.9rem;
		width: 0.9rem;
		border-radius: 50%;
		background-color: white;
		transform: translateX(0);
		transition: transform var(--transition-standard);
		box-shadow: var(--shadow-sm);
	}

	.toggle-switch.active .toggle-knob {
		transform: translateX(1.25rem);
	}

	.search-button {
		position: relative;
		width: 100%;
		padding: 0.9rem 1.5rem;
		border: none;
		border-radius: 0.75rem;
		background: var(--primary-gradient);
		color: white;
		font-family: var(--font-primary);
		font-size: var(--fs-base);
		font-weight: var(--fw-medium);
		letter-spacing: var(--ls-wide);
		cursor: pointer;
		transition:
			filter var(--transition-standard),
			box-shadow var(--transition-standard);
		box-shadow: var(--shadow-md);
		overflow: hidden;
		isolation: isolate;
	}

	.search-button::before {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(
			circle at 30% 107%,
			rgba(255, 255, 255, 0.2) 0%,
			rgba(255, 255, 255, 0) 80%
		);
		opacity: 0.6;
		z-index: -1;
	}

	.search-button:hover {
		filter: brightness(1.1);
		box-shadow: var(--shadow-lg), var(--glow-accent);
	}

	.search-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		box-shadow: var(--shadow-md);
	}

	.loading-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.spinner {
		animation: spin 1.2s cubic-bezier(0.5, 0.1, 0.5, 0.9) infinite;
		height: 1.25rem;
		width: 1.25rem;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	/* Using modern CSS layout features */
	@supports (display: grid) {
		.item-checker {
			display: grid;
			grid-gap: 1rem;
		}
	}

	/* Using container queries where supported */
	@supports (container-type: inline-size) {
		.item-checker {
			container-type: inline-size;
			container-name: checker;
		}

		@container checker (min-width: 480px) {
			.option-container {
				justify-content: flex-end;
			}
		}
	}
</style>
