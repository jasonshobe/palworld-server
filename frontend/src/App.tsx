import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "sonner"
import { AuthProvider } from "@/context/AuthContext"
import { useAuth } from "@/hooks/useAuth"
import Layout from "@/components/Layout"
import LoginPage from "@/pages/LoginPage"
import ServerPage from "@/pages/ServerPage"
import ConfigPage from "@/pages/ConfigPage"
import SavesPage from "@/pages/SavesPage"
import ModsPage from "@/pages/ModsPage"

const queryClient = new QueryClient()

function AuthGate({ children }: { children: React.ReactNode }) {
  const { required, authenticated } = useAuth()
  if (required && !authenticated) return <LoginPage />
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AuthGate>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Navigate to="/server" replace />} />
                <Route path="server" element={<ServerPage />} />
                <Route path="config" element={<ConfigPage />} />
                <Route path="saves" element={<SavesPage />} />
                <Route path="mods" element={<ModsPage />} />
              </Route>
            </Routes>
          </AuthGate>
        </BrowserRouter>
        <Toaster position="bottom-right" richColors closeButton theme="dark" />
      </AuthProvider>
    </QueryClientProvider>
  )
}
