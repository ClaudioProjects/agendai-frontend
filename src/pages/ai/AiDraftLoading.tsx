import { useEffect, useState } from "react";
import { Icon } from "../../components/Icon";

export function AiDraftLoading({ inputMode }: { inputMode: "voice" | "text" }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((performance.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const messages = [
    inputMode === "voice"
      ? "A IA está interpretando seu áudio para montar os rascunhos."
      : "A IA está interpretando seu pedido para montar os rascunhos.",
    "Você poderá ajustar títulos, datas e horários antes de confirmar.",
    "Seus lembretes só serão salvos após sua confirmação.",
  ];
  const isTakingLonger = elapsedSeconds >= 24;
  const messageIndex = Math.floor(elapsedSeconds / 6) % messages.length;
  const message = isTakingLonger
    ? "A resposta está levando um pouco mais de tempo. Continuamos aguardando seus rascunhos."
    : messages[messageIndex];
  const duration = `${Math.floor(elapsedSeconds / 60)}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  return (
    <section
      className="flex min-h-[55svh] flex-col items-center justify-center px-0.5 py-6 text-center"
      aria-labelledby="ai-loading-title"
    >
      <div
        className="relative grid size-[124px] place-items-center"
        aria-hidden="true"
      >
        <div className="ai-loading-halo absolute inset-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" />
        <div className="ai-loading-orbit absolute inset-1 rounded-full border-2 border-[color-mix(in_srgb,var(--accent)_15%,transparent)] border-t-accent border-r-accent" />
        <div className="ai-loading-core grid size-[86px] place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,var(--surface))] text-accent shadow-card">
          <Icon name="spark" size={36} />
        </div>
      </div>

      <h1
        className="m-0 mt-7 max-w-[340px] text-[clamp(30px,9vw,42px)] leading-[1.08] font-bold tracking-[-0.045em]"
        id="ai-loading-title"
      >
        Preparando seus lembretes
      </h1>
      <div
        className="mt-3 min-h-[84px] max-w-[310px] text-sm leading-relaxed text-muted"
        role="status"
        aria-atomic="true"
      >
        <p
          className="ai-loading-message m-0"
          key={isTakingLonger ? "waiting" : messageIndex}
        >
          {message}
        </p>
      </div>

      <div
        className="relative w-full max-w-[310px] overflow-hidden rounded-[18px] border border-border bg-surface p-4 text-left shadow-card"
        aria-hidden="true"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-muted-surface text-accent">
            <Icon name="bell" size={20} />
          </span>
          <div className="flex-1 space-y-2">
            <div className="h-2.5 w-3/4 rounded-full bg-muted-surface" />
            <div className="h-2 w-1/2 rounded-full bg-muted-surface" />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <div className="h-6 w-24 rounded-lg bg-muted-surface" />
          <div className="h-6 w-16 rounded-lg bg-muted-surface" />
        </div>
        <div className="ai-loading-shimmer pointer-events-none absolute inset-0" />
      </div>

      <p className="m-0 mt-5 text-xs text-muted" aria-live="off">
        Aguardando resposta · <span className="tabular-nums">{duration}</span>
      </p>
    </section>
  );
}
