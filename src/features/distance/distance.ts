export type Coordinates = {
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_KM = 6371;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function calculateDistanceKm(a: Coordinates, b: Coordinates) {
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);
  const startLatitude = toRadians(a.latitude);
  const endLatitude = toRadians(b.latitude);

  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function getDistanceCopy(distanceKm: number | null) {
  if (distanceKm === null) return "等待星球信号";
  return distanceKm >= 100 ? "相爱隔山海，山海皆可平" : "朝夕相伴，暮暮朝朝";
}
