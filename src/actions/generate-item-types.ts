import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import nbt from "prismarine-nbt";

import { Action } from "../action";

type ItemTag = {
	identifier: string;
	tags: string[];
	components?: string[];
	stackable?: boolean;
	maxAmount?: number;
};

type RuntimeItem = {
	name: string;
	id: number;
	version: number;
	componentBased: boolean;
};

type ItemMappings = {
	simple: Record<string, string>;
	complex: Record<string, Record<string, string>>;
};

const bucketPlacers: Record<string, { block: string; entity?: string }> = {
	"minecraft:water_bucket": { block: "minecraft:water" },
	"minecraft:lava_bucket": { block: "minecraft:lava" },
	"minecraft:powder_snow_bucket": { block: "minecraft:powder_snow" },
	"minecraft:cod_bucket": { block: "minecraft:water", entity: "minecraft:cod" },
	"minecraft:salmon_bucket": {
		block: "minecraft:water",
		entity: "minecraft:salmon",
	},
	"minecraft:pufferfish_bucket": {
		block: "minecraft:water",
		entity: "minecraft:pufferfish",
	},
	"minecraft:tropical_fish_bucket": {
		block: "minecraft:water",
		entity: "minecraft:tropicalfish",
	},
	"minecraft:axolotl_bucket": {
		block: "minecraft:water",
		entity: "minecraft:axolotl",
	},
	"minecraft:tadpole_bucket": {
		block: "minecraft:water",
		entity: "minecraft:tadpole",
	},
	"minecraft:sulfur_cube_bucket": {
		block: "minecraft:water",
		entity: "minecraft:sulfur_cube",
	},
};

const spawnEggAliases: Record<string, string> = {
	"minecraft:evoker_spawn_egg": "minecraft:evocation_illager",
	"minecraft:tropical_fish_spawn_egg": "minecraft:tropicalfish",
};

class GenerateItemTypesAction extends Action<[], void> {
	constructor(
		private readonly dataPath: string,
		private readonly outputPath: string,
	) {
		super("generate-item-types");
	}

	async run(): Promise<void> {
		const [componentsNbt, runtimeItems, mappings, itemTags] = await Promise.all(
			[
				nbt.parse(
					await readFile(resolve(this.dataPath, "item_components.nbt")),
					"big",
				),
				readFile(
					resolve(this.dataPath, "runtime_item_states.json"),
					"utf8",
				).then((value) => JSON.parse(value) as RuntimeItem[]),
				readFile(resolve(this.dataPath, "item_mappings.json"), "utf8").then(
					(value) => JSON.parse(value) as ItemMappings,
				),
				readFile(resolve(dirname(this.outputPath), "item-tags.json"), "utf8")
					.then((value) => JSON.parse(value) as ItemTag[])
					.catch(() => []),
			],
		);

		const componentData = nbt.simplify(componentsNbt.parsed) as Record<
			string,
			{ components?: Record<string, unknown> }
		>;
		const tagsByName = new Map(
			itemTags.map((item) => [item.identifier, item.tags]),
		);
		const runtimeByName = new Map(
			itemTags.map((item) => [item.identifier, item]),
		);
		const aliases = new Map(
			Object.entries(mappings.simple).map(([name, identifier]) => [
				identifier,
				name,
			]),
		);

		const items = runtimeItems.map((item) => {
			const data = componentData[item.name]?.components ?? {};
			const itemProperties = data.item_properties as
				| Record<string, unknown>
				| undefined;
			const nbtTags = Array.isArray(data.item_tags)
				? data.item_tags.filter((tag): tag is string => typeof tag === "string")
				: [];
			const componentNames = Object.keys(data).filter(
				(name) => name !== "item_properties" && name !== "item_tags",
			);
			const tags = [
				...new Set([...(tagsByName.get(item.name) ?? []), ...nbtTags]),
			];
			const runtime = runtimeByName.get(item.name);
			const bucketPlacer = bucketPlacers[item.name];
			const spawnEggEntity = item.name.endsWith("_spawn_egg")
				? (spawnEggAliases[item.name] ?? item.name.replace(/_spawn_egg$/, ""))
				: undefined;
			const maxAmount =
				runtime?.maxAmount && runtime.maxAmount > 0
					? runtime.maxAmount
					: typeof itemProperties?.max_stack_size === "number"
						? itemProperties.max_stack_size
						: bucketPlacer
							? 1
							: 64;
			const liveComponents = runtime?.components ?? [];
			const derivedComponents = [
				...(bucketPlacer
					? [
							"minecraft:block_actor_dynamic_properties",
							"minecraft:bucket_placer",
						]
					: []),
				...(spawnEggEntity ? ["minecraft:entity_placer"] : []),
			];
			const allComponents = [
				...new Set([
					...liveComponents,
					...componentNames,
					...derivedComponents,
				]),
			];

			return {
				identifier: item.name,
				tags,
				stackable: maxAmount > 1,
				maxAmount,
				componentBased: item.componentBased,
				networkId: item.id,
				itemVersion: item.version,
				...(aliases.has(item.name)
					? { legacyName: aliases.get(item.name) }
					: {}),
				propertiesPayload: {
					components: allComponents,
					...data,
					stackable: maxAmount > 1,
					maxAmount,
					...(bucketPlacer ? { bucketPlacer } : {}),
					...(spawnEggEntity
						? { entityPlacer: { entity: spawnEggEntity } }
						: {}),
				},
			};
		});

		await writeFile(this.outputPath, JSON.stringify(items, null, 2));
	}
}

export { GenerateItemTypesAction };
