import { system, world } from "@minecraft/server"

import { readBlockComponents, readBlockTags } from "./block-tags.js"
import { readItemTags } from "./item-tags.js"
import { readEntityTypes } from "./entity-types.js"
import { sendTags } from "./send.js"

console.warn("Tag behavior pack loaded")

world.afterEvents.worldLoad.subscribe(() => {
  console.warn("Tag behavior pack world loaded")

  try {
    world.getDimension("overworld").runCommand("tickingarea add circle 0 -60 0 4 dump")
  } catch (error) {
    console.warn(`Tag dump setup failed: ${String(error)}`)
  }

  system.runTimeout(() => {
    console.warn("Reading Bedrock block and item tags")

    try {
      sendTags({
        blockTags: readBlockTags(),
        blockComponents: readBlockComponents(),
        itemTags: readItemTags(),
        entityTypes: readEntityTypes(),
      })
    } catch (error) {
      console.warn(`Tag dump failed: ${String(error)}`)
    }
  }, 1)
})
