import katex from "katex"
import type { MarkedExtension, Tokens } from "marked"
import markedKatex from "marked-katex-extension"
import markedShiki from "marked-shiki"
import { createMarkdownBase } from "./marked-base"

export function createMarkdownParser(highlight: (code: string, language: string) => string | Promise<string>) {
  return createMarkdownBase().use(...markdownMath, markedShiki({ highlight }))
}

const inlineParenMathRegex = /^\\\(((?:\\.|[^\\\n])*?)\\\)/

const unescapedDollarRegex = /(?:^|[^\\])\$/

// marked-katex-extension handles `$...$`, `$$...$$`, and `$$` fenced blocks; it has no `\(...\)` syntax.
export const markdownMath: MarkedExtension[] = [
  {
    extensions: markedKatex({ throwOnError: false }).extensions?.map((extension) => {
      if (!("level" in extension) || extension.level !== "inline") return extension

      return {
        ...extension,
        tokenizer(src, tokens) {
          const token = extension.tokenizer.call(this, src, tokens)

          // The package lets inline math contain `$`, so "Pay $5 now, or $x$ later" would become one formula
          // starting at the price. Rejecting it leaves the price as text and lets `$x$` match on its own.
          if (token && unescapedDollarRegex.test(token.text)) return

          return token
        },
      }
    }),
  },
  {
    extensions: [
      {
        name: "inlineParenKatex",
        level: "inline",
        start(src) {
          const index = src.indexOf("\\(")

          if (index === -1) return

          return index
        },
        tokenizer(src) {
          const match = src.match(inlineParenMathRegex)

          if (!match) return

          return {
            type: "inlineParenKatex",
            raw: match[0],
            text: match[1].trim(),
          }
        },
        renderer(token: Tokens.Generic) {
          return katex.renderToString(token.text, { throwOnError: false })
        },
      },
    ],
  },
]
