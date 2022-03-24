// @ts-ignore
import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.24.0/index.ts';
// @ts-ignore
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';
// @ts-ignore
import * as log from "https://deno.land/std@0.100.0/log/mod.ts";

const initialize = async() => {
await log.setup({
    handlers: {
        console: new log.handlers.ConsoleHandler("DEBUG"),
    },
    loggers: {
        default: {
            level: "DEBUG",
            handlers: ["console"],
        },
    },
});
};

let logger = log.getLogger();

function getAssets(chain: Chain, wallet: Account) {
    let verityBalance = chain.callReadOnlyFn('verity-token', 'get-balance', [types.principal(wallet.address)], wallet.address);

    let assets = ' { address : ' + wallet.address 
                + ', $STX : '+ chain.getAssetsMaps().assets.STX[wallet.address]
                + ', $VERITY : '+ JSON.stringify(verityBalance.result)+ ' }'

    return assets;
}

Clarinet.test({
    name: "TEST : withdraw challenge",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const playerA = accounts.get('wallet_1')!;
        const playerB = accounts.get('wallet_2')!;
        console.log('\n\n* TEST: withdraw challenge ... starting');
        let block = chain.mineBlock([
            Tx.contractCall('veritygames', 'start', [types.utf8("Earth is flat!"), types.uint(10000000), types.uint(2)], playerA.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(0)], playerA.address),

            Tx.contractCall('veritygames', 'challenge', [types.uint(0), types.utf8("Earth is square!"), types.uint(10000000), types.uint(2)], playerB.address),
            Tx.contractCall('veritygames', 'challenge', [types.uint(0), types.utf8("Earth is spherical!"), types.uint(20000000), types.uint(2)], playerB.address),
            Tx.contractCall('veritygames', 'withdraw', [ types.uint(0)], playerB.address),
            Tx.contractCall('veritygames', 'get-offer', [types.uint(1)], playerA.address)

        ]);
        logger.warning('### block height:' + block.height + " ### A.start > B.challenge > B.challenge > B.withdraw");
        logger.debug('    ' + JSON.stringify(block) + '\n');
        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));
        block.receipts[4].result.expectOk();

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'accept', [types.uint(1)], playerA.address),
            Tx.contractCall('veritygames', 'withdraw', [ types.uint(1)], playerB.address),
        ]);
        logger.warning('### block height:' + block.height + " ### A.accept > B.withdraw");
        logger.debug('    ' + JSON.stringify(block) + '\n');
        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));
        block.receipts[1].result.expectErr();

    },
});

Clarinet.test({
    name: "TEST : stop game without accepting offer",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const playerA = accounts.get('wallet_1')!;
        const playerB = accounts.get('wallet_2')!;
        console.log('\n* TEST: stop game without accepting offer ... starting');
        let block = chain.mineBlock([
            Tx.contractCall('veritygames', 'start', [types.utf8("Earth is flat!"), types.uint(10000000), types.uint(2)], playerA.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(0)], playerA.address),
            Tx.contractCall('veritygames', 'stop', [types.uint(0)], playerB.address),
            Tx.contractCall('veritygames', 'stop', [types.uint(0)], playerA.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(0)], playerA.address),
        ]);
        logger.warning('### block height:' + block.height + " ### A.start > B.stop > A.stop ");
        logger.debug('    ' + JSON.stringify(block) + '\n');
        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));
        block.receipts[2].result.expectErr();
        block.receipts[3].result.expectOk();
        block.receipts[4].result.expectNone();
        

    },
});

