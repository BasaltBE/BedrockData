import { BlockTypes, EnchantmentType, ItemStack, system, world } from "@minecraft/server"

const sampleCount = 50

function createTool(identifier, enchantment) {
  const tool = new ItemStack(identifier)
  if (enchantment) {
    tool.getComponent("minecraft:enchantable")?.addEnchantment({
      type: new EnchantmentType(enchantment.type),
      level: enchantment.level,
    })
  }
  return tool
}

function waitForNextTick() {
  return new Promise((resolve) => system.run(resolve))
}

async function sampleDrops(loot, type, tool, state) {
  const values = new Map()

  for (let sample = 0; sample < sampleCount; sample++) {
    state.calls++
    if (state.calls % 20000 === 0) await waitForNextTick()
    const amounts = new Map()
    const items = loot.generateLootFromBlockType(type, tool) ?? []
    for (const item of items)
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

  return [...values]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([identifier, value]) => ({
      identifier,
      minAmount: value.samples < sampleCount ? 0 : value.minAmount,
      maxAmount: value.maxAmount,
    }))
}

async function readBlockDrops() {
  const tools = [["hand", undefined]]
  const toolTypes = [
    "wooden_axe",
    "wooden_hoe",
    "wooden_pickaxe",
    "wooden_shovel",
    "stone_axe",
    "stone_hoe",
    "stone_pickaxe",
    "stone_shovel",
    "iron_axe",
    "iron_hoe",
    "iron_pickaxe",
    "iron_shovel",
    "golden_axe",
    "golden_hoe",
    "golden_pickaxe",
    "golden_shovel",
    "diamond_axe",
    "diamond_hoe",
    "diamond_pickaxe",
    "diamond_shovel",
    "netherite_axe",
    "netherite_hoe",
    "netherite_pickaxe",
    "netherite_shovel",
    "shears",
  ]
  const enchantments = [
    { name: "silk_touch", type: "minecraft:silk_touch", level: 1 },
    { name: "fortune_1", type: "minecraft:fortune", level: 1 },
    { name: "fortune_2", type: "minecraft:fortune", level: 2 },
    { name: "fortune_3", type: "minecraft:fortune", level: 3 },
  ]

  for (const identifier of toolTypes) {
    tools.push([identifier, createTool(identifier)])
    for (const enchantment of enchantments) {
      try {
        tools.push([
          `${identifier}_${enchantment.name}`,
          createTool(identifier, enchantment),
        ])
      } catch {}
    }
  }

  const loot = world.getLootTableManager()
  const result = {}
  const state = { calls: 0 }

  for (const type of BlockTypes.getAll()) {
    const drops = {}

  for (const [name, tool] of tools) {
      if (
        name !== "hand" &&
        enchantments.some((enchantment) => name.endsWith(`_${enchantment.name}`))
      )
        continue

      try {
        const variants = {
          default: await sampleDrops(loot, type, tool, state),
        }

        for (const enchantment of enchantments) {
          const variant = `${name}_${enchantment.name}`
          const index = tools.findIndex(([toolName]) => toolName === variant)
          if (index === -1) continue
          const variantName =
            enchantment.name === "silk_touch"
              ? "silkTouch"
              : enchantment.name.replace("_", "")
          variants[variantName] = await sampleDrops(
            loot,
            type,
            tools[index][1],
            state,
          )
        }

        drops[name] = variants
      } catch {
        drops[name] = { default: [] }
      }
    }

    result[type.id] = drops
  }

  return result
}

export { readBlockDrops }
