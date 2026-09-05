import { EntityTypes, EnchantmentType, ItemStack, system, world } from "@minecraft/server"

const sampleCount = 50

async function readEntityDrops() {
  const tools = []
  for (let fireAspect = 0; fireAspect <= 2; fireAspect++) {
    for (let looting = 0; looting <= 3; looting++) {
      const tool = new ItemStack("minecraft:diamond_sword")
      const enchantable = tool.getComponent("minecraft:enchantable")
      const names = []
      if (looting) {
        enchantable.addEnchantment({
          type: new EnchantmentType("minecraft:looting"),
          level: looting,
        })
        names.push(`looting${looting}`)
      }
      if (fireAspect) {
        enchantable.addEnchantment({
          type: new EnchantmentType("minecraft:fire_aspect"),
          level: fireAspect,
        })
        names.push(`fireAspect${fireAspect}`)
      }
      tools.push({ name: names.join("_") || "default", tool, fireAspect })
    }
  }

  const loot = world.getLootTableManager()
  const dimension = world.getDimension("overworld")
  const result = {}

  for (const type of EntityTypes.getAll()) {
    await new Promise((resolve) => system.run(resolve))
    let entity
    try {
      entity = dimension.spawnEntity(type.id, { x: 0, y: -60, z: 0 })
    } catch (error) {
      console.warn(`Entity drop sample skipped for ${type.id}: ${String(error)}`)
      continue
    }

    try {
      const variants = {}
      for (const { name, tool, fireAspect } of tools) {
        entity.extinguishFire()
        // Loot generation does not apply the sword's Fire Aspect to the entity.
        if (fireAspect) entity.setOnFire(4 * fireAspect)
        const values = new Map()

        for (let sample = 0; sample < sampleCount; sample++) {
          const amounts = new Map()
          for (const item of loot.generateLootFromEntity(entity, tool) ?? [])
            amounts.set(item.typeId, (amounts.get(item.typeId) ?? 0) + item.amount)

          for (const [identifier, amount] of amounts) {
            const value = values.get(identifier) ?? {
              minAmount: Number.POSITIVE_INFINITY,
              maxAmount: 0,
              samples: 0,
            }
            value.minAmount = Math.min(value.minAmount, amount)
            value.maxAmount = Math.max(value.maxAmount, amount)
            value.samples++
            values.set(identifier, value)
          }
        }

        variants[name] = [...values]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([identifier, value]) => ({
            identifier,
            minAmount: value.samples < sampleCount ? 0 : value.minAmount,
            maxAmount: value.maxAmount,
          }))
      }
      result[type.id] = variants
    } finally {
      entity.remove()
    }
  }

  return result
}

export { readEntityDrops }
