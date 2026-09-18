import { Plugin } from '@opencode/plugin/tui'
import type { PanelInput } from '@opencode/plugin/tui/context'
import { buildKittyKeyboardFlags, type KeyEvent, type TextRenderable } from '@opentui/core'
import { InvadersGame } from 'tui-invaders/embed'
import { Show, onCleanup, onMount } from 'solid-js'
import { gameInput, isGameBinding } from './controls.js'

type ActiveGame = {
  sessionID: string
  game: InvadersGame
  canvas: TextRenderable
}

export default Plugin.define({
  id: 'oc-invaders.tui',
  setup(ctx) {
    let active: ActiveGame | undefined
    let keyboardEventUsers = 0

    const acquireKeyboardEvents = () => {
      if (keyboardEventUsers++ === 0) ctx.renderer.enableKittyKeyboard(buildKittyKeyboardFlags({ events: true }))
      return () => {
        keyboardEventUsers = Math.max(0, keyboardEventUsers - 1)
        if (keyboardEventUsers === 0) ctx.renderer.enableKittyKeyboard(buildKittyKeyboardFlags({}))
      }
    }

    const GamePanel = (props: { panel: PanelInput }) => {
      let canvas: TextRenderable | undefined
      let game: InvadersGame | undefined
      let timer: ReturnType<typeof setInterval> | undefined
      let disposed = false
      let releaseKeyboardEvents: (() => void) | undefined
      const heldUntil = new Map<string, number>()
      const holdFor = 180

      const held = (binding: string, now: number) => (heldUntil.get(binding) ?? 0) > now

      const sustain = (now: number) => {
        if (!game) return
        const left = held('left', now) || held('a', now)
        const right = held('right', now) || held('d', now)
        if (left !== right) void game.press(gameInput(left ? 'left' : 'right'))
        else {
          game.release(gameInput('left'))
          game.release(gameInput('right'))
        }
        if (held('space', now)) void game.press(gameInput('space'))
      }

      const render = () => {
        if (!game || !canvas) return
        const width = Math.max(game.minWidth, props.panel.width)
        const height = Math.max(game.minHeight, ctx.renderer.height - 3)
        if (game.size.width !== width || game.size.height !== height) game.resize(width, height)
        const now = performance.now()
        sustain(now)
        game.step(now)
        game.draw(canvas, now)
      }

      const handled = (key: KeyEvent) => isGameBinding(key.name) && !key.ctrl && !key.meta && !key.option
      const press = (key: KeyEvent) => {
        if (!game || !handled(key)) return
        key.preventDefault()
        key.stopPropagation()
        const input = gameInput(key.name)
        if (key.name === 'left' || key.name === 'right' || key.name === 'a' || key.name === 'd' || key.name === 'space') {
          // OpenCode's shared renderer does not request Kitty release events.
          // Refresh a short lease on terminal key repeats and let the frame
          // loop provide smooth movement and cooldown-aware autofire.
          heldUntil.set(key.name, key.source === 'kitty' ? Infinity : performance.now() + holdFor)
          void game.press(input).then(render)
          return
        }
        void game.tap(input).then(render)
      }
      const release = (key: KeyEvent) => {
        if (!game || !handled(key)) return
        key.preventDefault()
        key.stopPropagation()
        heldUntil.delete(key.name)
        game.release(gameInput(key.name))
        render()
      }

      ctx.keymap.layer(() => ({
        priority: 100,
        commands: [
          { bind: 'ctrl+f', title: 'Toggle fullscreen', run: props.panel.toggleFullscreen },
          { bind: 'escape', title: 'Return to OpenCode', run: props.panel.close },
        ],
      }))

      onMount(() => {
        props.panel.focus()
        releaseKeyboardEvents = acquireKeyboardEvents()
        ctx.renderer.keyInput.on('keypress', press)
        ctx.renderer.keyInput.on('keyrelease', release)
        void InvadersGame.load(props.panel.width, ctx.renderer.height - 3).then(value => {
          if (disposed || !canvas) return
          game = value
          active = { sessionID: props.panel.sessionID, game, canvas }
          render()
          timer = setInterval(render, 33)
        })
      })

      onCleanup(() => {
        disposed = true
        ctx.renderer.keyInput.off('keypress', press)
        ctx.renderer.keyInput.off('keyrelease', release)
        releaseKeyboardEvents?.()
        if (timer) clearInterval(timer)
        if (active?.game === game) active = undefined
      })

      return <text ref={canvas} width="100%" height="100%" content="Loading TUI Invaders…" wrapMode="none" />
    }

    const panel = ctx.ui.slot({
      append: 'session.panel',
      render: input => (
        <Show when={input.name === 'oc-invaders.game'}>
          <GamePanel panel={input} />
        </Show>
      ),
    })

    const commands = ctx.ui.slot({
      append: 'app',
      render: () => {
        ctx.keymap.layer(() => ({
          mode: 'global',
          commands: [{
            id: 'oc-invaders.open',
            title: 'Play TUI Invaders',
            description: 'Play while the current agent works',
            group: 'oc-invaders',
            palette: true,
            slash: { name: 'invaders' },
            enabled: () => ctx.ui.router.current().type === 'session',
            run: () => {
              if (!ctx.ui.panel.open('oc-invaders.game', { presentation: 'fullscreen' })) {
                ctx.ui.toast.show({ title: 'oc-invaders', message: 'Open a session before starting the game.', variant: 'warning' })
              }
            },
          }],
        }))
        return null
      },
    })

    const idle = ctx.data.on('session.idle', event => {
      if (!active || event.data.sessionID !== active.sessionID) return
      if (ctx.options.pauseOnCompletion !== false) active.game.pause()
      active.game.draw(active.canvas)
      ctx.ui.toast.show({
        title: 'Agent finished',
        message: 'Your OpenCode task is ready. Press Esc to return.',
        variant: 'success',
        duration: 8000,
      })
    })

    return () => {
      idle()
      commands()
      panel()
    }
  },
})
