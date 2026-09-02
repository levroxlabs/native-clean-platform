# Services

Código que fala com o mundo externo — rede, hoje; armazenamento ou telemetria,
se um dia existirem. **Nada aqui conhece React**: sem hooks, sem contextos, sem
componentes. Um serviço que precisa de estado de React é consumido por um hook,
nunca o contrário.

Nada aqui conhece módulos de domínio também. Quando um serviço precisa de algo
que só um módulo sabe — o token da sessão, por exemplo — ele expõe um ponto de
registro e o módulo se registra nele.

## Services

| Name   | Description                                              |
| ------ | -------------------------------------------------------- |
| `http` | Cliente da API: URL base, JSON, bearer token e a tradução do envelope de erro. |
