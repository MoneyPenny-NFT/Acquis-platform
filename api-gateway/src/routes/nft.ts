import type { FastifyInstance } from 'fastify';
import { NFTService } from '@acquis/hedera-service';
import type { AcquisCustomerNFT } from '@acquis/hedera-service';

interface MintBody {
  customer_hedera_account: string;
  metadata: AcquisCustomerNFT;
}

interface UpdateMetadataBody {
  token_id: string;
  serial_number: number;
  metadata: AcquisCustomerNFT;
}

export async function nftRoutes(app: FastifyInstance) {
  app.post('/nft/create-collection', async (_request, reply) => {
    const result = await NFTService.createNFTCollection();
    return reply.send(result);
  });

  app.post<{ Body: MintBody }>('/nft/mint', async (request, reply) => {
    const { customer_hedera_account, metadata } = request.body;
    if (!customer_hedera_account || !metadata) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'customer_hedera_account and metadata are required' });
    }
    const result = await NFTService.mintCustomerNFT({ customerHederaAccount: customer_hedera_account, metadata });
    return reply.status(201).send(result);
  });

  app.post<{ Body: UpdateMetadataBody }>('/nft/update-metadata', async (request, reply) => {
    const { token_id, serial_number, metadata } = request.body;
    if (!token_id || serial_number == null || !metadata) {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'token_id, serial_number, and metadata are required' });
    }
    const result = await NFTService.updateNFTMetadata({ tokenId: token_id, serialNumber: serial_number, metadata });
    return reply.send(result);
  });

  app.get<{ Params: { tokenId: string; serial: string } }>(
    '/nft/:tokenId/:serial',
    async (request, reply) => {
      const { tokenId, serial } = request.params;
      const serialNum = parseInt(serial, 10);
      if (isNaN(serialNum)) {
        return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'serial must be a number' });
      }
      const metadata = await NFTService.getNFTMetadata(tokenId, serialNum);
      return reply.send(metadata);
    },
  );
}
