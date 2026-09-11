import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { cn } from "../../libs/cn";
import { Icon } from "../Icon";

const iconButton =
  "inline-flex size-[42px] items-center justify-center rounded-full border-0 bg-transparent text-accent transition hover:bg-muted-surface hover:text-foreground focus-visible:bg-muted-surface focus-visible:text-foreground";
const navItem =
  "flex flex-col items-center gap-1.5 text-[10px] font-bold text-muted no-underline [&>svg]:size-[22px]";

export function AppShell() {
  const [showSplash, setShowSplash] = useState(true);
  const location = useLocation(),
    navigate = useNavigate();
  useEffect(() => {
    const timeout = window.setTimeout(() => setShowSplash(false), 850);
    return () => window.clearTimeout(timeout);
  }, []);
  if (showSplash)
    return (
      <div className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background">
        <div className="flex items-center gap-2 text-[28px] font-bold tracking-[-0.05em]">
          <span className="grid size-[39px] place-items-center rounded-[14px] bg-primary text-primary-foreground">
            ✦
          </span>
          <span>
            Agend<span className="text-accent">AI</span>
          </span>
        </div>
        <p className="m-0 text-xs text-muted">Organize o seu dia</p>
        <div className="mt-[22px] h-[3px] w-[26px] overflow-hidden rounded bg-border">
          <div className="h-full w-2/5 animate-pulse rounded bg-accent" />
        </div>
      </div>
    );
  const isAgenda =
    location.pathname === "/" || location.pathname.startsWith("/agenda");
  return (
    <div className="mx-auto min-h-svh max-w-[680px] pb-[calc(92px+env(safe-area-inset-bottom))] min-[700px]:min-h-[calc(100svh-24px)] min-[700px]:overflow-hidden min-[700px]:rounded-[28px] min-[700px]:border min-[700px]:border-border min-[700px]:bg-background">
      <header className="flex h-[70px] items-center justify-between px-[22px] pt-[max(14px,env(safe-area-inset-top))] pb-2">
        <button
          className="border-0 bg-transparent p-0"
          onClick={() => navigate("/")}
          aria-label="Ir para agenda"
        >
          <img
            className="block w-[160px] object-contain theme-logo theme-logo--light"
            src="/assets/logo-dark.svg"
            alt="AgendAI"
          />
          <img
            className="w-[160px] object-contain theme-logo theme-logo--dark"
            src="/assets/logo-white.svg"
            alt=""
            aria-hidden="true"
          />
        </button>
        <button
          className={iconButton}
          onClick={() => navigate("/settings")}
          aria-label="Configurações"
        >
          <Icon name="settings" size={30} />
        </button>
      </header>
      <main className="px-[22px] pt-2 pb-7 min-[700px]:px-[30px]">
        <Outlet />
      </main>
      <nav
        className="fixed bottom-0 flex justify-around left-1/2 z-5 w-full max-w-[680px] -translate-x-1/2 border-t border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color-mix(in_srgb,var(--background)_93%,transparent)] px-[18px] pt-2.5 pb-[max(12px,env(safe-area-inset-bottom))] backdrop-blur-[18px] min-[700px]:bottom-3 min-[700px]:rounded-b-[28px]"
        aria-label="Navegação principal"
      >
        <NavLink
          to="/agenda"
          className={({ isActive }) =>
            cn(
              navItem,
              (isActive || isAgenda) &&
                "text-accent after:mt-0.5 after:h-0.5 after:w-9 after:rounded after:bg-accent [&>svg]:[stroke-width:2.5]",
            )
          }
        >
          <Icon name="calendar" />
          <span>Agenda</span>
        </NavLink>
        <NavLink
          to="/ai"
          className={({ isActive }) =>
            cn(
              navItem,
              isActive &&
                "text-accent after:mt-0.5 after:h-0.5 after:w-9 after:rounded after:bg-accent [&>svg]:[stroke-width:2.5]",
            )
          }
        >
          <Icon name="spark" />
          <span>IA</span>
        </NavLink>
        <NavLink
          to="/completed"
          className={({ isActive }) =>
            cn(
              navItem,
              isActive &&
                "text-accent after:mt-0.5 after:h-0.5 after:w-9 after:rounded after:bg-accent [&>svg]:[stroke-width:2.5]",
            )
          }
        >
          <Icon name="check" />
          <span>Concluídos</span>
        </NavLink>
      </nav>
    </div>
  );
}
