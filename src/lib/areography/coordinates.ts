import * as THREE from 'three'

export function latLonToCartesian(lat: number, lon: number, radius: number): THREE.Vector3 {
  const latRad = lat * THREE.MathUtils.DEG2RAD
  const lonRad = lon * THREE.MathUtils.DEG2RAD
  return new THREE.Vector3(
    radius * Math.cos(latRad) * Math.sin(lonRad),
    radius * Math.sin(latRad),
    radius * Math.cos(latRad) * Math.cos(lonRad),
  )
}

export function cartesianToLatLon(position: THREE.Vector3, radius: number): { lat: number; lon: number } {
  const lat = Math.asin(position.y / radius) * THREE.MathUtils.RAD2DEG
  const lon = Math.atan2(position.x, position.z) * THREE.MathUtils.RAD2DEG
  return { lat, lon }
}

export function surfaceNormal(lat: number, lon: number): THREE.Vector3 {
  return latLonToCartesian(lat, lon, 1)
}
