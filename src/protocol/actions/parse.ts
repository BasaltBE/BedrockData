import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Action } from "../../action";
import type { PropertyValue } from "../types";

class ParseAction extends Action<[], void> {
	private names: Record<string, string> = {};
	private types: Record<string, string> = {};
	constructor(
		private readonly protocolPath: string,
		private readonly outputPath: string,
	) {
		super("parse");
	}

	async run(): Promise<void> {
		await Promise.all(
			["packets", "types", "enums"].map((folder) =>
				rm(resolve(this.outputPath, folder), { recursive: true, force: true }),
			),
		);
		try {
			this.names = JSON.parse(await readFile(resolve(import.meta.dir, "..", "..", "..", "resources", "names.json"), "utf8"));
			this.types = JSON.parse(await readFile(resolve(import.meta.dir, "..", "..", "..", "resources", "types.json"), "utf8"));
		} catch { }
		const files = await readdir(this.protocolPath, { withFileTypes: true });
		const jsonFiles = files.filter(
			(file) => file.isFile() && file.name.endsWith(".json"),
		);

		const schemas = new Map<string, PropertyValue>();
		for (const file of jsonFiles) {
			const filePath = resolve(this.protocolPath, file.name);
			try {
				const value: PropertyValue = JSON.parse(await readFile(filePath, "utf8"));
				if (typeof value !== "object" || value === null || Array.isArray(value))
					throw new Error("Invalid PropertyValue");
				schemas.set(file.name, value);
				await this.saveEnum(value);
			} catch (error) {
				throw new Error(
					`Could not parse protocol schema ${file.name}: ${error instanceof Error ? error.message : String(error)
					}`,
				);
			}
		}

		for (const value of schemas.values()) {
			if (value.properties && value.$metaProperties === undefined)
				await this.saveType(value, schemas);
			else if (value.$ref && value.$metaProperties === undefined) {
				const referenced = this.referenceSchema(value, schemas);
				if (referenced?.properties)
					await this.saveType({ ...referenced, title: value.title }, schemas);
			}

			if (
				value.$metaProperties?.["[cereal:packet]"] === undefined ||
				!value.$ref ||
				typeof value.title !== "string"
			)
				continue;
			const payload = schemas.get(value.$ref.replace("./", ""));
			if (payload) await this.savePacket(value, payload, schemas);
		}

		console.log(`Parsed ${jsonFiles.length} protocol schemas.`);
	}

	private async savePacket(
		packet: PropertyValue,
		payload: PropertyValue,
		schemas: Map<string, PropertyValue>,
	): Promise<void> {
		const fields = Object.entries(payload.properties ?? {})
			.sort(([, left], [, right]) =>
				(left["x-ordinal-index"] ?? Number.MAX_SAFE_INTEGER) -
				(right["x-ordinal-index"] ?? Number.MAX_SAFE_INTEGER),
			)
			.map(([identifier, value]) => {
				const resolved = this.resolveProperty(value, schemas);
				if (value.oneOf) return {
					identifier: this.getIdentifier(identifier),
					type: "union",
					types: value.oneOf.map((option) => this.getReferenceType(option, schemas)),
					...(value["x-control-value-type"] ? { control: value["x-control-value-type"] } : {}),
					required: payload.required?.includes(identifier) ?? false,
					optional: !(payload.required?.includes(identifier) ?? false),
				};
				if (resolved.type === "array" && resolved.items && !Array.isArray(resolved.items) && resolved.items.oneOf)
					return {
						identifier: this.getIdentifier(identifier),
						type: "union[]",
						types: resolved.items.oneOf.map((option) => this.getReferenceType(option, schemas)),
						...(resolved.items["x-control-value-type"] ? { control: resolved.items["x-control-value-type"] } : {}),
						length: "varuint",
						required: payload.required?.includes(identifier) ?? false,
					};
				return {
					identifier: this.getIdentifier(identifier),
					type: this.types[identifier] ?? this.getPropertyType(value, resolved, schemas),
					...(this.getEnumType(value, schemas) ? { enum: this.getEnumType(value, schemas) } : {}),
					...(value.description ? { description: value.description } : {}),
					...(resolved.type === "array" ? { length: "varuint" } : {}),
					...(resolved["x-serialization-options"]?.includes("Big Endian")
						? { endian: "big" }
						: {}),
					required: payload.required?.includes(identifier) ?? false,
					optional: !(payload.required?.includes(identifier) ?? false),
				};
			});
		const output = {
			title: this.getTypeName(packet.title.replace(/Packet$/, "")),
			id: packet.$metaProperties?.["[cereal:packet]"],
			description: packet.$metaProperties?.["[cereal:packet_details]"] ?? "",
			fields,
		};
		const packetPath = resolve(this.outputPath, "packets");
		const fileName = this.getTypeName(packet.title);
		await mkdir(packetPath, { recursive: true });
		await writeFile(resolve(packetPath, `${fileName}.json`), JSON.stringify(output, null, 2));
	}

