import { ItemStack, ItemTypes } from "@minecraft/server"

const knownComponents = new Set([
  "minecraft:digger", "minecraft:weapon", "minecraft:armor", "minecraft:projectile",
  "minecraft:throwable", "minecraft:shooter", "minecraft:entity_placer", "minecraft:block_placer",
  "minecraft:record", "minecraft:repairable", "minecraft:wearable", "minecraft:icon", "minecraft:damage",
  "minecraft:use_duration",
])

function readItemTags() {
  return ItemTypes.getAll().map((type) => {
    try {
      const stack = new ItemStack(type, 1)
      const components = stack.getComponents().map((component) => component.typeId)
      const tags = stack.getTags()

      return {
        identifier: type.id,
        tags: tags.filter((tag) => !knownComponents.has(tag) && !components.includes(tag)),
        components: [...new Set([...components, ...tags.filter((tag) => knownComponents.has(tag))])],
        stackable: stack.isStackable,
        maxAmount: stack.maxAmount,
      }
    } catch {
      return {
        identifier: type.id,
        tags: [],
        components: [],
        stackable: false,
        maxAmount: 0,
      }
    }
  })
}

export { readItemTags }