Clarinet.test({
    name: "TEST : consensus",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const playerA = accounts.get('wallet_1')!;
        const playerB = accounts.get('wallet_2')!;
        console.log('\n* TEST:  consensus ... starting');
        let block = chain.mineBlock([
            Tx.contractCall('veritygames', 'start', [types.utf8("Earth is flat!"), types.uint(10000000), types.uint(2)], playerA.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(0)], playerA.address),

            Tx.contractCall('veritygames', 'challenge', [types.uint(0), types.utf8("Earth is square!"), types.uint(10000000), types.uint(2)], playerB.address),
            Tx.contractCall('veritygames', 'challenge', [types.uint(0), types.utf8("Earth is spherical!"), types.uint(20000000), types.uint(2)], playerB.address),
        ]);
        logger.warning('### block height:' + block.height + " ### A.start > B.challenge > B.challenge ");
        logger.debug('    ' + JSON.stringify(block) + '\n');
        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'accept', [types.uint(1)], playerA.address),
        ]);
        logger.warning('### block height:' + block.height + " ### A.accept ");
        logger.debug('    ' + JSON.stringify(block) + '\n');
        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'declare', [ types.uint(0), types.bool(true)], playerA.address),
            Tx.contractCall('veritygames', 'declare', [types.uint(0), types.bool(false)], playerB.address),
        ]);
        logger.warning('### block height:' + block.height + " ### A.declare win > B.declare loss");
        logger.debug('    ' + JSON.stringify(block) + '\n');
        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));

        chain.mineEmptyBlockUntil(block.height + 290);
        logger.warning('### block height:' + block.height + " ### >>>> fast-forward blockchain");

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'collect', [types.uint(0)], playerA.address),
            Tx.contractCall('veritygames', 'collect', [types.uint(0)], playerB.address),

        ]);
        logger.warning('### block height:' + block.height + " ### A.collect > B.collect");
        logger.debug('    ' + JSON.stringify(block) + '\n');
        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));
        block.receipts[0].result.expectOk();
        block.receipts[1].result.expectOk();

    },
});


Clarinet.test({
    name: "TEST : conflict",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const playerA = accounts.get('wallet_1')!;
        const playerB = accounts.get('wallet_2')!;

        console.log('\n* TEST: conflict ... starting');
        let block = chain.mineBlock([
            Tx.contractCall('veritygames', 'start', [types.utf8("tomorrow is wednesday"), types.uint(10000000), types.uint(2)], playerA.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(0)], playerA.address),

            Tx.contractCall('veritygames', 'challenge', [types.uint(0), types.utf8("tomorrow is today"), types.uint(20000000), types.uint(2)], playerB.address),
            Tx.contractCall('veritygames', 'get-offer', [types.uint(0)], playerA.address)

        ]);
        logger.warning('### block height:'+ block.height + ' ### A.start > B.challenge > B.challenge ');
        logger.debug('    ' + block.receipts[3].result);
        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'accept', [types.uint(0)], playerA.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(0)], playerA.address)
        ]);
        logger.warning('### block height:'+ block.height + ' ### A.accept ');
        logger.debug('    ' + block.receipts[1].result);

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'declare', [types.uint(0), types.bool(true)], playerA.address),
            Tx.contractCall('veritygames', 'declare', [types.uint(0), types.bool(true)], playerB.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(0)], playerA.address)
        ]);
        logger.warning('### block height:'+ block.height + ' ### A.declare win > B.declare loss ');

        chain.mineEmptyBlockUntil(block.height + 290);

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'collect', [types.uint(0)], playerA.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(0)], playerA.address),
            Tx.contractCall('veritygames', 'collect', [types.uint(0)], playerB.address),

        ]);
        logger.warning('### block height:'+ block.height + ' ### A.collect > B.collect');
        logger.debug('    ' + JSON.stringify(block) + '\n');
        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));
        block.receipts[0].result.expectOk();
        block.receipts[2].result.expectOk();


    },
});


