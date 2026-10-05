import { afterEach, describe, expect, mock, test } from "bun:test";
import { createMemoryRouter } from "react-router";
import { createBackNavigation } from "../src/libs/back-navigation";

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function setup(initialEntries = ["/agenda"], initialIndex?: number) {
  const router = createMemoryRouter([{ path: "*", element: null }], {
    initialEntries,
    initialIndex,
  });
  const exitConfirmation = {
    requestExit: mock(async () => {}),
    resetExitConfirmation: mock(async () => {}),
  };
  const navigation = createBackNavigation(router, exitConfirmation);
  cleanups.push(() => {
    navigation.dispose();
    router.dispose();
  });
  return { router, navigation, ...exitConfirmation };
}

describe("botão de voltar", () => {
  test("percorre as telas anteriores antes de pedir confirmação de saída", async () => {
    const { router, navigation, requestExit } = setup();
    await router.navigate("/ai");
    await router.navigate("/completed");
    await router.navigate("/settings");

    for (const previous of ["/completed", "/ai", "/agenda"]) {
      await navigation.handleNativeBack();
      expect(router.state.location.pathname).toBe(previous);
      expect(requestExit).not.toHaveBeenCalled();
    }

    await navigation.handleNativeBack();
    expect(requestExit).toHaveBeenCalledTimes(1);
  });

  test("volta da edição ao detalhe preservando a ocorrência e a tela de origem", async () => {
    const { router, navigation, requestExit } = setup(["/completed"]);
    await router.navigate("/alarms/reminder?occurrence=2026-10-05", {
      state: { source: "completed" },
    });
    await router.navigate("/alarms/reminder/edit");

    await navigation.goBack();
    expect(router.state.location.pathname).toBe("/alarms/reminder");
    expect(router.state.location.search).toBe("?occurrence=2026-10-05");
    expect(router.state.location.state).toEqual({ source: "completed" });

    await navigation.handleNativeBack();
    expect(router.state.location.pathname).toBe("/completed");
    expect(requestExit).not.toHaveBeenCalled();
  });

  test("retorna à agenda quando aberto diretamente em outra tela", async () => {
    const { router, navigation, requestExit } = setup(["/alarms/reminder"]);
    await navigation.handleNativeBack();
    expect(router.state.location.pathname).toBe("/agenda");
    expect(requestExit).not.toHaveBeenCalled();

    await navigation.handleNativeBack();
    expect(requestExit).toHaveBeenCalledTimes(1);
  });

  test("o botão da página usa a agenda como destino quando não há histórico", async () => {
    const { router, navigation, requestExit } = setup(["/alarms/new"]);
    await navigation.goBack();
    expect(router.state.location.pathname).toBe("/agenda");
    await navigation.goBack();
    expect(requestExit).not.toHaveBeenCalled();
  });

  test("substituir uma rota preserva a tela anterior", async () => {
    const { router, navigation } = setup();
    await router.navigate("/alarms/new");
    await router.navigate("/settings", { replace: true });
    await navigation.goBack();
    expect(router.state.location.pathname).toBe("/agenda");
  });

  test("descarta destinos à frente ao iniciar outra navegação após voltar", async () => {
    const { router, navigation, requestExit } = setup();
    await router.navigate("/ai");
    await router.navigate("/settings");
    await navigation.goBack();
    await router.navigate("/completed");
    await navigation.goBack();
    expect(router.state.location.pathname).toBe("/ai");
    await navigation.goBack();
    expect(router.state.location.pathname).toBe("/agenda");
    expect(requestExit).not.toHaveBeenCalled();
  });

  test("acompanha voltar e avançar feitos pelo próprio histórico", async () => {
    const { router, navigation } = setup();
    await router.navigate("/ai");
    await router.navigate("/settings");
    await router.navigate(-1);
    await router.navigate(1);
    await navigation.goBack();
    expect(router.state.location.pathname).toBe("/ai");
  });

  test("não navega para entradas anteriores ao início do app", async () => {
    const { router, navigation, requestExit } = setup(
      ["/external", "/agenda"],
      1
    );
    await navigation.handleNativeBack();
    expect(router.state.location.pathname).toBe("/agenda");
    expect(requestExit).toHaveBeenCalledTimes(1);
  });

  test("trocar de tela cancela a confirmação de saída pendente", async () => {
    const { router, navigation, resetExitConfirmation } = setup();
    await navigation.handleNativeBack();
    await router.navigate("/settings");
    expect(resetExitConfirmation).toHaveBeenCalledTimes(1);
    await navigation.goBack();
    expect(resetExitConfirmation).toHaveBeenCalledTimes(2);
  });
});
