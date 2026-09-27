/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useLocation,
} from "react-router";
import {
  completionForOccurrence,
  isAlarmOccurrence,
  type Alarm,
  type AlarmInput,
} from "./libs/alarm";
import { getAlarmStorage } from "./libs/storage";
import { notificationScheduler } from "./libs/notifications";
import { AppShell } from "./components/layout/AppShell";
import { HomePage } from "./pages/HomePage";
import { WeekPage } from "./pages/WeekPage";
import { AlarmFormPage } from "./pages/AlarmFormPage";
import { AlarmDetailPage } from "./pages/AlarmDetailPage";
import { CompletedPage } from "./pages/CompletedPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AiPage } from "./pages/AiPage";

type Theme = "system" | "light" | "dark";
type AlarmContextValue = {
  alarms: Alarm[];
  loading: boolean;
  initialLoading: boolean;
  error: string | null;
  saveAlarm: (input: AlarmInput, id?: string) => Promise<Alarm>;
  saveAlarmBatch: (inputs: AlarmInput[], id?: string) => Promise<Alarm[]>;
  removeAlarm: (id: string) => Promise<void>;
  updateAlarm: (id: string, input: Partial<AlarmInput>) => Promise<void>;
  toggleComplete: (id: string, occurrence?: string) => Promise<void>;
  refresh: () => Promise<void>;
};
type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void };
const AlarmContext = createContext<AlarmContextValue | null>(null);
const ThemeContext = createContext<ThemeContextValue | null>(null);
const storage = getAlarmStorage();

async function applyNativeConfirmations() {
  const confirmations = await notificationScheduler.getConfirmations();
  for (const confirmation of confirmations) {
    const alarm = await storage.findById(confirmation.alarmId);
    if (
      !alarm ||
      alarm.scheduleRevision !== confirmation.scheduleRevision ||
      !isAlarmOccurrence(alarm, confirmation.occurrenceDate)
    )
      continue;
    const completion = completionForOccurrence(
      alarm,
      confirmation.occurrenceDate,
    );
    if (completion) await storage.update(alarm.id, completion);
  }
  await notificationScheduler.acknowledgeConfirmations(confirmations);
}

export function useAlarms() {
  const value = useContext(AlarmContext);
  if (!value) throw new Error("useAlarms must be used inside AppProviders");
  return value;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside AppProviders");
  return value;
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Não foi possível atualizar seus lembretes.";
}

