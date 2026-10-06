import { createUniqueId, type ComponentProps } from "solid-js"

export function Wordmark(
  props: Pick<ComponentProps<"svg">, "class"> & { fade?: boolean; muted?: boolean; outline?: boolean },
) {
  const mask = createUniqueId()
  const maskGradient = createUniqueId()

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 720 129"
      fill="none"
      classList={{
        [props.class ?? ""]: !!props.class,
        "overflow-visible [&_path]:[vector-effect:non-scaling-stroke]": props.outline,
      }}
    >
      <g opacity={props.muted === false ? 1 : 0.6} class="[[data-color-scheme=dark]_&]:opacity-100">
        <g mask={props.fade === false ? undefined : `url(#${mask})`}>
          <g
            opacity={props.muted === false ? 1 : 0.16 * 0.7}
            fill={props.outline ? "none" : "currentColor"}
            stroke={props.outline ? "currentColor" : undefined}
            stroke-width={props.outline ? 1 : undefined}
          >
            <path
              pathLength={props.outline ? 1 : undefined}
              d="M15 30h15v15h-15ZM30 30h15v15h-15ZM45 30h15v15h-15ZM0 45h15v15h-15ZM60 45h15v15h-15ZM0 60h15v15h-15ZM60 60h15v15h-15ZM0 75h15v15h-15ZM60 75h15v15h-15ZM15 90h15v15h-15ZM30 90h15v15h-15ZM45 90h15v15h-15ZM90 0h15v15h-15ZM90 15h15v15h-15ZM90 30h15v15h-15ZM120 30h15v15h-15ZM135 30h15v15h-15ZM90 45h15v15h-15ZM105 45h15v15h-15ZM150 45h15v15h-15ZM90 60h15v15h-15ZM150 60h15v15h-15ZM90 75h15v15h-15ZM150 75h15v15h-15ZM90 90h15v15h-15ZM150 90h15v15h-15ZM180 30h15v15h-15ZM195 30h15v15h-15ZM225 30h15v15h-15ZM240 30h15v15h-15ZM180 45h15v15h-15ZM210 45h15v15h-15ZM240 45h15v15h-15ZM180 60h15v15h-15ZM210 60h15v15h-15ZM240 60h15v15h-15ZM180 75h15v15h-15ZM210 75h15v15h-15ZM240 75h15v15h-15ZM180 90h15v15h-15ZM210 90h15v15h-15ZM240 90h15v15h-15ZM270 30h15v15h-15ZM330 30h15v15h-15ZM270 45h15v15h-15ZM330 45h15v15h-15ZM285 60h15v15h-15ZM300 60h15v15h-15ZM315 60h15v15h-15ZM330 60h15v15h-15ZM330 75h15v15h-15ZM285 90h15v15h-15ZM300 90h15v15h-15ZM315 90h15v15h-15ZM375 30h15v15h-15ZM390 30h15v15h-15ZM405 30h15v15h-15ZM420 30h15v15h-15ZM360 45h15v15h-15ZM360 60h15v15h-15ZM360 75h15v15h-15ZM375 90h15v15h-15ZM390 90h15v15h-15ZM405 90h15v15h-15ZM420 90h15v15h-15ZM465 30h15v15h-15ZM480 30h15v15h-15ZM495 30h15v15h-15ZM450 45h15v15h-15ZM510 45h15v15h-15ZM450 60h15v15h-15ZM510 60h15v15h-15ZM450 75h15v15h-15ZM510 75h15v15h-15ZM465 90h15v15h-15ZM480 90h15v15h-15ZM495 90h15v15h-15ZM600 0h15v15h-15ZM600 15h15v15h-15ZM555 30h15v15h-15ZM570 30h15v15h-15ZM600 30h15v15h-15ZM540 45h15v15h-15ZM585 45h15v15h-15ZM600 45h15v15h-15ZM540 60h15v15h-15ZM600 60h15v15h-15ZM540 75h15v15h-15ZM600 75h15v15h-15ZM555 90h15v15h-15ZM570 90h15v15h-15ZM585 90h15v15h-15ZM600 90h15v15h-15ZM645 30h15v15h-15ZM660 30h15v15h-15ZM675 30h15v15h-15ZM630 45h15v15h-15ZM690 45h15v15h-15ZM630 60h15v15h-15ZM645 60h15v15h-15ZM660 60h15v15h-15ZM675 60h15v15h-15ZM690 60h15v15h-15ZM630 75h15v15h-15ZM645 90h15v15h-15ZM660 90h15v15h-15ZM675 90h15v15h-15ZM690 90h15v15h-15Z"
            />
          </g>
        </g>
      </g>
      <defs>
        <mask id={mask} style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="720" height="129">
          <rect width="720" height="129" fill={`url(#${maskGradient})`} />
        </mask>
        <linearGradient id={maskGradient} x1="360" y1="68" x2="360" y2="129" gradientUnits="userSpaceOnUse">
          <stop stop-color="white" stop-opacity="0.7" />
          <stop offset="1" stop-color="white" stop-opacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}