Clarinet.test({
    name: "TEST : Proof-of-Honesty consensus (player with more VERITY tokens wins)",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const playerA = accounts.get('wallet_1')!;
        const playerB = accounts.get('wallet_2')!;

        let block = chain.mineBlock([
            Tx.contractCall('veritygames', 'start', [types.utf8("Earth is flat!"), types.uint(10000000), types.uint(2)], playerA.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(0)], playerA.address),

            Tx.contractCall('veritygames', 'challenge', [types.uint(0), types.utf8("Earth is square!"), types.uint(10000000), types.uint(2)], playerB.address),
            Tx.contractCall('veritygames', 'challenge', [types.uint(0), types.utf8("Earth is spherical!"), types.uint(20000000), types.uint(2)], playerB.address),
            Tx.contractCall('veritygames', 'get-offer', [types.uint(1)], playerA.address)

        ]);
        console.log('\n* TEST: Proof-of-Honesty consensus (player with more VERITY tokens wins) ... starting');
        logger.warning('### block height:' + block.height + " ### A.start > B.challenge > B.challenge ");
        logger.debug('    ' + JSON.stringify(block) + '\n');
        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'accept', [types.uint(1)], playerA.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(0)], playerA.address)
        ]);
        logger.warning('### block height:' + block.height + " ### A.accept ");
        logger.debug('    ' + JSON.stringify(block) + '\n');

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'declare', [types.uint(0), types.bool(true)], playerA.address),
            Tx.contractCall('veritygames', 'declare', [types.uint(0), types.bool(false)], playerB.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(0)], playerA.address)
        ]);
        logger.warning('### block height:' + block.height + " ### A.declare win > B.declare loss ");
        logger.debug('    ' + JSON.stringify(block) + '\n');
        chain.mineEmptyBlockUntil(block.height + 290);

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'collect', [types.uint(0)], playerA.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(0)], playerA.address),
            Tx.contractCall('veritygames', 'collect', [types.uint(0)], playerB.address),

        ]);

        logger.warning('### block height:' + block.height + " ### A.collect > B.collect");
        logger.debug('    ' + JSON.stringify(block) + '\n');
        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));

        block.receipts[0].result.expectOk();
        block.receipts[2].result.expectOk();

        logger.info('@@@ Game 0 Result : '+JSON.stringify(block.receipts[2].result));
        // New game
        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));


        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'start', [types.utf8("tomorrow is wednesday"), types.uint(33000000), types.uint(300)], playerA.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(1)], playerA.address),

            Tx.contractCall('veritygames', 'challenge', [types.uint(1), types.utf8("tomorrow is today"), types.uint(10000000), types.uint(300)], playerB.address),
            Tx.contractCall('veritygames', 'challenge', [types.uint(1), types.utf8("tomorrow is today"), types.uint(63000000), types.uint(300)], playerB.address),
            Tx.contractCall('veritygames', 'get-offer', [types.uint(3)], playerA.address)

        ]);
        logger.warning('### block height:' + block.height + " ### A.start > B.challenge > B.challenge ");
        logger.debug('    ' + JSON.stringify(block) + '\n');
        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));
        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'accept', [types.uint(3)], playerA.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(1)], playerA.address)
        ]);
        logger.warning('### block height:' + block.height + " ### A.accept ");
        logger.debug('    ' + JSON.stringify(block) + '\n');

        chain.mineEmptyBlockUntil(303);

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'declare', [types.uint(1), types.bool(true)], playerA.address),
            Tx.contractCall('veritygames', 'declare', [types.uint(1), types.bool(true)], playerB.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(1)], playerA.address)
        ]);
        logger.warning('### block height:' + block.height + " ### A.declare win > B.declare win ");
        logger.debug('    ' + JSON.stringify(block) + '\n');

        chain.mineEmptyBlockUntil(block.height + 300);
        logger.warning('### block height:' + block.height + " ###");

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'collect', [types.uint(1)], playerA.address),
            Tx.contractCall('veritygames', 'collect', [types.uint(1)], playerB.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(1)], playerA.address),
        ]);
        logger.warning('### block height:' + block.height + " ### A.collect > B.collect ");
        logger.debug('    ' + JSON.stringify(block) + '\n');
        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));
        block.receipts[0].result.expectOk();
        block.receipts[1].result.expectOk();

    },
});


