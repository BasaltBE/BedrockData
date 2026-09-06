import { resolve } from "node:path";

import { DownloadAction } from "./actions/bds-download";
import { GenerateDocsAction } from "./data/generate-docs";
import { RunServerAction } from "./actions/run-server";
import { GenerateBlockTypesAction } from "./data/generate-block-types";
import { GenerateEntityTypesAction } from "./data/generate-entity-types";
import { GenerateEntityDropsAction } from "./data/generate-entity-drops";
import { GenerateEnchantmentTypesAction } from "./data/generate-enchantment-types";
import { GenerateTreeTypesAction } from "./data/generate-tree-types";
import { GenerateItemTypesAction } from "./data/generate-item-types";
import { PrepareServerAction } from "./actions/prepare-server";
import { ParseAction } from "./protocol/actions/parse";
import { BdsEvents } from "./events";

class Bds extends BdsEvents {
	readonly actions: {
		download: DownloadAction;
		prepare: PrepareServerAction;
		generateDocs: GenerateDocsAction;
		runServer: RunServerAction;
		generateBlockTypes: GenerateBlockTypesAction;
		generateEntityTypes: GenerateEntityTypesAction;
		generateEntityDrops: GenerateEntityDropsAction;
		generateEnchantmentTypes: GenerateEnchantmentTypesAction;
		generateTreeTypes: GenerateTreeTypesAction;
		generateItemTypes: GenerateItemTypesAction;
		parse: ParseAction;
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
			runServer: new RunServerAction(this.serverPath),
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
				this.serverPath,
			),
			parse: new ParseAction(
				resolve(this.serverPath, "docs", "json_schemas", "protocol"),
				resolve(outputPath, "protocol"),
			),
		};
	}
}

export { Bds };
