# Relatório dos cenários

| # | Protocolo | Cenário | Checks | Resultado |
|---|---|---|---|---|
| 1 | TCP | Handshake de três vias | 8/8 | APROVADO |
| 2 | TCP | Perda do SYN | 7/7 | APROVADO |
| 3 | TCP | Perda do SYN+ACK | 7/7 | APROVADO |
| 4 | TCP | Encerramento normal | 5/5 | APROVADO |
| 5 | TCP | Encerramento simultâneo | 4/4 | APROVADO |
| 6 | TCP | Retransmissão rápida com perda de 1 entre 10 segmentos | 10/10 | APROVADO |
| 7 | TCP | Conexão a uma porta fechada | 5/5 | APROVADO |
| 8 | UDP | 20 datagramas com 30% de perda | 6/6 | APROVADO |
| 9 | UDP | Datagrama com checksum corrompido | 7/7 | APROVADO |
| 10 | UDP vs TCP | Mesma carga, mesmo canal ruidoso | 7/7 | APROVADO |

**10 de 10 cenários aprovados.**

## Cenário 1: Handshake de três vias

Protocolo: TCP. Resultado: **APROVADO**.

Esperado: Ambos chegam a ESTABLISHED com seq/ack consistentes e 3 segmentos.

- [x] A passa por CLOSED > SYN_SENT > ESTABLISHED (CLOSED > SYN_SENT > ESTABLISHED)
- [x] B passa por CLOSED > LISTEN > SYN_RCVD > ESTABLISHED (CLOSED > LISTEN > SYN_RCVD > ESTABLISHED)
- [x] exatamente 3 segmentos trafegam (3)
- [x] 1º segmento é SYN de A com seq = ISS de A
- [x] 2º segmento é SYN+ACK de B com ack = ISS de A + 1
- [x] 3º segmento é ACK de A com seq = ISS de A + 1 e ack = ISS de B + 1
- [x] nenhum segmento foi retransmitido
- [x] nenhum segmento foi descartado

## Cenário 2: Perda do SYN

Protocolo: TCP. Resultado: **APROVADO**.

Esperado: A retransmite o SYN após o RTO e o handshake completa.

- [x] o canal perdeu exatamente 1 segmento (1)
- [x] A enviou o SYN duas vezes (2)
- [x] a retransmissão usa o mesmo número de sequência
- [x] a retransmissão ocorre exatamente um RTO depois (1010)
- [x] A termina em ESTABLISHED (ESTABLISHED)
- [x] B termina em ESTABLISHED (ESTABLISHED)
- [x] A registrou um TIMEOUT_RETX

## Cenário 3: Perda do SYN+ACK

Protocolo: TCP. Resultado: **APROVADO**.

Esperado: A retransmite o SYN, B reenvia o SYN+ACK e o handshake completa.

- [x] o segmento perdido é o primeiro SYN+ACK de B (1)
- [x] A enviou o SYN duas vezes (2)
- [x] B enviou o SYN+ACK duas vezes (2)
- [x] B passou por SYN_RCVD ao receber o SYN duplicado sem mudar de estado
- [x] A termina em ESTABLISHED (ESTABLISHED)
- [x] B termina em ESTABLISHED (ESTABLISHED)
- [x] o SYN+ACK reenviado tem os mesmos seq e ack do original

## Cenário 4: Encerramento normal

Protocolo: TCP. Resultado: **APROVADO**.

Esperado: Passa por FIN_WAIT_1, FIN_WAIT_2, TIME_WAIT e CLOSE_WAIT, LAST_ACK.

- [x] A: ESTABLISHED > FIN_WAIT_1 > FIN_WAIT_2 > TIME_WAIT > CLOSED (CLOSED > SYN_SENT > ESTABLISHED > FIN_WAIT_1 > FIN_WAIT_2 > TIME_WAIT > CLOSED)
- [x] B: ESTABLISHED > CLOSE_WAIT > LAST_ACK > CLOSED (CLOSED > LISTEN > SYN_RCVD > ESTABLISHED > CLOSE_WAIT > LAST_ACK > CLOSED)
- [x] TIME_WAIT dura exatamente 2 x MSL (1000 ms (2 x 500))
- [x] o encerramento usa 4 segmentos (FIN, ACK, FIN, ACK) (A:FIN-ACK seq=1001 ack=5001 | B:ACK seq=5001 ack=1002 | B:FIN-ACK seq=5001 ack=1002 | A:ACK seq=1002 ack=5002)
- [x] ambos terminam em CLOSED

## Cenário 5: Encerramento simultâneo

Protocolo: TCP. Resultado: **APROVADO**.

Esperado: Ambos passam por FIN_WAIT_1, CLOSING e TIME_WAIT.

- [x] A: ESTABLISHED > FIN_WAIT_1 > CLOSING > TIME_WAIT > CLOSED (CLOSED > SYN_SENT > ESTABLISHED > FIN_WAIT_1 > CLOSING > TIME_WAIT > CLOSED)
- [x] B: ESTABLISHED > FIN_WAIT_1 > CLOSING > TIME_WAIT > CLOSED (CLOSED > LISTEN > SYN_RCVD > ESTABLISHED > FIN_WAIT_1 > CLOSING > TIME_WAIT > CLOSED)
- [x] cada lado enviou seu FIN sem esperar o do outro
- [x] ambos terminam em CLOSED

