# FSMs: simulador de UDP e TCP

Trabalho Prático 2 de Redes Convergentes (Unifor). Simulador com interface gráfica que executa, visualiza e testa as máquinas de estado finito do UDP e do TCP sobre um canal com falhas configuráveis.

## Requisitos

- Node.js 22.12 ou mais novo (`node -v`)
- npm 10 ou mais novo

## Instalação

```bash
npm install
```

## Comandos

| Comando             | O que faz                                 |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Abre a interface em http://localhost:5173 |
| `npm test`          | Roda os testes do núcleo (Vitest)         |
| `npm run typecheck` | Verifica os tipos de todos os pacotes     |
| `npm run lint`      | Roda o ESLint                             |
| `npm run build`     | Gera a versão de produção da interface    |

## Estrutura

```
packages/
  core/         núcleo de simulação em TypeScript puro (sem React/DOM)
  definitions/  arquivos JSON das FSMs
  scenarios/    os 10 cenários de teste
  web/          interface em React + Vite
docs/           relatório, diagramas e prints
```
