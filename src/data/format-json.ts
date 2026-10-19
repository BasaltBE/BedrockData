function formatJson(value: unknown): string {
	function quote(value: string): string {
		return JSON.stringify(value).replace(/[+&<>']/g, (character) =>
			`\\u${character.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
		);
	}

	function inline(value: unknown): string {
		if (Array.isArray(value)) {
			return value.length === 0
				? "[]"
				: `[${value.map(inline).join(", ")}]`;
		}
		if (value !== null && typeof value === "object") {
			const entries = Object.entries(value);
			return entries.length === 0
				? "{}"
				: `{ ${entries
						.map(([key, entry]) => `${quote(key)}: ${inline(entry)}`)
						.join(", ")} }`;
		}
		return typeof value === "string" ? quote(value) : JSON.stringify(value);
	}

	function print(
		value: unknown,
		indent: number,
		prefix = 0,
		arrayElement = false,
	): string {
		const compact = inline(value);
		const lineLength = compact.length + indent + prefix;
		if (arrayElement ? lineLength <= 80 : lineLength < 80)
			return compact;

		const padding = " ".repeat(indent);
		const childPadding = " ".repeat(indent + 2);
		if (Array.isArray(value)) {
			if (value.length === 0) return "[]";
			return `[\n${value
				.map((entry) => `${childPadding}${print(entry, indent + 2, 0, true)}`)
				.join(",\n")}\n${padding}]`;
		}
		if (value !== null && typeof value === "object") {
			const entries = Object.entries(value);
			if (entries.length === 0) return "{}";
			return `{\n${entries
				.map(
				([key, entry]) =>
						`${childPadding}${quote(key)}: ${print(entry, indent + 2, quote(key).length + 2)}`,
				)
				.join(",\n")}\n${padding}}`;
		}
		return compact;
	}

	return `${print(value, 0)}\n`;
}

export { formatJson };
