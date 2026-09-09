import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { useTheme } from "../App";
import {
  notificationScheduler,
  type NotificationPermission,
} from "../libs/notifications";
import { cn } from "../libs/cn";

export function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [permissionError, setPermissionError] = useState("");

  const refreshPermission = async () => {
    try {
      setPermission(await notificationScheduler.checkPermission());
      setPermissionError("");
    } catch {
      setPermissionError(
        "Não foi possível consultar a permissão de notificações.",
      );
    }
  };

  useEffect(() => {
    // Read the platform permission after the settings screen mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshPermission();
  }, []);

  const request = async () => {
    try {
      setPermission(await notificationScheduler.requestPermission());
      setPermissionError("");
    } catch {
      setPermissionError(
        "Não foi possível solicitar a permissão de notificações.",
      );
    }
  };

  const sectionTitle =
    "mx-[5px] mb-2 text-[10px] tracking-[0.12em] text-muted uppercase";
  const row =
    "flex w-full items-center gap-3 rounded-[17px] border border-border bg-surface p-[14px] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

  return (
    <div>
      <div className="mt-2 mb-[25px] flex items-end justify-between gap-[18px]">
        <div>
          <span className="block text-[11px] font-bold tracking-[0.13em] text-muted uppercase">
            Personalização
          </span>
          <h1 className="m-0 mt-1.5 text-[clamp(26px,7vw,35px)] leading-[1.07] font-bold tracking-[-0.05em]">
            Configurações
          </h1>
        </div>
      </div>
      <section className="my-[25px]">
        <h2 className={sectionTitle}>Aparência</h2>
        <div
          className="grid grid-cols-3 gap-1 rounded-[17px] border border-border bg-surface p-[5px]"
          role="radiogroup"
          aria-label="Tema"
        >
          {(["system", "light", "dark"] as const).map((item) => (
            <button
              key={item}
              className={cn(
                "grid place-items-center gap-1.5 rounded-xl border-0 bg-transparent px-1 py-2.5 text-[11px] text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                theme === item && "bg-muted-surface text-foreground",
              )}
              onClick={() => setTheme(item)}
              role="radio"
              aria-checked={theme === item}
            >
              <span
                className={cn(
                  "block h-[25px] w-[38px] rounded-[7px] border border-border",
                  item === "light" && "bg-[var(--background)]",
                  item === "dark" && "bg-[var(--foreground)]",
                  item === "system" &&
                    "bg-[linear-gradient(135deg,var(--background)_50%,var(--foreground)_50%)]",
                )}
              />
              <span>
                {item === "system"
                  ? "Sistema"
                  : item === "light"
                    ? "Claro"
                    : "Escuro"}
              </span>
              {theme === item && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      </section>
      <section className="my-[25px]">
        <h2 className={sectionTitle}>Notificações</h2>
        <button className={row} onClick={() => void request()}>
          <span className="grid size-8 place-items-center rounded-[11px] bg-muted-surface text-primary">
            <Icon name="bell" />
          </span>
          <span className="grid flex-1 gap-1">
            <strong className="text-[13px]">Notificações locais</strong>
            <small className="text-[11px] text-muted">
              {permission === "granted"
                ? "Permissão concedida"
                : permission === "denied"
                  ? "Bloqueadas: habilite nas configurações do sistema"
                  : "Toque para permitir lembretes"}
            </small>
          </span>
          <span className="text-muted">
            <Icon name="chevron-right" size={18} />
          </span>
        </button>
        {permissionError && (
          <p className="mt-2 text-xs text-danger" role="alert">
            {permissionError}
          </p>
        )}
      </section>
      <section className="my-[25px]">
        <h2 className={sectionTitle}>AgendAI</h2>
        <div className={row}>
          <span className="grid size-8 place-items-center rounded-[11px] bg-muted-surface text-primary">
            <Icon name="spark" />
          </span>
          <span className="grid flex-1 gap-1">
            <strong className="text-[13px]">Assistente de IA</strong>
            <small className="text-[11px] text-muted">
              Interprete texto ou áudio para preparar lembretes.
            </small>
          </span>
        </div>
      </section>
      <section className="my-[25px]">
        <h2 className={sectionTitle}>Sobre</h2>
        <div className="flex items-center gap-[13px] rounded-[17px] border border-border bg-surface p-[17px]">
          <div className="grid size-7 place-items-center rounded-[10px] bg-primary text-[15px] text-primary-foreground">
            ✦
          </div>
          <div>
            <strong className="text-sm">AgendAI</strong>
            <p className="m-0 mt-1 text-[11px] text-muted">
              Organize o seu dia com leveza.
            </p>
            <small className="mt-1 text-[11px] text-muted">
              Versão 0.1.0 · Frontend MVP
            </small>
          </div>
        </div>
      </section>
    </div>
  );
}
