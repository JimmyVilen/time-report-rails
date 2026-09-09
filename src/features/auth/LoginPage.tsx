import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { login } from '../../api/auth'
import { Input } from '../../components/Input'
import { Button } from '../../components/Button'
import { today } from '../../lib/dateUtils'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const qc = useQueryClient()
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: () => login(email, password),
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
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--champagne)]">Välkommen tillbaka</p>
        <h1 className="auth-title">Logga in</h1>
        <p className="mb-7 text-sm text-[var(--foreground-muted)]">Fortsätt till din tidsöversikt.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="E-post"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
          />
          <Input
            label="Lösenord"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
          <Button type="submit" variant="primary" size="lg" loading={mutation.isPending} className="mt-2 w-full">
            Logga in
          </Button>
        </form>
        <p className="mt-6 text-sm text-[var(--foreground-muted)] text-center">
          Inget konto?{' '}
          <Link to="/register" className="text-[var(--accent)] hover:underline">Registrera dig</Link>
        </p>
      </div>
    </div>
  )
}
