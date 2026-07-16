import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseItemText } from '../src/lib/utils/item-parser.js';

test('parses PoE 2 advanced-copy item text', async () => {
	const itemText = await readFile(
		new URL('./fixtures/poe2-rare-gloves.txt', import.meta.url),
		'utf8'
	);
	const item = parseItemText(itemText);

	assert.deepEqual(item, {
		itemClass: 'Gloves',
		itemLevel: 62,
		rarity: 'Rare',
		name: 'Soul Hand',
		baseType: 'Pauascale Gloves',
		stats: [
			'+45 to maximum Life (rune)',
			'+104(100-119) to maximum Life',
			'+79(65-79) to maximum Mana',
			'+26(26-30)% to Cold Resistance',
			'18(15-19)% increased Critical Damage Bonus',
			'+13(13-16) to Intelligence'
		]
	});
});

test('keeps modifiers without numeric values', () => {
	const item = parseItemText(`Item Class: Boots
Rarity: Rare
Test Pace
Wrapped Sandals
--------
Item Level: 20
--------
Cannot be Frozen`);

	assert.deepEqual(item.stats, ['Cannot be Frozen']);
});
