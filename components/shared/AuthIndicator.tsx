'use client'

import { useEffect, useState } from 'react'

interface AuthState {
  status: 'loading' | 'authenticated' | 'unauthenticated'
  user?: string
}

const AUTH_LOGIN_URL = 'https://auth.az-lab.dev/?rd=https://home.az-lab.dev'

export default function AuthIndicator() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    fetch('/api/auth')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setAuth({ status: 'authenticated', user: data.user })
        } else {
          setAuth({ status: 'unauthenticated' })
        }
      })
      .catch(() => {
        setAuth({ status: 'unauthenticated' })
      })
  }, [])

  if (auth.status === 'loading') {
    return <div className="w-20 h-8" />
  }

  if (auth.status === 'authenticated') {
    return (
      <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300">
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        {auth.user}
      </span>
    )
  }

  return (
    <a
      href={AUTH_LOGIN_URL}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm text-zinc-400 hover:text-white transition-all"
    >
      <span className="w-2 h-2 rounded-full bg-zinc-600" />
      Sign in
    </a>
  )
}
