import {
	createServer,
	type IncomingMessage,
	type ServerResponse,
} from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

type TagsPayload = {
	blockTags: Array<{
		identifier: string;
		tags: string[];
	}>;
	itemTags: Array<{
		identifier: string;
		tags: string[];
	}>;
	blockComponents?: Array<{
		identifier: string;
		components: Record<string, unknown>;
	}>;
	entityTypes?: Array<{
		identifier: string;
		components: string[];
		families: string[];
	}>;
};

function readBody(request: IncomingMessage): Promise<string> {
	return new Promise((resolveBody, rejectBody) => {
		const chunks: Buffer[] = [];

		request.on("data", (chunk: Buffer) => chunks.push(chunk));
		request.on("error", rejectBody);
		request.on("end", () =>
			resolveBody(Buffer.concat(chunks).toString("utf8")),
		);
	});
}

function sendResponse(
	response: ServerResponse,
	status: number,
	body: string,
): void {
	response.statusCode = status;
	response.setHeader("content-type", "text/plain");
	response.end(body);
}

async function startServer(
	dataPath: string,
	port = 18080,
): Promise<ReturnType<typeof createServer>> {
	const server = createServer(async (request, response) => {
		if (request.method !== "POST" || request.url !== "/tags") {
			sendResponse(response, 404, "Not found");
			return;
		}

		try {
			const payload = JSON.parse(await readBody(request)) as TagsPayload;
			if (
				!Array.isArray(payload.blockTags) ||
				!Array.isArray(payload.itemTags)
			) {
				throw new Error("Invalid tags payload");
			}

			await mkdir(dataPath, { recursive: true });
			await writeFile(
				resolve(dataPath, "block-tags.json"),
				JSON.stringify(payload.blockTags, null, 2),
			);
			await writeFile(
				resolve(dataPath, "item-tags.json"),
				JSON.stringify(payload.itemTags, null, 2),
			);
			if (Array.isArray(payload.blockComponents)) {
				await writeFile(
					resolve(dataPath, "block-components.json"),
					JSON.stringify(payload.blockComponents, null, 2),
				);
			}
			if (Array.isArray(payload.entityTypes)) {
				await writeFile(
					resolve(dataPath, "entity-types.json"),
					JSON.stringify(payload.entityTypes, null, 2),
				);
			}
			sendResponse(response, 200, "ok");
			console.log(`Saved BDS data to ${dataPath}`);
		} catch (error) {
			sendResponse(
				response,
				400,
				error instanceof Error ? error.message : "Invalid request",
			);
		}
	});

	await new Promise<void>((resolveServer, rejectServer) => {
		server.once("error", rejectServer);
		server.listen(port, "127.0.0.1", () => {
			server.removeListener("error", rejectServer);
			resolveServer();
		});
	});

	return server;
}

export { startServer };
