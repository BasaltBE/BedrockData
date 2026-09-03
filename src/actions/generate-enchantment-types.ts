import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Action } from "../action";

type EnchantmentEntry = {
	name: string;
	value?: string;
};

type EnchantmentType = {
	identifier: string;
	id: number;
	maxLevel: number;
};

class GenerateEnchantmentTypesAction extends Action<[], void> {
	constructor(
		private readonly serverPath: string,
		private readonly outputPath: string,
	) {
		super("generate-enchantment-types");
	}

	async run(): Promise<void> {
		const source = JSON.parse(
			await readFile(
				resolve(
					this.serverPath,
					"docs",
					"vanilladata_modules",
					"mojang-enchantments.json",
				),
				"utf8",
			),
		) as { data_items: EnchantmentEntry[] };
		const legacy = await readFile(
			resolve(
				this.serverPath,
				"..",
				"..",
				".old",
				"dump",
				"enchantment_types.json",
			),
			"utf8",
		)
			.then((value) => JSON.parse(value) as EnchantmentType[])
			.catch(() => []);
		const maxLevels = new Map(
			legacy.map((entry) => [entry.identifier, entry.maxLevel]),
		);

		const enchantments = source.data_items.map((entry, id) => {
			const identifier = (entry.value ?? entry.name).replace(/^minecraft:/, "");
			return {
				identifier,
				id,
				maxLevel: maxLevels.get(identifier) ?? 1,
			};
		});

		await writeFile(this.outputPath, JSON.stringify(enchantments, null, 2));
	}
}

export { GenerateEnchantmentTypesAction };
