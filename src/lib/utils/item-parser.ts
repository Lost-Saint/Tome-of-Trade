import type { ParsedItem } from '$lib/types/trade-query.types.js';

const SEPARATOR = /^-{8,}$/;
const NON_MODIFIER_LINES = new Set([
	'Corrupted',
	'Unidentified',
	'Mirrored',
	'Split',
	'Synthesised Item'
]);

function valueAfterLabel(line: string, label: string): string {
	return line.slice(label.length).trim();
}

function isModifierLine(line: string): boolean {
	return (
		!SEPARATOR.test(line) &&
		!line.startsWith('{') &&
		!line.startsWith('Note:') &&
		!NON_MODIFIER_LINES.has(line)
	);
}

/** Parse text copied from Path of Exile 2, including advanced modifier descriptions. */
export function parseItemText(text: string): ParsedItem {
	const lines = text
		.replace(/^\uFEFF/, '')
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

	const itemClassLine = lines.find((line) => line.startsWith('Item Class:'));
	const rarityIndex = lines.findIndex((line) => line.startsWith('Rarity:'));
	const itemLevelIndex = lines.findIndex((line) => line.startsWith('Item Level:'));
	const itemLevelMatch =
		itemLevelIndex >= 0 ? lines[itemLevelIndex]?.match(/^Item Level:\s*(\d+)/) : null;

	const rarity = rarityIndex >= 0 ? valueAfterLabel(lines[rarityIndex]!, 'Rarity:') : undefined;
	const identityEnd =
		rarityIndex >= 0
			? lines.findIndex((line, index) => index > rarityIndex && SEPARATOR.test(line))
			: -1;
	const identity =
		rarityIndex >= 0
			? lines.slice(rarityIndex + 1, identityEnd >= 0 ? identityEnd : undefined)
			: [];

	let modifierStart = -1;
	if (itemLevelIndex >= 0) {
		modifierStart = lines.findIndex(
			(line, index) => index > itemLevelIndex && SEPARATOR.test(line)
		);
	}

	const stats = modifierStart >= 0 ? lines.slice(modifierStart + 1).filter(isModifierLine) : [];

	return {
		itemClass: itemClassLine ? valueAfterLabel(itemClassLine, 'Item Class:') : undefined,
		itemLevel: itemLevelMatch?.[1] ? Number.parseInt(itemLevelMatch[1], 10) : undefined,
		stats,
		rarity,
		name: identity[0],
		baseType: identity[1] ?? identity[0]
	};
}
