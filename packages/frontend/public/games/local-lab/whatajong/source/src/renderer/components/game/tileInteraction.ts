// Whatajong MIT accessibility adaptation, 2026-09-15. No matching/rule changes.
import type { Card } from "@/lib/game"

const SUITS: Record<Card["suit"], string> = {
  bam: "条", crack: "万", dot: "筒", wind: "风牌", dragon: "龙牌",
  rabbit: "兔牌", frog: "蛙牌", lotus: "莲牌", shadow: "影牌",
  sparrow: "雀牌", phoenix: "凤凰牌", taijitu: "太极牌", mutation: "变异牌",
  flower: "花牌", element: "元素牌", gem: "宝石牌", joker: "百搭牌",
}
const RANKS: Record<string, string> = { r: "红", g: "绿", b: "蓝", k: "黑", n: "北", e: "东", w: "西", s: "南" }

export function getTileA11yLabel(id: string, card: Card, visible: boolean) {
  // A restricted underlying tile must not disclose a hidden face to assistive
  // technology. Only the original isFree-visible selectable face is described.
  if (!visible) return `不可选择的牌 · 编号 ${id}`
  const rank = (RANKS[card.rank] ?? card.rank) || card.id.match(/\d+$/)?.[0] || ""
  return `牌 ${SUITS[card.suit]} ${rank} · 编号 ${id}`
}

type KeyInput = { key: string; repeat?: boolean; preventDefault(): void; stopPropagation(): void }

export function createTileActivation(isBlocked: () => boolean, onActivate: () => void) {
  const heldKeys = new Set<string>()
  function activate() {
    if (isBlocked()) return false
    onActivate()
    return true
  }
  return {
    pointer(event: { button: number }) { if (event.button === 0) activate() },
    keyDown(event: KeyInput) {
      if (event.key !== "Enter" && event.key !== " ") return
      event.preventDefault()
      event.stopPropagation()
      if (event.repeat || heldKeys.has(event.key)) return
      heldKeys.add(event.key)
      activate()
    },
    keyUp(event: { key: string }) { heldKeys.delete(event.key) },
    blur() { heldKeys.clear() },
    // Role=button divs do not synthesize native clicks for key events. AT can
    // emit a detail=0 click; avoid double activation while a key is held.
    click(event: { detail: number }) { if (event.detail === 0 && heldKeys.size === 0) activate() },
  }
}
