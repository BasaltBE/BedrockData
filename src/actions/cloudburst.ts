import { execFile as childExecFile } from "node:child_process";
import { mkdir, open, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { Action } from "../action";

const repositoryUrl =
	"https://codeload.github.com/CloudburstMC/Data/zip/refs/heads/master";
const execFile = promisify(childExecFile);

class CloudburstAction extends Action<[], void> {
	constructor(private readonly dataPath: string) {
		super("cloudburst");
	}

	async run(): Promise<void> {
		if (await this.exists()) return;

		await mkdir(this.dataPath, { recursive: true });
		const response = await fetch(repositoryUrl);
		if (!response.ok) {
			throw new Error(
				`Failed to download CloudburstMC Data: ${response.status}`,
			);
		}

		const archivePath = resolve(dirname(this.dataPath), "data.zip");
		const archive = await open(archivePath, "w");
		const reader = response.body?.getReader();
		if (!reader)
			throw new Error("The CloudburstMC Data download has no response body.");

		try {
			while (true) {
				const chunk = await reader.read();
				if (chunk.done) break;
				await archive.write(chunk.value);
			}
		} finally {
			await archive.close();
		}

		try {
			await execFile("tar", [
				"-xf",
				archivePath,
				"-C",
				this.dataPath,
				"--strip-components=1",
			]);
			await writeFile(resolve(this.dataPath, ".complete"), "");
		} finally {
			await rm(archivePath, { force: true });
		}
	}

	private async exists(): Promise<boolean> {
		try {
			return (await stat(resolve(this.dataPath, ".complete"))).isFile();
		} catch {
			return false;
		}
	}
}

export { CloudburstAction };
