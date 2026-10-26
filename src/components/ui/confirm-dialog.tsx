'use client'

import * as React from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/* ─── Promise-based confirm / prompt dialogs ─────────────────────────────────
   Replaces window.confirm / window.prompt with the app's own dialog:

     const confirm = useConfirm()
     if (!(await confirm({ title: 'Delete supplier?', description: 'This cannot be undone.', destructive: true }))) return

     const prompt = usePrompt()
     const url = await prompt({ title: 'Insert link', label: 'URL', defaultValue: 'https://' })
     if (url === null) return   // cancelled

   ConfirmProvider is mounted once in components/providers.tsx. */

export type ConfirmOptions = {
  title: React.ReactNode
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button for deletes and other irreversible actions. */
  destructive?: boolean
}

export type PromptOptions = Omit<ConfirmOptions, 'destructive'> & {
  label?: string
  placeholder?: string
  defaultValue?: string
  /** Disable the confirm button while the input is empty (default true). */
  required?: boolean
}

type Request =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void }

type Ctx = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  prompt: (opts: PromptOptions) => Promise<string | null>
}

const ConfirmContext = React.createContext<Ctx | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = React.useState<Request | null>(null)
  const [value, setValue] = React.useState('')

  const confirm = React.useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>(resolve => setRequest({ kind: 'confirm', opts, resolve })),
    [],
  )
  const prompt = React.useCallback(
    (opts: PromptOptions) =>
      new Promise<string | null>(resolve => {
        setValue(opts.defaultValue ?? '')
        setRequest({ kind: 'prompt', opts, resolve })
      }),
    [],
  )

  const close = (result: boolean) => {
    if (!request) return
    if (request.kind === 'confirm') request.resolve(result)
    else request.resolve(result ? value : null)
    setRequest(null)
  }

  const ctx = React.useMemo(() => ({ confirm, prompt }), [confirm, prompt])
  const opts = request?.opts
  const isPrompt = request?.kind === 'prompt'
  const promptOpts = isPrompt ? (request.opts as PromptOptions) : null
  const destructive = request?.kind === 'confirm' && request.opts.destructive
  const confirmDisabled = isPrompt && (promptOpts?.required ?? true) && !value.trim()

  return (
    <ConfirmContext.Provider value={ctx}>
      {children}
      <AlertDialog open={!!request} onOpenChange={open => { if (!open) close(false) }}>
        <AlertDialogContent>
          <form
            className="contents"
            onSubmit={e => { e.preventDefault(); if (!confirmDisabled) close(true) }}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
              {opts?.description && <AlertDialogDescription>{opts.description}</AlertDialogDescription>}
            </AlertDialogHeader>
            {isPrompt && (
              <div className="grid gap-2">
                {promptOpts?.label && <Label htmlFor="confirm-dialog-input">{promptOpts.label}</Label>}
                <Input
                  id="confirm-dialog-input"
                  autoFocus
                  value={value}
                  placeholder={promptOpts?.placeholder}
                  onChange={e => setValue(e.target.value)}
                />
              </div>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel type="button">{opts?.cancelLabel ?? 'Cancel'}</AlertDialogCancel>
              <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={confirmDisabled}>
                {opts?.confirmLabel ?? (destructive ? 'Delete' : isPrompt ? 'Save' : 'Confirm')}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}

function useConfirmContext() {
  const ctx = React.useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm/usePrompt must be used inside <ConfirmProvider>')
  return ctx
}

/** `await confirm({ title, description?, destructive? })` → true when the user confirms. */
export const useConfirm = () => useConfirmContext().confirm

/** `await prompt({ title, label?, defaultValue? })` → the entered text, or null when cancelled. */
export const usePrompt = () => useConfirmContext().prompt