function AppProviders({ children }: PropsWithChildren) {
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasRequestedNotificationPermission = useRef(false);
  const [theme, setThemeState] = useState<Theme>(
    () =>
      (window.localStorage.getItem("agendai:theme") as Theme | null) ??
      "system",
  );

  const refresh = useCallback(async (reconcileNotifications = false) => {
    setLoading(true);
    try {
      await applyNativeConfirmations();
      const items = await storage.list();
      setAlarms(items);
      setError(null);
      if (reconcileNotifications) {
        try {
          await notificationScheduler.reconcile(items);
        } catch (notificationError) {
          setError(
            `Seus lembretes foram carregados, mas as notificações não puderam ser atualizadas: ${errorMessage(notificationError)}`,
          );
        }
      }
    } catch (storageError) {
      setError(
        `Não foi possível carregar seus lembretes: ${errorMessage(storageError)}`,
      );
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    // The initial storage read must happen after the provider mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(true);
  }, [refresh]);

  useEffect(() => {
    if (hasRequestedNotificationPermission.current) return;
    hasRequestedNotificationPermission.current = true;

    const requestNotificationPermissionOnStartup = async () => {
      try {
        let permission = await notificationScheduler.checkPermission();
        if (permission === "default") {
          permission = await notificationScheduler.requestPermission();
        }

        await notificationScheduler.requestExactAlarmPermission();
        await notificationScheduler.requestFullScreenIntentPermission();
        if (permission !== "granted") return;

        // The first reconciliation can run before the native prompt is answered.
        // Run it again after permission is granted so existing alarms are scheduled.
        await notificationScheduler.reconcile(await storage.list());
      } catch {
        // A permission prompt must never prevent the agenda from loading.
      }
    };

    void requestNotificationPermissionOnStartup();
  }, []);

  useEffect(() => {
    const reconcileOnResume = () => {
      if (document.visibilityState !== "visible") return;
      void refresh(true);
    };
    document.addEventListener("visibilitychange", reconcileOnResume);
    return () =>
      document.removeEventListener("visibilitychange", reconcileOnResume);
  }, [refresh]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.dataset.theme = theme;
    };
    applyTheme();
    if (theme === "system") media.addEventListener("change", applyTheme);
    window.localStorage.setItem("agendai:theme", theme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  const alarmValue = useMemo<AlarmContextValue>(() => {
    const updateAlarm = async (id: string, input: Partial<AlarmInput>) => {
      const result = await storage.update(id, input);
      try {
        if (result) {
          await notificationScheduler.cancel(id);
          await notificationScheduler.schedule(result);
        }
      } catch (notificationError) {
        const message = `O lembrete foi atualizado, mas as notificações não puderam ser atualizadas: ${errorMessage(notificationError)}`;
        setError(message);
        throw new Error(message, { cause: notificationError });
      } finally {
        await refresh();
      }
    };

    const saveAlarmBatch = async (inputs: AlarmInput[], id?: string) => {
      if (!inputs.length) return [];
      const results = await storage.saveBatch(
        inputs.map((input, index) => ({
          input,
          ...(index === 0 && id ? { id } : {}),
        })),
      );
      try {
        for (const result of results) {
          await notificationScheduler.cancel(result.id);
          await notificationScheduler.schedule(result);
        }
      } catch (notificationError) {
        const message = `Os lembretes foram salvos, mas as notificações não puderam ser atualizadas: ${errorMessage(notificationError)}`;
        setError(message);
        throw new Error(message, { cause: notificationError });
      } finally {
        await refresh();
      }
      return results;
    };

    return {
      alarms,
      loading,
      initialLoading,
      error,
      refresh,
      saveAlarmBatch,
      async saveAlarm(input, id) {
        const [result] = await saveAlarmBatch([input], id);
        if (!result) throw new Error("Lembrete não encontrado.");
        return result;
      },
      async removeAlarm(id) {
        try {
          await notificationScheduler.cancel(id);
          await storage.delete(id);
        } finally {
          await refresh();
        }
      },
      updateAlarm,
      async toggleComplete(id, occurrence) {
        const alarm = alarms.find((item) => item.id === id);
        if (!alarm) return;
        if (alarm.recurrence.type !== "none") {
          if (!occurrence) {
            throw new Error("Escolha a ocorrência que deseja concluir.");
          }
          const next =
            alarm.exceptions[occurrence] === "completed"
              ? undefined
              : "completed";
          const exceptions = { ...alarm.exceptions };
          if (next) exceptions[occurrence] = next;
          else delete exceptions[occurrence];
          await updateAlarm(id, {
            exceptions,
          });
          return;
        }
        await updateAlarm(id, {
          status: alarm.status === "completed" ? "pending" : "completed",
        });
      },
    };
  }, [alarms, error, initialLoading, loading, refresh]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>
      <AlarmContext.Provider value={alarmValue}>
        {children}
      </AlarmContext.Provider>
    </ThemeContext.Provider>
  );
}

function NotFoundPage() {
  return (
    <div className="flex min-h-[40svh] flex-col items-center justify-center gap-3 text-center">
      <h1 className="m-0 text-2xl">Página não encontrada</h1>
      <p className="m-0 text-sm text-muted">
        Esta rota não existe ou não está mais disponível.
      </p>
      <Link
        className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground no-underline"
        to="/agenda"
      >
        Voltar para agenda
      </Link>
    </div>
  );
}

function PageLoading() {
  return (
    <div
      className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-[28px] font-bold tracking-[-0.05em]">
        <span className="grid size-[39px] place-items-center rounded-[14px] bg-primary text-primary-foreground">
          ✦
        </span>
        <span>
          Agend<span className="text-accent">AI</span>
        </span>
      </div>
      <p className="m-0 text-xs text-muted">Carregando sua agenda…</p>
      <div className="mt-[22px] h-[3px] w-[26px] overflow-hidden rounded bg-border">
        <div className="h-full w-2/5 animate-pulse rounded bg-accent" />
      </div>
    </div>
  );
}

type PersistentPage = "agenda" | "week" | "ai" | "completed" | "settings";

function persistentPageFor(pathname: string): PersistentPage | null {
  if (pathname === "/" || pathname === "/agenda") return "agenda";
  if (pathname === "/agenda/week") return "week";
  if (pathname === "/ai") return "ai";
  if (pathname === "/completed") return "completed";
  if (pathname === "/settings") return "settings";
  return null;
}

function PersistentPrimaryPages() {
  const { pathname } = useLocation();
  const activePage = persistentPageFor(pathname);

  return (
    <>
      <div hidden={activePage !== "agenda"}>
        <HomePage />
      </div>
      <div hidden={activePage !== "week"}>
        <WeekPage />
      </div>
      <div hidden={activePage !== "ai"}>
        <AiPage />
      </div>
      <div hidden={activePage !== "completed"}>
        <CompletedPage />
      </div>
      <div hidden={activePage !== "settings"}>
        <SettingsPage />
      </div>
      {!activePage && <Outlet />}
    </>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    errorElement: <NotFoundPage />,
    children: [
      {
        element: <PersistentPrimaryPages />,
        children: [
          { index: true, element: null },
          { path: "agenda", element: null },
          { path: "agenda/week", element: null },
          { path: "completed", element: null },
          { path: "ai", element: null },
          { path: "settings", element: null },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
  { path: "/alarms/new", element: <AlarmFormPage /> },
  { path: "/alarms/:id", element: <AlarmDetailPage /> },
  { path: "/alarms/:id/edit", element: <AlarmFormPage /> },
]);

export default function App() {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}

function AppContent() {
  const { initialLoading } = useAlarms();
  useEffect(() => {
    let disposed = false;
    let subscription: { remove: () => Promise<void> } | undefined;
    void notificationScheduler
      .onOpen(({ alarmId, occurrenceDate, scheduleRevision }) => {
        if (
          disposed ||
          !alarmId ||
          !/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate) ||
          !Number.isInteger(scheduleRevision) ||
          scheduleRevision <= 0
        )
          return;
        void (async () => {
          const alarm = await storage.findById(alarmId);
          if (
            !alarm ||
            alarm.scheduleRevision !== scheduleRevision ||
            !isAlarmOccurrence(alarm, occurrenceDate)
          )
            return;
          await router.navigate(
            `/alarms/${encodeURIComponent(alarmId)}?occurrence=${encodeURIComponent(occurrenceDate)}`,
          );
        })();
      })
      .then((handle) => {
        if (disposed) {
          void handle?.remove();
          return;
        }
        subscription = handle;
      });
    return () => {
      disposed = true;
      void subscription?.remove();
    };
  }, []);
  return initialLoading ? <PageLoading /> : <RouterProvider router={router} />;
}
