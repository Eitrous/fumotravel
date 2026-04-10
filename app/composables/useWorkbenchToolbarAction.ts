import type { ComputedRef, InjectionKey, MaybeRefOrGetter, ShallowRef } from 'vue'

export type WorkbenchToolbarAction = {
  label: MaybeRefOrGetter<string>
  icon: MaybeRefOrGetter<string>
  run: () => void | Promise<void>
  disabled?: MaybeRefOrGetter<boolean>
  loading?: MaybeRefOrGetter<boolean>
}

type WorkbenchToolbarController = {
  currentAction: ShallowRef<WorkbenchToolbarAction | null>
  setAction: (token: symbol, action: WorkbenchToolbarAction | null) => void
  clearAction: (token: symbol) => void
}

const WORKBENCH_TOOLBAR_KEY: InjectionKey<WorkbenchToolbarController> = Symbol('workbench-toolbar')

export const provideWorkbenchToolbarActionController = () => {
  const currentAction = shallowRef<WorkbenchToolbarAction | null>(null)
  const currentToken = shallowRef<symbol | null>(null)

  const controller: WorkbenchToolbarController = {
    currentAction,
    setAction(token, action) {
      currentToken.value = token
      currentAction.value = action
    },
    clearAction(token) {
      if (currentToken.value !== token) {
        return
      }

      currentToken.value = null
      currentAction.value = null
    }
  }

  provide(WORKBENCH_TOOLBAR_KEY, controller)
  return controller
}

export const useWorkbenchToolbarAction = (
  action: ComputedRef<WorkbenchToolbarAction | null> | (() => WorkbenchToolbarAction | null)
) => {
  const controller = inject(WORKBENCH_TOOLBAR_KEY, null)

  if (!controller) {
    throw new Error('Workbench toolbar controller is not available.')
  }

  const token = Symbol('workbench-toolbar-action')

  watchEffect(() => {
    const nextAction = typeof action === 'function'
      ? action()
      : action.value

    controller.setAction(token, nextAction)
  })

  onBeforeUnmount(() => {
    controller.clearAction(token)
  })
}

export const resolveToolbarValue = <T>(value: MaybeRefOrGetter<T> | undefined, fallback: T) => {
  if (value == null) {
    return fallback
  }

  return toValue(value)
}
