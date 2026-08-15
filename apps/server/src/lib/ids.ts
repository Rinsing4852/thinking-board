import { randomUUID } from "node:crypto";

export function id(): string {
  return randomUUID();
}
export function now(): string {
  return new Date().toISOString();
}
