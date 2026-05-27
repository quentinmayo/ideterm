import { useState } from 'react'
import { Modal } from './Modal'

interface PromptProps {
  title: string
  label: string
  initial?: string
  submitLabel?: string
  onSubmit: (value: string) => void
  onClose: () => void
}

export function Prompt({ title, label, initial = '', submitLabel = 'OK', onSubmit, onClose }: PromptProps): JSX.Element {
  const [value, setValue] = useState(initial)
  const submit = (): void => {
    if (value.trim()) onSubmit(value.trim())
    onClose()
  }
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit}>
            {submitLabel}
          </button>
        </>
      }
    >
      <div className="field">
        <label>{label}</label>
        <input
          type="text"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
      </div>
    </Modal>
  )
}
