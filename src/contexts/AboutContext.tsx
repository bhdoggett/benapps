import { createContext, useContext, useState } from 'react'

type AboutContextValue = {
  content: React.ReactNode | null
  setContent: (content: React.ReactNode | null) => void
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}

const AboutContext = createContext<AboutContextValue>({
  content: null,
  setContent: () => {},
  isOpen: false,
  setIsOpen: () => {},
})

export function AboutProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = useState<React.ReactNode | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  return (
    <AboutContext.Provider value={{ content, setContent, isOpen, setIsOpen }}>
      {children}
    </AboutContext.Provider>
  )
}

export const useAbout = () => useContext(AboutContext)
