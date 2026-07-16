import type { StatGroup, StatOption } from '$lib/types/stats.types.js';
import { attempt } from '$lib/utils/attempt.js';
import Fuse from 'fuse.js';

function isStatsApiResponse(data: unknown): data is { result: StatGroup[]; error?: string } {
	return (
		typeof data === 'object' &&
		data !== null &&
		'result' in data &&
		Array.isArray((data as { result: unknown }).result)
	);
}

function isStatGroup(obj: unknown): obj is StatGroup {
	const candidate = obj as Record<string, unknown>;
	return (
		typeof obj === 'object' &&
		obj !== null &&
		'entries' in obj &&
		Array.isArray(candidate.entries) &&
		'label' in obj &&
		typeof candidate.label === 'string'
	);
}

function isStatEntry(
	obj: unknown
): obj is { id: string; text: string; option?: Record<string, unknown> } {
	const candidate = obj as Record<string, unknown>;
	return (
		typeof obj === 'object' &&
		obj !== null &&
		'id' in obj &&
		'text' in obj &&
		typeof candidate.id === 'string' &&
		typeof candidate.text === 'string'
	);
}

interface OptimizedStatsCache {
	allStats: StatOption[];
	statsByNamespace: Map<string, StatSearchConfiguration>;
	fallbackSearch: StatSearchConfiguration;
	timestamp: number;
}

interface StatSearchConfiguration {
	normalizedMap: Map<string, StatOption>;
	fuseInstance: Fuse<StatOption> | null;
}

const MODIFIER_MARKER_TO_NAMESPACE: Record<string, string> = {
	implicit: 'implicit',
	fractured: 'fractured',
	crafted: 'crafted',
	enchant: 'enchant',
	rune: 'rune',
	augment: 'rune',
	desecrated: 'desecrated'
};

function statNamespace(stat: StatOption): string {
	return stat.id.split('.', 1)[0]?.toLowerCase() || 'unknown';
}

function requestedNamespace(statText: string): string {
	const marker = statText.match(
		/\((implicit|fractured|crafted|enchant|rune|augment|desecrated)\)\s*$/i
	)?.[1];

	return marker ? MODIFIER_MARKER_TO_NAMESPACE[marker.toLowerCase()]! : 'explicit';
}

class StatsManager {
	private cache: OptimizedStatsCache | null = null;
	private lastFetchAttempt = 0;
	private fetchPromise: Promise<StatOption[]> | null = null;

	private readonly CACHE_RETRY_INTERVAL = 60000; // 1 minute
	private readonly CACHE_TTL = 300000; // 5 minutes
	private readonly FUSE_THRESHOLD = 0.6;

	async fetchStats(): Promise<StatOption[]> {
		if (this.fetchPromise) {
			return this.fetchPromise;
		}

		if (this.cache && this.isCacheValid()) {
			return this.cache.allStats;
		}

		const now = Date.now();
		const timeSinceLastTry = now - this.lastFetchAttempt;

		if (timeSinceLastTry < this.CACHE_RETRY_INTERVAL && !this.cache) {
			throw new Error('Stats cache is unavailable. Please try again later.');
		}

		this.lastFetchAttempt = now;
		this.fetchPromise = this.doFetchStats();

		try {
			const result = await this.fetchPromise;
			return result;
		} finally {
			this.fetchPromise = null;
		}
	}

	private async doFetchStats(): Promise<StatOption[]> {
		try {
			const response = await this.fetchStatsFromAPI();
			const statsData = await this.parseStatsResponse(response);
			const processedStats = this.processStatsData(statsData);

			this.cache = this.createOptimizedCache(processedStats);
			return this.cache.allStats;
		} catch (error) {
			this.clearCache();
			throw error;
		}
	}

	private async fetchStatsFromAPI(): Promise<Response> {
		const [fetchError, response] = await attempt(fetch('/api/poe/stats', { cache: 'force-cache' }));

		if (fetchError) {
			throw new Error(`Network failed: ${fetchError.message}`);
		}

		if (!response.ok) {
			throw new Error(`Server error: ${response.status}`);
		}

		return response;
	}

	private async parseStatsResponse(
		response: Response
	): Promise<{ result: StatGroup[]; error?: string }> {
		const [jsonError, data] = await attempt(response.json());

		if (jsonError) {
			throw new Error('Bad JSON from server');
		}

		// Type validation instead of assertion
		if (!isStatsApiResponse(data)) {
			throw new Error('Invalid response format from server');
		}

		if (data.error) {
			throw new Error(data.error);
		}

		if (!data.result || data.result.length === 0) {
			throw new Error('No stats data from server');
		}

		return data;
	}

	private processStatsData(data: { result: StatGroup[] }): StatOption[] {
		const allStats: StatOption[] = [];

		for (const group of data.result) {
			if (!isStatGroup(group)) {
				continue;
			}

			for (const entry of group.entries) {
				if (!isStatEntry(entry)) {
					continue;
				}

				const stat: StatOption = {
					id: entry.id,
					text: entry.text,
					type: group.label,
					option: entry.option
				};

				allStats.push(stat);
			}
		}

		if (allStats.length === 0) {
			throw new Error('No valid stats received');
		}

		return allStats;
	}

	private createOptimizedCache(allStats: StatOption[]): OptimizedStatsCache {
		const statsByNamespace = new Map<string, StatOption[]>();
		for (const stat of allStats) {
			const namespace = statNamespace(stat);
			const namespaceStats = statsByNamespace.get(namespace) ?? [];
			namespaceStats.push(stat);
			statsByNamespace.set(namespace, namespaceStats);
		}

		return {
			allStats,
			statsByNamespace: new Map(
				[...statsByNamespace].map(([namespace, stats]) => [
					namespace,
					this.createSearchConfiguration(stats)
				])
			),
			fallbackSearch: this.createSearchConfiguration(allStats),
			timestamp: Date.now()
		};
	}

