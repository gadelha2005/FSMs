import { describe, expect, it } from 'vitest';
import { Simulation } from '../src';

function tcp(seed = 1, channel = {}) {
  return new Simulation({
    protocol: 'TCP',
    seed,
    channel: { delayMin: 20, delayMax: 20, ...channel },
  });
}

describe('Simulation: TCP', () => {
  it('começa em CLOSED nos dois hosts, no instante 0, ociosa', () => {
    const sim = tcp();
    expect(sim.now).toBe(0);
    expect(sim.idle).toBe(true);
    const hosts = sim.hosts();
    expect(hosts.A.state).toBe('CLOSED');
    expect(hosts.B.state).toBe('CLOSED');
  });

  it('listen e connect, avançando o relógio, estabelecem a conexão', () => {
    const sim = tcp();
    expect(sim.command({ type: 'listen', host: 'B' })).toEqual({ ok: true });
    expect(sim.command({ type: 'connect', host: 'A' })).toEqual({ ok: true });
    sim.advance(1000);
    expect(sim.now).toBe(1000);
    expect(sim.hosts().A.state).toBe('ESTABLISHED');
    expect(sim.hosts().B.state).toBe('ESTABLISHED');
  });

  it('o log guarda cada transição com host, camada, estados, evento e ações', () => {
    const sim = tcp();
    sim.command({ type: 'listen', host: 'B' });
    sim.command({ type: 'connect', host: 'A' });
    sim.advance(1000);
    const first = sim.log[0]!;
    expect(first).toMatchObject({
      host: 'B',
      layer: 'conexão',
      kind: 'transition',
      from: 'CLOSED',
      event: 'APP_PASSIVE_OPEN',
      to: 'LISTEN',
    });
    const states = sim.log.filter((l) => l.host === 'A').map((l) => l.to);
    expect(states).toEqual(['SYN_SENT', 'ESTABLISHED']);
    expect(sim.log.map((l) => l.id)).toEqual(sim.log.map((_, i) => i + 1));
  });

  it('step executa exatamente um evento agendado e devolve false quando não há mais nenhum', () => {
    const sim = tcp();
    sim.command({ type: 'listen', host: 'B' });
    sim.command({ type: 'connect', host: 'A' });
    expect(sim.idle).toBe(false);
    expect(sim.step()).toBe(true);
    expect(sim.now).toBe(20);
    let guard = 0;
    while (sim.step() && guard++ < 1000);
    expect(sim.step()).toBe(false);
    expect(sim.idle).toBe(true);
  });

  it('comando inválido devolve erro em vez de lançar exceção', () => {
    const sim = tcp();
    const result = sim.command({ type: 'send', host: 'A', bytes: 100 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/estabelecida/);
  });

  it('comando de datagrama no modo TCP é recusado', () => {
    const result = tcp().command({ type: 'datagram', host: 'A' });
    expect(result).toEqual({ ok: false, error: 'Datagramas só existem no modo UDP' });
  });

  it('send transfere os bytes e o host B registra a entrega', () => {
    const sim = tcp();
    sim.command({ type: 'listen', host: 'B' });
    sim.command({ type: 'connect', host: 'A' });
    sim.advance(500);
    expect(sim.command({ type: 'send', host: 'A', bytes: 1000 }).ok).toBe(true);
    sim.advance(5000);
    const b = sim.hosts().B.details.find((d) => d.label.startsWith('Bytes entregues'));
    expect(b?.value).toBe('1000');
    expect(sim.hosts().A.senderState).toBe('IDLE');
  });

  it('dropNext derruba o próximo segmento e o contador volta a zero', () => {
    const sim = tcp();
    sim.dropNext();
    expect(sim.pendingDrops).toBe(1);
    sim.command({ type: 'listen', host: 'B' });
    sim.command({ type: 'connect', host: 'A' });
    expect(sim.pendingDrops).toBe(0);
    sim.advance(3000);
    const lost = sim.channelEvents.filter((e) => e.kind === 'lost');
    expect(lost.length).toBe(1);
    expect(sim.hosts().A.state).toBe('ESTABLISHED');
  });

  it('setChannelParams muda o canal em andamento e valida os valores', () => {
    const sim = tcp();
    sim.setChannelParams({ lossProb: 0.25 });
    expect(sim.channelParams.lossProb).toBe(0.25);
    expect(() => sim.setChannelParams({ lossProb: 2 })).toThrow();
  });

  it('as configurações de MSL e RTO chegam aos hosts', () => {
    const sim = new Simulation({ protocol: 'TCP', seed: 1, tcp: { msl: 300, rto: 400 } });
    expect(sim.tcp!.A.fsm.context.msl).toBe(300);
    expect(sim.tcp!.A.fsm.context.rto).toBe(400);
  });

  it('a mesma seed produz o mesmo log; seeds diferentes podem divergir', () => {
    const run = (seed: number) => {
      const sim = tcp(seed, { lossProb: 0.3 });
      sim.command({ type: 'listen', host: 'B' });
      sim.command({ type: 'connect', host: 'A' });
      sim.advance(20000);
      return sim.log.map((l) => `${l.time} ${l.host} ${l.from}>${l.to}`);
    };
    expect(run(5)).toEqual(run(5));
  });

  it('o número de versão sobe a cada mudança e os ouvintes são avisados', () => {
    const sim = tcp();
    let calls = 0;
    const off = sim.subscribe(() => calls++);
    const v0 = sim.getVersion();
    sim.command({ type: 'listen', host: 'B' });
    sim.advance(10);
    expect(sim.getVersion()).toBe(v0 + 2);
    expect(calls).toBe(2);
    off();
    sim.advance(10);
    expect(calls).toBe(2);
  });

  it('advance com valor zero ou negativo não faz nada', () => {
    const sim = tcp();
    sim.advance(0);
    sim.advance(-5);
    expect(sim.now).toBe(0);
    expect(sim.getVersion()).toBe(0);
  });
});

describe('Simulation: UDP', () => {
  const udp = (seed = 1, channel = {}) =>
    new Simulation({ protocol: 'UDP', seed, channel: { delayMin: 20, delayMax: 20, ...channel } });

  it('os dois hosts têm um estado só, READY', () => {
    const hosts = udp().hosts();
    expect(hosts.A.state).toBe('READY');
    expect(hosts.B.state).toBe('READY');
  });

  it('um datagrama chega ao outro host e os contadores refletem isso', () => {
    const sim = udp();
    expect(sim.command({ type: 'datagram', host: 'A' }).ok).toBe(true);
    sim.advance(100);
    const detail = (host: 'A' | 'B', label: string) =>
      sim.hosts()[host].details.find((d) => d.label.startsWith(label))?.value;
    expect(detail('A', 'Enviados')).toBe('1');
    expect(detail('B', 'Entregues')).toBe('1');
  });

  it('com perda de 100% o datagrama não chega e ninguém é avisado', () => {
    const sim = udp(1, { lossProb: 1 });
    sim.command({ type: 'datagram', host: 'A' });
    sim.advance(100);
    expect(sim.hosts().B.details.find((d) => d.label.startsWith('Entregues'))?.value).toBe('0');
    expect(sim.channelEvents.some((e) => e.kind === 'lost')).toBe(true);
    expect(sim.log.filter((l) => l.host === 'B').length).toBe(0);
  });

  it('comandos de TCP são recusados no modo UDP', () => {
    const result = udp().command({ type: 'connect', host: 'A' });
    expect(result).toEqual({ ok: false, error: 'Comandos de conexão só existem no modo TCP' });
  });

  it('o rótulo do datagrama vai no meta, para o diagrama de sequência usar', () => {
    const sim = udp();
    sim.command({ type: 'datagram', host: 'A' });
    const sent = sim.channelEvents.find((e) => e.kind === 'sent');
    expect(sent?.kind === 'sent' && sent.frame.meta.label).toBe('DGRAM #1');
  });
});