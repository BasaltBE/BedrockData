import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { Action } from "../action";

class GenerateSoundIdentifiersAction extends Action<[], void> {
	constructor(
		private readonly serverPath: string,
		private readonly outputPath: string,
	) {
		super("generate-sound-identifiers");
	}

	async run(): Promise<void> {
		const identifiers = new Set<string>();
		const levelSoundEventPath = resolve(
			this.serverPath,
			"docs",
			"json_schemas",
			"protocol",
			"LevelSoundEvent.json",
		);
		const levelSoundEvent = JSON.parse(
			await readFile(levelSoundEventPath, "utf8"),
		) as { enum?: unknown[] };

		for (const value of levelSoundEvent.enum ?? []) {
			if (typeof value === "string") identifiers.add(value);
		}

		await this.scanDirectory(resolve(this.serverPath, "resource_packs"), identifiers);
		await this.scanDirectory(resolve(this.serverPath, "behavior_packs"), identifiers);

		await mkdir(dirname(this.outputPath), { recursive: true });
		await writeFile(
			this.outputPath,
			`${JSON.stringify([...identifiers].sort(), null, 2)}\n`,
		);
	}

	private async scanDirectory(
		path: string,
		identifiers: Set<string>,
	): Promise<void> {
		let entries;
		try {
			entries = await readdir(path, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const entryPath = resolve(path, entry.name);
			if (entry.isDirectory()) {
				await this.scanDirectory(entryPath, identifiers);
				continue;
			}

			if (entry.name === "blocks.json") {
				await this.scanBlockSounds(entryPath, identifiers);
			}

			if (entry.name.endsWith(".js") || entry.name.endsWith(".mcfunction")) {
				const content = await readFile(entryPath, "utf8");
				for (const match of content.matchAll(/\b(?:play|stop)sound\s+([A-Za-z0-9_.:-]+)/g)) {
					identifiers.add(match[1]);
				}
			}
		}
	}

	private async scanBlockSounds(
		path: string,
		identifiers: Set<string>,
	): Promise<void> {
		const content = await readFile(path, "utf8");
		const json = content
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/^\s*\/\/.*$/gm, "");
		let blocks: Record<string, { sound?: unknown }>;
		try {
			blocks = JSON.parse(json) as Record<string, { sound?: unknown }>;
		} catch {
			return;
		}
		for (const block of Object.values(blocks)) {
			if (typeof block.sound === "string") identifiers.add(block.sound);
		}
	}
}

export { GenerateSoundIdentifiersAction };
