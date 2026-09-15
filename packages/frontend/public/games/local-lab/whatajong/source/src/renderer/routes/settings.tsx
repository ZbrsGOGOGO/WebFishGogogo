import { useMusic } from "@/components/audio"
import { LinkButton } from "@/components/button"
import { ArrowLeft, Check, ChevronUpAndDown } from "@/components/icon"
import { useTranslation } from "@/i18n/useTranslation"
import { useGlobalState } from "@/state/globalState"
import { Select } from "@kobalte/core/select"
import {
  backButtonClass,
  containerClass,
  contentClass,
  selectContentClass,
  selectIconClass,
  selectItemClass,
  selectItemIndicatorClass,
  selectListboxClass,
  selectTriggerClass,
  selectValueClass,
  titleClass,
} from "./settings.css"

const LOCALES = {
  es: "Spanish",
  en: "English",
} as const

export function Settings() {
  const globalState = useGlobalState()
  const t = useTranslation()

  useMusic("music")

  return (
    <div class={containerClass}>
      <div class={contentClass}>
        <div class={backButtonClass}>
          <LinkButton href="/" hue="dot">
            <ArrowLeft />
          </LinkButton>
        </div>
        <h1 class={titleClass}>{t.settings.title()}</h1>
        <p>Silent edition · Audio is not included.</p>
        <Select
          options={Object.keys(LOCALES)}
          value={globalState.locale}
          selectionBehavior="replace"
          disallowEmptySelection
          onChange={(value) => {
            globalState.locale = value!
          }}
          placeholder="Select Language"
          itemComponent={(props) => (
            <Select.Item item={props.item} class={selectItemClass}>
              <Select.ItemLabel>
                {LOCALES[props.item.rawValue as keyof typeof LOCALES]}
              </Select.ItemLabel>
              <Select.ItemIndicator class={selectItemIndicatorClass}>
                <Check width={20} height={20} />
              </Select.ItemIndicator>
            </Select.Item>
          )}
        >
          <Select.Trigger aria-label="Language" class={selectTriggerClass}>
            <Select.Value class={selectValueClass}>
              {(state: any) =>
                LOCALES[state.selectedOption() as keyof typeof LOCALES]
              }
            </Select.Value>
            <Select.Icon class={selectIconClass}>
              <ChevronUpAndDown width={20} height={20} />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content class={selectContentClass}>
              <Select.Listbox class={selectListboxClass} />
            </Select.Content>
          </Select.Portal>
        </Select>
        <p id="localLegal">Whatajong © 2025 Pao Ramon · MIT · 本站静音改编，无担保。进度仅当前窗口，不会永久保存。源码及依赖许可请在父页操作、存档与来源说明中打开。</p>
      </div>
    </div>
  )
}
