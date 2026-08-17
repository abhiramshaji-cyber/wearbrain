import { createReminder } from './createReminder'
import { getReflection } from './getReflection'
import { listRecent } from './listRecent'
import { Registry } from './registry'
import { searchEntries } from './searchEntries'

export function defaultRegistry(): Registry {
  return new Registry([searchEntries, listRecent, createReminder, getReflection])
}
