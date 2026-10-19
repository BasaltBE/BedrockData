import type { Drop } from "./drop";

type EntityDrop = {
	identifier: string;
	dropSetIds: number[];
};

type EntityDropsData = Record<string, Record<string, Drop[]>>;

type EntityDrops = {
	variants: string[];
	dropSets: Drop[][];
	entities: EntityDrop[];
};

export type { EntityDrops, EntityDropsData };
