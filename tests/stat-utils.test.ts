import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseItemText } from '../src/lib/utils/item-parser.js';
import { fetchStats, findStatId, normalizeStatText } from '../src/lib/utils/stat-utils.js';

test('normalizes PoE 2 advanced-copy roll ranges and modifier markers', () => {
	assert.equal(normalizeStatText('+104(100-119) to maximum Life'), '# to maximum life');
	assert.equal(normalizeStatText('+45 to maximum Life (rune)'), '# to maximum life');
	assert.equal(
		normalizeStatText('18(15-19)% increased Critical Damage Bonus'),
		'#% increased critical damage bonus'
	);
});

test('matches supplied gloves to correct PoE 2 stat namespaces', async () => {
	const cache = JSON.parse(
		await readFile(new URL('../src/lib/server/cache/stats.json', import.meta.url), 'utf8')
	) as { data: unknown };
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async () => new Response(JSON.stringify(cache.data));

	try {
		await fetchStats();
	} finally {
		globalThis.fetch = originalFetch;
	}

	const itemText = await readFile(
		new URL('./fixtures/poe2-rare-gloves.txt', import.meta.url),
		'utf8'
	);
	const ids = parseItemText(itemText).stats.map(findStatId);

	assert.deepEqual(ids, [
		'rune.stat_3299347043',
		'explicit.stat_3299347043',
		'explicit.stat_1050105434',
		'explicit.stat_4220027924',
		'explicit.stat_3556824919',
		'explicit.stat_328541901'
	]);
});
