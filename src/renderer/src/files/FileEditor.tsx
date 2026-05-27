import { useEffect, useRef } from 'react'
import { basicSetup } from 'codemirror'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { StreamLanguage, type StreamParser } from '@codemirror/language'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { sass } from '@codemirror/lang-sass'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { cpp } from '@codemirror/lang-cpp'
import { go } from '@codemirror/lang-go'
import { java } from '@codemirror/lang-java'
import { php } from '@codemirror/lang-php'
import { rust } from '@codemirror/lang-rust'
import { sql } from '@codemirror/lang-sql'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'
import { vue } from '@codemirror/lang-vue'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { ruby } from '@codemirror/legacy-modes/mode/ruby'
import { csharp, kotlin, scala, dart } from '@codemirror/legacy-modes/mode/clike'
import { swift } from '@codemirror/legacy-modes/mode/swift'
import { lua } from '@codemirror/legacy-modes/mode/lua'
import { powerShell } from '@codemirror/legacy-modes/mode/powershell'
import { perl } from '@codemirror/legacy-modes/mode/perl'
import { r } from '@codemirror/legacy-modes/mode/r'
import { clojure } from '@codemirror/legacy-modes/mode/clojure'
import { haskell } from '@codemirror/legacy-modes/mode/haskell'

function stream<T>(mode: StreamParser<T>): Extension {
  return StreamLanguage.define(mode)
}

/** Pick a CodeMirror language for a filename, by special name then extension. */
function languageFor(name: string): Extension[] {
  const lower = name.toLowerCase()
  if (lower === 'dockerfile' || lower.endsWith('.dockerfile')) return [stream(dockerFile)]
  const ext = lower.includes('.') ? lower.split('.').pop()! : ''
  switch (ext) {
    case 'ts':
    case 'mts':
    case 'cts':
    case 'tsx':
      return [javascript({ typescript: true, jsx: ext === 'tsx' })]
    case 'js':
    case 'mjs':
    case 'cjs':
    case 'jsx':
      return [javascript({ jsx: ext === 'jsx' })]
    case 'json':
    case 'jsonc':
      return [json()]
    case 'html':
    case 'htm':
      return [html()]
    case 'vue':
      return [vue()]
    case 'css':
      return [css()]
    case 'scss':
    case 'less':
      return [sass()]
    case 'sass':
      return [sass({ indented: true })]
    case 'md':
    case 'markdown':
      return [markdown()]
    case 'py':
    case 'pyw':
      return [python()]
    case 'rs':
      return [rust()]
    case 'go':
      return [go()]
    case 'java':
      return [java()]
    case 'c':
    case 'h':
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
    case 'hh':
      return [cpp()]
    case 'php':
      return [php()]
    case 'sql':
      return [sql()]
    case 'xml':
    case 'svg':
    case 'xsd':
    case 'xsl':
      return [xml()]
    case 'yaml':
    case 'yml':
      return [yaml()]
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'ksh':
      return [stream(shell)]
    case 'ps1':
    case 'psm1':
      return [stream(powerShell)]
    case 'toml':
      return [stream(toml)]
    case 'ini':
    case 'cfg':
    case 'conf':
    case 'env':
    case 'properties':
      return [stream(properties)]
    case 'rb':
      return [stream(ruby)]
    case 'cs':
      return [stream(csharp)]
    case 'kt':
    case 'kts':
      return [stream(kotlin)]
    case 'scala':
      return [stream(scala)]
    case 'dart':
      return [stream(dart)]
    case 'swift':
      return [stream(swift)]
    case 'lua':
      return [stream(lua)]
    case 'pl':
    case 'pm':
      return [stream(perl)]
    case 'r':
      return [stream(r)]
    case 'clj':
    case 'cljs':
    case 'edn':
      return [stream(clojure)]
    case 'hs':
      return [stream(haskell)]
    default:
      return []
  }
}

interface FileEditorProps {
  path: string
  initialValue: string
  onChange: (value: string) => void
  onSave: () => void
}

/** Remounted per file (keyed on path); manages a single CodeMirror view. */
export function FileEditor({ path, initialValue, onChange, onSave }: FileEditorProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  onChangeRef.current = onChange
  onSaveRef.current = onSave

  useEffect(() => {
    if (!hostRef.current) return
    const state = EditorState.create({
      doc: initialValue,
      extensions: [
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => {
              onSaveRef.current()
              return true
            }
          }
        ]),
        basicSetup,
        oneDark,
        ...languageFor(path.split(/[\\/]/).pop() ?? path),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString())
        })
      ]
    })
    const view = new EditorView({ state, parent: hostRef.current })
    return () => view.destroy()
    // Recreate only when switching files.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  return <div className="cm-host" ref={hostRef} />
}