## Cenário 6: Retransmissão rápida com perda de 1 entre 10 segmentos

Protocolo: TCP. Resultado: **APROVADO**.

Esperado: 3 ACKs duplicados disparam a retransmissão antes do timer, e os 10 segmentos chegam em ordem.

- [x] o canal perdeu exatamente 1 segmento, o 3º de dados de A (1 perdido(s), seq=1201)
- [x] A enviou os 10 segmentos pela primeira vez (10)
- [x] B enviou pelo menos 3 ACKs duplicados pedindo o segmento perdido (4 duplicados com ack=1201)
- [x] a retransmissão ocorre no 3º ACK duplicado (3 ACKs duplicados até a retransmissão)
- [x] nenhuma retransmissão foi causada por timeout
- [x] a retransmissão rápida acontece antes do instante em que o timer estouraria (economia de 160 ms virtuais)
- [x] os 10 segmentos foram entregues em ordem, sem lacunas (1000 bytes)
- [x] A termina com tudo confirmado (IDLE, SendBase = próximo seq) (IDLE, SendBase=2001)
- [x] o RTT estimado fica perto do RTT real do canal (40 ms) (EstimatedRTT=40.0, DevRTT=6.3, TimeoutInterval=200.0)
- [x] depois da transferência o encerramento usa seq = ISS + 1 + dados (FIN seq=2001, A=CLOSED, B=CLOSED)

## Cenário 7: Conexão a uma porta fechada

Protocolo: TCP. Resultado: **APROVADO**.

Esperado: B responde RST+ACK e A volta a CLOSED sem retransmitir.

- [x] A passa por CLOSED > SYN_SENT > CLOSED (CLOSED > SYN_SENT > CLOSED)
- [x] B permanece em CLOSED (CLOSED)
- [x] apenas 2 segmentos trafegam (SYN e RST) (2)
- [x] a resposta é RST+ACK com ack = ISS de A + 1
- [x] o SYN não é retransmitido

## Cenário 8: 20 datagramas com 30% de perda

Protocolo: UDP. Resultado: **APROVADO**.

Esperado: Perdidos não são recuperados e nenhuma retransmissão ocorre.

- [x] houve perda de datagramas (5 perdidos)
- [x] entregues + perdidos = 20 (15 + 5)
- [x] o canal perdeu exatamente os que a aplicação não recebeu (canal: 5, aplicação: 5)
- [x] nenhuma retransmissão: A enviou 20 frames, nem um a mais (20)
- [x] nenhum datagrama chegou duas vezes
- [x] B não enviou nada de volta (sem ACK, sem aviso de perda)

## Cenário 9: Datagrama com checksum corrompido

Protocolo: UDP. Resultado: **APROVADO**.

Esperado: Descartado pelo receptor, sem notificação.

- [x] o canal corrompeu exatamente 1 datagrama (1)
- [x] B descartou exatamente 1 datagrama (1)
- [x] o motivo do descarte é integridade (checksum ou comprimento) (checksum)
- [x] a aplicação não recebeu o datagrama 2
- [x] os datagramas 1 e 3 foram entregues (1,3)
- [x] B não enviou nada de volta (sem notificação)
- [x] A não recebeu nada

## Cenário 10: Mesma carga, mesmo canal ruidoso

Protocolo: UDP vs TCP. Resultado: **APROVADO**.

Esperado: Relatório comparando entregues, perdidos, duplicados, em ordem e tempo total.

- [x] TCP entregou 100% das mensagens, em ordem e sem duplicados (seed principal) (50/50, duplicados 0)
- [x] TCP entregou 100% em ordem nas 20 seeds (100% das seeds)
- [x] UDP perdeu mensagens na seed principal (10 perdidas de 50)
- [x] UDP entrega menos de 100% das mensagens em média nas 20 seeds (88.7% entregues em média)
- [x] o UDP entregou duplicados e fora de ordem ao menos uma vez nas 20 seeds (duplicados em média 1.20, fora de ordem 9.65)
- [x] o preço da confiabilidade: o TCP usa mais quadros no canal do que o UDP (TCP 118 contra UDP 50 quadros em média)
- [x] o preço do tempo: o TCP leva mais tempo para entregar tudo (TCP 5325 ms contra UDP 527 ms em média)

Seed principal: 10. Mesma carga (50 mensagens de 100 bytes) e mesmo canal para os dois protocolos.

| Protocolo | Entregues | Perdidos | Duplicados | Fora de ordem | Tudo em ordem | Tempo total (ms) | Quadros no canal | Bytes no canal |
|---|---|---|---|---|---|---|---|---|
| UDP | 40/50 | 10 | 1 | 9 | não | 520 | 50 | 5400 |
| TCP | 50/50 | 0 | 0 | 0 | sim | 5958 | 128 | 9160 |

Média de 20 seeds:

| Protocolo | Entregues | Perdidos | Duplicados | Fora de ordem | Tudo em ordem | Tempo total (ms) | Quadros no canal | Bytes no canal |
|---|---|---|---|---|---|---|---|---|
| UDP | 88.7% | 5.7 | 1.20 | 9.65 | 0% | 527 | 50 | 5400 |
| TCP | 100.0% | 0.0 | 0.00 | 0.00 | 100% | 5325 | 118 | 8484 |
