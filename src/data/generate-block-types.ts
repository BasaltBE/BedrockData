import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import nbt from "prismarine-nbt";

import { Action } from "../action";

type NbtValue = { type: string; value: unknown };

type PaletteBlock = {
	block_id: number;
	name: string;
	name_hash: [number, number];
	network_id: number;
	states: Record<string, NbtValue>;
	version: number;
};

type BlockData = {
	name: string;
	blockStateHash: number;
	[key: string]: unknown;
};

type BlockProperties = {
	name: string;
	properties?: {
		blockTags?: string[];
		components?: Record<string, unknown>;
		[key: string]: unknown;
	};
};

type BlockComponents = {
	identifier: string;
	components: Record<string, unknown>;
};

async function readNbt(path: string): Promise<{ blocks: PaletteBlock[] }> {
	const result = await nbt.parse(await readFile(path), "big");
	const root = result.parsed.value as unknown as Record<string, NbtValue>;
	const blocks = (root.blocks.value as NbtValue).value as Array<
		Record<string, NbtValue>
	>;

	return {
		blocks: blocks.map((block) => ({
			block_id: block.block_id.value as number,
			name: block.name.value as string,
			name_hash: block.name_hash.value as [number, number],
			network_id: block.network_id.value as number,
			states: block.states.value as Record<string, NbtValue>,
			version: block.version.value as number,
		})),
	};
}

function normalizeName(name: string): string {
	return name.replace(/^minecraft:/, "").toUpperCase();
}

function stateValue(value: NbtValue): string | number | boolean {
	if (value.type === "byte" && (value.value === 0 || value.value === 1))
		return value.value === 1;
	return value.value as string | number;
}

function valueType(value: string | number | boolean): string {
	if (typeof value === "boolean") return "bool";
	if (typeof value === "number")
		return Number.isInteger(value) ? "int" : "float";
	return "string";
}

class GenerateBlockTypesAction extends Action<[], void> {
	constructor(
		private readonly dataPath: string,
		private readonly outputPath: string,
	) {
		super("generate-block-types");
	}

