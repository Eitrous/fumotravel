import type { SpriteSpecification, StyleSpecification } from 'maplibre-gl'

const MAP_ASSET_PATH_PREFIX = '/map-assets/'

const resolveCurrentOriginMapAssetUrl = (value: string) => {
  if (!import.meta.client || !value) {
    return value
  }

  const trimmed = value.trim()
  const currentOrigin = window.location.origin

  if (trimmed.startsWith(MAP_ASSET_PATH_PREFIX)) {
    return `${currentOrigin}${trimmed}`
  }

  if (trimmed.startsWith(MAP_ASSET_PATH_PREFIX.slice(1))) {
    return `${currentOrigin}/${trimmed}`
  }

  try {
    const url = new URL(trimmed)
    const rawPathAndQuery = trimmed.slice(url.origin.length)

    if (!rawPathAndQuery.startsWith(MAP_ASSET_PATH_PREFIX)) {
      return value
    }

    return `${currentOrigin}${rawPathAndQuery}`
  } catch {
    return value
  }
}

const resolveSpriteSpecification = (
  sprite: StyleSpecification['sprite']
): StyleSpecification['sprite'] => {
  if (typeof sprite === 'string') {
    return resolveCurrentOriginMapAssetUrl(sprite)
  }

  if (Array.isArray(sprite)) {
    return sprite.map((item: SpriteSpecification) => ({
      ...item,
      url: resolveCurrentOriginMapAssetUrl(item.url)
    }))
  }

  return sprite
}

export const resolveHostedMapStyleAssetUrls = (style: StyleSpecification) => {
  return {
    ...style,
    glyphs: typeof style.glyphs === 'string'
      ? resolveCurrentOriginMapAssetUrl(style.glyphs)
      : style.glyphs,
    sprite: resolveSpriteSpecification(style.sprite)
  }
}

export const fetchHostedMapStyle = async (styleUrl: string, signal?: AbortSignal) => {
  const style = await $fetch<StyleSpecification>(styleUrl, { signal })

  return resolveHostedMapStyleAssetUrls(style)
}
