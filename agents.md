# AGENTS.md — AgendAI Frontend

## Escopo e caminhos

- Todo o frontend fica em `/frontend`.
- Todas as imagens de referência ficam em `/assets`.
- O backend não faz parte do escopo atual.
- O PRD é somente um arquivo local de referência e controle: **nunca adicionar, stagear ou commitar o PRD**.

## Arquitetura e padrões

- React + TypeScript + Capacitor.
- React Router em Data Mode.
- Tailwind CSS sem biblioteca de componentes.
- Zod nas fronteiras de dados.
- Persistência usando **Adapter/Repository Pattern**:
  - Android → SQLite;
  - navegador → `localStorage`;
  - pages e componentes dependem do contrato do storage;
  - pages e componentes nunca executam SQL nem acessam `localStorage` diretamente.
- Integrações e infraestrutura ficam em `/frontend/src/libs`.
- A futura integração de IA deve ficar isolada em `/frontend/src/libs/ai`; não espalhar `fetch` pelas páginas.

## Organização de componentes

- `/frontend/src/pages`: páginas e componentes de rota.
- `/frontend/src/components`: componentes reutilizáveis globalmente.
- `/frontend/src/components/home`: componentes exclusivos da Home e suas rotas filhas.
- Componentes específicos de uma página devem permanecer no namespace daquela página até existir reutilização global real.

## Tailwind e design

- Todas as cores devem vir de CSS variables/tokens.
- Não hardcodar a paleta nos componentes.
- Temas `system`, `light` e `dark` devem reutilizar os mesmos tokens.
- Todo merge/composição de classes Tailwind deve passar por `cn()` em `/frontend/src/libs`.
- Não importar diretamente outra implementação de merge nos componentes.
- As referências em `/assets` indicadas no PRD são rígidas; não redesenhar espontaneamente.
- Ajustes visuais só são permitidos para responsividade, safe areas, acessibilidade e conteúdo dinâmico.

## Commits

- Trabalhar por fase `FE-XXX`.
- Cada fase concluída deve gerar um commit próprio.
- Evitar misturar fases não relacionadas.
- Padrão recomendado:

```text
feat(FE-010): implement home agenda
chore(FE-001): setup frontend
fix(FE-008): reschedule local notifications
```

- Antes do commit, executar as validações disponíveis: typecheck, lint, testes e build, além de validar manualmente o fluxo alterado quando aplicável.
- **Nunca commitar o PRD, mesmo após atualizar localmente a tabela de fases.**
- Usar somente a autoria Git configurada pelo usuário.
- Nunca adicionar `Co-authored-by` para agente, IA, ChatGPT, OpenAI ou ferramenta de co-work.

## Restrições

Sem autorização explícita, não:

- criar backend;
- adicionar biblioteca de UI;
- trocar a stack definida;
- trocar React Router Data Mode;
- acessar SQLite ou `localStorage` diretamente em pages/componentes;
- hardcodar cores de produto;
- ignorar o `cn()` central;
- implementar funcionalidades fora do PRD;
- alterar a arquitetura principal silenciosamente.
