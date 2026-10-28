# Infinity Clicker — Web + Android

Projeto em várias tecnologias:
- `public/index.html`: estrutura da tela.
- `public/styles.css`: visual e layout mobile-first.
- `public/game.js`: mecânicas, mundos, baús, loja, renascimento e salvamento local.
- `python/run.py`: servidor de desenvolvimento local em Python, sem dependências externas.
- `python/check_project.py`: verificações estáticas do projeto.
- `android/`: aplicativo Android em Kotlin que abre o jogo offline.
- `.github/workflows/build-android-apk.yml`: compila o APK de teste no GitHub Actions quando o jogo ou o projeto Android mudar na branch `main`.

## Testar no PC
Requer Python 3.10+. Execute:

```bash
python python/run.py
```

Abra http://127.0.0.1:8000. Para verificar a estrutura e mecânicas, execute `python python/check_project.py`; para a sintaxe JS, execute `node --check public/game.js`.

O progresso é salvo no `localStorage` do navegador/dispositivo. O ganho offline é limitado a 8 horas.

## Compilar APK no Android Studio
1. Abra a pasta `android` no Android Studio.
2. Instale Android SDK 35 se solicitado e aguarde a sincronização do Gradle.
3. Selecione **Build > Build Bundle(s) / APK(s) > Build APK(s)**.
4. O APK de teste ficará em `android/app/build/outputs/apk/debug/app-debug.apk`.

## APK pelo GitHub Actions
Depois que o workflow concluir, abra **Actions** → **Gerar APK do Infinity Clicker** → execução mais recente → baixe o artefato `infinity-clicker-apk`. Extraia o ZIP para obter `app-debug.apk`. É um APK de depuração para testes; publicar na Play Store exige assinatura de lançamento.

## Render
A hospedagem web atual do repositório foi mantida. O APK carrega os arquivos do jogo localmente e funciona sem internet para as mecânicas incluídas.
