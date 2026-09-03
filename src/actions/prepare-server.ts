import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Action } from "../action";

class PrepareServerAction extends Action<[], void> {
	constructor(
		private readonly serverPath: string,
		private readonly templatePath: string,
		private readonly behaviorPackPath: string,
	) {
		super("prepare-server");
	}

	async run(): Promise<void> {
		const worldPath = resolve(this.serverPath, "worlds", "bedrock-data-dumper");
		const packPath = resolve(
			this.serverPath,
			"development_behavior_packs",
			"bedrock-data-dumper",
		);

		await mkdir(this.serverPath, { recursive: true });
		await cp(this.templatePath, worldPath, { recursive: true, force: true });
		await cp(this.behaviorPackPath, packPath, { recursive: true, force: true });

		const propertiesPath = resolve(this.serverPath, "server.properties");
		let properties = await readFile(propertiesPath, "utf8");
		properties = properties.replace(
			/level-name=.*/g,
			"level-name=bedrock-data-dumper",
		);
		properties = /server-port=.*/.test(properties)
			? properties.replace(/server-port=.*/g, "server-port=19142")
			: `${properties}\nserver-port=19142`;
		properties = /server-portv6=.*/.test(properties)
			? properties.replace(/server-portv6=.*/g, "server-portv6=19143")
			: `${properties}\nserver-portv6=19143`;
		properties = /content-log-console-output-enabled=.*/.test(properties)
			? properties.replace(
					/content-log-console-output-enabled=.*/g,
					"content-log-console-output-enabled=true",
				)
			: `${properties}\ncontent-log-console-output-enabled=true`;
		await writeFile(propertiesPath, properties);

		const permissionsPath = resolve(
			this.serverPath,
			"config",
			"default",
			"permissions.json",
		);
		const permissions = JSON.parse(await readFile(permissionsPath, "utf8")) as {
			allowed_modules: string[];
		};
		if (!permissions.allowed_modules.includes("@minecraft/server-net")) {
			permissions.allowed_modules.push("@minecraft/server-net");
		}
		await writeFile(permissionsPath, JSON.stringify(permissions, null, 2));
	}
}

export { PrepareServerAction };
