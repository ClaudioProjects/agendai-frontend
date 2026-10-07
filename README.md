# AgendAI Frontend

## Lembretes e alarmes no Android

- Toque na hora ou nos minutos para digitar com o teclado numérico. A rolagem continua disponível; horários válidos vão de `00:00` a `23:59`.
- Na primeira abertura, o app solicita notificações e microfone e apresenta, em sequência, os acessos a alarmes exatos, tela cheia e exibição sobre outros apps. Cada tela de acesso especial só é seguida pela próxima após o retorno ao app. As escolhas ficam salvas; permissões recusadas podem ser habilitadas em **Configurações → Permissões**.
- Alarmes criados manualmente começam com **Toda semana** e o dia da data selecionada. Na criação por IA, a recorrência permanece desativada quando o prompt não pede repetição.
- Em **Som e vibração**, cada alarme começa com o som padrão do dispositivo e a vibração ativada. É possível desligar a vibração, escolher um toque do Android, selecionar uma música baixada pelo seletor de arquivos ou deixar o alarme sem som. As mesmas opções ficam disponíveis ao revisar um lembrete criado pela IA.
- O volume é salvo por alarme entre **0% e 100%**. **Ouvir prévia** reproduz o som escolhido por até dez segundos na mesma intensidade, com ajuste durante a reprodução e botão para parar. A prévia para ao sair da tela, abrir o seletor ou enviar o app para segundo plano. O volume também é limitado pelo volume de alarmes do dispositivo; o controle não modifica o volume global do Android.
- Ao escolher música personalizada no Android 8 ou superior, o seletor tenta iniciar na categoria **Áudio**, que reúne os arquivos indexados pelo dispositivo. O seletor pode organizá-los por artista/álbum. Se o fabricante não oferecer essa categoria, o Android usa seu local padrão e mantém a busca e a navegação por arquivos.
- O acesso à música personalizada é mantido após reiniciar o dispositivo. Se o arquivo for removido ou ficar indisponível, o alarme usa o som padrão. Quando há alarmes simultâneos, toca a música do alarme audível mais antigo e a vibração continua enquanto algum alarme ativo a solicitar.
- No horário do lembrete, uma tela nativa de alarme mostra o título e a descrição, com a música e a vibração configuradas para aquele alarme. **Concluir lembrete** conclui a ocorrência; **Dispensar alarme** silencia e mantém o lembrete pendente. O som para automaticamente após dez minutos.
- A tela cheia permite mostrar o alarme com o celular bloqueado; a exibição sobre outros apps permite abri-lo durante o uso de outro aplicativo. Sem esses acessos, o Android pode limitar a apresentação à notificação. O som respeita o volume de alarmes e as configurações do sistema.
- O agendamento permanece nativo com o app fechado e é restaurado após reinicialização, atualização do app ou mudança do relógio/fuso. Alarmes criados ou reconciliados no último minuto continuam sendo agendados.

Validação de entrega e recorrência em um emulador/dispositivo Android:

```powershell
cd android
./gradlew.bat :app:connectedDebugAndroidTest '-Pandroid.testInstrumentationRunnerArguments.class=com.claudiodev.agendai.AlarmDeliveryTest,com.claudiodev.agendai.AlarmOccurrenceTest,com.claudiodev.agendai.AlarmRingingOptionsTest'
```

O teste `StartupPermissionsTest` valida o primeiro início em uma instalação nova, com os acessos especiais inicialmente desativados.

## Integração com IA

Copie `.env.example` para `.env` e configure:

- `VITE_AGENDAI_API_URL`: URL pública do backend, sem barra final.
- `VITE_APP_AUTH_TEST_TOKEN`: token temporário para desenvolvimento. Quando definido, é enviado no lugar do token Firebase e deve ser igual a `APP_AUTH_TEST_TOKEN` do backend.
- `VITE_FIREBASE_APP_CHECK_TOKEN`: token Firebase App Check válido para o ambiente browser, usado quando não há token temporário.

Ao usar texto ou áudio na tela **IA**, o cliente usa `VITE_APP_AUTH_TEST_TOKEN` quando ele existe; caso contrário, usa `VITE_FIREBASE_APP_CHECK_TOKEN`. Em ambos os casos, registra automaticamente o token em `/register-auth` antes de chamar `/interpret/text` ou `/interpret/audio`. O registro é repetido se o backend informar que o estado temporário expirou. Todos os valores `VITE_*` são incluídos no bundle do navegador; não use essa variável para segredos privados.

As gravações WebM/MP4/Ogg/AAC (incluindo os MIME `video/webm` e `video/mp4` usados por alguns WebViews) são convertidas localmente para WAV mono de 16 kHz com Web Audio antes do envio. WAV e MP3 são enviados diretamente. O backend envia áudio e contexto juntos ao GPT-Audio-1.5 para extrair os alarmes em uma única chamada. O limite padrão de 4 MB vale para o arquivo convertido, aproximadamente dois minutos em WAV.

A tela exibe os `AlarmDraft[]` recebidos, exige título ou descrição, data e horário quando faltarem, e só cria os alarmes locais após confirmação.