Clarinet.test({
    name: "TEST : Proof-of-Honesty conflict resolution\n(players with equal VERITY tokens loose half of their earned tokens)",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        const deployer = accounts.get('deployer')!;
        const playerA = accounts.get('wallet_1')!;
        const playerB = accounts.get('wallet_2')!;

        console.log('\n* TEST: Proof-of-Honesty conflict resolution ... starting\n(players with equal VERITY tokens loose half of their earned tokens)');
        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));
        let block = chain.mineBlock([
            Tx.contractCall('veritygames', 'start', [types.utf8("Earth is flat!"), types.uint(10000000), types.uint(2)], playerA.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(0)], playerA.address),

            Tx.contractCall('veritygames', 'challenge', [types.uint(0), types.utf8("Earth is square!"), types.uint(10000000), types.uint(2)], playerB.address),
            Tx.contractCall('veritygames', 'get-offer', [types.uint(0)], playerA.address)

        ]);
        logger.warning('### block height:' + block.height + " ### A.start > B.challenge");
        logger.debug('    ' + JSON.stringify(block) + '\n');
        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'accept', [types.uint(0)], playerA.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(0)], playerA.address)
        ]);
        logger.warning('### block height:' + block.height + " ### A.accept");
        logger.debug('    ' + JSON.stringify(block) + '\n');

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'declare', [types.uint(0), types.bool(true)], playerA.address),
            Tx.contractCall('veritygames', 'declare', [types.uint(0), types.bool(false)], playerB.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(0)], playerA.address)
        ]);
        logger.warning('### block height:' + block.height + " ### A.declare win > B.declare loss");
        logger.debug('    ' + JSON.stringify(block) + '\n');
        chain.mineEmptyBlockUntil(block.height + 290);

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'collect', [types.uint(0)], playerA.address),
            Tx.contractCall('veritygames', 'collect', [types.uint(0)], playerB.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(0)], playerA.address),
        ]);

        logger.warning('### block height:' + block.height + " ### A.collect > B.collect");
        logger.debug('    ' + JSON.stringify(block) + '\n');
        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));

        block.receipts[0].result.expectOk();
        block.receipts[1].result.expectOk();

        logger.info('@@@ Game 0 Result : '+JSON.stringify(block.receipts[2].result));

        // New game

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'start', [types.utf8("tomorrow is wednesday"), types.uint(33000000), types.uint(300)], playerA.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(1)], playerA.address),

            Tx.contractCall('veritygames', 'challenge', [types.uint(1), types.utf8("tomorrow is today"), types.uint(63000000), types.uint(300)], playerB.address),
            Tx.contractCall('veritygames', 'get-offer', [types.uint(1)], playerA.address)

        ]);
        logger.warning('### block height:' + block.height + " ### A.start > B.challenge");
        logger.debug('    ' + JSON.stringify(block) + '\n');
        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'accept', [types.uint(1)], playerA.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(1)], playerA.address)
        ]);
        logger.warning('### block height:' + block.height + " ### A.accept");
        logger.debug('    ' + JSON.stringify(block) + '\n');

        chain.mineEmptyBlockUntil(303);

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'declare', [types.uint(1), types.bool(true)], playerA.address),
            Tx.contractCall('veritygames', 'declare', [types.uint(1), types.bool(true)], playerB.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(1)], playerA.address)
        ]);
        logger.warning('### block height:' + block.height + " ### A.declare win > B.declare win");
        logger.debug('    ' + JSON.stringify(block) + '\n');

        chain.mineEmptyBlockUntil(block.height + 300);
        logger.warning('### block height:' + block.height + " ### >>>> fast-forward 300 blocks");

        block = chain.mineBlock([
            Tx.contractCall('veritygames', 'collect', [types.uint(1)], playerA.address),
            Tx.contractCall('veritygames', 'collect', [types.uint(1)], playerB.address),
            Tx.contractCall('veritygames', 'get-game', [types.uint(1)], playerA.address),
        ]);
        logger.warning('### block height:' + block.height + " ### A.collect > B.collect");
        logger.debug('    ' + JSON.stringify(block) + '\n');

        logger.info('$$$ PlayerA '+ getAssets(chain, playerA));
        logger.info('$$$ PlayerB '+ getAssets(chain, playerB));
        logger.info('@@@ Game 1 Result : '+JSON.stringify(block.receipts[2].result));
        block.receipts[0].result.expectOk();
        block.receipts[1].result.expectOk();

    },
});
