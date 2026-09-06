import { copyFile, mkdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { Bds } from "./bds";
import { CloudburstAction } from "./data/cloudburst";
import { startServer } from "./server";

const temporaryPath = resolve(import.meta.dir, "..", ".temp");
const bds = new Bds(resolve(temporaryPath, "server"));
const cloudburst = new CloudburstAction(resolve(temporaryPath, "data"));
const preview = process.argv.includes("--preview");
const skipData = process.argv.includes("--skip-data");
const server = await startServer(
	resolve(temporaryPath, "output"),
	18080,
	false,
	undefined,
	skipData,
);
let serverClosed = false;

bds.on("downloadStarted", (isPreview) => {
	console.log(
		`Downloading ${isPreview ? "preview" : "stable"} Bedrock Dedicated Server...`,
	);
});

bds.on("downloadCompleted", () => {
	console.log("Bedrock Dedicated Server is ready.");
});

try {
	await bds.actions.download.run(preview);
	await bds.actions.prepare.run();
	if (skipData) {
		const docsPath = resolve(bds.serverPath, "docs");
		let docsExist = false;
		try {
			docsExist = (await stat(docsPath)).isDirectory();
		} catch {}

		if (docsExist) {
			console.log("Data generation is disabled + docs found.");
			await bds.actions.parse.run();
		} else {
			console.log("Data generation is disabled. Starting BDS...");
			await bds.actions.runServer.run();
		}
	} else {
		console.log("Generating BDS documentation...");
		await bds.actions.generateDocs.run();
		await bds.actions.parse.run();
		await new Promise<void>((resolveServer, rejectServer) =>
			server.close((error) =>
				error ? rejectServer(error) : resolveServer(),
			),
		);
		serverClosed = true;
		let resolveDrops: (() => void) | undefined;
		const dropsReady = new Promise<void>((resolveReady) => {
			resolveDrops = resolveReady;
		});
		const dropServer = await startServer(
			resolve(temporaryPath, "output"),
			18080,
			true,
			() => resolveDrops?.(),
		);
		try {
			await bds.actions.runServer.run(dropsReady);
		} finally {
			await new Promise<void>((resolveServer, rejectServer) =>
				dropServer.close((error) =>
					error ? rejectServer(error) : resolveServer(),
				),
			);
		}
		await cloudburst.run();
		await mkdir(resolve(temporaryPath, "output"), { recursive: true });
		await copyFile(
			resolve(temporaryPath, "data", "recipes.json"),
			resolve(temporaryPath, "output", "recipes.json"),
		);
		await bds.actions.generateBlockTypes.run();
		await bds.actions.generateEntityTypes.run();
		await bds.actions.generateEntityDrops.run();
		await bds.actions.generateEnchantmentTypes.run();
		await bds.actions.generateTreeTypes.run();
		await bds.actions.generateItemTypes.run();
	}
} finally {
	if (!serverClosed) server.close();
}