	private async saveType(
		value: PropertyValue,
		schemas: Map<string, PropertyValue>,
	): Promise<void> {
		if (typeof value.title !== "string") return;
		const fields = Object.entries(value.properties ?? {})
			.sort(([, left], [, right]) =>
				(left["x-ordinal-index"] ?? Number.MAX_SAFE_INTEGER) -
				(right["x-ordinal-index"] ?? Number.MAX_SAFE_INTEGER),
			)
			.map(([identifier, property]) => {
				const resolved = this.resolveProperty(property, schemas);
				if (property.oneOf) return {
					identifier: this.getIdentifier(identifier),
					type: "union",
					types: property.oneOf.map((option) => this.getReferenceType(option, schemas)),
					...(property["x-control-value-type"] ? { control: property["x-control-value-type"] } : {}),
					required: value.required?.includes(identifier) ?? false,
					optional: !(value.required?.includes(identifier) ?? false),
				};
				if (resolved.type === "array" && resolved.items && !Array.isArray(resolved.items) && resolved.items.oneOf)
					return {
						identifier: this.getIdentifier(identifier),
						type: "union[]",
						types: resolved.items.oneOf.map((option) => this.getReferenceType(option, schemas)),
						control: resolved.items["x-control-value-type"],
						length: "varuint",
						required: value.required?.includes(identifier) ?? false,
						optional: !(value.required?.includes(identifier) ?? false),
					};
				return {
					identifier: this.getIdentifier(identifier),
					type: this.types[identifier] ?? this.getPropertyType(property, resolved, schemas),
					...(this.getEnumType(property, schemas) ? { enum: this.getEnumType(property, schemas) } : {}),
					...(property.description ? { description: property.description } : {}),
					...(resolved.type === "array" ? { length: "varuint" } : {}),
					required: value.required?.includes(identifier) ?? false,
					optional: !(value.required?.includes(identifier) ?? false),
				};
			});

		const typePath = resolve(this.outputPath, "types");
		const fileName = this.getTypeName(value.title);
		await mkdir(typePath, { recursive: true });
		await writeFile(
			resolve(typePath, `${fileName}.json`),
			JSON.stringify({
				title: this.getTypeName(value.title),
				...(value.description ? { description: value.description } : {}),
				fields,
			}, null, 2),
		);
	}

	private resolveProperty(
		value: PropertyValue,
		schemas: Map<string, PropertyValue>,
	): PropertyValue {
		const referenced = this.referenceSchema(value, schemas);
		const entries = Object.entries(referenced?.properties ?? {});
		return entries.length === 1 ? { ...entries[0][1], ...value } : value;
	}

