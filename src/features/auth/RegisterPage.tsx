import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { register } from '../../api/auth'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { today } from '../../lib/dateUtils'

export function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const qc = useQueryClient()
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: () => register(email, password, confirm),
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
        <Link className="brand-wordmark" to="/login">Time<span>Report</span></Link>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--champagne)]">Ett elegantare arbetsflöde</p>
        <h1 className="auth-title">Skapa konto</h1>
        <p className="mb-7 text-sm text-[var(--foreground-muted)]">Samla planering, uppgifter och tid på ett ställe.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="E-post" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          <Input label="Lösenord" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          <Input label="Bekräfta lösenord" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
          <Button type="submit" variant="primary" size="lg" loading={mutation.isPending} className="mt-2 w-full">Registrera</Button>
        </form>
        <p className="mt-6 text-sm text-[var(--foreground-muted)] text-center">
          Har du ett konto?{' '}
          <Link to="/login" className="text-[var(--accent)] hover:underline">Logga in</Link>
        </p>
      </div>
    </div>
  )
}
