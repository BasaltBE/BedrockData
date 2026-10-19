import type { Tag } from "./tag";
import type { BlockComponents } from "./block-components";
import type { Drops } from "./drops";
import type { EntityDropsData } from "./entity-drops";
import type { EntityType } from "./entity-type";

type TagsPayload = {
	blockTags: Tag[];
	itemTags: Tag[];
	blockComponents?: BlockComponents[];
	blockDrops?: Drops;
	entityDrops?: EntityDropsData;
	entityTypes?: EntityType[];
};

export type { TagsPayload };
