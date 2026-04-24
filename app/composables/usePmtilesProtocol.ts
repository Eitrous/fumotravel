const PMTILES_PROTOCOL_FLAG = '__fumo_pmtiles_protocol_registered__'

export const registerPmtilesProtocol = async (
  maplibregl: typeof import('maplibre-gl')
) => {
  const globalState = globalThis as typeof globalThis & Record<string, boolean | undefined>

  if (globalState[PMTILES_PROTOCOL_FLAG]) {
    return
  }

  const { Protocol } = await import('~~/vendor/pmtiles.mjs')
  const protocol = new Protocol({ metadata: true })
  maplibregl.addProtocol('pmtiles', protocol.tile)
  globalState[PMTILES_PROTOCOL_FLAG] = true
}
