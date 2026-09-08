import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getProfile, updateProfile } from '../../api/profile'

const inputClass = 'w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--foreground-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]'
const labelClass = 'mb-1 block text-xs text-[var(--foreground-muted)]'

export function ProfilePage() {
  const qc = useQueryClient()
  const { data: user } = useQuery({ queryKey: ['profile'], queryFn: getProfile })

  const [name, setName] = useState('')
  const [jiraUrl, setJiraUrl] = useState('')
  const [jiraEmail, setJiraEmail] = useState('')
  const [jiraToken, setJiraToken] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(user.name ?? '')
      setJiraUrl(user.jiraUrl ?? '')
      setJiraEmail(user.jiraEmail ?? '')
    }
  }, [user])

  const mutation = useMutation({
    mutationFn: () => updateProfile({
      name: name || undefined,
      jiraUrl: jiraUrl || undefined,
      jiraEmail: jiraEmail || undefined,
      jiraApiToken: jiraToken || undefined,
      jiraIntegrationSystem: 'JIRA_CLOUD',
      password: password || undefined,
      passwordConfirmation: passwordConfirm || undefined,
    }),
    onSuccess: (u) => {
      qc.setQueryData(['auth/me'], u)
      qc.setQueryData(['profile'], u)
      setSuccess('Profilen sparades.')
      setPassword(''); setPasswordConfirm(''); setJiraToken('')
      setTimeout(() => setSuccess(''), 3000)
    },
    onError: (e: Error) => setError(e.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); setError(''); setSuccess('')
    mutation.mutate()
  }

  return (
    <div className="flex-1 p-4 md:p-6 max-w-app mx-auto w-full">
      <h1 className="mb-8 text-xl font-semibold text-[var(--foreground)]">Profil</h1>
      <p className="page-intro">Hantera konto, säkerhet och integrationer.</p>

      <form onSubmit={handleSubmit} className="rounded-xl border border-[var(--border)] bg-[var(--background-card)] px-6 shadow-[var(--shadow-sm)]">
        <div className="divide-y divide-[var(--border)]">

          {/* Kontoinformation */}
          <div className="pb-8">
            <h2 className="mb-1 text-sm font-medium text-[var(--foreground)]">Kontoinformation</h2>
            <p className="mb-4 text-sm text-[var(--foreground-muted)]">Ditt namn och din inloggning</p>
            <div className="flex flex-col gap-3 max-w-sm">
              <div>
                <label className={labelClass}>E-post</label>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--background-elevated)] px-3 py-2 text-sm text-[var(--foreground-muted)]">
                  {user?.email}
                </div>
              </div>
              <div>
                <label htmlFor="profile-name" className={labelClass}>Namn</label>
                <input
                  id="profile-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ditt namn"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Byt lösenord */}
          <div className="py-8">
            <h2 className="mb-1 text-sm font-medium text-[var(--foreground)]">Byt lösenord</h2>
            <p className="mb-4 text-sm text-[var(--foreground-muted)]">Lämna tomt för att behålla befintligt lösenord</p>
            <div className="flex flex-col gap-3 max-w-sm">
              <div>
                <label htmlFor="profile-password" className={labelClass}>Nytt lösenord</label>
                <input
                  id="profile-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Nytt lösenord"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="profile-password-confirm" className={labelClass}>Bekräfta lösenord</label>
                <input
                  id="profile-password-confirm"
                  type="password"
                  value={passwordConfirm}
                  onChange={e => setPasswordConfirm(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Jira-integration */}
          <div className="py-8">
            <h2 className="mb-1 text-sm font-medium text-[var(--foreground)]">Jira-integration</h2>
            <p className="mb-4 text-sm text-[var(--foreground-muted)]">Anslut ditt Jira-konto för att logga tid direkt från appen</p>
            <div className="flex flex-col gap-3 max-w-sm">
              <div>
                <label htmlFor="profile-jira-url" className={labelClass}>Jira-URL</label>
                <input
                  id="profile-jira-url"
                  type="url"
                  value={jiraUrl}
                  onChange={e => setJiraUrl(e.target.value)}
                  placeholder="https://your-org.atlassian.net"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="profile-jira-email" className={labelClass}>Jira-e-post</label>
                <input
                  id="profile-jira-email"
                  type="email"
                  value={jiraEmail}
                  onChange={e => setJiraEmail(e.target.value)}
                  placeholder="din@epost.se"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="profile-jira-token" className={labelClass}>API-token</label>
                <input
                  id="profile-jira-token"
                  type="password"
                  value={jiraToken}
                  onChange={e => setJiraToken(e.target.value)}
                  placeholder={user?.jiraApiTokenSet ? '••••••••' : 'Din Jira API-token'}
                  autoComplete="off"
                  className={inputClass}
                />
                <p className="mt-1.5 text-xs text-[var(--foreground-muted)]">
                  Skapa en API-token på{' '}
                  <a
                    href="https://id.atlassian.com/manage/api-tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] hover:underline"
                  >
                    id.atlassian.com
                  </a>
                </p>
              </div>
            </div>
          </div>

        </div>

        {error && <p role="alert" className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
        {success && <p role="status" className="mt-4 text-sm text-[var(--success)]">{success}</p>}

        <div className="border-t border-[var(--border)] py-6">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-60 cursor-pointer"
          >
            {mutation.isPending ? 'Sparar…' : 'Spara ändringar'}
          </button>
        </div>
      </form>
    </div>
  )
}
