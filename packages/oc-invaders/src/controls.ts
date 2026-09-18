export const GAME_BINDINGS = ['left', 'right', 'space', 'p', 'r', 'backspace', 'return'] as const
export const NAME_BINDINGS = [...'abcdefghijklmnopqrstuvwxyz0123456789']
const INPUT_BINDINGS = new Set<string>([...GAME_BINDINGS, ...NAME_BINDINGS])

export const isGameBinding = (binding: string) => INPUT_BINDINGS.has(binding)

export function gameInput(binding: string) {
  return {
    name: binding,
    sequence: binding.length === 1 ? binding : undefined,
  }
}
