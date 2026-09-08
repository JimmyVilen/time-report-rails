import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { setup } from '../../api/auth'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { today } from '../../lib/dateUtils'

export function SetupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const qc = useQueryClient()
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: () => setup(email, password, confirm),
    onSuccess: (user) => {
      qc.setQueryData(['auth/me'], user)
      void navigate({ to: '/dashboard', search: { date: today() } })
    },
    onError: (e: Error) => setError(e.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    mutation.mutate()
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <Link className="brand-wordmark" to="/setup">Time<span>Report</span></Link>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--champagne)]">Första konfigurationen</p>
        <h1 className="auth-title">Välkommen</h1>
        <p className="text-sm text-[var(--foreground-muted)] mb-7">Skapa ett administratörskonto för att komma igång.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="E-post" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          <Input label="Lösenord (minst 8 tecken)" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          <Input label="Bekräfta lösenord" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
          <Button type="submit" variant="primary" size="lg" loading={mutation.isPending} className="mt-2 w-full">Skapa konto</Button>
        </form>
      </div>
    </div>
  )
}
