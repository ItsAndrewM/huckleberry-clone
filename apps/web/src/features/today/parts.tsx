import { Fragment } from "react"

interface PartsProps {
  readonly parts: ReadonlyArray<string>
  readonly between?: string
  readonly freeText?: boolean
}

export const Parts = ({ parts, between = " · ", freeText = false }: PartsProps) =>
  parts.map((part, index) => (
    <Fragment key={`${index}-${part}`}>
      {index === 0 ? null : between}
      <span className={freeText ? "break-words" : "whitespace-nowrap"}>{part}</span>
    </Fragment>
  ))
