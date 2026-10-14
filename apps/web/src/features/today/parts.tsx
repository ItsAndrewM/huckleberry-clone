import { Fragment } from "react"

interface PartsProps {
  readonly parts: ReadonlyArray<string>
  readonly between?: string
}

export const Parts = ({ parts, between = " · " }: PartsProps) =>
  parts.map((part, index) => (
    <Fragment key={`${index}-${part}`}>
      {index === 0 ? null : between}
      <span className="whitespace-nowrap">{part}</span>
    </Fragment>
  ))
