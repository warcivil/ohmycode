import { Wordmark } from "../typography/wordmark/wordmark"
import { type ComponentProps } from "solid-js"
import ohmycode from "../assets/brand/ohmycode.svg"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <image href={ohmycode} width="100" height="100" />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <image href={ohmycode} width="100" height="100" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => <Wordmark class={props.class} fade={false} muted={false} />
