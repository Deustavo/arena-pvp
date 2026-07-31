import { createHttpServer } from './httpServer.js';
import { createWsServer } from './wsServer.js';

const PORT = process.env.PORT || 3000;

const server = createHttpServer();
createWsServer(server);

server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
