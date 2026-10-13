import { Fragment } from "react"

interface PartsProps {
  readonly parts: ReadonlyArray<string>
  readonly freeText?: boolean
}

export const Parts = ({ parts, freeText = false }: PartsProps) =>
  parts.map((part, index) => (
    <Fragment key={`${index}-${part}`}>
      {index === 0 ? null : " · "}
      <span className={freeText ? "break-words" : "whitespace-nowrap"}>{part}</span>
    </Fragment>
  ))
