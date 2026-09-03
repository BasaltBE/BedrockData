import { system, world } from "@minecraft/server"

import { readBlockComponents, readBlockTags } from "./block-tags.js"
import { readBlockDrops } from "./block-drops.js"
import { readItemTags } from "./item-tags.js"
import { readEntityTypes } from "./entity-types.js"
import { dropMode, sendTags } from "./send.js"

console.warn("Tag behavior pack loaded")

world.afterEvents.worldLoad.subscribe(() => {
  console.warn("Tag behavior pack world loaded")

  try {
    world.getDimension("overworld").runCommand("tickingarea add circle 0 -60 0 4 dump")
  } catch (error) {
    console.warn(`Tag dump setup failed: ${String(error)}`)
  }

  system.runTimeout(async () => {
    console.warn("Reading Bedrock block and item tags")

    try {
      const dropsMode = await dropMode()
      const response = await sendTags({
        blockTags: readBlockTags(),
        blockComponents: readBlockComponents(),
        ...(dropsMode ? { blockDrops: await readBlockDrops() } : {}),
        itemTags: readItemTags(),
        entityTypes: readEntityTypes(),
      })
      console.warn(`Tag dump POST status: ${response.status}`)
      if (dropsMode && response.status === 202)
        world.getDimension("overworld").runCommand("stop")
    } catch (error) {
      console.warn(`Tag dump failed: ${String(error)}`)
    }
  }, 1)
})
