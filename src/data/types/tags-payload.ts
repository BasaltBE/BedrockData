import type { Tag } from "./tag";
import type { BlockComponents } from "./block-components";
import type { Drops } from "./drops";
import type { EntityType } from "./entity-type";

type TagsPayload = {
	blockTags: Tag[];
	itemTags: Tag[];
	blockComponents?: BlockComponents[];
	blockDrops?: Drops;
	entityDrops?: Drops;
	entityTypes?: EntityType[];
};

export type { TagsPayload };
