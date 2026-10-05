# AgendAI Frontend

## Integração com IA

Copie `.env.example` para `.env` e configure:

- `VITE_AGENDAI_API_URL`: URL pública do backend, sem barra final.
- `VITE_APP_AUTH_TEST_TOKEN`: token temporário para desenvolvimento. Quando definido, é enviado no lugar do token Firebase e deve ser igual a `APP_AUTH_TEST_TOKEN` do backend.
- `VITE_FIREBASE_APP_CHECK_TOKEN`: token Firebase App Check válido para o ambiente browser, usado quando não há token temporário.

Ao usar texto ou áudio na tela **IA**, o cliente usa `VITE_APP_AUTH_TEST_TOKEN` quando ele existe; caso contrário, usa `VITE_FIREBASE_APP_CHECK_TOKEN`. Em ambos os casos, registra automaticamente o token em `/register-auth` antes de chamar `/parse` ou `/transcribe`. O registro é repetido se o backend informar que o estado temporário expirou. Todos os valores `VITE_*` são incluídos no bundle do navegador; não use essa variável para segredos privados.

As gravações WebM/MP4/Ogg/AAC (incluindo os MIME `video/webm` e `video/mp4` usados por alguns WebViews) são convertidas localmente para WAV mono de 16 kHz com Web Audio antes do envio. WAV e MP3 são enviados diretamente. O backend envia áudio e contexto juntos ao GPT-Audio-1.5 para extrair os alarmes em uma única chamada. O limite padrão de 4 MB vale para o arquivo convertido, aproximadamente dois minutos em WAV.

A tela exibe os `AlarmDraft[]` recebidos, exige título ou descrição, data e horário quando faltarem, e só cria os alarmes locais após confirmação.
