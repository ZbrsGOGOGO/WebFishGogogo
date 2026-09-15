/* @refresh reload */
import { Route } from "@solidjs/router"
import { MemoryRouter } from "@solidjs/router"
import { render } from "solid-js/web"
import { Layout } from "./components/layout"
import { Home } from "./routes/home"
import { Run } from "./routes/run"
import "./styles/reset.css"
import type { ParentProps } from "solid-js"
import { initObservability } from "./lib/observability"
import { Help } from "./routes/help"
import New from "./routes/new"
import { Settings } from "./routes/settings"

const root = document.getElementById("root")

initObservability()

render(() => {
  return (
    <MainRouter>
      <Route path="/" component={Home} />
      <Route path="/play" component={Run} />
      <Route path="/settings" component={Settings} />
      <Route path="/new" component={New} />
      <Route path="/help" component={Help} />
    </MainRouter>
  )
}, root!)

function MainRouter(props: ParentProps) {
  return (
    <MemoryRouter root={Layout} preload={false}>{props.children}</MemoryRouter>
  )
}
