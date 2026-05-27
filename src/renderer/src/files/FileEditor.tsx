import { useEffect, useRef } from 'react'
import { basicSetup } from 'codemirror'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'

function languageFor(name: string): Extension[] {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext))
    return [javascript({ jsx: ext.endsWith('x'), typescript: ext.startsWith('ts') })]
  if (ext === 'json') return [json()]
  if (['html', 'htm'].includes(ext)) return [html()]
  if (['css', 'scss', 'less'].includes(ext)) return [css()]
  if (['md', 'markdown'].includes(ext)) return [markdown()]
  if (ext === 'py') return [python()]
  return []
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
        ...languageFor(path),
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
