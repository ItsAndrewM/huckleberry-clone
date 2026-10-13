import { type FieldError, InvalidInput } from "@bt/contracts"
import type { ValidationIssue } from "@bt/domain"

export const errorAt = (path: string, issue: ValidationIssue | null): FieldError[] =>
  issue === null ? [] : [{ path, issue }]

export const invalidUnless = (errors: ReadonlyArray<FieldError>): InvalidInput | null =>
  errors.length === 0 ? null : new InvalidInput({ fieldErrors: errors })
