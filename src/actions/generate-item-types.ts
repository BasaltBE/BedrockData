import { readdir, readFile, writeFile } from "node:fs/promises";
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

type ItemCatalogEntry = {
	categoryName: string;
	group_identifier: {
		icon?: string;
		name?: string;
	};
};

type ItemCatalog = {
	"minecraft:crafting_items_catalog"?: {
		categories?: Array<{
			category_name: string;
			groups?: Array<{
				group_identifier?: ItemCatalogEntry["group_identifier"];
				items?: string[];
			}>;
		}>;
	};
};

type CreativeItems = {
	groups?: Array<{
		name?: string;
		category?: string;
		icon?: { id?: string };
	}>;
	items?: Array<{
		id?: string;
		groupId?: number;
	}>;
};

type CatalogData = {
	entries: Map<string, ItemCatalogEntry>;
	order: Map<string, number>;
};

async function readCatalogData(
	serverPath: string,
	dataPath: string,
): Promise<CatalogData> {
	const entries = new Map<string, ItemCatalogEntry>();
	const order = new Map<string, number>();
	const packsPath = resolve(serverPath, "behavior_packs");
	let packNames: string[];

	try {
		packNames = await readdir(packsPath);
	} catch {
		packNames = [];
	}

	const orderedPacks = [
		...packNames.filter((name) => name.startsWith("vanilla")).sort(),
		...packNames.filter((name) => !name.startsWith("vanilla")).sort(),
	];
	let index = 0;

	for (const packName of orderedPacks) {
		const catalogPath = resolve(
			packsPath,
			packName,
			"item_catalog",
			"crafting_item_catalog.json",
		);
		let catalog: ItemCatalog;

		try {
			catalog = JSON.parse(await readFile(catalogPath, "utf8")) as ItemCatalog;
		} catch {
			continue;
		}

		for (const category of catalog["minecraft:crafting_items_catalog"]
			?.categories ?? []) {
			for (const group of category.groups ?? []) {
				for (const rawItem of group.items ?? []) {
					const identifier = rawItem.replace(/:\d+$/, "");
					if (!entries.has(identifier)) {
						entries.set(identifier, {
							categoryName: category.category_name,
							group_identifier: group.group_identifier ?? {},
						});
					}
					if (!order.has(identifier)) order.set(identifier, index++);
				}
			}
		}
	}

	try {
		const creative = JSON.parse(
			await readFile(resolve(dataPath, "creative_items.json"), "utf8"),
		) as CreativeItems;
		const creativeOrderStart = order.size;

		for (const [index, item] of (creative.items ?? []).entries()) {
			if (!item.id || item.groupId === undefined) continue;

			const group = creative.groups?.[item.groupId];
			if (!group?.category) continue;

			const identifier = item.id.replace(/:\d+$/, "");
			if (!entries.has(identifier)) {
				entries.set(identifier, {
					categoryName: group.category,
					group_identifier: {
						...(group.icon?.id ? { icon: group.icon.id } : {}),
						...(group.name ? { name: group.name } : {}),
					},
				});
			}
			if (!order.has(identifier))
				order.set(identifier, creativeOrderStart + index);
		}
	} catch {}

	return { entries, order };
}

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
		private readonly serverPath: string,
	) {
		super("generate-item-types");
	}

	async run(): Promise<void> {
		const [componentsNbt, runtimeItems, mappings, itemTags, catalogData] =
			await Promise.all(
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
					readCatalogData(this.serverPath, this.dataPath),
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
				...(catalogData.entries.has(item.name)
					? { catalog: catalogData.entries.get(item.name) }
					: {}),
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

		const maxCatalogOrder = catalogData.order.size;
		items.sort((left, right) => {
			const leftOrder =
				catalogData.order.get(left.identifier) ?? maxCatalogOrder;
			const rightOrder =
				catalogData.order.get(right.identifier) ?? maxCatalogOrder;

			return leftOrder === rightOrder
				? left.identifier.localeCompare(right.identifier)
				: leftOrder - rightOrder;
		});

		await writeFile(this.outputPath, JSON.stringify(items, null, 2));
	}
}

export { GenerateItemTypesAction };
