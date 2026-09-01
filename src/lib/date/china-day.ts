import { toRelationshipDate } from "./relationship-date";

export function getChinaDateString(date = new Date()) {
  return toRelationshipDate(date);
}
