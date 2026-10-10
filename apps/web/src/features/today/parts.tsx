import { Fragment } from "react"

export const Parts = ({ parts }: { readonly parts: ReadonlyArray<string> }) =>
  parts.map((part, index) => (
    <Fragment key={`${index}-${part}`}>
      {index === 0 ? null : " · "}
      <span className="whitespace-nowrap">{part}</span>
    </Fragment>
  ))
