type ActionHandler = (...args: string[]) => void

const handlers: Record<string, ActionHandler> = {}

function registerAction(key: string, handler: ActionHandler): void {
  handlers[key] = handler
}

function invokeAction(actionString: string): boolean {
  const colonIdx = actionString.indexOf(':')
  let key: string
  let args: string[]
  if (colonIdx >= 0) {
    key = actionString.slice(0, colonIdx)
    args = [actionString.slice(colonIdx + 1)]
  } else {
    key = actionString
    args = []
  }
  const handler = handlers[key]
  if (!handler) return false
  handler(...args)
  return true
}

export function useInventoryActions() {
  return { registerAction, invokeAction }
}
