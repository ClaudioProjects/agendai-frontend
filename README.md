# AgendAI Frontend

## Integração com IA

Copie `.env.example` para `.env` e configure:

- `VITE_AGENDAI_API_URL`: URL pública do backend, sem barra final.
- `VITE_FIREBASE_APP_CHECK_TOKEN`: token Firebase App Check válido para o ambiente browser.

Ao usar texto ou áudio na tela **IA**, o cliente registra automaticamente esse token em `/register-auth` antes de chamar `/parse` ou `/transcribe`. O registro é repetido se o backend informar que o estado temporário expirou. Todos os valores `VITE_*` são incluídos no bundle do navegador; não use essa variável para segredos privados.

A tela exibe os `AlarmDraft[]` recebidos, exige título ou descrição, data e horário quando faltarem, e só cria os alarmes locais após confirmação.
