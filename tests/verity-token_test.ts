// @ts-ignore
import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.24.0/index.ts';
// @ts-ignore
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
    name: "TEST : public mint is not allowed",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const playerX = accounts.get('wallet_1')!;
        const playerY = accounts.get('wallet_2')!;
        let block = chain.mineBlock([
            Tx.contractCall('verity-token', 'mint', [types.uint(10000000), types.principal(playerX.address)], playerX.address),
            Tx.contractCall('verity-token', 'mint', [types.uint(10000000), types.principal(playerY.address)], playerX.address),
            Tx.contractCall('verity-token', 'mint', [types.uint(10000000), types.principal(deployer.address)], playerX.address),
        ]);

        block.receipts[0].result.expectErr();
        block.receipts[1].result.expectErr();
    },
});

Clarinet.test({
    name: "TEST : public burn is not allowed",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const playerX = accounts.get('wallet_1')!;
        const playerY = accounts.get('wallet_2')!;
        let block = chain.mineBlock([
            Tx.contractCall('verity-token', 'burn', [types.uint(10000000), types.principal(playerX.address)], playerX.address),
            Tx.contractCall('verity-token', 'burn', [types.uint(10000000), types.principal(playerY.address)], playerX.address),
            Tx.contractCall('verity-token', 'burn', [types.uint(10000000), types.principal(deployer.address)], playerX.address),
        ]);

        block.receipts[0].result.expectErr();
        block.receipts[1].result.expectErr();
    },
});

