import {
  Connection,
  ParsedTransactionWithMeta,
  PublicKey,
  TransactionInstruction,
} from "@solana/web3.js";
import { Command } from "commander";
import { extract } from ".";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import fetch from "node-fetch";

const API_ENDPOINT = "https://quote-api.jup.ag/v6";

const getQuote = async (
  fromMint: PublicKey,
  toMint: PublicKey,
  amount: number
) => {
  return fetch(
    `${API_ENDPOINT}/quote?outputMint=${toMint.toBase58()}&inputMint=${fromMint.toBase58()}&amount=${amount}&slippage=5&onlyDirectRoutes=true`
  ).then((response) => response.json());
};

const getSwapIx = async (
  user: PublicKey,
  outputAccount: PublicKey,
  quote: any
) => {
  const data = {
    quoteResponse: quote,
    userPublicKey: user.toBase58(),
    destinationTokenAccount: outputAccount.toBase58(),
    useSharedAccounts: true,
  };
  return fetch(`${API_ENDPOINT}/swap-instructions`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  }).then((response) => response.json());
};

const instructionDataToTransactionInstruction = (instructionPayload: any) => {
  // console.log("instructionPayload", instructionPayload);
  if (instructionPayload === null) {
    return null;
  }

  const transactionInstruction = new TransactionInstruction({
    programId: new PublicKey(instructionPayload.programId),
    keys: instructionPayload.accounts.map((key) => ({
      pubkey: new PublicKey(key.pubkey),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    data: Buffer.from(instructionPayload.data, "base64"),
  });

  const parsedTransactionWithMeta: ParsedTransactionWithMeta = {
    slot: 12345678, // Add a mock slot number
    transaction: {
      message: {
        accountKeys: transactionInstruction.keys.map((key) => ({
          pubkey: key.pubkey,
          signer: key.isSigner,
          writable: key.isWritable,
        })),
        instructions: [
          {
            programId: transactionInstruction.programId,
            accounts: transactionInstruction.keys.map((key) => key.pubkey),
            data: transactionInstruction.data.toString("base64"), // Convert Buffer to base64 string
          },
        ],
        recentBlockhash: "RecentBlockhashBase58String", // Replace with the actual blockhash
      },
      signatures: ["MockSignature"], // Replace with the actual or mock transaction signature
    },
    meta: {
      err: null, // No error
      fee: 5000, // Transaction fee in lamports (adjust as needed)
      preBalances: [1000000, 500000], // Mocked pre-transaction balances
      postBalances: [995000, 505000], // Mocked post-transaction balances
      logMessages: ["Program log: Instruction executed successfully."],
      innerInstructions: [],
    },
  };

  return parsedTransactionWithMeta;
};

const program = new Command();

program
  .command("lookup-tx")
  .requiredOption("-s, --signature <signature>")
  .requiredOption("-r, --rpc <rpc>")
  .addHelpText(
    "beforeAll",
    "Look up a Jupiter v6 swap transaction and extract its information"
  )
  .action(async ({ signature, rpc }) => {
    const connection = new Connection(rpc); // Use your own RPC endpoint here.
    // const tx = await connection.getParsedTransaction(signature, {
    //   maxSupportedTransactionVersion: 0,
    // });

    // if (tx.meta.err) {
    //   console.log("Failed transaction", tx.meta.err);
    // }

    const SOL = new PublicKey("So11111111111111111111111111111111111111112");
    const tokenPublicKey = new PublicKey(
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
    );
    const quote = await getQuote(SOL, tokenPublicKey, 1000000);
    const adminPublicKey = new PublicKey(
      "5EZKmFpo7vDxcjruzyM3q5PrQHaqx2VnSM9QasZUpVta"
    );
    // Convert the Quote into a Swap instruction
    const tokenAccount = getAssociatedTokenAddressSync(
      tokenPublicKey,
      adminPublicKey,
      false,
      TOKEN_PROGRAM_ID
    );
    const {
      computeBudgetInstructions, // The necessary instructions to setup the compute budget.
      swapInstruction, // The actual swap instruction.
      addressLookupTableAddresses, // The lookup table addresses that you can use if you are using versioned transaction.
    } = await getSwapIx(adminPublicKey, tokenAccount, quote);
    const tx = instructionDataToTransactionInstruction(swapInstruction);

    const result = await extract(signature, connection, tx, tx.blockTime);

    console.log(result);
  });

program.parse();
