import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { gameActions } from './game'

/** Every server action, exposed at POST /api/actions/<name>. */
export const actions: Record<string, ActionHandler<Env>> = {
  ...gameActions,
}
