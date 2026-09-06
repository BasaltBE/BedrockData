type PropertyValue = {
	title: string;
	description?: string;
    $schema?: string;
    $id: string;
    "x-format-version": string;
    "x-minecraft-version": string;
    "x-protocol-version": number;
    type?: "integer" | "boolean" | "array" | "string" | "number" | "object" | "null";
    enum?: Array<string | number | boolean | null>;
	"x-underlying-type"?: string;
	"x-serialization-options"?: string[];
	"x-enum-binary-value"?: number[];
	"x-ordinal-index"?: number;
	"x-runtime-constraint-description"?: string;
	$ref?: string;
	$metaProperties?: {
		"[cereal:packet]"?: number;
		"[cereal:packet_details]"?: string;
	};
	properties?: Record<string, PropertyValue>;
	items?: PropertyValue | PropertyValue[];
	oneOf?: PropertyValue[];
	required?: string[];
    [key: string]: unknown;
};

export type { PropertyValue };
