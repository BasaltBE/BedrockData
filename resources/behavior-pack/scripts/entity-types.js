import { EntityTypes, world } from "@minecraft/server"

function readEntityTypes() {
  const dimension = world.getDimension("overworld")

  return EntityTypes.getAll().map((type) => {
    try {
      const entity = dimension.spawnEntity(type.id, { x: 0, y: -60, z: 0 })
      const components = entity.getComponents().map((component) => component.typeId)
      const family = entity.getComponent("minecraft:type_family")
      const families = family?.getTypeFamilies() ?? []
      entity.remove()

      return { identifier: type.id, components, families }
    } catch {
      return { identifier: type.id, components: [], families: [] }
    }
  })
}

export { readEntityTypes }
