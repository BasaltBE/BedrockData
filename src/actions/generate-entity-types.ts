import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import nbt from "prismarine-nbt";

import { Action } from "../action";

type Tag = { type: string; value: any };

type EntityType = {
	identifier: string;
	components: string[];
	families?: string[];
};

type EntityFile = {
	"minecraft:entity"?: {
		description?: { identifier?: string };
		components?: Record<string, unknown>;
		component_groups?: Record<string, Record<string, unknown>>;
	};
};

function allowedComponent(identifier: string): boolean {
	return (
		identifier === "minecraft:attack" ||
		identifier === "minecraft:breathable" ||
		identifier === "minecraft:collision_box" ||
		identifier === "minecraft:health" ||
		identifier === "minecraft:inventory" ||
		identifier === "minecraft:rideable" ||
		identifier === "minecraft:scale" ||
		identifier === "minecraft:lava_movement" ||
		identifier === "minecraft:underwater_movement" ||
		identifier === "minecraft:behavior.look_at_player" ||
		identifier === "minecraft:behavior.mount_pathing" ||
		identifier === "minecraft:behavior.nearest_attackable_target" ||
		identifier === "minecraft:behavior.avoid_mob_type" ||
		identifier === "minecraft:behavior.panic" ||
		identifier === "minecraft:behavior.random_look_around" ||
		identifier === "minecraft:behavior.random_stroll" ||
		identifier === "minecraft:behavior.tempt" ||
		identifier === "minecraft:burns_in_daylight" ||
		identifier === "minecraft:type_family" ||
		identifier.startsWith("minecraft:movement") ||
		identifier.startsWith("minecraft:player.")
	);
}

function entityProperties(entity: EntityFile["minecraft:entity"]): {
	components: Record<string, unknown>;
	loot?: { table: string };
} {
	const components: Record<string, unknown> = {};
	const groups = Object.values(entity?.component_groups ?? {});

	for (const group of groups) {
		for (const [identifier, value] of Object.entries(group)) {
			if (allowedComponent(identifier) && !(identifier in components))
				components[identifier] = value;
		}
	}

	for (const [identifier, value] of Object.entries(entity?.components ?? {})) {
		if (allowedComponent(identifier)) components[identifier] = value;
	}

	const loot = entity?.components?.["minecraft:loot"] as
		| { table?: unknown }
		| undefined;
	const table =
		typeof loot?.table === "string"
			? loot.table.replace(/^.*\//, "").replace(/\.json$/, "")
			: undefined;

	return table ? { components, loot: { table } } : { components };
}

function readTag(value: Tag | undefined): any {
	return value?.value;
}

function parseJsonc(value: string): unknown {
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

	return JSON.parse(result);
}

class GenerateEntityTypesAction extends Action<[], void> {
	constructor(
		private readonly dataPath: string,
		private readonly outputDirectory: string,
		private readonly serverPath: string,
	) {
		super("generate-entity-types");
	}

	async run(): Promise<void> {
		const [entities, propertiesNbt, identifiersNbt] = await Promise.all([
			readFile(resolve(this.outputDirectory, "entity-types.json"), "utf8").then(
				(value) => JSON.parse(value) as EntityType[],
			),
			nbt.parse(
				await readFile(resolve(this.dataPath, "entity_properties.nbt")),
			),
			nbt.parse(
				await readFile(resolve(this.dataPath, "entity_identifiers.dat")),
			),
		]);
		const legacyEntities = await readFile(
			resolve(this.dataPath, "..", "..", ".old", "dump", "entity_types.json"),
			"utf8",
		)
			.then((value) => JSON.parse(value) as EntityType[])
			.catch(() => []);
		const legacyComponents = new Map(
			legacyEntities.map((entity) => [entity.identifier, entity.components]),
		);
		const vanillaEntities = new Map<
			string,
			ReturnType<typeof entityProperties>
		>();
		const entityDirectory = resolve(
			this.serverPath,
			"behavior_packs",
			"vanilla",
			"entities",
		);

		for (const fileName of await readdir(entityDirectory)) {
			if (!fileName.endsWith(".json")) continue;
			const file = parseJsonc(
				await readFile(resolve(entityDirectory, fileName), "utf8"),
			) as EntityFile;
			const entity = file["minecraft:entity"];
			const identifier = entity?.description?.identifier;
			if (identifier) vanillaEntities.set(identifier, entityProperties(entity));
		}

		const propertiesRoot = propertiesNbt.parsed.value as Record<string, Tag>;
		const propertiesByName = new Map<string, unknown>();

		for (const [identifier, entity] of Object.entries(propertiesRoot)) {
			const entityValue = readTag(entity) as Record<string, Tag>;
			const properties =
				readTag(readTag(entityValue.properties) as Tag)?.map(
					(property: Record<string, Tag>) => ({
						name: readTag(property.name),
						type: readTag(property.type),
						values: readTag(readTag(property.enum) as Tag),
					}),
				) ?? [];
			propertiesByName.set(identifier, properties);
		}

		const identifierRoot = identifiersNbt.parsed.value as Record<string, Tag>;
		const identifierEntries = readTag(
			readTag(identifierRoot.idlist) as Tag,
		) as Array<Record<string, Tag>>;
		const identifiers = new Map(
			identifierEntries.map((entry) => [
				readTag(entry.id),
				{
					runtimeId: readTag(entry.rid),
					summonable: Boolean(readTag(entry.summonable)),
					hasSpawnEgg: Boolean(readTag(entry.hasspawnegg)),
					blockId: readTag(entry.bid) || undefined,
				},
			]),
		);

		const result = entities.map((entity) => {
			const vanilla = vanillaEntities.get(entity.identifier);
			const components = [
				...new Set([
					...(entity.components.length > 0
						? entity.components
						: (legacyComponents.get(entity.identifier) ?? [])),
					...Object.keys(vanilla?.components ?? {}),
				]),
			];
			const familyComponent = vanilla?.components["minecraft:type_family"] as
				| { family?: unknown }
				| undefined;
			const families = entity.families?.length
				? entity.families
				: Array.isArray(familyComponent?.family)
					? familyComponent.family.filter(
							(value): value is string => typeof value === "string",
						)
					: [];

			return {
				identifier: entity.identifier,
				...(vanilla?.loot ? { "minecraft:loot": vanilla.loot } : {}),
				components,
				families,
				...(identifiers.get(entity.identifier) ?? {}),
				...(vanilla && Object.keys(vanilla.components).length > 0
					? { propertiesPayload: { components: vanilla.components } }
					: {}),
				...(propertiesByName.has(entity.identifier)
					? { properties: propertiesByName.get(entity.identifier) }
					: {}),
			};
		});

		await writeFile(
			resolve(this.outputDirectory, "entity-types.json"),
			JSON.stringify(result, null, 2),
		);
	}
}

export { GenerateEntityTypesAction };
