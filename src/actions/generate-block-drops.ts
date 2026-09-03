import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";

import { Action } from "../action";

class GenerateBlockDropsAction extends Action<[], void> {
	constructor(private readonly serverPath: string) {
		super("generate-block-drops");
	}

	async run(stopRequested?: Promise<void>): Promise<void> {
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

		await new Promise<void>((resolveProcess, rejectProcess) => {
			let stopping = false;
			const server = spawn(executablePath, [], {
				cwd: this.serverPath,
				stdio: ["pipe", "pipe", "pipe"],
			});
			stopRequested?.then(() => {
				stopping = true;
				server.stdin?.write("stop\n");
			});

			server.stdout?.on("data", (data) => process.stdout.write(data));
			server.stderr?.on("data", (data) => process.stderr.write(data));
			server.on("error", rejectProcess);
			server.on("exit", (code) => {
				if (code === 0 || stopping) resolveProcess();
				else
					rejectProcess(
						new Error(`BDS exited with code ${code ?? "unknown"}.`),
					);
			});
		});
	}
}

export { GenerateBlockDropsAction };
