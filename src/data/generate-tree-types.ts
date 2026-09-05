import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Action } from "../action";

type TreeBlock = {
	name: string;
	states?: Record<string, unknown>;
};

type TreeType = {
	identifier: string;
	type: string;
	trunkBlock?: TreeBlock;
	leafBlock?: TreeBlock;
	features?: string[];
};

type Feature = {
	identifier: string;
	type: string;
	data: Record<string, unknown>;
	features: string[];
};

function parseJsonc(value: string): Record<string, unknown> {
	let result = "";
	let string = false;
	let escaped = false;
	let lineComment = false;
	let blockComment = false;

	for (let index = 0; index < value.length; index++) {
		const character = value[index];
		const next = value[index + 1];

		if (lineComment) {
			if (character === "\n") {
				lineComment = false;
				result += character;
			}
			continue;
		}
		if (blockComment) {
			if (character === "*" && next === "/") {
				blockComment = false;
				index++;
			}
			continue;
		}
		if (string) {
			result += character;
			if (escaped) escaped = false;
			else if (character === "\\") escaped = true;
			else if (character === '"') string = false;
			continue;
		}
		if (character === '"') {
			string = true;
			result += character;
		} else if (character === "/" && next === "/") {
			lineComment = true;
			index++;
		} else if (character === "/" && next === "*") {
			blockComment = true;
			index++;
		} else {
			result += character;
		}
	}

	return JSON.parse(result) as Record<string, unknown>;
}

function readBlock(value: unknown): TreeBlock | undefined {
	if (typeof value === "string") return { name: value };
	if (!value || typeof value !== "object" || Array.isArray(value))
		return undefined;

	const block = value as Record<string, unknown>;
	if (typeof block.name !== "string") return undefined;
	return {
		name: block.name,
		...(block.states &&
		typeof block.states === "object" &&
		!Array.isArray(block.states)
			? { states: block.states as Record<string, unknown> }
			: {}),
	};
}

function readReferences(type: string, data: Record<string, unknown>): string[] {
	if (type === "scatter_feature")
		return typeof data.places_feature === "string" ? [data.places_feature] : [];
	if (!Array.isArray(data.features)) return [];

	return data.features.flatMap((value) => {
		if (typeof value === "string") return [value];
		if (Array.isArray(value) && typeof value[0] === "string") return [value[0]];
		return [];
	});
}

function readFeature(value: Record<string, unknown>): Feature | undefined {
	const entry = Object.entries(value).find(([key]) =>
		key.startsWith("minecraft:"),
	);
	if (
		!entry ||
		!entry[1] ||
		typeof entry[1] !== "object" ||
		Array.isArray(entry[1])
	)
		return undefined;

	const type = entry[0].slice("minecraft:".length);
	const data = entry[1] as Record<string, unknown>;
	const description = data.description as Record<string, unknown> | undefined;
	if (typeof description?.identifier !== "string") return undefined;

	return {
		identifier: description.identifier,
		type,
		data,
		features: readReferences(type, data),
	};
}

function findBlock(
	data: Record<string, unknown>,
	sections: string[],
	name: string,
): TreeBlock | undefined {
	for (const section of sections) {
		const value = data[section];
		if (!value || typeof value !== "object" || Array.isArray(value)) continue;
		const block = readBlock((value as Record<string, unknown>)[name]);
		if (block) return block;
	}
	return undefined;
}

function buildTree(feature: Feature): TreeType {
	const tree: TreeType = {
		identifier: feature.identifier,
		type: feature.type.replace(/_feature$/, ""),
	};

	if (feature.type === "tree_feature") {
		tree.trunkBlock = findBlock(
			feature.data,
			["trunk", "fancy_trunk", "mega_trunk", "acacia_trunk", "fallen_trunk"],
			"trunk_block",
		);
		tree.leafBlock = findBlock(
			feature.data,
			[
				"canopy",
				"fancy_canopy",
				"spruce_canopy",
				"pine_canopy",
				"mega_canopy",
				"mega_pine_canopy",
				"acacia_canopy",
				"roofed_canopy",
			],
			"leaf_block",
		);
	}

	if (feature.features.length > 0) tree.features = feature.features;
	return tree;
}

class GenerateTreeTypesAction extends Action<[], void> {
	constructor(
		private readonly serverPath: string,
		private readonly outputPath: string,
	) {
		super("generate-tree-types");
	}

	async run(): Promise<void> {
		const directory = resolve(this.serverPath, "definitions", "features");
		const definitions = new Map<string, Feature>();

		for (const fileName of (await readdir(directory)).sort()) {
			if (!fileName.endsWith(".json")) continue;
			const feature = readFeature(
				parseJsonc(await readFile(resolve(directory, fileName), "utf8")),
			);
			if (feature) definitions.set(feature.identifier, feature);
		}

		const treeIdentifiers = new Set(
			[...definitions.values()]
				.filter((feature) => feature.type === "tree_feature")
				.map((feature) => feature.identifier),
		);
		let changed = true;
		while (changed) {
			changed = false;
			for (const feature of definitions.values()) {
				if (
					!treeIdentifiers.has(feature.identifier) &&
					feature.features.some((identifier) => treeIdentifiers.has(identifier))
				) {
					treeIdentifiers.add(feature.identifier);
					changed = true;
				}
			}
		}

		const trees = [...treeIdentifiers]
			.map((identifier) => buildTree(definitions.get(identifier)!))
			.sort((left, right) => left.identifier.localeCompare(right.identifier));

		await writeFile(this.outputPath, JSON.stringify(trees, null, 2));
	}
}

export { GenerateTreeTypesAction };
