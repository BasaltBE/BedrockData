import { mkdir, open, rm, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";
import { Action } from "../action";
import { BdsEvents } from "../events";

const linksUrl =
	"https://net-secondary.web.minecraft-services.net/api/v1.0/download/links";

type DownloadLink = {
	downloadType: string;
	downloadUrl: string;
};

type DownloadLinksResponse = {
	result?: {
		links?: DownloadLink[];
	};
};

class DownloadAction extends Action<[boolean], void> {
	constructor(
		private readonly serverPath: string,
		private readonly events: BdsEvents,
	) {
		super("download");
	}

	async run(preview = false): Promise<void> {
		if (await this.serverExists()) return;

		this.events.emit("downloadStarted", preview);

		try {
			await mkdir(this.serverPath, { recursive: true });
			const downloadUrl = await this.resolveDownloadUrl(preview);
			const response = await fetch(downloadUrl);

			if (!response.ok) {
				throw new Error(
					`Failed to download the Bedrock server: ${response.status}`,
				);
			}

			const archivePath = resolve(this.serverPath, "bedrock_server.zip");
			const reader = response.body?.getReader();
			if (!reader)
				throw new Error("The Bedrock server download has no response body.");

			const archive = await open(archivePath, "w");
			const total = Number(response.headers.get("content-length"));
			let downloaded = 0;

			try {
				while (true) {
					const chunk = await reader.read();
					if (chunk.done) break;

					await archive.write(chunk.value);
					downloaded += chunk.value.byteLength;

					const downloadedSize = `${(downloaded / 1024 / 1024).toFixed(1)} MB`;
					if (Number.isFinite(total) && total > 0) {
						const percentage = Math.min(1, downloaded / total);
						const filled = Math.round(30 * percentage);
						const bar = `${"#".repeat(filled)}${"-".repeat(30 - filled)}`;
						process.stdout.write(
							`\r[${bar}] ${(percentage * 100).toFixed(1)}% ${downloadedSize}`,
						);
					} else {
						process.stdout.write(`\rDownloaded ${downloadedSize}`);
					}
				}
			} finally {
				await archive.close();
				process.stdout.write("\n");
			}

			await this.extract(archivePath);
			await rm(archivePath, { force: true });

			this.events.emit("downloadCompleted", preview);
		} catch (error) {
			const failure = error instanceof Error ? error : new Error(String(error));
			this.events.emit("downloadFailed", failure);
			throw failure;
		}
	}

	private async serverExists(): Promise<boolean> {
		const executable =
			process.platform === "win32"
				? "bedrock_server.exe"
				: process.platform === "linux"
					? "bedrock_server"
					: undefined;
		if (!executable) return false;

		try {
			return (await stat(resolve(this.serverPath, executable))).isFile();
		} catch {
			return false;
		}
	}

	private async extract(archivePath: string): Promise<void> {
		process.stdout.write("\r\x1b[2KUnzipping BDS... 0.0%");

		let total = 0;
		let totalFiles = 0;
		let sizesKnown = true;
		const metadata = new Unzip((file) => {
			if (file.originalSize === undefined) sizesKnown = false;
			else total += file.originalSize;
			if (!file.name.endsWith("/")) totalFiles++;
			file.ondata = () => {};
			file.start();
		});

		metadata.register(UnzipInflate);
		metadata.register(UnzipPassThrough);
		await this.readArchive(archivePath, metadata);

		let extracted = 0;
		let extractedFiles = 0;
		let writes = Promise.resolve();
		let extractionError: Error | undefined;

		const updateProgress = (): void => {
			const percentage =
				sizesKnown && total > 0
					? Math.min(100, (extracted / total) * 100)
					: totalFiles > 0
						? Math.min(100, (extractedFiles / totalFiles) * 100)
						: 100;
			const filled = Math.round((30 * percentage) / 100);
			const bar = `${"#".repeat(filled)}${"-".repeat(30 - filled)}`;
			const extractedSize = `${(extracted / 1024 / 1024).toFixed(1)} MB`;
			process.stdout.write(
				`\r\x1b[2K[${bar}] ${percentage.toFixed(1)}% ${extractedSize}`,
			);
		};

		const unzip = new Unzip((file) => {
			const targetPath = resolve(this.serverPath, file.name);
			const targetRelativePath = relative(this.serverPath, targetPath);

			if (
				targetRelativePath.startsWith(`..${sep}`) ||
				targetRelativePath === ".."
			) {
				extractionError = new Error(`Unsafe path in BDS archive: ${file.name}`);
				return;
			}

			file.ondata = (error, data, final) => {
				writes = writes
					.then(async () => {
						if (error) throw error;

						if (file.name.endsWith("/")) {
							await mkdir(targetPath, { recursive: true });
						} else {
							await mkdir(dirname(targetPath), { recursive: true });
							const output = await open(targetPath, "a");
							try {
								await output.write(data);
							} finally {
								await output.close();
							}
						}

						extracted += data.byteLength;
						updateProgress();

						if (final) {
							if (!file.name.endsWith("/")) extractedFiles++;
							await mkdir(dirname(targetPath), { recursive: true });
						}
					})
					.catch((error) => {
						extractionError =
							error instanceof Error ? error : new Error(String(error));
					});
			};

			file.start();
		});

		unzip.register(UnzipInflate);
		unzip.register(UnzipPassThrough);

		await this.readArchive(archivePath, unzip);
		await writes;
		if (extractionError) throw extractionError;
		updateProgress();
		process.stdout.write("\n");
	}

	private async readArchive(archivePath: string, unzip: Unzip): Promise<void> {
		const archive = await open(archivePath, "r");

		try {
			while (true) {
				const buffer = Buffer.alloc(1024 * 1024);
				const { bytesRead } = await archive.read(
					buffer,
					0,
					buffer.length,
					null,
				);
				if (bytesRead === 0) break;
				unzip.push(buffer.subarray(0, bytesRead));
			}

			unzip.push(new Uint8Array(), true);
		} finally {
			await archive.close();
		}
	}

	private async resolveDownloadUrl(preview: boolean): Promise<string> {
		const platform =
			process.platform === "win32"
				? "Windows"
				: process.platform === "linux"
					? "Linux"
					: undefined;
		if (!platform) {
			throw new Error(`Unsupported operating system: ${process.platform}`);
		}

		const response = await fetch(linksUrl);

		if (response.ok) {
			const body = (await response.json()) as DownloadLinksResponse;
			const downloadType = `serverBedrock${preview ? "Preview" : ""}${platform}`;
			const downloadUrl = body.result?.links?.find(
				(link) => link.downloadType === downloadType,
			)?.downloadUrl;

			if (downloadUrl) return downloadUrl;
		}

		throw new Error(
			`Unable to resolve the Bedrock ${preview ? "preview " : ""}${platform} server download URL.`,
		);
	}
}

export { DownloadAction };
