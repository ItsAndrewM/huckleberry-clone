import { Link } from "@tanstack/react-router"
import { Page } from "./page.tsx"

export const NotFoundPage = () => (
  <Page title="Page not found">
    <p className="text-muted-foreground">
      There's nothing here.{" "}
      <Link to="/" className="font-medium text-primary underline underline-offset-4">
        Go to Today
      </Link>
    </p>
  </Page>
)
