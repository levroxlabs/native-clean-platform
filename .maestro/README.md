# Testes E2E (Maestro)

Esta pasta contém os flows de teste end-to-end escritos em
[Maestro](https://maestro.mobile.dev/), rodando contra um build de dev
client instalado no simulador/emulador — não contra o Expo Go.

**Por que dev client, não Expo Go:** este repositório é um template que
outros projetos clonam e nos quais adicionam módulos com código nativo ao
longo do tempo. O Expo Go para de funcionar assim que qualquer módulo
precisa de um módulo nativo customizado; o dev client continua funcionando.

## Pré-requisitos

1. Instale o Maestro CLI (não é um pacote npm, é um binário separado):

   ```bash
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```

   Confirme com `maestro --version`.
2. Para iOS: Xcode + um simulador configurado (macOS apenas).
3. Para Android: Android Studio + um emulador configurado (AVD).

## Rodando os testes

```bash
pnpm e2e:build:ios      # builda e instala o dev client no simulador iOS
pnpm e2e:build:android  # builda e instala o dev client no emulador Android
pnpm test:e2e           # roda todos os flows desta pasta contra o dev client já instalado
```

`e2e:build:*` só precisa rodar de novo quando código nativo mudar (nova
dependência com módulo nativo, mudança em `app.json`, etc). Para iterar em
flows, basta manter o dev client aberto e rodar `pnpm test:e2e` de novo.

`pnpm test:e2e` falha com "no flows found" enquanto esta pasta não tiver
nenhum flow — isso é esperado até o primeiro ser escrito (veja a seção
abaixo).

## Convenção de seleção de elementos

O Maestro seleciona elementos por texto visível ou por `testID`. Prefira
texto visível sempre que possível. Adicione um `testID` a um componente
apenas quando o texto for ambíguo (botões de ícone, texto repetido na tela)
— não adicione `testID`s de forma especulativa. Quando precisar de um,
trate-o como qualquer outra string mágica: extraia para uma constante,
seguindo a [Regra 4 do AGENTS.md](../AGENTS.md#4-no-magic-strings-or-numbers).

## Convenção de nomenclatura dos flows

Ainda não há nenhum flow nesta pasta — é só infraestrutura por enquanto,
já que o app hoje só tem a tela `Home` e a autenticação está
pausada até o backend (em outro repositório) ficar pronto. Quando o
primeiro flow for escrito, nomeie o arquivo pelo fluxo que ele cobre em
`kebab-case` (`sign-in.yaml`, `edit-profile.yaml`), um flow por arquivo.
