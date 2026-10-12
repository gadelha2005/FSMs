import { CORE_VERSION, createRng } from '@fsms/core';

export function App() {
  const rng = createRng(42);
  return (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>Simulador FSM UDP/TCP</h1>
      <p>Core carregado: v{CORE_VERSION}</p>
      <p>Primeiro número da seed 42: {rng.next().toFixed(6)}</p>
    </main>
  );
}