	private createSearchConfiguration(stats: StatOption[]): StatSearchConfiguration {
		const normalizedMap = new Map<string, StatOption>();

		for (const stat of stats) {
			const normalized = normalizeStatText(stat.text);
			if (normalized && !normalizedMap.has(normalized)) {
				normalizedMap.set(normalized, stat);
			}
		}

		return {
			normalizedMap,
			fuseInstance: stats.length > 0 ? this.createFuseInstance(stats) : null
		};
	}

	findStatId(statText: string): string | null {
		if (!statText || typeof statText !== 'string') {
			return null;
		}

		if (!this.cache) {
			console.error('Stats cache not ready');
			return null;
		}

		const cleanInput = normalizeStatText(statText);
		if (!cleanInput) {
			return null;
		}

		const namespace = requestedNamespace(statText);
		const searchConfig = this.getSearchConfiguration(namespace);

		const exactMatch = searchConfig.normalizedMap.get(cleanInput);
		if (exactMatch) {
			this.logMatch('Exact match found', cleanInput, exactMatch, namespace);
			return exactMatch.id;
		}

		const fuzzyMatch = this.findFuzzyMatch(cleanInput, searchConfig.fuseInstance);
		if (fuzzyMatch) {
			this.logMatch('Fuzzy match found', cleanInput, fuzzyMatch, namespace, fuzzyMatch.score);
			return fuzzyMatch.id;
		}

		this.logNoMatch(cleanInput, namespace, searchConfig.normalizedMap.size);
		return null;
	}

	private getSearchConfiguration(namespace: string): StatSearchConfiguration {
		if (!this.cache) {
			throw new Error('Cache not available');
		}

		return this.cache.statsByNamespace.get(namespace) ?? this.cache.fallbackSearch;
	}

	private findFuzzyMatch(
		cleanInput: string,
		fuseInstance: Fuse<StatOption> | null
	): (StatOption & { score?: number }) | null {
		if (!fuseInstance) return null;

		const searchResults = fuseInstance.search(cleanInput);
		const bestResult = searchResults[0];

		if (bestResult && bestResult.score !== undefined && bestResult.score < this.FUSE_THRESHOLD) {
			return { ...bestResult.item, score: bestResult.score };
		}

		return null;
	}

	private createFuseInstance(stats: StatOption[]): Fuse<StatOption> {
		return new Fuse(stats, {
			keys: ['text'],
			includeScore: true,
			threshold: this.FUSE_THRESHOLD,
			distance: 300,
			ignoreLocation: true,
			minMatchCharLength: 3,
			useExtendedSearch: true,
			getFn: (obj, path) => {
				if (path === 'text' && typeof obj.text === 'string') {
					return normalizeStatText(obj.text);
				}
				const value = obj[path as keyof StatOption];
				return value != null ? String(value) : '';
			}
		});
	}

	private isCacheValid(): boolean {
		return this.cache !== null && Date.now() - this.cache.timestamp < this.CACHE_TTL;
	}

	private clearCache(): void {
		this.cache = null;
	}

	// Logging methods
	private logMatch(
		type: string,
		input: string,
		match: StatOption,
		namespace: string,
		score?: number
	): void {
		if (process.env.NODE_ENV === 'development') {
			const logData: Record<string, unknown> = {
				input: this.sanitizeForLogging(input),
				match: this.sanitizeForLogging(match.text),
				id: match.id,
				type: match.type,
				namespace
			};
			if (score !== undefined) {
				logData.score = score;
			}
			console.debug(type, logData);
		}
	}

	private logNoMatch(input: string, namespace: string, statsSearched: number): void {
		if (process.env.NODE_ENV === 'development') {
			console.debug('No match found:', {
				input: this.sanitizeForLogging(input),
				namespace,
				statsSearched
			});
		}
	}

	private sanitizeForLogging(text: string): string {
		return text.replace(/[<>]/g, '');
	}
}

const statsManager = new StatsManager();

// Public API exports
export const fetchStats = (): Promise<StatOption[]> => statsManager.fetchStats();
export const findStatId = (statText: string): string | null => statsManager.findStatId(statText);

export function normalizeStatText(text: string): string {
	if (!text || typeof text !== 'string') {
		return '';
	}

	return text
		.toLowerCase()
		.replace(
			/([+-]?\d+(?:\.\d+)?)\s*\(\s*[+-]?\d+(?:\.\d+)?(?:\s*-\s*[+-]?\d+(?:\.\d+)?)?\s*\)/g,
			'$1'
		) // Remove advanced-copy roll ranges, e.g. 104(100-119)
		.replace(/\s*\((?:implicit|fractured|crafted|enchant|rune|augment|desecrated)\)\s*$/i, '')
		.replace(/\+(?=\d)/g, '') // Remove plus signs before numbers
		.replace(/\[|\]/g, '') // Remove brackets
		.replace(/\|.*?(?=\s|$)/g, '') // Remove pipe sections
		.replace(/[+-]?\d+\.?\d*/g, '#') // Replace numbers with placeholder
		.replace(/\s+/g, ' ') // Normalize whitespace
		.replace(/^adds /, '') // Remove common prefixes
		.replace(/^gain /, '')
		.replace(/^you /, '')
		.trim();
}

// Value extraction utility
export function extractValue(statText: string): number {
	if (!statText || typeof statText !== 'string') {
		return 0;
	}

	const matches = statText.match(/([+-]?\d+\.?\d*)/g);
	if (!matches) return 0;
	return parseFloat(matches[0]);
}
