import { useMe } from "../../api/hooks.ts"
import { Page } from "../../shell/page.tsx"

export const TodayPage = () => {
  const { data: me } = useMe()
  return <Page title="Today" subtitle={me?.child.name} />
}
