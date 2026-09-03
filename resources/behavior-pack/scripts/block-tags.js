import { BlockPermutation, BlockTypes, world } from "@minecraft/server"

function readBlockTags() {
  return BlockTypes.getAll().map((type) => {
    try {
      const permutation = BlockPermutation.resolve(type.id)

      return {
        identifier: type.id,
        tags: permutation.getTags(),
      }
    } catch {
      return {
        identifier: type.id,
        tags: [],
      }
    }
  })
}

function readBlockComponents() {
  const dimension = world.getDimension("overworld")

  return BlockTypes.getAll().map((type) => {
    const components = {}

    try {
      const block = dimension.getBlock({ x: 0, y: -60, z: 0 })
      block.setType(type)

      for (const component of block.getComponents()) {
        try {
          components[component.typeId] = serializeComponent(component)
        } catch {}
      }
    } catch {}

    return { identifier: type.id, components }
  })
}

function serializeComponent(component) {
  const data = {}
  const prototype = Object.getPrototypeOf(component)

  for (const key of Object.getOwnPropertyNames(prototype ?? {})) {
    if (key === "typeId" || key === "block") continue

    try {
      const value = component[key]
      if (typeof value === "function") continue
      data[key] = value !== null && typeof value === "object" ? serializeObject(value) : value
    } catch {}
  }

  return data
}

function serializeObject(value) {
  if (Array.isArray(value)) return value.map((item) => item !== null && typeof item === "object" ? serializeObject(item) : item)

  const data = {}
  const keys = new Set([
    ...Object.getOwnPropertyNames(value),
    ...Object.getOwnPropertyNames(Object.getPrototypeOf(value) ?? {}),
  ])

  for (const key of keys) {
    if (["constructor", "block", "isValid", "emptySlotsCount", "containerRules", "weight"].includes(key)) continue

    try {
      const nested = value[key]
      if (typeof nested === "function") continue
      data[key] = nested !== null && typeof nested === "object" ? serializeObject(nested) : nested
    } catch {}
  }

  return data
}

export { readBlockComponents, readBlockTags }