	private getIdentifier(value: string): string {
		return (this.names[value] ?? value).replace(/[\s'?!-]+/g, "");
	}

	private getTypeName(value: string): string {
		if (value.includes("::"))
			value = value.split("::").at(-1) ?? value;

		return value
			.replace(/^\(anonymous namespace\)::/g, "")
			.replace(/::/g, "_")
			.replace(/[()\s<>:"/\\|?*]/g, "_")
			.replace(/_+/g, "_")
			.replace(/^_|_$/g, "");
	}

	private getEnumType(value: PropertyValue, schemas: Map<string, PropertyValue>): string | undefined {
		const referenced = this.referenceSchema(value, schemas);
		return referenced?.enum && typeof referenced.title === "string"
			? `@enums/${this.getTypeName(referenced.title)}`
			: undefined;
	}

	private referenceSchema(
		value: PropertyValue,
		schemas: Map<string, PropertyValue>,
	): PropertyValue | undefined {
		let current = value;
		const visited = new Set<string>();
		while (current.$ref && !visited.has(current.$ref)) {
			visited.add(current.$ref);
			const referenced = schemas.get(current.$ref.replace("./", ""));
			if (!referenced) return undefined;
			current = referenced;
		}
		return current;
	}

	private getReferenceType(value: PropertyValue, schemas: Map<string, PropertyValue>): string {
		if (value.$ref) {
			const referenced = schemas.get(value.$ref.replace("./", ""));
			if (referenced?.title)
				return `@types/${this.getTypeName(referenced.title)}`;
		}
		return value["x-underlying-type"] ?? value.type ?? "unknown";
	}

	private getPropertyType(
		original: PropertyValue,
		value: PropertyValue,
		schemas: Map<string, PropertyValue>,
	): string {
		if (value["x-runtime-constraint-description"]?.includes("tag"))
			return "CompoundTag";

		if (
			value.type === undefined &&
			value.$ref === undefined &&
			value["x-underlying-type"] === undefined
		)
			return "CompoundTag";

		if (value.type === "array" && value.items && !Array.isArray(value.items))
			return `${this.getPropertyType(value.items, this.resolveProperty(value.items, schemas), schemas)}[]`;

		if (original.$ref) {
			const referenced = schemas.get(original.$ref.replace("./", ""));
			const resolved = this.referenceSchema(original, schemas);
			if (referenced && Object.keys(resolved?.properties ?? {}).length > 1)
				return `@types/${this.getTypeName(referenced.title)}`;
		}
		const type = value["x-underlying-type"] ?? value.type ?? "unknown";
		return value["x-serialization-options"]?.includes("Compression")
			? ({
				int32: "varint",
				int64: "varint64",
				uint32: "varuint",
				uint64: "varuint64",
			}[type] ?? type)
			: type;
	}

	private async saveEnum(value: PropertyValue): Promise<void> {
		if (
			value.enum != undefined &&
			value["x-enum-binary-value"] == undefined // just incase
		) throw new Error(`PropertyValue ${value.title} has enum but no x-enum-binary-value`)
		else if (
			value.enum == undefined &&
			value["x-enum-binary-value"] != undefined
		) throw new Error(`PropertyValue ${value.title} has x-enum-binary-value but no enum`)
		else if (
			value["x-enum-binary-value"] == undefined ||
			value.enum == undefined
		) return;

		/**
		 * {
		 *  "enumKey": "enumValue",
		 *   ...
		 * }
		 */

		const binaryValues = value["x-enum-binary-value"];
		const enumObject = Object.fromEntries(
			value.enum
				.map((entry, index) => [entry, binaryValues[index]] as const)
				.filter(([entry, binary]) => binary !== undefined && entry !== null),
		);

		const enumPath = resolve(this.outputPath, "enums");
		const fileName = this.getTypeName(value.title);
		await mkdir(enumPath, { recursive: true });
		await writeFile(
			resolve(enumPath, `${fileName}.json`),
			JSON.stringify({
				title: this.getTypeName(value.title),
				...(value.description ? { description: value.description } : {}),
				values: enumObject,
			}, null, 2),
		);
	}
}

export { ParseAction };
