import { ICON_PATHS } from '@zenui/design-schema'

import type { IconName } from '@zenui/design-schema'

/**
 * Renders an allowlisted icon from server-owned path constants. Path data never
 * comes from user input or the AI provider, so no sanitisation surface exists.
 */
export function DesignIcon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name].map(d => <path key={d} d={d} />)}
    </svg>
  )
}
