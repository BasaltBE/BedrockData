import { resolve } from "node:path";

import { DownloadAction } from "./actions/bds-download";
import { GenerateDocsAction } from "./actions/generate-docs";
import { GenerateBlockTypesAction } from "./actions/generate-block-types";
import { GenerateEntityTypesAction } from "./actions/generate-entity-types";
import { GenerateEntityDropsAction } from "./actions/generate-entity-drops";
import { GenerateEnchantmentTypesAction } from "./actions/generate-enchantment-types";
import { GenerateTreeTypesAction } from "./actions/generate-tree-types";
import { GenerateItemTypesAction } from "./actions/generate-item-types";
import { PrepareServerAction } from "./actions/prepare-server";
import { BdsEvents } from "./events";

class Bds extends BdsEvents {
	readonly actions: {
		download: DownloadAction;
		prepare: PrepareServerAction;
		generateDocs: GenerateDocsAction;
		generateBlockTypes: GenerateBlockTypesAction;
		generateEntityTypes: GenerateEntityTypesAction;
		generateEntityDrops: GenerateEntityDropsAction;
		generateEnchantmentTypes: GenerateEnchantmentTypesAction;
		generateTreeTypes: GenerateTreeTypesAction;
		generateItemTypes: GenerateItemTypesAction;
	};

	constructor(
		readonly serverPath: string = resolve(
			import.meta.dir,
			"..",
			".temp",
			"server",
		),
	) {
		super();
		const rootPath = resolve(import.meta.dir, "..");
		const dataPath = resolve(rootPath, ".temp", "data");
		const outputPath = resolve(rootPath, ".temp", "output");
		const resourcesPath = resolve(rootPath, "resources");

		this.actions = {
			download: new DownloadAction(this.serverPath, this),
			prepare: new PrepareServerAction(
				this.serverPath,
				resolve(resourcesPath, "template"),
				resolve(resourcesPath, "behavior-pack"),
			),
			generateDocs: new GenerateDocsAction(this.serverPath),
			generateBlockTypes: new GenerateBlockTypesAction(
				dataPath,
				resolve(outputPath, "block-types.json"),
			),
			generateEntityTypes: new GenerateEntityTypesAction(
				dataPath,
				outputPath,
				this.serverPath,
			),
			generateEntityDrops: new GenerateEntityDropsAction(
				this.serverPath,
				resolve(outputPath, "entity_drops.json"),
			),
			generateEnchantmentTypes: new GenerateEnchantmentTypesAction(
				this.serverPath,
				resolve(outputPath, "enchantment_types.json"),
			),
			generateTreeTypes: new GenerateTreeTypesAction(
				this.serverPath,
				resolve(outputPath, "tree_types.json"),
			),
			generateItemTypes: new GenerateItemTypesAction(
				dataPath,
				resolve(outputPath, "item-types.json"),
			),
		};
	}
}

export { Bds };
