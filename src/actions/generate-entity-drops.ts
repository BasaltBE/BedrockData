import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { Action } from "../action";

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
		} else if (character === '"') {
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

class GenerateEntityDropsAction extends Action<[], void> {
	constructor(
		private readonly serverPath: string,
		private readonly outputPath: string,
	) {
		super("generate-entity-drops");
	}

	async run(): Promise<void> {
		const sourcePath = resolve(
			this.serverPath,
			"behavior_packs",
			"vanilla",
			"loot_tables",
			"entities",
		);
		const drops: Record<string, unknown> = {};

		for (const fileName of (await readdir(sourcePath)).sort()) {
			if (!fileName.endsWith(".json")) continue;
			drops[basename(fileName, ".json")] = parseJsonc(
				await readFile(resolve(sourcePath, fileName), "utf8"),
			);
		}

		await writeFile(this.outputPath, JSON.stringify(drops, null, 2));
	}
}

export { GenerateEntityDropsAction };
