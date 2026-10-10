export const SERVICE_WORKER_URL = "/sw.js"

interface Registrar {
  readonly register: (url: string, options: RegistrationOptions) => Promise<Pick<ServiceWorkerRegistration, "scope">>
}

export const registerServiceWorker = (registrar: Registrar) =>
  registrar.register(SERVICE_WORKER_URL, { scope: "/" }).then(
    () => "registered" as const,
    () => "unavailable" as const,
  )
