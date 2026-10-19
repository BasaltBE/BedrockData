import type { Drop } from "./drop";

type BlockDrop = {
	identifier: string;
	dropSetIds: number[];
};

type BlockDrops = {
	tools: string[];
	variants: string[];
	dropSets: Drop[][];
	blocks: BlockDrop[];
};

export type { BlockDrops };
