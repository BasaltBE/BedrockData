import { spawn } from "node:child_process";
import { rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Action } from "../action";

class GenerateDocsAction extends Action<[], void> {
	constructor(private readonly serverPath: string) {
		super("generate-docs");
	}

	async run(): Promise<void> {
		const executable =
			process.platform === "win32"
				? "bedrock_server.exe"
				: process.platform === "linux"
					? "bedrock_server"
					: undefined;
		if (!executable)
			throw new Error(`Unsupported operating system: ${process.platform}`);

		const executablePath = resolve(this.serverPath, executable);
		try {
			await stat(executablePath);
		} catch {
			throw new Error(`BDS executable was not found: ${executablePath}`);
		}

		const configPath = resolve(this.serverPath, "test_config.json");
		await writeFile(
			configPath,
			JSON.stringify({ generate_documentation: true }),
		);

		try {
			await new Promise<void>((resolveProcess, rejectProcess) => {
				const server = spawn(executablePath, [], {
					cwd: this.serverPath,
					stdio: ["ignore", "pipe", "pipe"],
				});

				server.stdout?.on("data", (data) => process.stdout.write(data));
				server.stderr?.on("data", (data) => process.stderr.write(data));
				server.on("error", rejectProcess);
				server.on("exit", (code) => {
					if (code === 0) resolveProcess();
					else
						rejectProcess(
							new Error(`BDS exited with code ${code ?? "unknown"}.`),
						);
				});
			});
		} finally {
			await rm(configPath, { force: true });
		}
	}
}

export { GenerateDocsAction };