	async run(): Promise<void> {
		const [
			palette,
			blockData,
			attributes,
			blockProperties,
			tags,
			components,
			legacyTypes,
		] = await Promise.all([
			readNbt(resolve(this.dataPath, "block_palette.nbt")),
			readFile(resolve(this.dataPath, "blocks.json"), "utf8").then(
				(value) => JSON.parse(value) as BlockData[],
			),
			readFile(resolve(this.dataPath, "block_attributes.json"), "utf8").then(
				(value) => JSON.parse(value) as Array<Record<string, unknown>>,
			),
			readFile(resolve(this.dataPath, "block_properties.json"), "utf8")
				.then((value) => JSON.parse(value) as BlockProperties[])
				.catch(() => []),
			readFile(resolve(dirname(this.outputPath), "block-tags.json"), "utf8")
				.then(
					(value) =>
						JSON.parse(value) as Array<{ identifier: string; tags: string[] }>,
				)
				.catch(() => []),
			readFile(
				resolve(dirname(this.outputPath), "block-components.json"),
				"utf8",
			)
				.then(
					(value) =>
						JSON.parse(value) as Array<{
							identifier: string;
							components: Record<string, unknown>;
						}>,
				)
				.catch(() => []),
			readFile(
				resolve(this.dataPath, "..", "..", ".old", "dump", "block_types.json"),
				"utf8",
			)
				.then((value) => JSON.parse(value) as BlockComponents[])
				.catch(() => []),
		]);

		const dataByHash = new Map(
			blockData.map((block) => [block.blockStateHash >>> 0, block]),
		);
		const attributesByName = new Map(
			attributes.map((value) => [normalizeName(String(value.name)), value]),
		);
		const propertiesByName = new Map(
			blockProperties.map((value) => [value.name, value.properties ?? {}]),
		);
		const tagsByName = new Map(
			tags.map((value) => [value.identifier, value.tags]),
		);
		const componentsByName = new Map<string, Record<string, unknown>>();
		const legacyByName = new Map<
			string,
			BlockComponents & Record<string, unknown>
		>();
		for (const value of legacyTypes)
			componentsByName.set(value.identifier, value.components);
		for (const value of legacyTypes) legacyByName.set(value.identifier, value);
		for (const value of components) {
			if (
				Object.keys(value.components).length > 0 ||
				!componentsByName.has(value.identifier)
			) {
				componentsByName.set(value.identifier, value.components);
			}
		}
		const permutations: Array<{
			identifier: string;
			hash: number;
			state: Record<string, string | number | boolean>;
		}> = [];
		const stateDefinitions = new Map<
			string,
			{
				identifier: string;
				type: string;
				values: Set<string | number | boolean>;
			}
		>();
		const blocks = new Map<
			string,
			{
				identifier: string;
				blockId: number;
				nameHash: [number, number];
				version: number;
				tags: string[];
				components: Record<string, unknown>;
				states: string[];
				attributes: Record<string, unknown> | null;
				data: Record<string, unknown>;
			}
		>();

		for (const state of palette.blocks) {
			const hash = state.network_id >>> 0;
			const values = Object.fromEntries(
				Object.entries(state.states).map(([name, value]) => [
					name,
					stateValue(value),
				]),
			) as Record<string, string | number | boolean>;
			permutations.push({
				identifier: state.name,
				hash: state.network_id,
				state: values,
			});

			for (const [name, value] of Object.entries(values)) {
				const definition = stateDefinitions.get(name) ?? {
					identifier: name,
					type: valueType(value),
					values: new Set<string | number | boolean>(),
				};
				definition.values.add(value);
				stateDefinitions.set(name, definition);
			}

			const properties = propertiesByName.get(state.name) ?? {};
			const propertyComponents = properties.components as
				| Record<string, unknown>
				| undefined;
			const propertyTags = properties.blockTags as string[] | undefined;
			const block = blocks.get(state.name) ?? {
				identifier: state.name,
				blockId: state.block_id,
				nameHash: state.name_hash,
				version: state.version,
				tags: tagsByName.get(state.name) ?? propertyTags ?? [],
				components:
					componentsByName.get(state.name) ?? propertyComponents ?? {},
				states: [],
				attributes: attributesByName.get(normalizeName(state.name)) ?? null,
				data: {},
			};
			const data = dataByHash.get(hash);
			const {
				name: _name,
				blockStateHash: _hash,
				...stateData
			} = data ?? { name: state.name, blockStateHash: hash };

			for (const name of Object.keys(values))
				if (!block.states.includes(name)) block.states.push(name);
			if (Object.keys(stateData).length > 0) block.data = stateData;
			blocks.set(state.name, block);
		}

		const blockTypes = [...blocks.values()].map(
			({ attributes, data, ...block }) => {
				const legacy = legacyByName.get(block.identifier);
				const opacity = legacy?.opacity ?? (data.translucency === 0 ? 1 : 0);

				return {
					identifier: block.identifier,
					states: block.states.sort(),
					components: block.components,
					tags: block.tags,
					air: legacy?.air ?? block.identifier === "minecraft:air",
					liquid: legacy?.liquid ?? false,
					solid: legacy?.solid ?? attributes?.solid ?? data.isSolid ?? false,
					blastResistance:
						legacy?.blastResistance ??
						data.explosionResistance ??
						attributes?.resistance ??
						0,
					brightness:
						legacy?.brightness ??
						data.lightEmission ??
						attributes?.emitLight ??
						0,
					flameEncouragement:
						legacy?.flameEncouragement ??
						data.burnOdds ??
						attributes?.burnChance ??
						0,
					flammability:
						legacy?.flammability ??
						data.flameOdds ??
						attributes?.burnAbility ??
						0,
					friction:
						legacy?.friction ?? data.friction ?? attributes?.friction ?? 0,
					hardness:
						legacy?.hardness ?? data.hardness ?? attributes?.hardness ?? 0,
					opacity,
				};
			},
		);
		const blockStates = [...stateDefinitions.values()]
			.sort((left, right) => left.identifier.localeCompare(right.identifier))
			.map(({ identifier, type, values }) => ({
				identifier,
				type,
				values: [...values].sort((left, right) =>
					String(left).localeCompare(String(right)),
				),
			}));

		await writeFile(
			resolve(dirname(this.outputPath), "block_states.json"),
			JSON.stringify(blockStates, null, 2),
		);
		await writeFile(
			resolve(dirname(this.outputPath), "block_permutations.json"),
			JSON.stringify(permutations, null, 2),
		);
		await writeFile(
			resolve(dirname(this.outputPath), "block-components.json"),
			JSON.stringify(
				[...componentsByName].map(([identifier, value]) => ({
					identifier,
					components: value,
				})),
				null,
				2,
			),
		);
		await writeFile(this.outputPath, JSON.stringify(blockTypes, null, 2));
	}
}

export { GenerateBlockTypesAction };
