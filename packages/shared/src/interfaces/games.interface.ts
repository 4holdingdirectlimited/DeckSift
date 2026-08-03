import type { FieldMeta } from "./sort-bins.interface";

export interface Game {
  guid: string;
  key: string;
  name: string;
  dataSourceUrl: string;
  isActive: boolean;
  fieldDefinitions: FieldMeta[];
  /** ISO 8601 — the API serializes timestamps as strings. */
  createdAt: string;
  updatedAt: string;
}
